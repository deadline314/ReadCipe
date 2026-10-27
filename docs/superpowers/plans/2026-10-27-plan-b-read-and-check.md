# 方案 B Read & Check 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每個學生用小組的 iPad 唸完 7 張步驟卡，由 Azure 發音評估評分；成績存在 Cloudflare D1，老師用 `/teacher/` 查看。

**Architecture:** 同一支 Cloudflare Worker（`wispy-fog-b991`）同時提供靜態網站（`dist/site`：簡報 `/`、學生頁 `/read/`、老師頁 `/teacher/`）和 `/api/*`（token、存成績、讀成績）。學生頁的純邏輯放在 `src/read-core.js`，用 node 測試，建置時內嵌進頁面。辨識引擎用介面抽象：`AzureEngine`（正式）和 `FakeEngine`（`?engine=fake`，給測試用）。

**Tech Stack:** 原生 HTML/CSS/JS（沒有框架）、Azure Speech SDK for JavaScript 1.52.0（jsDelivr browser bundle）、Cloudflare Workers + Static Assets + D1 + Rate Limiting binding、Wrangler 4、Python 3 + Pillow（建置）、Playwright for Python（E2E）。

規格：`docs/plan-b-pronunciation.md`。

## Global Constraints

- 簡報 `src/index.src.html` **不能改**；建置後 `dist/site/index.html` 和 `dist/vanilla-cupcakes.html` 必須和改動前位元組完全相同。
- 新頁面第一行是 `<meta charset="utf-8">`，接著 `<title>`、字型 `<link>`、`<style>`（build.py 的 `standalone()` 把第一個 `</style>` 之前的內容放進 `<head>`）。
- 圖片用 `<img data-img="girl_pin.webp">` 加 `const IMG = {{IMGMAP}};`；純邏輯用 `/*{{READCORE}}*/` 佔位，由 build.py 內嵌 `src/read-core.js`。
- Speech SDK URL 寫死：`https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.52.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js`（global `SpeechSDK`）。
- 卡片 id：`'1','2','3','4-1','4-2','5','6'`。`src/read-core.js` 和 `worker/index.mjs` 各有一份，要同步。
- 評分門檻全部在 `SCORING`：`three: 85, two: 70, one: 50, minCompleteness: 50, readCompleteness: 60, weak: 70, maxWeakPerCard: 10, maxWeakSummary: 5, maxTries: 3, silenceMs: 2500`。
- 不存錄音、不收姓名：只有組別 1–6、座號 1–40。
- localStorage key：`readcipe-group`、`readcipe-pending`。每次讀寫都包 try/catch。
- 學生頁、老師頁的介面文字用英文；給老師看的錯誤訊息附中文。不用 emoji。
- 老師頁一律用 `textContent` 和 DOM API 產生內容，不用 `innerHTML` 塞資料：`weak` 欄位來自任何人都能 POST 的 API。
- Azure 金鑰只能放在 Cloudflare secret 或 `.dev.vars`（已在 `.gitignore`），不能 commit，也不能貼到對話裡。
- Windows 上用 `python`；Cloud 環境用 `python3`，Chromium 在 `/opt/pw-browsers`，不要 `playwright install`。

## 檔案結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `src/read-core.js` | 新增 | 卡片資料、reference text、即時亮字進度、Azure 結果對齊、星星與回饋、要再練的字、總結、上傳資料格式。沒有 DOM、沒有網路 |
| `tools/test_read_core.js` | 新增 | read-core 的 node assert 測試 |
| `tools/build.py` | 修改 | 多頁面建置＋內嵌 read-core；簡報輸出不變 |
| `src/read.src.html` | 新增 | 學生頁：畫面、引擎、token、上傳佇列 |
| `src/teacher.src.html` | 新增 | 老師頁：成績表、自動更新 |
| `worker/index.mjs` | 新增 | `/api/*` 路由、驗證、D1 upsert；其他路徑交給 `env.ASSETS` |
| `worker/schema.sql` | 新增 | D1 資料表 |
| `worker/test.mjs` | 新增 | Worker 驗證邏輯的 node assert 測試 |
| `wrangler.jsonc` | 新增 | Worker 設定 |
| `tools/test_read.py` | 新增 | Playwright E2E：學生流程＋老師頁，mock API |
| `requirements.txt`、`README.md`、`docs/HANDOFF.md`、`CLAUDE.md`、`AGENTS.md`、`docs/architecture.md` | 修改 | 部署與維護說明 |

---

### Task 1：read-core 純邏輯

**Files:**
- Create: `src/read-core.js`
- Test: `tools/test_read_core.js`

**Interfaces:**
- Produces（`window.ReadCore`，在 node 是 `module.exports`）：
  - `CARDS: {id, title, text, say?}[]`、`CARD_IDS: string[]`、`SCORING: object`
  - `prepare(card) -> {id, title, tokens: {text, head: bool, words: string[]}[], referenceText: string}`
  - `spokenWords(text) -> string[]`（正規化成小寫字，數字展開成英文字）
  - `progress(tokens, partialText) -> number`（要亮起的 token 數，從頭算）
  - `fromAzure(json, tokens) -> Result`；`Result = {tokens: {text, head, score: number|null, error: string}[], scores: {accuracy, fluency, completeness, prosody, overall}}`
  - `rate(result) -> {stars: 0-3, read: bool, feedback: string}`
  - `weakWords(resultTokens, max?) -> string[]`
  - `better(a, b) -> entry`；`entry = {result, rate}`
  - `summarize(best: {[cardId]: entry}) -> {stars, maxStars, readCount, allRead, weak: string[]}`
  - `toPayload(grp, seat, cardId, entry, attempts) -> {grp, seat, card, stars, overall, accuracy, fluency, completeness, prosody, weak, attempts}`

- [ ] **Step 1：寫會失敗的測試**

建立 `tools/test_read_core.js`：

```js
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
```

- [ ] **Step 2：跑測試確認失敗**

Run: `node tools/test_read_core.js`
Expected: FAIL，`Cannot find module '../src/read-core.js'`

- [ ] **Step 3：寫實作**

建立 `src/read-core.js`：

```js
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
```

- [ ] **Step 4：跑測試確認通過**

Run: `node tools/test_read_core.js`
Expected: `read-core: all checks passed`

- [ ] **Step 5：Commit**

```bash
git add src/read-core.js tools/test_read_core.js
git commit -m "feat(read): pure read-aloud logic with node self-check"
```

---

### Task 2：多頁面建置

**Files:**
- Modify: `tools/build.py`（`main()`、新增 `render()` 與 `PAGES`）
- Create: `src/read.src.html`、`src/teacher.src.html`（先放最小骨架，Task 4、5 再填）

**Interfaces:**
- Consumes：`src/read-core.js`（Task 1）
- Produces：`dist/site/read/index.html`、`dist/site/teacher/index.html`；佔位 `/*{{READCORE}}*/` 和 `{{IMGMAP}}` 在任何頁面都會被取代

- [ ] **Step 1：記錄簡報目前的輸出雜湊（回歸基準）**

Run:
```bash
python tools/build.py && sha256sum dist/site/index.html dist/vanilla-cupcakes.html > "$TMPDIR/deck.sha"; cat "$TMPDIR/deck.sha"
```
Expected：印出兩個雜湊。（Windows Git Bash 沒有 `$TMPDIR` 時，改用 scratchpad 路徑。）

- [ ] **Step 2：建立兩個最小頁面**

`src/read.src.html`：
```html
<meta charset="utf-8">
<title>Read &amp; Check</title>
<style>body{margin:0}</style>
<p id="probe">read</p>
<script>
/*{{READCORE}}*/
const IMG = {{IMGMAP}};
document.getElementById('probe').textContent = 'cards: ' + window.ReadCore.CARD_IDS.length;
</script>
```

`src/teacher.src.html`：
```html
<meta charset="utf-8">
<title>Reading Scores</title>
<style>body{margin:0}</style>
<p id="probe">teacher</p>
<script>
/*{{READCORE}}*/
document.getElementById('probe').textContent = 'cards: ' + window.ReadCore.CARD_IDS.length;
</script>
```

- [ ] **Step 3：改 build.py**

把 docstring 的 Outputs 補上兩行，並把 `main()` 換成下面的版本（`image_map`、`standalone` 不動）：

```python
"""...（原本的說明保留，Outputs 加上）
  dist/site/read/index.html     Read & Check student page (iPad), website only.
  dist/site/teacher/index.html  Teacher score page, website only.

Pages may contain the placeholder comment READCORE (written as /*{{READCORE}}*/);
it is replaced by src/read-core.js so the pure logic stays testable with node.
"""
```

