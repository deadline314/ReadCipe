# 程式架構（src/index.src.html）

整份簡報是一個檔案：上半部 CSS，中間 SVG 圖示庫和 16 個 `<section class="slide">`，下半部一個 IIFE 的 JavaScript。沒有框架，也沒有外部 JS 函式庫；外部資源只有 Google Fonts（Fredoka、Nunito）。

## 版面與縮放
- `#stage` 固定 1280×720，`Deck.fit()` 用 `translate(-50%,-50%) scale(s)` 置中縮放到視窗大小。
- 拖曳、繪圖這類座標都要換算成 stage 座標：`toStage(event)`、`stagePoint(element)`。SVG 內用 `svg.getScreenCTM().inverse()`。
- 右下角按鈕（`#navbtns`）、繪圖工具列（`#drawbar`）、講稿面板（`#notes`）、toast 都是 `position:fixed`，不在 stage 內，所以不會被縮放。

## CSS 分區（依檔案順序）
| 區段 | 內容 |
|---|---|
| `:root` | 色彩與字型 token（`--paper` 桃色底、`--rose` 標題、`--brown` 描邊、`--verb` 紅、`--noun` 紫、`--lemon` 黃標、`--display` Fredoka、`--body` Nunito） |
| slides | 投影片切換（淡入＋位移＋縮放）、`[data-in]` 進場動畫。進場 keyframes 用獨立的 `translate`/`scale` 屬性，才不會蓋掉元素本身的 `transform`（例如旋轉的拍立得） |
| step slide layout | 步驟頁左右兩欄、`.flip` 鏡像、`.tasks` 檢核清單、`.lab` 實驗區 |
| specific slides | 各頁專屬樣式 |
| chrome | 計數器、說明列、講稿面板、繪圖層、燈箱、toast |
| v3: wait control | Skip 按鈕、AUTO 標籤、YouTube iframe |
| v2 additions | 開場標籤、句型框、倒數與橫幅 overlay、排序/配對頁、影片頁、Read together、手機按鈕 |

進場動畫：元素加 `data-in`（`up` / `left` / `right` / `drop` / `stamp`，預設是 pop），延遲寫 `style="--d:300"`（毫秒）。換到該頁時 `Deck.go` 會移除再加回 `.play`，所以每次進頁都會重播。
`prefers-reduced-motion` 會把所有動畫縮到幾乎為 0。

## HTML 慣例
- `<section class="slide" id="s-xxx" data-lead="AI|Teacher" data-mod="模組名" data-group="N">`
  - `data-mod` 對應 `Modules[名]`；`data-group` 只有步驟頁有，會自動加上「Group N · Read together」。
- 講稿：每頁一個 `<aside class="notes" data-lead="...">`，裡面的 `<p>` 就是講稿；`<b>` 會以橘色強調；`<span class="cue">` 是灰色操作提示。
- 標題用 `class="bubble-title split"`：會自動拆成一個個字母做逐字跳出。
- 圖片：`<img data-img="xxx.webp">`；拍立得可點擊放大：`data-zoom="p3a.webp,p3b.webp"`。
- SVG 圖示庫：`#i-star`、`#i-spark`、`#i-cherry`、`#i-heart`、`#i-tulip`、`#i-scissors`，用 `<svg><use href="#i-star"/></svg>`。

## JavaScript 結構（依檔案順序）
| 名稱 | 用途 |
|---|---|
| `$`、`$$`、`clamp`、`lerp`、`mix`（顏色內插）、`sleep`、`safe` | 工具函式；`safe(fn)` 包 try/catch，錯誤只記錄到 console，不會讓整份簡報掛掉 |
| `toast(msg)`、`say(root, msg, kind)` | 畫面頂端提示；實驗區內的對話泡泡（kind：`good` / `warn`） |
| `burst`、`celebrate` | 局部彩帶、整頁彩帶雨 |
| `overlay`、`banner`、`bigCount` | 全頁覆蓋層、大字橫幅、圓環倒數（可點擊或按 Skip 結束） |
| `wrapWords`、`Reader` | Read together：把文字拆成 `.w` 一個字一個字亮起；`Reader.items()` 讓卡片逐張亮起；換頁時 `Reader.stop()` |
| `Speed` | 實驗區模式 `fast` / `real` / `auto`，存在 localStorage 的 `cupcake-lab-mode`。`.speed-slot` 會自動填入切換鈕 |
| `skipButton`、`Timers`、`countdown` | **所有等待都走 `countdown(seconds, onTick(left, progress), onDone, root)`**：Fast 模式下任何長度都在 5 秒（`FAST_SECONDS`）跑完；有 root 時會顯示 Skip 鈕；註冊到 `Timers` 讓 Auto 知道還在忙；回傳 `{ cancel(), skip() }` |
| `autoStir`、`autoClick`、`Auto` | Auto 模式：`Auto` 每 1.1 秒檢查目前頁面的模組，如果沒有在忙（`Timers.busy`、`m.autoBusy`、`m.autoUntil`），就呼叫 `m.autoStep()` |
| `bowl`、`mixer`、`spatula`、`svgEl` | 實驗區共用的 SVG 產生器（碗：後緣 → 內容物 → `opts.mid` → 前緣） |
| `stirrer` | 在 SVG 上拖曳攪拌：累積移動距離換算成 0–1 進度 |
| `taskList`、`enable` | 左側 Try it 清單打勾；只啟用指定的實驗按鈕並讓它跳動提示 |
| `Modules.*` | 各頁邏輯（見下方介面） |
| `INGREDIENTS`、`ICONS`、`fmtAmt` | 食材資料、食材 SVG 圖示、分數格式（½、¼） |
| `VERBS`、`STEPS` | 單字卡資料；6 個學習單步驟（總覽、排序、配對頁共用） |
| `dragger` | 通用指標拖曳（在縮放後的 stage 內正確定位），排序與配對頁使用 |
| `Lightbox` | 點 `[data-zoom]` 放大圖片 |
| `Draw` | 繪圖層：每頁各自保存筆畫（`pages: Map`）；左鍵畫、右鍵或 Eraser 工具按「整條線」擦除（`segDist` 判斷距離）；C 清除本頁 |
| `Deck` | `go(n)`、`next/prev`、`fit`、`init`（拆標題字、初始化模組、加 Read together、讀 `#n` 網址錨點）；換頁時呼叫 `leave`/`enter`、重播動畫、更新計數器與講稿 |
| `TITLES`、`slideInfo` | 講稿視窗用的頁標題與講稿內容 |
| `Presenter` | F1 獨立講稿視窗（`window.open` 開 about:blank，同源後直接寫 DOM）：頁碼、主講、計時器（點擊歸零）、A−/A+、← →、下一頁標題；視窗內按鍵直接控制主簡報；被擋時回傳 false |
| `Notes` | F1 / 講稿按鈕：先試 `Presenter`，失敗才顯示頁面下方的講稿面板 |
| 輸入處理 | keydown（capture）、wheel（累積量超過 40 才換頁，鎖 650 ms）、中鍵 mousedown 切換繪圖並阻止自動捲動、右鍵選單只在繪圖模式阻擋、`#navbtns` 按鈕 |

