# 交接文件（HANDOFF）

最後更新：2026-10-27。這份文件記錄到目前為止所有需求、決定、做法與尚未完成的事，讓新的工作階段不用回頭翻對話。

## 1. 一句話現況
16 頁的互動 HTML 簡報已完成，發佈在 claude.ai Artifact（版本 5），使用者也部署到了 Cloudflare。**方案 B（Read & Check）已實作（2026-10-27）**：學生頁 `/read/`、老師頁 `/teacher/`、Worker API，規格在 `plan-b-pronunciation.md`。待使用者部署（Azure S0、D1、secret）並在 iPad 實測；老師 2026-10-30（五）試教。

## 2. 背景
- 使用者幫一位國小英語老師製作「How to make vanilla cupcakes?」課堂簡報。老師原本用 Canva 風格的 PPT（`references/original-slides/` 共 13 張截圖）。
- 本堂課**不烘焙**，只學食材與步驟；下週才實際做。
- 分工：開場和學習單活動由老師帶；食材到 Step 4-2 由 AI 帶（使用者之後會自己配 AI 語音和 3D 角色）。
- 學生分 6 組，有學習單（剪下步驟、圖片、食材，貼到彩色紙上排順序）。

## 3. 需求時間軸（使用者原話與處理方式）

### 2026-10-14 #1：做 HTML 簡報
> 幫我做一個 Html 的投影片，我過去的投影片截圖我有傳給你，最好就直接照著做，如果有需要的話就把圖片摳出來放進去。
> 然後不要點擊換頁?就只允許左右鍵跟滾輪
> 然後多一個功能，就是按中鍵之後進入繪畫模式，這個時候點左鍵可以當畫筆，右鍵可以把線條擦掉
> 1. 格式：改成 HTML 試試看　2. 講稿：好，按 F1 出現講稿
> 所以要有足夠的動畫、可操控元件。這樣才能有東西可以講。
> （老師分工說明，見 teacher-script.md）
> 從第六章投影片到step四之二,應該都可以請AI
> 不過先把整份動態的 Slide 準備好，我會先給老師看，沒問題之後我自己會再想辦法配語音跟動態的3D人物上去，然後文字可以全英文。

處理方式：
- 照原稿的視覺重做：桃色格紋、白色圓角卡、粉紅描邊大標題、橘色標籤、黃色副標、紅色動詞、紫色名詞、星星、櫻桃、鬱金香。
- 用 flood-fill 去背，把女孩和照片從截圖摳出來（`tools/extract_assets.py`）。
- 每個步驟頁都做了可操作的實驗區。
- 補了原稿沒有的 Step 4-2 和 Kitchen words 單字卡頁。
- 漫畫圖裡的中文計時標籤（30秒、2分鐘…）重繪成英文。
- 範本留下的「@reallygreatsite.com」改掉。

### 2026-10-14 #2：講稿依老師小卡、加強動畫、手機按鈕
> NOte的內容可以參考這些截圖，然後幫我再完善動畫
> 右下角給我左右鍵，這樣我手機上面可以按
> 網址是我給最後一張截圖

處理方式：
- 講稿改成小卡原句。
- 頁面順序改成小卡的 1→8 流程：開場 → 選蛋糕 → 剪下排序 → 做食譜 → 看影片 → 食材 → 單字 → Step 1–6 → 總覽 → 結尾。
- 新增：開場的 Today / Next week 標籤與印章、句型框與字卡、5 秒思考倒數、剪刀動畫、First/Then/Next/Finally、3 分鐘計時、影片頁提醒卡與「Is your recipe correct now?」、Read together（逐字亮起）、結尾彩帶與 Big hand、右下角 ‹ › 講稿 畫筆 按鈕、Eraser 工具（手機沒有右鍵）。
- YouTube：https://www.youtube.com/watch?v=dGgE68DBvkw