```python
SRC_DIR = ROOT / 'src'
CORE = SRC_DIR / 'read-core.js'
# Extra website pages: (source file in src/, output folder under dist/site/)
PAGES = [('read.src.html', 'read'), ('teacher.src.html', 'teacher')]


def render(src):
    """Fill the image map and inline the shared read-aloud logic."""
    out = src.replace('{{IMGMAP}}', json.dumps(image_map(src)))
    if '/*{{READCORE}}*/' in out:
        out = out.replace('/*{{READCORE}}*/', CORE.read_text(encoding='utf-8'))
    return out


def main():
    site = DIST / 'site'
    site.mkdir(parents=True, exist_ok=True)
    out = render(SRC.read_text(encoding='utf-8'))
    (DIST / 'vanilla-cupcakes.html').write_text(out, encoding='utf-8')
    (site / 'index.html').write_text(standalone(out), encoding='utf-8')
    print(f'deck: artifact {round(len(out) / 1024)} KB -> dist/vanilla-cupcakes.html, site -> dist/site/index.html')
    for name, folder in PAGES:
        page = render((SRC_DIR / name).read_text(encoding='utf-8'))
        (site / folder).mkdir(exist_ok=True)
        (site / folder / 'index.html').write_text(standalone(page), encoding='utf-8')
        print(f'{name}: {round(len(page) / 1024)} KB -> dist/site/{folder}/index.html')
```

- [ ] **Step 4：建置並確認簡報沒變、新頁面有內嵌 read-core**

Run:
```bash
python tools/build.py && sha256sum -c "$TMPDIR/deck.sha" && grep -c "CARD_IDS" dist/site/read/index.html dist/site/teacher/index.html && grep -c "READCORE\|IMGMAP" dist/site/read/index.html
```
Expected：兩個 `OK`；兩個頁面的 `CARD_IDS` 計數 ≥ 1；最後一個 grep 印出 `0`（佔位都被取代了，grep 會回傳 exit 1，這是預期的）。

- [ ] **Step 5：Commit**

```bash
git add tools/build.py src/read.src.html src/teacher.src.html
git commit -m "build: multi-page site build with inlined read-core"
```

---

### Task 3：Worker API 與 D1

**Files:**
- Create: `worker/index.mjs`、`worker/schema.sql`、`worker/test.mjs`、`wrangler.jsonc`

**Interfaces:**
- Produces（HTTP）：
  - `GET /api/token` → `200 {token, region}` ｜ `429 {error:'rate'}` ｜ `500 {error:'config'}` ｜ `502 {error:'token'}`
  - `POST /api/score`，body 同 `ReadCore.toPayload()` → `200 {ok:true}` ｜ `400 {error:<欄位名>}` ｜ `413` ｜ `429`
  - `GET /api/scores?day=YYYY-MM-DD` → `200 {day, rows: [{seat, card, grp, stars, overall, accuracy, fluency, completeness, prosody, weak: string[], attempts, updated_at}]}`
  - 任何 `/api/*` 的 `Origin` 和自己網域不同 → `403 {error:'origin'}`
- Produces（JS，給測試用）：`parseScore(body) -> {value} | {error}`、`taipeiDay(nowMs) -> 'YYYY-MM-DD'`、`CARD_IDS`

- [ ] **Step 1：寫會失敗的測試**

建立 `worker/test.mjs`：

```js
// Self-check for the Worker's pure helpers. Usage: node worker/test.mjs
import assert from 'node:assert/strict';
import { parseScore, taipeiDay, CARD_IDS } from './index.mjs';

assert.deepEqual(CARD_IDS, ['1', '2', '3', '4-1', '4-2', '5', '6']);
// 2026-10-29 16:30 UTC is already 10-30 in Taipei
assert.equal(taipeiDay(Date.UTC(2026, 9, 29, 16, 30)), '2026-10-30');
assert.equal(taipeiDay(Date.UTC(2026, 9, 29, 15, 59)), '2026-10-29');

const good = { grp: 3, seat: 12, card: '4-1', stars: 2, overall: 74.6, accuracy: 80, fluency: null, completeness: 100, prosody: 70.2, weak: ['whisk'], attempts: 2 };
assert.deepEqual(parseScore(good), { value: { grp: 3, seat: 12, card: '4-1', stars: 2, overall: 75, attempts: 2, accuracy: 80, fluency: null, completeness: 100, prosody: 70, weak: ['whisk'] } });
assert.deepEqual(parseScore({ ...good, weak: undefined }).value.weak, []);

const bad = (patch, field) => assert.deepEqual(parseScore({ ...good, ...patch }), { error: field }, JSON.stringify(patch));
bad({ seat: 41 }, 'seat');
bad({ seat: '12' }, 'seat');
bad({ grp: 0 }, 'grp');
bad({ card: '7' }, 'card');
bad({ stars: 4 }, 'stars');
bad({ overall: -1 }, 'overall');
bad({ attempts: 4 }, 'attempts');
bad({ accuracy: 101 }, 'accuracy');
bad({ prosody: NaN }, 'prosody');
bad({ weak: 'whisk' }, 'weak');
bad({ weak: Array(11).fill('a') }, 'weak');
bad({ weak: ['x'.repeat(31)] }, 'weak');
bad({ weak: [''] }, 'weak');
assert.deepEqual(parseScore(null), { error: 'body' });
assert.deepEqual(parseScore([]), { error: 'body' });

console.log('worker: all checks passed');
```

- [ ] **Step 2：跑測試確認失敗**

Run: `node worker/test.mjs`
Expected: FAIL，`Cannot find module ... worker/index.mjs`

- [ ] **Step 3：寫 Worker**

建立 `worker/index.mjs`：