## 模組介面（新增互動頁時照這個寫）
```js
Modules.myLab = {
  init(root) { /* 只執行一次：建 SVG、綁事件、this.reset() */ },
  enter() { /* 每次進入此頁（選用） */ },
  leave() { /* 離開此頁：暫停影片、停止持續動作（選用） */ },
  reset() { /* Start over：取消 this.timer、還原畫面、tasks.reset()、enable([...第一步]) */ },
  autoStep() { /* Auto 模式：做「下一個」動作；通常 autoClick(this.root) 就夠 */ }
};
```
- 實驗按鈕：`.controls` 內的 `<button data-a="動作">`，在 `init` 用事件委派接到 `this.act(a)`。
- 等待：`this.timer = countdown(秒數, (left, p) => {...}, () => {...}, this.root)`；`reset()` 時記得 `this.timer && this.timer.cancel()`。
- 拖曳攪拌類的 Auto：設 `this.autoBusy = true`，`await autoStir({...alive: () => tok === this.tok})`，結束再設回 false；`reset()` 時遞增 `this.tok` 讓進行中的動畫停止。
- 需要等動畫播完再做下一步時：設 `this.autoUntil = performance.now() + 毫秒`。

## 建置（tools/build.py）
1. 找出原始碼中所有 `xxx.webp` 名稱，到 `assets/img/xxx.png|jpg` 轉 WebP（quality 88）→ data URI。
2. 用 JSON 取代 `{{IMGMAP}}`，產出 Artifact 片段 `dist/vanilla-cupcakes.html`。
3. 包成完整 HTML（doctype、`<meta charset="utf-8">`、viewport）輸出 `dist/site/index.html`。

## 已知平台限制
| 功能 | claude.ai Artifact | 網站（https） | 直接開檔（file://） |
|---|---|---|---|
| 換頁、實驗、繪圖、動畫 | 可 | 可 | 可 |
| F1 獨立講稿視窗 | 多半被擋，改用頁內面板 | 可（第一次可能要允許彈出視窗） | 可 |
| YouTube 內嵌（Play here） | 被擋（不能嵌其他網站） | 應可（未實測） | 很可能失敗（YouTube 要求來源網址，Error 153） |
| 麥克風（方案 B） | 不可 | 可 | 不建議 |
| localStorage（記住模式） | 可（可能被清空） | 可 | 可 |

## Read & Check（學生頁 / 老師頁 / Worker）
- `src/read-core.js`：純邏輯（`CARDS`、`SCORING`、`prepare`、`progress`、`fromAzure`、`rate`、`weakWords`、`summarize`、`toPayload`），建置時內嵌（佔位 `/*{{READCORE}}*/`），用 `node tools/test_read_core.js` 測試。
- `src/read.src.html`：畫面切換（`[data-screen]`）、`AzureEngine` / `FakeEngine`（`?engine=fake`），介面是 `assess(card, { onPartial, signal }) -> Promise<Result>`；`Token`（快取 9 分鐘）；`Scores`（localStorage 佇列 `readcipe-pending`，離線補送）。每張卡在離開時上傳最好的一次。
- `src/teacher.src.html`：`GET /api/scores` 每 10 秒更新；所有資料用 textContent 顯示（API 是公開的，不能當 HTML）。
- `worker/index.mjs`：`/api/token`、`/api/score`（`parseScore` 驗證、D1 upsert 只保留高分）、`/api/scores`；其他路徑由 Static Assets 直接回應（`wrangler.jsonc` 的 `run_worker_first` 只含 `/api/*`）。
- 測試：`node worker/test.mjs`、`python tools/test_read.py`（Playwright，假引擎＋mock API）。
