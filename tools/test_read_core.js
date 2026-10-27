// Self-check for src/read-core.js (pure logic of the Read & Check page).
// Usage: node tools/test_read_core.js
const assert = require('assert/strict');
const C = require('../src/read-core.js');

const card = id => C.prepare(C.CARDS.find(c => c.id === id));

// --- cards and reference text ---
assert.deepEqual(C.CARD_IDS, ['1', '2', '3', '4-1', '4-2', '5', '6']);
const c6 = card('6');
assert.equal(c6.referenceText, 'Fill the cups and bake. Spoon the batter into cupcake cases. Bake at one hundred eighty degrees for sixteen minutes.');
assert.deepEqual(c6.tokens.find(t => t.text === '180°C').words, ['one', 'hundred', 'eighty', 'degrees']);
assert.equal(c6.tokens.filter(t => t.head).length, 5);
assert.equal(card('5').referenceText, 'Mix with flour. Add flour in three to four times. Mix gently.');
assert.equal(card('3').referenceText, 'Whisk the eggs and sugar. Whisk eggs on high speed for two minutes. Add sugar and mix until creamy.');
const c42 = card('4-2');
assert.equal(c42.referenceText, 'Add the vanilla extract and the honey milk. Mix with a spatula.');
assert.equal(c42.tokens.filter(t => t.head).length, 0);
assert.deepEqual(c6.tokens.find(t => t.text === 'minutes.').words, ['minutes']);

// --- live progress ---
const c1 = card('1');
assert.equal(C.progress(c1.tokens, ''), 0);
assert.equal(C.progress(c1.tokens, 'prepare the liquids mix'), 4);
assert.equal(C.progress(c1.tokens, 'um prepare the'), 2);
assert.equal(C.progress(c6.tokens, 'fill the cups and bake spoon the batter into cupcake cases bake at 180 degrees'), 14);
assert.equal(C.progress(c6.tokens, 'Fill the cups and bake. Spoon the batter into cupcake cases. Bake at 180°C'), 14);

// --- Azure result alignment ---
const words = (c, f) => c.tokens.flatMap(t => t.words).map((w, i) => ({ Word: w, PronunciationAssessment: f(w, i) }));
const ok = s => ({ AccuracyScore: s, ErrorType: 'None' });
const w1 = words(c1, w => (w === 'honey' ? { AccuracyScore: 0, ErrorType: 'Omission' } : w === 'mix' ? { AccuracyScore: 62, ErrorType: 'Mispronunciation' } : ok(95)));
w1.splice(2, 0, { Word: 'um', PronunciationAssessment: { ErrorType: 'Insertion' } });
const json1 = { NBest: [{ PronunciationAssessment: { AccuracyScore: 81.4, FluencyScore: 90, CompletenessScore: 92, ProsodyScore: 77.6, PronScore: 83.2 }, Words: w1 }] };
const r1 = C.fromAzure(json1, c1.tokens);
assert.equal(r1.tokens.length, c1.tokens.length);
assert.deepEqual(r1.tokens.find(t => t.text === 'honey.'), { text: 'honey.', head: false, score: null, error: 'Omission' });
assert.deepEqual(r1.tokens.find(t => t.text === 'Mix'), { text: 'Mix', head: false, score: 62, error: 'Mispronunciation' });
assert.equal(r1.tokens[0].score, 95);
assert.deepEqual(r1.scores, { accuracy: 81, fluency: 90, completeness: 92, prosody: 78, overall: 83 });

const json6 = { NBest: [{ PronunciationAssessment: { PronScore: 70, CompletenessScore: 100 }, Words: words(c6, w => ok(w === 'eighty' ? 40 : 90)) }] };
assert.equal(C.fromAzure(json6, c6.tokens).tokens.find(t => t.text === '180°C').score, 40);
// Fewer words than expected: the rest count as omitted, nothing throws
const short = C.fromAzure({ NBest: [{ PronunciationAssessment: { PronScore: 20 }, Words: words(c1, () => ok(90)).slice(0, 3) }] }, c1.tokens);
assert.equal(short.tokens[5].error, 'Omission');
assert.equal(C.fromAzure({}, c1.tokens).scores.overall, 0);

// --- stars, read flag, feedback ---
const res = (overall, completeness, toks = []) => ({ tokens: toks, scores: { accuracy: overall, fluency: overall, completeness, prosody: overall, overall } });
assert.deepEqual(C.rate(res(90, 100)), { stars: 3, read: true, feedback: 'Excellent reading!' });
const weakTok = [{ text: 'whisk', score: 55, error: 'Mispronunciation' }];
assert.deepEqual(C.rate(res(75, 100, weakTok)), { stars: 2, read: true, feedback: 'Great job! Try "whisk" again.' });
assert.deepEqual(C.rate(res(55, 100, weakTok)), { stars: 1, read: true, feedback: 'Good try! Listen and read "whisk" one more time.' });
assert.equal(C.rate(res(90, 40)).stars, 0);
assert.equal(C.rate(res(90, 40)).read, false);
assert.equal(C.rate(res(40, 65)).read, true);
assert.equal(C.rate(res(40, 65)).feedback, "Let's listen and try again.");
assert.equal(C.rate(res(90, null)).read, false);

// --- weak words: omitted first, then lowest score, no duplicates, punctuation removed ---
const toks = [
  { text: 'Mix', score: 50, error: 'Mispronunciation' },
  { text: 'mix', score: 60, error: 'None' },
  { text: 'milk.', score: null, error: 'Omission' },
  { text: 'honey', score: 95, error: 'None' },
];
assert.deepEqual(C.weakWords(toks), ['milk', 'Mix']);
assert.deepEqual(C.weakWords(toks, 1), ['milk']);

// --- best attempt, summary, payload ---
const e = (overall, completeness) => { const r = res(overall, completeness, toks); return { result: r, rate: C.rate(r) }; };
assert.equal(C.better(undefined, e(50, 100)).result.scores.overall, 50);
assert.equal(C.better(e(80, 100), e(70, 100)).result.scores.overall, 80);
assert.equal(C.better(e(70, 100), e(80, 100)).result.scores.overall, 80);
const best = Object.fromEntries(C.CARD_IDS.map(id => [id, e(90, 100)]));
assert.deepEqual(C.summarize(best), { stars: 21, maxStars: 21, readCount: 7, allRead: true, weak: ['milk', 'Mix'] });
delete best['5'];
assert.equal(C.summarize(best).allRead, false);
assert.equal(C.summarize(best).readCount, 6);
assert.deepEqual(C.toPayload(3, 12, '4-1', e(75, 100), 2), {
  grp: 3, seat: 12, card: '4-1', stars: 2, overall: 75, accuracy: 75, fluency: 75, completeness: 100, prosody: 75, weak: ['milk', 'Mix'], attempts: 2,
});

console.log('read-core: all checks passed');