```js
// ReadCipe Worker: serves the static site (dist/site) and the Read & Check API.
// Static files never reach this code (wrangler.jsonc run_worker_first: /api/* only).

// Keep in sync with CARD_IDS in src/read-core.js.
export const CARD_IDS = ['1', '2', '3', '4-1', '4-2', '5', '6'];

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

/** Calendar day in Taipei (UTC+8, no DST), used to group a lesson's scores. */
export function taipeiDay(now = Date.now()) {
  return new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
}

const int = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : undefined);

/** Validate a score upload from the student page. Returns { value } or { error: fieldName }. */
export function parseScore(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'body' };
  const v = {
    grp: int(b.grp, 1, 6), seat: int(b.seat, 1, 40), card: CARD_IDS.includes(b.card) ? b.card : undefined,
    stars: int(b.stars, 0, 3), overall: int(b.overall, 0, 100), attempts: int(b.attempts, 1, 3),
  };
  for (const k of Object.keys(v)) if (v[k] === undefined) return { error: k };
  for (const k of ['accuracy', 'fluency', 'completeness', 'prosody']) {
    if (b[k] == null) { v[k] = null; continue; }
    v[k] = int(b[k], 0, 100);
    if (v[k] === undefined) return { error: k };
  }
  const weak = b.weak == null ? [] : b.weak;
  if (!Array.isArray(weak) || weak.length > 10 || weak.some(w => typeof w !== 'string' || !w || w.length > 30)) return { error: 'weak' };
  v.weak = weak;
  return { value: v };
}

// One row per day + seat + card. Score columns are replaced only by a better overall score;
// attempts always add up; grp follows the latest upload.
const UPSERT = `
INSERT INTO scores (day, seat, card, grp, stars, overall, accuracy, fluency, completeness, prosody, weak, attempts, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
ON CONFLICT (day, seat, card) DO UPDATE SET
  grp          = excluded.grp,
  stars        = CASE WHEN excluded.overall > scores.overall THEN excluded.stars        ELSE scores.stars        END,
  accuracy     = CASE WHEN excluded.overall > scores.overall THEN excluded.accuracy     ELSE scores.accuracy     END,
  fluency      = CASE WHEN excluded.overall > scores.overall THEN excluded.fluency      ELSE scores.fluency      END,
  completeness = CASE WHEN excluded.overall > scores.overall THEN excluded.completeness ELSE scores.completeness END,
  prosody      = CASE WHEN excluded.overall > scores.overall THEN excluded.prosody      ELSE scores.prosody      END,
  weak         = CASE WHEN excluded.overall > scores.overall THEN excluded.weak         ELSE scores.weak         END,
  overall      = MAX(excluded.overall, scores.overall),
  attempts     = scores.attempts + excluded.attempts,
  updated_at   = excluded.updated_at`;

const SELECT = `SELECT seat, card, grp, stars, overall, accuracy, fluency, completeness, prosody, weak, attempts, updated_at
FROM scores WHERE day = ?1 ORDER BY grp, seat`;

/** true when this key is over its limit. A missing or failing limiter never blocks a class. */
async function limited(limiter, key) {
  if (!limiter) return false;
  try { return !(await limiter.limit({ key })).success; } catch (e) { console.error('ratelimit', e); return false; }
}

function parseJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

async function api(request, env, url) {
  const origin = request.headers.get('Origin');
  if (origin) {
    let same = false;
    try { same = new URL(origin).host === url.host; } catch { /* malformed Origin */ }
    if (!same) return json({ error: 'origin' }, 403);
  }
  // A whole school may share one IP; limits are sized for that (6 iPads + teacher).
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  if (url.pathname === '/api/token' && request.method === 'GET') {
    if (await limited(env.TOKEN_LIMIT, ip)) return json({ error: 'rate' }, 429);
    if (!env.AZURE_SPEECH_KEY || !env.AZURE_SPEECH_REGION) { console.error('Azure secrets are not set'); return json({ error: 'config' }, 500); }
    const r = await fetch(`https://${env.AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY, 'Content-Length': '0' },
    });
    if (!r.ok) { console.error('issueToken failed', r.status, await r.text().catch(() => '')); return json({ error: 'token' }, 502); }
    return json({ token: await r.text(), region: env.AZURE_SPEECH_REGION });
  }

  if (url.pathname === '/api/score' && request.method === 'POST') {
    if (await limited(env.SCORE_LIMIT, ip)) return json({ error: 'rate' }, 429);
    if (Number(request.headers.get('Content-Length') || 0) > 4096) return json({ error: 'size' }, 413);
    const text = await request.text();
    if (text.length > 4096) return json({ error: 'size' }, 413);
    const { value: v, error } = parseScore(parseJson(text, null));
    if (error) return json({ error }, 400);
    await env.DB.prepare(UPSERT).bind(
      taipeiDay(), v.seat, v.card, v.grp, v.stars, v.overall,
      v.accuracy, v.fluency, v.completeness, v.prosody, JSON.stringify(v.weak), v.attempts, Date.now(),
    ).run();
    return json({ ok: true });
  }

  if (url.pathname === '/api/scores' && request.method === 'GET') {
    const day = url.searchParams.get('day') || taipeiDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'day' }, 400);
    const { results } = await env.DB.prepare(SELECT).bind(day).all();
    return json({ day, rows: results.map(r => ({ ...r, weak: parseJson(r.weak, []) })) });
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (e) {
      console.error('api error', url.pathname, e);
      return json({ error: 'server' }, 500);
    }
  },
};
```

建立 `worker/schema.sql`：

```sql
-- Read & Check scores. One row per day + seat + card; the best reading wins (see worker/index.mjs).
CREATE TABLE IF NOT EXISTS scores (
  day          TEXT    NOT NULL,             -- YYYY-MM-DD, Taipei time, set by the Worker
  seat         INTEGER NOT NULL,             -- seat number 1-40 (no names)
  card         TEXT    NOT NULL,             -- '1','2','3','4-1','4-2','5','6'
  grp          INTEGER NOT NULL,             -- group 1-6 (latest upload)
  stars        INTEGER NOT NULL,             -- 0-3
  overall      INTEGER NOT NULL,             -- Azure PronScore 0-100
  accuracy     INTEGER,
  fluency      INTEGER,
  completeness INTEGER,
  prosody      INTEGER,
  weak         TEXT    NOT NULL DEFAULT '[]', -- JSON array of words to practice
  attempts     INTEGER NOT NULL DEFAULT 1,
  updated_at   INTEGER NOT NULL,             -- epoch ms
  PRIMARY KEY (day, seat, card)
);
```

建立 `wrangler.jsonc`：

```jsonc
{
  // ReadCipe: deck + Read & Check pages (dist/site) + /api/* in one Worker.
  // The name must stay "wispy-fog-b991" so the existing workers.dev URL keeps working.
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "wispy-fog-b991",
  "main": "worker/index.mjs",
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./dist/site",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    // Create with: npx wrangler d1 create readcipe   (then paste the id here)
    { "binding": "DB", "database_name": "readcipe", "database_id": "PASTE_DATABASE_ID_FROM_WRANGLER_D1_CREATE" }
  ],
  // Per-IP limits; the code skips them if the binding is missing.
  "ratelimits": [
    { "name": "TOKEN_LIMIT", "namespace_id": "1001", "simple": { "limit": 20, "period": 60 } },
    { "name": "SCORE_LIMIT", "namespace_id": "1002", "simple": { "limit": 60, "period": 60 } }
  ],
  "observability": { "enabled": true }
  // Secrets (never in this file): npx wrangler secret put AZURE_SPEECH_KEY / AZURE_SPEECH_REGION
  // Local dev: put them in .dev.vars (git-ignored).
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `node worker/test.mjs`
Expected: `worker: all checks passed`

- [ ] **Step 5：本機 D1＋wrangler dev 檢查 API**

`database_id` 還是佔位字串時，本機 dev 仍然可以跑（本機 D1 只看 `database_name`）。

Run（建置一次讓 `dist/site` 存在，建立本機資料表，背景啟動 dev server）：
```bash
python tools/build.py
npx wrangler@4 d1 execute readcipe --local --file worker/schema.sql
npx wrangler@4 dev --port 8787
```
（`wrangler dev` 用 `run_in_background` 跑。）

再依序執行：
```bash
B=http://127.0.0.1:8787
curl -s $B/api/scores
curl -s -X POST $B/api/score -H 'content-type: application/json' -d '{"grp":3,"seat":12,"card":"1","stars":2,"overall":75,"completeness":100,"weak":["whisk"],"attempts":2}'
curl -s -X POST $B/api/score -H 'content-type: application/json' -d '{"grp":3,"seat":12,"card":"1","stars":1,"overall":60,"completeness":90,"weak":["milk"],"attempts":1}'
curl -s $B/api/scores
curl -s -X POST $B/api/score -H 'content-type: application/json' -d '{"grp":3,"seat":99,"card":"1","stars":2,"overall":75,"attempts":1}'
curl -s -H 'Origin: https://evil.example' $B/api/scores
curl -s $B/api/token
curl -s -o /dev/null -w '%{http_code}\n' $B/
curl -s -o /dev/null -w '%{http_code}\n' $B/read/
```
Expected，依序：
1. `{"day":"<今天>","rows":[]}`
2. `{"ok":true}`
3. `{"ok":true}`
4. 只有一列：`"stars":2,"overall":75`、`"weak":["whisk"]`、`"attempts":3`（低分沒有覆蓋，次數有累加）
5. `{"error":"seat"}`
6. `{"error":"origin"}`
7. 還沒設 `.dev.vars` 時是 `{"error":"config"}`
8. `200`
9. `200`

結束後停掉 dev server。

- [ ] **Step 6：Commit**

```bash
git add worker/index.mjs worker/schema.sql worker/test.mjs wrangler.jsonc
git commit -m "feat(worker): token, score upsert and scores API on D1"
```

---

### Task 4：學生頁（iPad）

**Files:**
- Modify（整檔取代 Task 2 的骨架）：`src/read.src.html`
- Create：`tools/test_read.py`（這個 task 先寫學生流程；Task 5 再加老師頁的部分）
- Modify：`requirements.txt`（註明 test_read.py 也需要 playwright）

**Interfaces:**
- Consumes：`ReadCore.*`（Task 1）、`POST /api/score`、`GET /api/token`（Task 3）
- Produces：E2E 依賴的 DOM id：`#groupPad`、`#seatPad`、`#seatShow`、`#startBtn`、`#readBtn`、`#listenBtn`、`#cancelBtn`、`#againBtn`、`#nextBtn`、`#sentence`、`#cardTitle`、`#stars`、`#feedback`、`#nextKid`、`#sumStars`、`#sumBadge`、`#sumWeak`、`#msg`、`[data-screen="group|seat|card|summary"]`

- [ ] **Step 1：寫會失敗的 E2E 測試**

建立 `tools/test_read.py`：