### 2026-10-14 #3：等待太久、Fast 改為 5 秒、Auto
> 所有需要等待的地方，可以讓我有一個比較好的UIUX來跳過該階段嗎?要不然像有一個16分鐘的就等超級久，或是選fast的話就幫我把動畫時間都濃縮到現實的5秒，不管是多長的動畫都是。然後多一個 Auto 的選項，可以自動推進步驟

處理方式：
- 所有等待都改走 `countdown()`：Fast＝不論長短都 5 秒跑完；等待中出現 Skip 鈕（顯示剩幾秒）。
- 5 秒思考倒數可點擊或按 Skip 跳過；3 分鐘計時有 Skip。
- Auto 模式會自動按下一步，拖曳攪拌類步驟用 `autoStir` 自動攪拌。
- 模式存在 localStorage。

### 2026-10-14 #4：YouTube 能不能內嵌
> 另外youtube影片不能內嵌在裡面嗎?

處理方式：加「Play here」（iframe 內嵌，postMessage 設 2×），保留「Open on YouTube」和「播放本機影片檔」。claude.ai 預覽會擋 iframe；直接開檔很可能遇到 YouTube Error 153；放在網站上應該可以。有提議發佈到 BSOS Present（present.bsos.co），使用者後來自行部署到 Cloudflare。

### 2026-10-14 #5：F1 講稿改成獨立視窗
> 按 F1 的講稿可以用這種形式嗎?就是額外的視窗。（附圖：references/feedback/presenter-view-example.png）
> 然後講稿內容可以參考我前面提供的綠色跟黃色的截圖，那是老師做PPT的時候寫的講稿

處理方式：
- `Presenter`：深色獨立視窗，顯示頁碼、主講、計時器、A−/A+、← →、標題、講稿、下一頁標題。視窗內按方向鍵可以控制主簡報，F1 / Esc 關閉。
- 視窗被擋時，改在頁面下方顯示講稿面板。
- 如果講稿第一行只是重複標題，就自動隱藏。

### 2026-10-14 #6：Cloudflare 亂碼
> 為什麼這裡的字我部屬到cloudflare 後變成這樣?（附圖：references/feedback/cloudflare-mojibake.png，例如「1Ã—」「â€œPlay hereâ€」）

原因：Artifact 版是頁面片段，沒有 charset，Cloudflare 上被當成 windows-1252。
處理方式：
- 原始碼第一行加 `<meta charset="utf-8">`。
- build 另外輸出完整文件 `dist/site/index.html`（doctype、charset、viewport），之後部署到網站一律用這個檔案。

### 2026-10-26：老師想要 AI 唸讀評分
原文、方案 A / B 分析、給老師的精簡版：見 `teacher-request-and-plans.md`。

### 2026-10-27：導讀頁加上投影片、簡報會念
> 這個版本是分組導讀的，可以把原本的 slide 畫面也附上嗎？原本的 slide 也要可以正常播放＋唸出來，兩個都要存在。

使用者選擇：導讀頁嵌入完整 Step 投影片；Read together 要出聲、整頁講稿用語音念、導讀頁裡的投影片也要能播。做法：簡報加 `Voice` / `Narrator` / `?embed=N`，學生頁用 iframe 嵌入。語音暫用瀏覽器內建，之後換成使用者自己配的 AI 語音。

### 2026-10-27：方案 B 定案並實作
老師回答：每組一台 iPad、每個學生都唸全部 7 張步驟卡（用 Slide 上的句子）、各自評分、成績要給老師看但不要後台。做法：同一支 Worker 提供 `/read/`、`/teacher/`、`/api/*`，成績存 D1，學生用組別＋座號辨識。查證發現 Azure F0 同時只能 1 個連線，所以要用 S0。

### 2026-10-27：打包 repo、決定做方案 B
> 幫我整理一下目前所有內容，跟我上傳過的圖片還有這個網頁的所有程式，幫我打包成 repo 的樣貌，我之後會丟到新的 Session 處理，我不希望遺漏任何東西
> 然後最後要決定做方案 B 了

