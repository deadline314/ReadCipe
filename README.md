# Vanilla Cupcakes Lesson（香草杯子蛋糕英語課互動簡報）

給國小英語課使用的互動式 HTML 簡報：教「香草杯子蛋糕」的食材與步驟（本堂課不實際烘焙，下週才做）。
簡報全英文；部分頁面由老師主講，部分頁面由 AI（之後會配語音與 3D 角色）主講。

- 單一 HTML 檔，圖片全部內嵌，可離線開啟
- 16 頁，每個步驟頁都有可操作的「實驗區」（微波、過篩、打發、倒油、攪拌、烘烤）
- 換頁只用 ← → 或滑鼠滾輪（點畫面不換頁）；手機右下角有按鈕
- 中鍵＝繪畫模式（左鍵畫、右鍵擦）
- F1＝獨立的講稿視窗（簡報者檢視）

> **下一步：方案 B（AI 唸讀發音評分）**，見 [`docs/plan-b-pronunciation.md`](docs/plan-b-pronunciation.md)。
> 新的工作階段請先讀 [`CLAUDE.md`](CLAUDE.md) 和 [`docs/HANDOFF.md`](docs/HANDOFF.md)。

## 目錄結構

```
src/index.src.html        簡報原始碼（唯一需要編輯的檔案；CSS + HTML + JS 都在這裡）
assets/img/               從老師投影片截圖摳出來的圖片（png/jpg，建置時轉 WebP 內嵌）
tools/build.py            建置：src + assets → dist/
tools/extract_assets.py   從 references/original-slides/ 重新產生 assets/img/ 的所有圖片
tools/screenshot_all.py   冒煙測試：無頭 Chromium 截每一頁並回報錯誤
dist/vanilla-cupcakes.html    claude.ai Artifact 用（頁面片段，沒有 <html>/<head>）
dist/site/index.html          一般網站用（Cloudflare Pages 等；完整 HTML，含 UTF-8 宣告）
docs/                     交接文件、需求、老師講稿、頁面對照、架構、方案 B 規格
references/original-slides/   老師原本的 13 張投影片截圖（設計與素材來源）
references/teacher-notes/     老師手寫講稿小卡 8 張 + YouTube 連結頁截圖
references/feedback/          使用者給的回饋截圖（講稿視窗範例、Cloudflare 亂碼）
```

## 建置與測試

```bash
pip install -r requirements.txt          # Pillow 必要；numpy/scipy 只有重摳圖片才需要
python3 tools/build.py                   # 產生 dist/vanilla-cupcakes.html 與 dist/site/index.html
python3 tools/screenshot_all.py          # 選用：截圖到 ./screenshots 並檢查頁面錯誤
python3 tools/extract_assets.py          # 選用：從原始截圖重新產生 assets/img/
```

## 部署

| 目的地 | 使用的檔案 | 備註 |
|---|---|---|
| Cloudflare Pages / 任何網站 | `dist/site/index.html` | **一定要用這個**。用 Artifact 版會因為沒有 charset 而出現亂碼（見 `references/feedback/cloudflare-mojibake.png`） |
| claude.ai Artifact | `dist/vanilla-cupcakes.html` | 現有網址 https://claude.ai/artifact/NeuWpVPVjJJb1D7VcJ2ZFj（目前分享設定為「Anyone with the link」） |
| 離線 | `dist/site/index.html` | 用 Chrome / Edge 直接開啟 |

## Read & Check（方案 B：AI 唸讀評分）

網址：`/read/`（學生，iPad）、`/teacher/`（老師看成績）。簡報仍在 `/`。規格見 `docs/plan-b-pronunciation.md`。

第一次部署：
1. Azure 入口網站建立 Speech 資源：定價 **S0**（F0 同時只能 1 個連線，6 台 iPad 會失敗）、區域 East Asia，記下 KEY 1；在 Cost Management → Budgets 設預算警示。
2. `npx wrangler@4 login`（登入擁有 stanley890314.workers.dev 的帳號），`npx wrangler@4 whoami` 確認。
3. 在 Cloudflare Dashboard 打開 `wispy-fog-b991`，確認沒有連 Git、沒有在 Dashboard 設的變數（deploy 會覆蓋 Dashboard 設的變數）。
4. 資料庫 `readcipe` 已建立（2026-10-27），`database_id` 已寫在 `wrangler.jsonc`，binding 名稱一定要是 `DB`。換帳號重建時才需要再跑 `npx wrangler@4 d1 create readcipe`，並且不要讓 wrangler 自動加第二筆設定。
5. `npx wrangler@4 d1 execute readcipe --remote --file worker/schema.sql`
6. `npx wrangler@4 secret put AZURE_SPEECH_KEY`（貼金鑰）、`npx wrangler@4 secret put AZURE_SPEECH_REGION`（輸入 `eastasia`）。金鑰不要放進任何檔案或對話。
7. `python tools/build.py && npx wrangler@4 deploy`。如果 `ratelimits` 報錯，刪掉 `wrangler.jsonc` 那一段再部署（程式沒有它也能運作）。
8. 檢查 `/`、`/read/?engine=fake`、`/teacher/`；有問題用 `npx wrangler@4 tail` 看 log。

之後更新：`python tools/build.py && npx wrangler@4 deploy`。不要再從 Dashboard 只上傳 `index.html`，會蓋掉 Worker 程式。

測試：
- `node tools/test_read_core.js`、`node worker/test.mjs`（純邏輯）
- `python tools/test_read.py`（學生流程＋老師頁，假引擎，不需要 Azure）
- 真的辨識：在 `.dev.vars` 寫 `AZURE_SPEECH_KEY=...` 和 `AZURE_SPEECH_REGION=eastasia`，`npx wrangler@4 d1 execute readcipe --local --file worker/schema.sql`，`npx wrangler@4 dev`，開 `http://localhost:8787/read/`。
- 不開麥克風看畫面：`/read/?engine=fake`。

在網站上（https）才能使用：YouTube 內嵌播放、F1 獨立講稿視窗、（方案 B 的）麥克風。claude.ai 預覽會擋這些，程式已有退路。

## 操作

| 動作 | 操作 |
|---|---|
| 換頁 | ← → ↑ ↓ PageUp/PageDown、滑鼠滾輪、右下角 ‹ › 按鈕（Home/End 跳到首尾） |
| 繪畫模式 | 滑鼠中鍵或右下角筆形按鈕；左鍵畫、右鍵擦掉整條線；工具列有顏色、粗細、螢光筆、Eraser、Clear page；C 清除本頁 |
| 念講稿 | N 或右下角喇叭按鈕：用瀏覽器語音念出本頁講稿（灰色操作提示不念），換頁自動停止 |
| Read together | 步驟頁和食材頁的按鈕：字逐一亮起，同時用語音念出來 |
| 講稿 | F1 或右下角講稿按鈕 → 獨立視窗（被擋時改在頁面下方顯示）；視窗內 ← → 也能換頁，F1/Esc 關閉 |
| 全螢幕 | F |
| 實驗區速度 | 每個實驗區右上角：Fast（任何等待都 5 秒跑完）/ Real（真實時間）/ Auto（自動一步步執行）；等待中右下角有 Skip |
| 說明列 | ? 重新顯示 |