```python
"""E2E check for the Read & Check pages with a fake speech engine and a mocked API.

Serves dist/site over http (relative /api/* URLs need an origin), drives the student
flow on an iPad-sized viewport, checks the uploads, screenshots each screen and fails
on any page error.

Usage:  python tools/test_read.py [out_dir]      (default: ./screenshots/read)
Needs:  playwright + Chromium. Locally: pip install playwright && python -m playwright install chromium
        In the Claude cloud sandbox Chromium is preinstalled at /opt/pw-browsers.
"""
import asyncio
import functools
import http.server
import json
import pathlib
import sys
import threading

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'dist' / 'site'
CARDS = ['1', '2', '3', '4-1', '4-2', '5', '6']


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITE))
    handler.log_message = lambda *a: None
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


async def student(page, base, out, posted):
    await page.goto(base + '/read/?engine=fake')
    await page.click('#groupPad button:text-is("3")')
    await page.click('#seatPad button:text-is("12")')
    assert await page.inner_text('#seatShow') == '12'
    await page.screenshot(path=str(out / '1-seat.png'))
    await page.click('#startBtn')
    for i, card in enumerate(CARDS):
        await page.click('#readBtn')
        await page.wait_for_selector('#nextBtn:not([hidden])', timeout=15000)
        if i == 0:
            assert await page.locator('#sentence .w.bad').count() + await page.locator('#cardTitle .w.bad').count() == 1
            assert '★' in await page.inner_text('#stars')
            await page.screenshot(path=str(out / '2-card-result.png'))
            await page.click('#againBtn')  # second reading of card 1
            await page.wait_for_selector('#nextBtn:not([hidden])', timeout=15000)
        await page.click('#nextBtn')
    await page.wait_for_selector('[data-screen="summary"]:not([hidden])')
    assert 'All 7 steps read!' in await page.inner_text('#sumBadge')
    await page.wait_for_timeout(800)  # confetti + upload queue
    await page.screenshot(path=str(out / '3-summary.png'))
    assert [p['card'] for p in posted] == CARDS, posted
    assert posted[0]['attempts'] == 2 and posted[1]['attempts'] == 1, posted
    assert all(p['grp'] == 3 and p['seat'] == 12 for p in posted), posted
    await page.click('#nextKid')
    assert await page.is_visible('[data-screen="seat"]')
    assert await page.is_disabled('#startBtn')
    # the group is remembered after a reload
    await page.reload()
    assert await page.is_visible('[data-screen="seat"]')


async def main(out):
    out.mkdir(parents=True, exist_ok=True)
    httpd = serve()
    base = f'http://127.0.0.1:{httpd.server_address[1]}'
    errors, posted = [], []

    async def api(route):
        url = route.request.url
        if url.endswith('/api/score'):
            posted.append(json.loads(route.request.post_data))
            await route.fulfill(json={'ok': True})
        elif '/api/scores' in url:
            await route.fulfill(json={'day': '2026-10-30', 'rows': ROWS})
        else:
            await route.fulfill(status=404, json={'error': 'not_found'})

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1024, 'height': 768}, has_touch=True)  # iPad landscape
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        await page.route('**/api/**', api)
        # the fake engine does not need the Speech SDK; keep the test offline and fast
        await page.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(body='', content_type='application/javascript'))
        await student(page, base, out, posted)
        await browser.close()
    httpd.shutdown()
    if errors:
        print('PAGE ERRORS:', *errors, sep='\n')
        sys.exit(1)
    print('ok, screenshots in', out)


ROWS = []  # teacher-page sample data, filled in Task 5

if __name__ == '__main__':
    asyncio.run(main(pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'screenshots' / 'read'))
```

- [ ] **Step 2：跑測試確認失敗**

Run（第一次要先裝 Playwright）：
```bash
pip install playwright && python -m playwright install chromium
python tools/build.py && python tools/test_read.py
```
Expected: FAIL，在 `#groupPad button:text-is("3")` 逾時（骨架頁還沒有這些元素）。

- [ ] **Step 3：寫學生頁**

用下面內容整檔取代 `src/read.src.html`：