處理方式：就是這個 repo。git 歷史依序是 v1 → v2 → v3 → v4，見下方第 5 節。

## 4. 使用者的固定偏好與規則
見 `CLAUDE.md`。重點：
- 用繁體中文回覆，emoji 不要多。
- 程式要好維護、穩定、容錯、不破壞原功能。
- 點擊畫面不換頁。
- 簡報文字全英文。

## 5. 版本（git 歷史對應）
| 版本 | 時間 | 內容 |
|---|---|---|
| v1 | 2026-10-14 20:58 | 初版 16 頁：實驗區、繪圖、F1 頁內講稿、只能鍵盤和滾輪換頁 |
| v2 | 2026-10-14 21:10 | 小卡講稿、頁面重排、更多動畫、手機按鈕、影片頁 |
| v3 | 2026-10-14 21:20 | Fast（5 秒）/ Real / Auto、Skip、YouTube 內嵌 |
| v4 | 2026-10-14 21:28 | F1 獨立講稿視窗、UTF-8 與網站版建置（＝目前發佈的 Artifact 版本 5） |

## 6. 驗證過的事
- 每個版本都用無頭 Chromium 截了所有頁，沒有 page error。
- Fast：Step 6 的 16 分鐘烘烤在 5 秒內完成，Skip 可以直接跳到完成。
- Auto：Step 1、4-2、5 自動從頭跑到完成。
- 講稿視窗：可以開啟；在視窗內按 → 主簡報會換頁；F1 會關閉。
- 網站版透過 HTTP 載入時 `characterSet=UTF-8`、`compatMode=CSS1Compat`，「1×」「“Play here”」顯示正確。
- `tools/extract_assets.py` 重新產生的圖片和現有的一致（PNG 完全相同，JPG 只有重新壓縮的微小差異）。

## 7. 尚未驗證／已知限制
- Step 2、3、4-1、6 的 Auto 沒有完整實跑。
- 手機實機的繪圖（手指）沒測過，只看過 400px 寬的模擬畫面。
- YouTube「Play here」在 Cloudflare 上沒實測；postMessage 設定 2× 也沒實測。
- 圖片是從低解析截圖放大的，投影到大螢幕會有點糊。若取得老師原始素材（女孩插圖、照片），同名替換 `assets/img/` 後重新建置即可。
- 講稿視窗在 claude.ai 預覽多半會被擋，會改用頁內面板。
- 原稿的影片（Step 2、3、6 是影片截圖）沒有素材，所以改用漫畫格和互動實驗代替。

## 8. 外部位置
- claude.ai Artifact：https://claude.ai/artifact/NeuWpVPVjJJb1D7VcJ2ZFj（版本 5，分享設定為 Anyone with the link）。
- 空白的 Slides artifact：83fbe32f-f1e5-490b-a42f-cf00a9944cdb（使用者建立，沒使用）。
- Cloudflare Worker `wispy-fog-b991`（https://wispy-fog-b991.stanley890314.workers.dev/）：之後一律 `npx wrangler@4 deploy`。
- 使用者有 BSOS Present 的 MCP（present.bsos.co），可以用來發佈 ZIP 網站；發佈前須確認標題和網址。

## 9. 下一步
1. 使用者照 README「Read & Check」部署：Azure S0、D1、secret、`wrangler deploy`。
2. 用學校 Wi-Fi＋學校 iPad 實測：麥克風權限、連換 3 位學生、網路是否擋 workers.dev / jsDelivr / Azure WebSocket。
3. 實測 Step 3、4-1 慢慢唸會不會被截斷（單次 15 秒上限風險，`SCORING.silenceMs`）；依分數調整 `SCORING` 門檻。
4. 之後再做：方案 A 退路、多班級區分、匯出 CSV、簡報上的 QR code。
