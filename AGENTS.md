# CLAUDE.md：給接手這個專案的 Codex

先讀這份，再讀 `docs/HANDOFF.md`（完整來龍去脈）。**方案 B（Read & Check：AI 唸讀發音評分）已實作**，規格在 `docs/plan-b-pronunciation.md`，部署步驟見 README。

## 使用者
- 用繁體中文溝通（台灣用語）。簡報內容與講稿一律英文。
- 個人偏好（必須遵守）：
  - 不要用太多 emoji。
  - 新增或修改程式時：好維護、高擴充、高穩定、高效能、高容錯、良好的錯誤捕捉、不佔太多記憶體、做好抽象化並有適當註解引導，**不要破壞任何原有功能**。
- 使用者是幫一位國小英語老師做這份簡報；老師的需求會透過使用者轉達。之後使用者會自己配 AI 語音和 3D 角色。

## 專案規則
1. 簡報**只編輯 `src/index.src.html`**；Read & Check 編輯 `src/read.src.html`、`src/teacher.src.html`、`src/read-core.js`、`worker/`。改完跑 `python3 tools/build.py`。不要手改 `dist/`。
2. 圖片：HTML 裡寫 `<img data-img="girl_pin.webp">`（JS 啟動時填入 data URI）；建置會把 `assets/img/girl_pin.png|jpg` 轉成 WebP 放進 `IMG` 對照表。`{{IMGMAP}}` 佔位字串不能刪。
3. `src/index.src.html` 第一行是 `<meta charset="utf-8">`，必須保留。沒有 `<html>/<head>/<body>`，因為 Artifact 主機會自己包；網站版由 build.py 包成完整文件。
4. 部署到網站一定用 `dist/site/index.html`（用 Artifact 片段會出現亂碼，例如 `1Ã—`）。
5. 換頁規則（使用者明確要求）：**點擊畫面不能換頁**。只能用方向鍵、滾輪、右下角按鈕（以及講稿視窗的按鈕/方向鍵）。
6. 中鍵＝繪畫模式（左畫右擦），F1＝講稿視窗；這些行為不要改掉。
7. 新增實驗區時沿用模組介面：`Modules.xxx = { init(root), enter(), leave(), reset(), autoStep() }`，等待一律用 `countdown(seconds, onTick, onDone, this.root)`，這樣 Fast/Real/Auto 和 Skip 才會自動生效（見 `docs/architecture.md`）。
8. 改完要驗證：建置後用 `tools/screenshot_all.py`（或自己的 Playwright 腳本）截圖檢查版面並看有無 page error。Cloud 環境的 Chromium 在 `/opt/pw-browsers`，不要 `playwright install`。
9. 講稿（每頁 `<aside class="notes">`）以老師手寫小卡為準，原文在 `docs/teacher-script.md`；`<span class="cue">` 是操作提示（灰色小字），不是要唸的台詞。
10. 改簡報步驟頁的句子時，要同步改 `src/read-core.js` 的 `CARDS`（學生唸讀卡）。

## 已發佈的位置
- claude.ai Artifact：https://claude.ai/artifact/NeuWpVPVjJJb1D7VcJ2ZFj（版本 5）。從新的工作階段更新時，要用 Artifact 工具的 `url` 參數，並先 `read` 再 publish；發佈 `dist/vanilla-cupcakes.html`。
- Cloudflare Worker `wispy-fog-b991`（https://wispy-fog-b991.stanley890314.workers.dev/）：簡報 `/`、學生頁 `/read/`、老師頁 `/teacher/`、`/api/*`。用 `npx wrangler@4 deploy` 部署（見 README），不要再只上傳 `index.html`，會蓋掉 Worker 程式。
- 使用者另外建立過一個空白的 Slides artifact（83fbe32f-f1e5-490b-a42f-cf00a9944cdb），使用者選擇改用 HTML，所以它沒被使用，不要動它。