```html
<meta charset="utf-8">
<title>Read &amp; Check</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700;800;900&display=swap">
<style>
/* Read & Check: student page for the group iPad. Same look as the deck (peach grid paper, Fredoka). */
:root{
  --paper:#FCE7D6; --grid:#FFF6EE; --ink:#3B2A28; --brown:#6A3C3A; --rose:#EBA3A3; --apricot:#F2B184;
  --card:#FFFFFF; --lemon:#F7E35C; --verb:#E0473F; --noun:#5B30E6; --mint:#6CB98A; --sky:#7FB3E0;
  --good:#3E9A63; --ok:#D99A16; --bad:#E0473F; --miss:#A89A96;
  --display:'Fredoka',system-ui,sans-serif; --body:'Nunito',system-ui,sans-serif;
}
[hidden]{display:none!important}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{font-family:var(--body);color:var(--ink);background-color:var(--paper);
  background-image:linear-gradient(var(--grid) 2px,transparent 2px),linear-gradient(90deg,var(--grid) 2px,transparent 2px);
  background-size:36px 36px;-webkit-text-size-adjust:100%}
button{font:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#app{max-width:1000px;margin:0 auto;padding:16px 20px 32px;min-height:100vh;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.brand{font-family:var(--display);font-weight:700;font-size:28px;color:var(--brown);flex:1;text-align:center}
.chip{background:#fff;border:3px solid #E7B48C;border-radius:999px;padding:6px 16px;font-weight:800;color:var(--brown);cursor:pointer}
.chip:disabled{opacity:.4}
h1{font-family:var(--display);font-weight:700;color:var(--brown);text-align:center;font-size:40px;margin:12px 0 20px}
section{flex:1;display:flex;flex-direction:column;align-items:center}
.pad{display:grid;gap:14px;width:100%;max-width:720px}
#groupPad{grid-template-columns:repeat(3,1fr)}
#groupPad button{font-family:var(--display);font-size:44px;height:120px;border-radius:28px;background:#fff;border:4px solid var(--apricot);color:var(--brown);cursor:pointer}
#seatPad{grid-template-columns:repeat(8,1fr);gap:10px}
#seatPad button{font-family:var(--display);font-size:26px;height:62px;border-radius:16px;background:#fff;border:3px solid #E7B48C;color:var(--brown);cursor:pointer}
#seatPad button.on{background:var(--lemon);border-color:var(--brown)}
.seat-show{font-family:var(--display);font-size:64px;color:var(--noun);min-height:80px;margin-bottom:8px}
.girl{width:120px;height:auto}
.btn{font-family:var(--body);font-weight:800;font-size:24px;color:#4E302C;background:#FFF3E6;border:3px solid #E7B48C;border-radius:999px;padding:14px 30px;cursor:pointer}
.btn.go{background:var(--mint);border-color:#3E8A5E;color:#fff}
.btn.big{font-size:30px;padding:18px 46px;margin-top:20px}
.btn:disabled{opacity:.38;cursor:not-allowed}
.btn:focus-visible,.chip:focus-visible,.pad button:focus-visible{outline:4px solid var(--noun);outline-offset:3px}
.dots{display:flex;gap:10px;margin:4px 0 14px}
.dots i{width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid #E7B48C}
.dots i.done{background:var(--mint);border-color:#3E8A5E}
.dots i.now{background:var(--lemon);border-color:var(--brown);transform:scale(1.25)}
.card{background:var(--card);border-radius:28px;padding:26px 32px;width:100%;box-shadow:0 6px 0 rgba(106,60,58,.15)}
.step-no{font-family:var(--display);font-weight:700;font-size:26px;color:var(--apricot);-webkit-text-stroke:1px var(--brown)}
.hl{display:inline-block;background:var(--lemon);border-radius:10px;padding:2px 12px;font-family:var(--display);font-weight:600;font-size:34px;margin:8px 0 6px;color:var(--brown)}
.sentence{font-size:40px;line-height:1.5;font-weight:800;margin:6px 0 0}
.w{border-radius:8px;padding:0 3px;transition:background-color .2s,color .2s}
.w.lit{background:#FFF3B0}
.w.good{color:var(--good)} .w.ok{color:var(--ok)} .w.bad{color:var(--bad);text-decoration:underline wavy}
.w.miss{color:var(--miss);text-decoration:line-through}
.status{font-family:var(--display);font-size:34px;color:var(--noun);min-height:48px;margin-top:14px}
.status.live::before{content:'';display:inline-block;width:22px;height:22px;border-radius:50%;background:var(--verb);margin-right:12px;vertical-align:middle;animation:pulse 1s infinite}
@keyframes pulse{50%{transform:scale(1.4);opacity:.6}}
.stars{font-size:54px;color:#F2B01E;letter-spacing:6px;min-height:64px}
.feedback{font-size:28px;font-weight:800;color:var(--brown);margin:0 0 6px;min-height:38px;text-align:center}
.actions{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin-top:10px}
.stars.big{font-size:72px}
.badge{font-family:var(--display);font-size:32px;background:var(--lemon);border-radius:999px;padding:8px 28px;color:var(--brown);margin:8px 0 16px}
.weak{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.weak button{font-size:28px;font-weight:800;background:#fff;border:3px solid var(--rose);border-radius:16px;padding:10px 20px;color:var(--verb);cursor:pointer}
.weak button::before{content:'▶ ';font-size:20px;color:var(--brown)}
.msg{position:fixed;inset:0;background:rgba(59,42,40,.55);display:flex;align-items:center;justify-content:center;padding:20px;z-index:10}
.msg>div{background:#fff;border-radius:24px;padding:28px 32px;max-width:560px;text-align:center}
.msg p{font-size:24px;font-weight:800;white-space:pre-line;margin:0 0 18px}
.confetti{position:fixed;top:-20px;width:12px;height:18px;border-radius:3px;z-index:5;pointer-events:none;animation:fall 2.6s linear forwards}
@keyframes fall{to{transform:translateY(110vh) rotate(720deg)}}
@media (max-width:760px){
  #seatPad{grid-template-columns:repeat(5,1fr)} .sentence{font-size:30px} .hl{font-size:26px} h1{font-size:32px}
}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition:none!important}}
</style>
<main id="app">
  <header class="top">
    <button class="chip" id="whoBtn" hidden></button>
    <span class="brand">Read &amp; Check</span>
    <button class="chip" id="grpBtn" hidden></button>
  </header>

  <section data-screen="group" hidden>
    <h1>Which group are you?</h1>
    <div class="pad" id="groupPad"></div>
  </section>

  <section data-screen="seat" hidden>
    <img class="girl" data-img="girl_pin.webp" alt="">
    <h1>What is your seat number?</h1>
    <div class="seat-show" id="seatShow">–</div>
    <div class="pad" id="seatPad"></div>
    <button class="btn go big" id="startBtn" disabled>Start</button>
  </section>

  <section data-screen="card" hidden>
    <div class="dots" id="dots"></div>
    <div class="card">
      <div class="step-no" id="stepNo"></div>
      <h2 class="hl" id="cardTitle"></h2>
      <p class="sentence" id="sentence"></p>
    </div>
    <div class="status" id="status"></div>
    <div class="stars" id="stars"></div>
    <p class="feedback" id="feedback"></p>
    <div class="actions">
      <button class="btn" id="listenBtn">Listen</button>
      <button class="btn go big" id="readBtn">Start reading</button>
      <button class="btn" id="cancelBtn" hidden>Cancel</button>
      <button class="btn" id="againBtn" hidden>Try again</button>
      <button class="btn go" id="nextBtn" hidden>Next</button>
    </div>
  </section>

  <section data-screen="summary" hidden>
    <h1 id="sumTitle"></h1>
    <div class="stars big" id="sumStars"></div>
    <div class="badge" id="sumBadge"></div>
    <h2 id="sumWeakHead">Words to practice</h2>
    <div class="weak" id="sumWeak"></div>
    <button class="btn go big" id="nextKid">Next classmate</button>
  </section>

  <div class="msg" id="msg" hidden><div><p id="msgText"></p><button class="btn go" id="msgBtn">OK</button></div></div>
</main>
<script src="https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.52.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js" defer></script>
<script>
/*{{READCORE}}*/
(() => {
  'use strict';
  const C = window.ReadCore;
  const IMG = {{IMGMAP}};
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fail = code => Object.assign(new Error(code), { code });
  document.querySelectorAll('img[data-img]').forEach(i => { const u = IMG[i.dataset.img]; if (u) i.src = u; });

  // localStorage can throw (private mode, blocked storage): never let it break the page.
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  const MSG = {
    mic: 'Please ask your teacher to allow the microphone.\n請老師幫忙開啟麥克風：設定 > Safari > 麥克風 > 允許，然後重新整理。',
    token: 'Please ask your teacher.\n請老師幫忙：無法連到評分服務，請檢查網路。',
    sdk: 'Please check the internet and reload the page.\n請檢查網路後重新整理。',
    nomatch: "I couldn't hear you. Hold the iPad closer and try again.",
    canceled: "Something went wrong. Let's try again.",
  };

  // ---------- Azure token (10 min valid; cached 9 min, one retry) ----------
  const Token = {
    v: null,
    async get() {
      if (this.v && Date.now() - this.v.at < 9 * 60e3) return this.v;
      for (let i = 0; i < 2; i++) {
        try {
          const r = await fetch('/api/token', { cache: 'no-store' });
          if (r.ok) { const d = await r.json(); this.v = { token: d.token, region: d.region, at: Date.now() }; return this.v; }
          console.error('token http', r.status);
        } catch (e) { console.error('token', e); }
      }
      throw fail('token');
    },
    clear() { this.v = null; },
  };

  // ---------- engines: assess(card, { onPartial, signal }) -> Promise<Result> ----------
  const classify = msg => fail(/permission|notallowed|denied/i.test(msg) ? 'mic' : 'canceled');

  const AzureEngine = {
    async assess(card, { onPartial, signal }) {
      const sdk = window.SpeechSDK;
      if (!sdk) throw fail('sdk');
      const { token, region } = await Token.get();
      if (signal.aborted) throw fail('cancel');
      const cfg = sdk.SpeechConfig.fromAuthorizationToken(token, region);
      cfg.speechRecognitionLanguage = 'en-US';
      cfg.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, String(C.SCORING.silenceMs));
      const rec = new sdk.SpeechRecognizer(cfg, sdk.AudioConfig.fromDefaultMicrophoneInput());
      const pa = new sdk.PronunciationAssessmentConfig(card.referenceText,
        sdk.PronunciationAssessmentGradingSystem.HundredMark, sdk.PronunciationAssessmentGranularity.Word, true);
      pa.enableProsodyAssessment = true;
      pa.applyTo(rec);
      rec.recognizing = (_, e) => { try { onPartial(e.result.text); } catch (err) { console.error(err); } };
      try {
        const result = await new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(fail('cancel')), { once: true });
          rec.recognizeOnceAsync(resolve, err => reject(classify(String(err))));
        });
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          return C.fromAzure(JSON.parse(result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)), card.tokens);
        }
        if (result.reason === sdk.ResultReason.NoMatch) throw fail('nomatch');
        const d = sdk.CancellationDetails.fromResult(result);
        console.error('recognition canceled', d.reason, d.errorCode, d.errorDetails);
        if (d.errorCode === sdk.CancellationErrorCode.AuthenticationFailure) Token.clear();
        throw classify(String(d.errorDetails || ''));
      } finally {
        try { rec.close(); } catch (e) { console.error('close', e); } // frees the microphone
      }
    },
  };

  // ?engine=fake: no microphone and fixed results, for tests and demos. The third word scores low.
  const FakeEngine = {
    assess(card, { onPartial, signal }) {
      return new Promise((resolve, reject) => {
        const words = card.tokens.map(t => t.text);
        let i = 0;
        const tick = setInterval(() => {
          onPartial(words.slice(0, ++i).join(' '));
          if (i < words.length) return;
          clearInterval(tick);
          resolve({
            tokens: card.tokens.map((t, k) => ({ text: t.text, head: t.head, score: k === 2 ? 55 : 92, error: k === 2 ? 'Mispronunciation' : 'None' })),
            scores: { accuracy: 88, fluency: 90, completeness: 100, prosody: 85, overall: 87 },
          });
        }, 40);
        signal.addEventListener('abort', () => { clearInterval(tick); reject(fail('cancel')); }, { once: true });
      });
    },
  };

  const fake = new URLSearchParams(location.search).get('engine') === 'fake';
  const engine = fake ? FakeEngine : AzureEngine;

  // Ask for the microphone once per page load, so a denial gets a clear message.
  let micOk = fake;
  async function micCheck() {
    if (micOk) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw fail('mic');
    try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach(t => t.stop()); }
    catch (e) { console.error('mic', e); throw fail('mic'); }
    micOk = true;
  }

  // ---------- score upload queue (survives offline and reloads) ----------
  const Scores = {
    KEY: 'readcipe-pending', busy: false,
    send(payload) {
      const q = store.get(this.KEY, []);
      q.push(payload);
      store.set(this.KEY, q.slice(-200));
      this.flush();
    },
    async flush() {
      if (this.busy) return;
      this.busy = true;
      try {
        for (let q = store.get(this.KEY, []); q.length; q = store.get(this.KEY, [])) {
          let r;
          try { r = await fetch('/api/score', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q[0]) }); }
          catch (e) { console.warn('upload later', e); break; }
          if (r.status >= 500 || r.status === 429) break; // try again later
          if (!r.ok) console.error('score rejected', r.status, q[0]); // 4xx never succeeds: drop it
          const now = store.get(this.KEY, []);
          now.shift();
          store.set(this.KEY, now);
        }
      } finally { this.busy = false; }
    },
  };
  window.addEventListener('online', () => Scores.flush());
  setInterval(() => Scores.flush(), 30000);

  // ---------- state ----------
  const cards = C.CARDS.map(C.prepare);
  const grpOk = n => Number.isInteger(n) && n >= 1 && n <= 6;
  const S = { grp: grpOk(store.get('readcipe-group', 0)) ? store.get('readcipe-group', 0) : 0, seat: 0, i: -1, tries: 0, best: {}, run: 0, ctrl: null, reading: false };

  function show(name) {
    document.querySelectorAll('[data-screen]').forEach(s => { s.hidden = s.dataset.screen !== name; });
    $('#grpBtn').hidden = !S.grp || name === 'group';
    $('#grpBtn').textContent = `Group ${S.grp}`;
    $('#whoBtn').hidden = !(name === 'card' || name === 'summary');
    $('#whoBtn').textContent = `Seat ${S.seat} · Change student`;
  }

  function message(text) { $('#msgText').textContent = text; $('#msg').hidden = false; }
  function status(text, live) { const el = $('#status'); el.textContent = text; el.classList.toggle('live', !!live); }
  function speak(text) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.85;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) { console.error('tts', e); }
  }
  const starText = n => '★'.repeat(n) + '☆'.repeat(3 - n);
  const spans = () => document.querySelectorAll('[data-screen="card"] .w');

  // ---------- pads ----------
  function buildPads() {
    for (let n = 1; n <= 6; n++) {
      const b = document.createElement('button');
      b.textContent = n;
      b.addEventListener('click', () => { S.grp = n; store.set('readcipe-group', n); toSeat(); });
      $('#groupPad').append(b);
    }
    for (let n = 1; n <= 40; n++) {
      const b = document.createElement('button');
      b.textContent = n;
      b.addEventListener('click', () => {
        S.seat = n;
        $('#seatShow').textContent = n;
        document.querySelectorAll('#seatPad button').forEach(x => x.classList.toggle('on', x === b));
        $('#startBtn').disabled = false;
      });
      $('#seatPad').append(b);
    }
  }

  function toSeat() {
    S.seat = 0;
    $('#seatShow').textContent = '–';
    document.querySelectorAll('#seatPad button.on').forEach(x => x.classList.remove('on'));
    $('#startBtn').disabled = true;
    show('seat');
  }

  // ---------- cards ----------
  function setButtons(state) { // idle | reading | done
    const hasBest = !!S.best[cards[S.i].id], last = S.i === cards.length - 1;
    $('#listenBtn').hidden = state === 'reading';
    $('#readBtn').hidden = state !== 'idle';
    $('#cancelBtn').hidden = state !== 'reading';
    $('#againBtn').hidden = state !== 'done' || S.tries >= C.SCORING.maxTries;
    $('#nextBtn').hidden = state === 'reading' || !hasBest;
    $('#nextBtn').textContent = last ? 'Finish' : 'Next';
    $('#grpBtn').disabled = $('#whoBtn').disabled = state === 'reading';
  }

  function openCard(i) {
    S.i = i; S.tries = 0;
    const c = cards[i], title = $('#cardTitle'), sent = $('#sentence');
    $('#stepNo').textContent = `Step ${c.id}`;
    title.textContent = ''; sent.textContent = '';
    c.tokens.forEach((t, k) => {
      const sp = document.createElement('span');
      sp.className = 'w'; sp.textContent = t.text; sp.dataset.k = k;
      (t.head ? title : sent).append(sp, ' ');
    });
    title.hidden = !c.title;
    $('#dots').textContent = '';
    cards.forEach((x, k) => {
      const d = document.createElement('i');
      d.className = k === i ? 'now' : S.best[x.id] ? 'done' : '';
      $('#dots').append(d);
    });
    $('#stars').textContent = ''; $('#feedback').textContent = ''; status('');
    setButtons('idle');
    show('card');
  }

  function light(n) { spans().forEach((s, k) => s.classList.toggle('lit', k < n)); }
  function paint(result) {
    spans().forEach((s, k) => {
      const t = result && result.tokens[k];
      s.classList.remove('lit', 'good', 'ok', 'bad', 'miss');
      if (!t) return;
      s.classList.add(t.error === 'Omission' || t.score == null ? 'miss' : t.score >= 80 ? 'good' : t.score >= 60 ? 'ok' : 'bad');
    });
  }

  async function read() {
    if (S.reading) return;
    const run = ++S.run, c = cards[S.i];
    S.reading = true;
    try { speechSynthesis.cancel(); } catch { /* no TTS */ }
    paint(null); $('#stars').textContent = ''; $('#feedback').textContent = '';
    setButtons('reading');
    try {
      for (const n of [3, 2, 1]) { status(String(n)); await sleep(fake ? 150 : 700); if (run !== S.run) return; }
      status('Listening…', true);
      S.ctrl = new AbortController();
      const result = await engine.assess(c, { onPartial: text => run === S.run && light(C.progress(c.tokens, text)), signal: S.ctrl.signal });
      if (run !== S.run) return;
      S.tries++;
      const entry = { result, rate: C.rate(result) };
      S.best[c.id] = C.better(S.best[c.id], entry);
      paint(result); status('');
      $('#stars').textContent = starText(entry.rate.stars);
      $('#feedback').textContent = entry.rate.feedback;
      setButtons('done');
    } catch (e) {
      if (run !== S.run) return;
      const code = (e && e.code) || 'canceled';
      if (!e || !e.code) console.error(e);
      status(''); light(0);
      setButtons(S.best[c.id] ? 'done' : 'idle');
      if (code !== 'cancel') message(MSG[code] || MSG.canceled);
    } finally {
      if (run === S.run) { S.reading = false; S.ctrl = null; }
    }
  }

  // Stops a countdown or a recognition in progress; does not count as a try.
  function cancel() {
    if (!S.reading) return;
    S.run++;
    if (S.ctrl) S.ctrl.abort();
    S.reading = false; S.ctrl = null;
    status(''); light(0);
    if (S.i >= 0) setButtons(S.best[cards[S.i].id] ? 'done' : 'idle');
  }

  // Upload this card's best reading once, when the student leaves it.
  function leaveCard() {
    if (S.i < 0) return;
    cancel();
    const id = cards[S.i].id, b = S.best[id];
    if (b) Scores.send(C.toPayload(S.grp, S.seat, id, b, S.tries));
    S.i = -1;
  }

  function summary() {
    const s = C.summarize(S.best);
    $('#sumTitle').textContent = `Great job, Seat ${S.seat}!`;
    $('#sumStars').textContent = `★ ${s.stars} / ${s.maxStars}`;
    $('#sumBadge').textContent = s.allRead ? 'All 7 steps read!' : `${s.readCount} / 7 steps read`;
    $('#sumWeak').textContent = '';
    s.weak.forEach(w => {
      const b = document.createElement('button');
      b.textContent = w;
      b.addEventListener('click', () => speak(w));
      $('#sumWeak').append(b);
    });
    $('#sumWeakHead').hidden = !s.weak.length;
    show('summary');
    celebrate();
  }

  function celebrate() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#E0473F', '#5B30E6', '#F7E35C', '#6CB98A', '#7FB3E0', '#F2B184'];
    for (let k = 0; k < 40; k++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[k % colors.length];
      p.style.animationDelay = Math.random() * 0.6 + 's';
      p.addEventListener('animationend', () => p.remove());
      document.body.append(p);
    }
  }

  // ---------- wiring ----------
  const on = (sel, fn) => $(sel).addEventListener('click', () => { try { fn(); } catch (e) { console.error(e); } });
  buildPads();
  on('#startBtn', async () => {
    if (!S.seat) return;
    try { await micCheck(); } catch (e) { message(MSG[e.code] || MSG.canceled); return; }
    S.best = {};
    openCard(0);
  });
  on('#listenBtn', () => speak(cards[S.i].referenceText));
  on('#readBtn', read);
  on('#cancelBtn', cancel);
  on('#againBtn', read);
  on('#nextBtn', () => { const i = S.i; leaveCard(); if (i + 1 < cards.length) openCard(i + 1); else summary(); });
  on('#nextKid', toSeat);
  on('#whoBtn', () => { leaveCard(); toSeat(); });
  on('#grpBtn', () => { leaveCard(); show('group'); });
  on('#msgBtn', () => { $('#msg').hidden = true; });

  if (S.grp) toSeat(); else show('group');
  Scores.flush();
})();
</script>
```

