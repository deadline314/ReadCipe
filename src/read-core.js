/* ReadCipe "Read & Check": pure logic, no DOM and no network.
   tools/build.py inlines this file into src/read.src.html and src/teacher.src.html
   (placeholder comment READCORE); tools/test_read_core.js tests it with node. */
(function (root) {
  'use strict';

  // Reading cards = the step slides of the deck (src/index.src.html, .instr text).
  // Keep in sync with the deck and with CARD_IDS in worker/index.mjs.
  // say: display word (without trailing punctuation) -> how it is spoken (Azure reference text).
  const CARDS = [
    { id: '1', title: 'Prepare the liquids', text: 'Mix milk and honey. Heat and let it cool.' },
    { id: '2', title: 'Prepare the dry ingredients', text: 'Mix and sieve cake flour, baking powder, and salt.' },
    { id: '3', title: 'Whisk the eggs and sugar', text: 'Whisk eggs on high speed for 2 minutes. Add sugar and mix until creamy.', say: { '2': 'two' } },
    { id: '4-1', title: 'Add oil and flavor', text: 'Add the sunflower seed oil slowly from the side, and whisk for another 3 minutes.', say: { '3': 'three' } },
    { id: '4-2', title: '', text: 'Add the vanilla extract and the honey milk. Mix with a spatula.' }, // same title as 4-1, so not read twice
    { id: '5', title: 'Mix with flour', text: 'Add flour in 3–4 times. Mix gently.', say: { '3–4': 'three to four' } },
    { id: '6', title: 'Fill the cups and bake', text: 'Spoon the batter into cupcake cases. Bake at 180°C for 16 minutes.', say: { '180°C': 'one hundred eighty degrees', '16': 'sixteen' } },
  ];
  const CARD_IDS = CARDS.map(c => c.id);

  // All thresholds in one place; tune after testing with real children's voices.
  const SCORING = {
    three: 85, two: 70, one: 50,   // overall (PronScore) needed for 3 / 2 / 1 stars
    minCompleteness: 50,           // below this: 0 stars whatever the overall score
    readCompleteness: 60,          // at or above this the card counts as "read" (teacher's main goal)
    weak: 70,                      // words scored below this go to "words to practice"
    maxWeakPerCard: 10, maxWeakSummary: 5,
    maxTries: 3,                   // readings per card; the best one counts
    silenceMs: 2500,               // pause that ends a reading (Azure segmentation silence)
  };

  const TRAIL = /[.,!?;:]+$/;
  const norm = w => String(w).toLowerCase().replace(/[^a-z']/g, '');
  // Numbers the recogniser may write as digits in live (partial) text.
  const NUM = { '2': 'two', '3': 'three', '4': 'four', '16': 'sixteen', '180': 'one hundred eighty' };

  function spokenWords(text) {
    return String(text || '').split(/\s+/).flatMap(raw => {
      const m = raw.match(/^(\d+)(°)?/);
      if (m && NUM[m[1]]) return NUM[m[1]].split(' ').concat(m[2] ? ['degrees'] : []);
      const w = norm(raw);
      return w ? [w] : [];
    });
  }

  function prepare(card) {
    const say = card.say || {};
    const speak = raw => { const key = raw.replace(TRAIL, ''); return say[key] != null ? say[key] + raw.slice(key.length) : raw; };
    const split = s => String(s || '').split(/\s+/).filter(Boolean);
    const tokens = [];
    const add = (part, head) => split(part).forEach(raw => {
      tokens.push({ text: raw, head, words: speak(raw).split(/\s+/).map(norm).filter(Boolean) });
    });
    add(card.title, true);
    add(card.text, false);
    const spoken = s => split(s).map(speak).join(' ');
    const referenceText = (card.title ? spoken(card.title) + '. ' : '') + spoken(card.text);
    return { id: card.id, title: card.title, tokens, referenceText };
  }

  // How many tokens (from the start) to light up for the live text. Visual only:
  // each heard word may skip ahead at most 3 reference words, so noise does not jump far.
  function progress(tokens, partial) {
    const owner = [], ref = [];
    tokens.forEach((t, i) => t.words.forEach(w => { ref.push(w); owner.push(i); }));
    let p = 0;
    for (const w of spokenWords(partial)) {
      for (let j = p; j < Math.min(p + 4, ref.length); j++) if (ref[j] === w) { p = j + 1; break; }
    }
    return p === 0 ? 0 : owner[p - 1] + 1;
  }

  // Azure detail JSON -> per display token score. Inserted words are ignored; the rest are
  // matched to the reference words in order. A token's score is its lowest word score.
  function fromAzure(json, tokens) {
    const best = (json && json.NBest && json.NBest[0]) || {};
    const pa = best.PronunciationAssessment || {};
    const got = (best.Words || []).filter(w => (w.PronunciationAssessment || {}).ErrorType !== 'Insertion');
    let k = 0;
    const out = tokens.map(t => {
      let score = null, error = 'None';
      t.words.forEach(() => {
        const a = (got[k++] || {}).PronunciationAssessment;
        if (!a || a.ErrorType === 'Omission') { error = 'Omission'; return; }
        if (error === 'None' && a.ErrorType && a.ErrorType !== 'None') error = a.ErrorType;
        if (typeof a.AccuracyScore === 'number') score = score == null ? a.AccuracyScore : Math.min(score, a.AccuracyScore);
      });
      if (error === 'Omission') score = null;
      return { text: t.text, head: t.head, score: score == null ? null : Math.round(score), error };
    });
    const r = v => (typeof v === 'number' ? Math.round(v) : null);
    return {
      tokens: out,
      scores: { accuracy: r(pa.AccuracyScore), fluency: r(pa.FluencyScore), completeness: r(pa.CompletenessScore), prosody: r(pa.ProsodyScore), overall: r(pa.PronScore) ?? 0 },
    };
  }

  const clean = text => String(text).replace(/[^A-Za-z0-9'°–-]/g, '');

  function weakWords(tokens, max = SCORING.maxWeakPerCard) {
    const seen = new Set();
    return tokens
      .filter(t => t.error === 'Omission' || (t.score != null && t.score < SCORING.weak))
      .map(t => ({ w: clean(t.text), s: t.score == null ? -1 : t.score }))
      .filter(x => x.w)
      .sort((a, b) => a.s - b.s)
      .filter(x => { const key = x.w.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
      .slice(0, max)
      .map(x => x.w);
  }

  function rate(result) {
    const s = result.scores, c = s.completeness ?? 0, S = SCORING;
    const stars = c < S.minCompleteness ? 0 : s.overall >= S.three ? 3 : s.overall >= S.two ? 2 : s.overall >= S.one ? 1 : 0;
    const w = weakWords(result.tokens, 1)[0];
    const feedback = stars === 3 ? 'Excellent reading!'
      : stars === 2 ? (w ? `Great job! Try "${w}" again.` : 'Great job!')
      : stars === 1 ? (w ? `Good try! Listen and read "${w}" one more time.` : 'Good try!')
      : "Let's listen and try again.";
    return { stars, read: c >= S.readCompleteness, feedback };
  }

  const better = (a, b) => (!a || b.result.scores.overall > a.result.scores.overall ? b : a);

  function summarize(best) {
    const ids = CARD_IDS.filter(id => best[id]);
    const readCount = ids.filter(id => best[id].rate.read).length;
    return {
      stars: ids.reduce((n, id) => n + best[id].rate.stars, 0),
      maxStars: CARD_IDS.length * 3,
      readCount,
      allRead: readCount === CARD_IDS.length,
      weak: weakWords(ids.flatMap(id => best[id].result.tokens), SCORING.maxWeakSummary),
    };
  }

  function toPayload(grp, seat, card, entry, attempts) {
    const s = entry.result.scores;
    return {
      grp, seat, card, stars: entry.rate.stars, overall: s.overall,
      accuracy: s.accuracy, fluency: s.fluency, completeness: s.completeness, prosody: s.prosody,
      weak: weakWords(entry.result.tokens), attempts,
    };
  }

  const api = { CARDS, CARD_IDS, SCORING, spokenWords, prepare, progress, fromAzure, weakWords, rate, better, summarize, toPayload };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReadCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