- [ ] **Step 4：建置並跑 E2E 確認通過**

Run: `python tools/build.py && python tools/test_read.py`
Expected: `ok, screenshots in .../screenshots/read`，沒有 `PAGE ERRORS`。

- [ ] **Step 5：逐張看截圖**

用 Read 工具打開 `screenshots/read/1-seat.png`、`2-card-result.png`、`3-summary.png`，確認：
- 座號盤在 1024×768 下 8 欄排得下，沒有水平捲軸；
- 卡片裡第 3 個字是紅色波浪底線，其他字是綠色，有星星和回饋；
- 總結頁有星星總數、「All 7 steps read!」、要再練的字按鈕。

有跑版就調整 CSS，回到 Step 4。

- [ ] **Step 6：更新 requirements.txt 並 Commit**

把 `requirements.txt` 的 `# tools/screenshot_all.py (optional smoke test)` 改成 `# tools/screenshot_all.py, tools/test_read.py (smoke / E2E tests)`。

```bash
git add src/read.src.html tools/test_read.py requirements.txt
git commit -m "feat(read): student Read & Check page with Azure and fake engines"
```

---

### Task 5：老師成績頁

**Files:**
- Modify（整檔取代 Task 2 的骨架）：`src/teacher.src.html`
- Modify：`tools/test_read.py`（`ROWS` 範例資料＋新增 `teacher()` 並在 `main()` 呼叫）

**Interfaces:**
- Consumes：`GET /api/scores?day=`（Task 3）、`ReadCore.CARD_IDS`、`ReadCore.SCORING.readCompleteness`（Task 1）
- Produces：DOM：`#day`、`#updated`、`#refresh`、`#groups`（每組一個 `<section class="grp">`，裡面一個 `<table>`）、`#empty`

- [ ] **Step 1：在 E2E 加入老師頁檢查（會失敗）**

在 `tools/test_read.py` 把 `ROWS = []` 換成：

```python
def row(seat, card, grp, stars, overall, completeness, weak=()):
    return {'seat': seat, 'card': card, 'grp': grp, 'stars': stars, 'overall': overall, 'accuracy': overall,
            'fluency': overall, 'completeness': completeness, 'prosody': overall, 'weak': list(weak),
            'attempts': 1, 'updated_at': 1793260800000}


ROWS = (
    [row(12, c, 3, 3, 90, 100) for c in CARDS]                                        # seat 12: all read
    + [row(5, '1', 1, 1, 55, 70, ['whisk', '<img src=x onerror=alert(1)>']),        # seat 5: weak words
       row(5, '2', 1, 0, 30, 40)]                                                    # not read (completeness 40)
)
```

在 `student()` 後面加上：

```python
async def teacher(page, base, out):
    await page.goto(base + '/teacher/')
    await page.wait_for_selector('#groups table')
    assert await page.locator('#groups section.grp').count() == 2   # groups 1 and 3
    g3 = await page.inner_text('#groups section.grp:has-text("Group 3")')
    assert '7 / 7' in g3, g3
    g1 = page.locator('#groups section.grp:has-text("Group 1")')
    assert '1 / 7' in await g1.inner_text()                           # card 2 is below "read"
    await g1.locator('tr.seat').first.click()                          # open the weak words
    detail = await g1.locator('tr.detail').inner_text()
    assert 'whisk' in detail and '<img' in detail, detail                # shown as text
    assert await page.locator('#groups img').count() == 0                # never parsed as HTML
    await page.screenshot(path=str(out / '4-teacher.png'), full_page=True)
```

在 `main()` 的 `await student(page, base, out, posted)` 後面加一行：

```python
        await teacher(page, base, out)
```

- [ ] **Step 2：跑測試確認失敗**

Run: `python tools/build.py && python tools/test_read.py`
Expected: FAIL，在 `#groups table` 逾時。

- [ ] **Step 3：寫老師頁**

用下面內容整檔取代 `src/teacher.src.html`：

```html
<meta charset="utf-8">
<title>Reading Scores</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700;800;900&display=swap">
<style>
/* Teacher view of today's Read & Check scores. Read-only, refreshes every 10 s. */
:root{--paper:#FCE7D6;--grid:#FFF6EE;--ink:#3B2A28;--brown:#6A3C3A;--apricot:#F2B184;--lemon:#F7E35C;
  --mint:#6CB98A;--verb:#E0473F;--miss:#A89A96;--display:'Fredoka',system-ui,sans-serif;--body:'Nunito',system-ui,sans-serif}
[hidden]{display:none!important}
*{box-sizing:border-box}
body{margin:0;font-family:var(--body);color:var(--ink);background:var(--paper)}
header{display:flex;flex-wrap:wrap;align-items:center;gap:14px;padding:16px 20px;background:#fff;border-bottom:3px solid var(--apricot);position:sticky;top:0}
h1{font-family:var(--display);color:var(--brown);margin:0;font-size:30px;flex:1}
label{font-weight:800}
input,button{font:inherit;font-weight:800;padding:6px 12px;border-radius:12px;border:2px solid #E7B48C;background:#FFF3E6;color:var(--brown)}
button{cursor:pointer}
#updated{color:#8a6f6a;font-weight:700}
#updated.off{color:var(--verb)}
main{padding:16px 20px;display:grid;gap:18px;max-width:1100px;margin:0 auto}
.grp{background:#fff;border-radius:20px;padding:14px 16px;overflow-x:auto}
.grp h2{font-family:var(--display);color:var(--brown);margin:0 0 8px}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{padding:8px 6px;text-align:center;border-bottom:1px solid #F3DCCB}
th{font-size:14px;color:#8a6f6a}
tr.seat{cursor:pointer}
tr.seat:hover{background:#FFF8EF}
td.st{color:#F2B01E;font-size:18px;letter-spacing:1px;white-space:nowrap}
td.st.no{color:var(--miss)}
td.st.none{color:#ddd}
td.done{font-weight:800}
td.done.all{color:var(--mint)}
tr.detail td{text-align:left;background:#FFF8EF;font-weight:700}
.weak{display:inline-block;background:#FDE7E6;color:var(--verb);border-radius:10px;padding:2px 10px;margin:2px 4px}
#empty{text-align:center;font-size:20px;color:#8a6f6a;padding:40px}
</style>
<header>
  <h1>Reading scores</h1>
  <label>Day <input type="date" id="day"></label>
  <button id="refresh">Refresh</button>
  <span id="updated"></span>
</header>
<main id="groups"></main>
<p id="empty" hidden>No scores yet for this day.</p>
<script>
/*{{READCORE}}*/
(() => {
  'use strict';
  const C = window.ReadCore, CARDS = C.CARD_IDS, READ_MIN = C.SCORING.readCompleteness;
  const $ = s => document.querySelector(s);
  const open = new Set();   // seats whose detail row is open (kept across refreshes)
  let rows = [];

  // Build DOM with text only: row data comes from a public API, never insert it as HTML.
  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    kids.flat().forEach(k => e.append(k instanceof Node ? k : document.createTextNode(String(k))));
    return e;
  }
  const taipeiToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const isRead = r => (r.completeness ?? 0) >= READ_MIN;

  function students() {
    const by = new Map();
    for (const r of rows) {
      const s = by.get(r.seat) || { seat: r.seat, grp: r.grp, at: 0, cards: {} };
      s.cards[r.card] = r;
      if (r.updated_at > s.at) { s.at = r.updated_at; s.grp = r.grp; } // latest group wins
      by.set(r.seat, s);
    }
    return [...by.values()].sort((a, b) => a.grp - b.grp || a.seat - b.seat);
  }

  function render() {
    const list = students(), main = $('#groups');
    main.textContent = '';
    $('#empty').hidden = list.length > 0;
    for (const grp of [...new Set(list.map(s => s.grp))]) {
      const body = el('tbody');
      for (const s of list.filter(x => x.grp === grp)) {
        const got = CARDS.map(id => s.cards[id]).filter(Boolean);
        const done = got.filter(isRead).length;
        const avg = got.length ? Math.round(got.reduce((n, r) => n + r.overall, 0) / got.length) : '';
        const tr = el('tr', { className: 'seat', title: 'Click for words to practice' },
          el('td', {}, el('b', {}, s.seat)),
          CARDS.map(id => {
            const r = s.cards[id];
            if (!r) return el('td', { className: 'st none', textContent: '—' });
            return el('td', {
              className: 'st' + (isRead(r) ? '' : ' no'),
              textContent: '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars),
              title: `Score ${r.overall} · read ${r.completeness ?? '?'}% · tries ${r.attempts}`,
            });
          }),
          el('td', { className: 'done' + (done === CARDS.length ? ' all' : ''), textContent: `${done} / ${CARDS.length}` }),
          el('td', { textContent: avg }));
        tr.addEventListener('click', () => { open.has(s.seat) ? open.delete(s.seat) : open.add(s.seat); render(); });
        body.append(tr);
        if (open.has(s.seat)) {
          const weak = [...new Set(got.flatMap(r => r.weak || []))];
          body.append(el('tr', { className: 'detail' }, el('td', { colSpan: CARDS.length + 3 },
            weak.length ? ['Words to practice: ', weak.map(w => el('span', { className: 'weak', textContent: w }))] : 'No words to practice.')));
        }
      }
      main.append(el('section', { className: 'grp' },
        el('h2', { textContent: `Group ${grp}` }),
        el('table', {},
          el('thead', {}, el('tr', {}, el('th', { textContent: 'Seat' }), CARDS.map(id => el('th', { textContent: `Step ${id}` })),
            el('th', { textContent: 'Read' }), el('th', { textContent: 'Avg' }))),
          body)));
    }
  }

  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    try {
      const r = await fetch('/api/scores?day=' + encodeURIComponent($('#day').value), { cache: 'no-store' });
      if (!r.ok) throw new Error('http ' + r.status);
      rows = (await r.json()).rows || [];
      render();
      $('#updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
      $('#updated').classList.remove('off');
    } catch (e) {
      console.warn('scores', e);
      $('#updated').textContent = 'Cannot load scores, retrying…';
      $('#updated').classList.add('off');
    } finally { loading = false; }
  }

  $('#day').value = taipeiToday();
  $('#day').addEventListener('change', () => { open.clear(); load(); });
  $('#refresh').addEventListener('click', load);
  setInterval(load, 10000);
  load();
})();
</script>
```

- [ ] **Step 4：建置並跑 E2E 確認通過**

Run: `python tools/build.py && python tools/test_read.py`
Expected: `ok, screenshots in ...`，沒有 `PAGE ERRORS`。

- [ ] **Step 5：看截圖**

打開 `screenshots/read/4-teacher.png`，確認：Group 1、Group 3 兩區；Group 3 的座號 12 全部 ★★★、`7 / 7` 是綠色；座號 5 的 Step 2 是灰色星星；展開列顯示 `whisk` 和 `<img ...>` 純文字。

- [ ] **Step 6：Commit**

```bash
git add src/teacher.src.html tools/test_read.py
git commit -m "feat(read): teacher score page"
```

---

### Task 6：文件、部署說明、整體驗證

**Files:**
- Modify：`README.md`（加「Read & Check 部署」一節）、`docs/HANDOFF.md`（狀態與下一步）、`CLAUDE.md` 和 `AGENTS.md`（專案規則第 1 條、已發佈的位置）、`docs/architecture.md`（加 Read & Check 一節）

**Interfaces:**
- Consumes：前面所有 task 的檔名與指令

- [ ] **Step 1：README 加部署一節**

在 `README.md` 最後加上：

```markdown
## Read & Check（方案 B：AI 唸讀評分）

網址：`/read/`（學生，iPad）、`/teacher/`（老師看成績）。簡報仍在 `/`。規格見 `docs/plan-b-pronunciation.md`。

第一次部署：
1. Azure 入口網站建立 Speech 資源：定價 F0（免費）、區域 East Asia，記下金鑰。
2. `npx wrangler@4 login`
3. `npx wrangler@4 d1 create readcipe`，把輸出的 `database_id` 貼進 `wrangler.jsonc`。
4. `npx wrangler@4 d1 execute readcipe --remote --file worker/schema.sql`
5. `npx wrangler@4 secret put AZURE_SPEECH_KEY`（貼金鑰）、`npx wrangler@4 secret put AZURE_SPEECH_REGION`（輸入 `eastasia`）。金鑰不要放進任何檔案或對話。
6. `python tools/build.py && npx wrangler@4 deploy`

之後更新：`python tools/build.py && npx wrangler@4 deploy`。

本機測試：
- `node tools/test_read_core.js`、`node worker/test.mjs`（純邏輯）
- `python tools/test_read.py`（學生流程＋老師頁，假引擎，不需要 Azure）
- 真的辨識：在 `.dev.vars` 寫 `AZURE_SPEECH_KEY=...` 和 `AZURE_SPEECH_REGION=eastasia`，`npx wrangler@4 d1 execute readcipe --local --file worker/schema.sql`，`npx wrangler@4 dev`，用瀏覽器開 `http://localhost:8787/read/`。
- 不開麥克風看畫面：`/read/?engine=fake`。
```

- [ ] **Step 2：更新 CLAUDE.md 和 AGENTS.md（兩份內容相同，都要改）**

專案規則第 1 條改成：

```markdown
1. 簡報只編輯 `src/index.src.html`；Read & Check 編輯 `src/read.src.html`、`src/teacher.src.html`、`src/read-core.js`、`worker/`。改完跑 `python3 tools/build.py`。不要手改 `dist/`。
```

開頭那句「下一個任務是方案 B」改成「方案 B（Read & Check）已實作，規格 `docs/plan-b-pronunciation.md`，部署見 README。」

「已發佈的位置」的 Cloudflare 那行改成：

```markdown
- Cloudflare Worker `wispy-fog-b991`（https://wispy-fog-b991.stanley890314.workers.dev/）：簡報 `/`、學生頁 `/read/`、老師頁 `/teacher/`、`/api/*`。用 `npx wrangler@4 deploy` 部署（見 README），不要再只上傳 `index.html`，會蓋掉 Worker 程式。
```

改簡報步驟句子時要同步改 `src/read-core.js` 的 `CARDS`：加在「專案規則」最後一條。

- [ ] **Step 3：architecture.md 和 HANDOFF.md**

`docs/architecture.md` 最後加：

```markdown
## Read & Check（學生頁 / 老師頁 / Worker）
- `src/read-core.js`：純邏輯（`CARDS`、`SCORING`、`prepare`、`progress`、`fromAzure`、`rate`、`weakWords`、`summarize`、`toPayload`），建置時內嵌（佔位 `/*{{READCORE}}*/`），用 `node tools/test_read_core.js` 測試。
- `src/read.src.html`：畫面切換（`[data-screen]`）、`AzureEngine` / `FakeEngine`（`?engine=fake`），介面是 `assess(card, { onPartial, signal }) -> Promise<Result>`；`Token`（快取 9 分鐘）；`Scores`（localStorage 佇列 `readcipe-pending`，離線補送）。每張卡在離開時上傳最好的一次。
- `src/teacher.src.html`：`GET /api/scores` 每 10 秒更新；所有資料用 textContent 顯示。
- `worker/index.mjs`：`/api/token`、`/api/score`（`parseScore` 驗證、D1 upsert 只保留高分）、`/api/scores`；其他路徑由 Static Assets 直接回應。
```

`docs/HANDOFF.md`：把開頭狀態那段改成「方案 B 已實作（2026-10-28），待 iPad 實測與調整 `SCORING` 門檻」，並在待辦清單加入：iPad 實測、`silenceMs` 是否會截斷、`SCORING` 門檻調整、方案 A 退路、多班級區分。

- [ ] **Step 4：整體驗證**

Run:
```bash
node tools/test_read_core.js && node worker/test.mjs && python tools/build.py && sha256sum -c "$TMPDIR/deck.sha" && python tools/test_read.py && python tools/screenshot_all.py
```
Expected：兩個 `all checks passed`、簡報雜湊兩個 `OK`、`ok, screenshots in ...`、`screenshot_all.py` 沒有 page error。簡報截圖抽看 Step 1 和最後一頁，跟改動前一樣。

- [ ] **Step 5：Commit**

```bash
git add README.md CLAUDE.md AGENTS.md docs/architecture.md docs/HANDOFF.md
git commit -m "docs: Read & Check deployment and maintenance notes"
```

- [ ] **Step 6：交給使用者的實機步驟（不能自動化，寫進回報）**

1. 照 README「第一次部署」做完 1–6。
2. 用 iPad Safari 開 `/read/`：允許麥克風 → 選組 → 座號 → 唸 Step 1，確認字會即時亮起、有分數。
3. 連續換 3 位學生，確認不會每次都問麥克風權限。
4. 開 `/teacher/` 確認成績出現。
5. 唸完第一句故意停 2 秒再唸，確認沒有被截斷；會截斷就把 `SCORING.silenceMs` 調高（最多 5000）。
6. 依實測分數調整 `SCORING` 的星星門檻。
```
