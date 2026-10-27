# 方案 B：AI 唸讀發音評分（規格）

狀態：**已實作**（2026-10-27），待部署、iPad 實測與調整 `SCORING` 門檻。實作計畫：`docs/superpowers/plans/2026-10-27-plan-b-read-and-check.md`；部署步驟見 README。老師原始需求與方案比較見 `teacher-request-and-plans.md`。

時程：宛倪老師要在 **2026-10-30（五）前試教**。目標是週三（10-28）給老師看第一版，週四（10-29）用 iPad 實測並調整門檻。

## 目標
學生剪貼並排好步驟順序後，**每個學生**用小組的 iPad 把全部步驟唸一次，程式要：
1. **確認學生有唸、唸得出來**（老師最主要的需求）。
2. 給每個學生分數與回饋（老師說「有很好，沒有也沒關係」；已決定要做）。
3. 讓小組自己操作，不需要老師在旁邊。
4. 保留成績讓老師看，但不做管理後台。

## 老師的回答（2026-10-27）
| 問題 | 回答 | 對設計的影響 |
|---|---|---|
| 裝置 | 每組一台 iPad，在自己座位唸 | iPad Safari 為主要目標；不能靠瀏覽器內建辨識 |
| 誰唸 | 每個學生都唸**全部段落**，各自評分（每步很短，只唸一步太少） | 要辨識「哪個學生」：組別＋座號 |
| 原文 | 唸 Slide 上的 Step | 不用等學習單，直接用簡報的句子 |
| 成績 | 要保留給老師看，不需要後台 | Cloudflare D1 存分數，老師開一個網址看 |
| 互動 | 參考網路上的做法 | 見下方「參考做法」 |

## 參考做法（取用的部分）
- Google Read Along：唸到哪個字就亮哪個字、唸完給星星。
- Microsoft Reading Progress / Reading Coach：老師看完成度、漏唸和唸錯的字；學生只練唸錯的字。
- ELSA、Speechace：每個字依分數上色，點字聽示範。
- 給國小生：只給星星與鼓勵，**不排名**。

## 系統組成
全部放在**同一支 Cloudflare Worker**（沿用現有網址 `wispy-fog-b991.stanley890314.workers.dev`），改用 `wrangler deploy` 部署。

| 路徑 | 內容 | 來源 |
|---|---|---|
| `/` | 簡報（**不改**） | `src/index.src.html` → `dist/site/index.html` |
| `/read/` | 學生頁（iPad） | `src/read.src.html` → `dist/site/read/index.html` |
| `/teacher/` | 老師成績頁 | `src/teacher.src.html` → `dist/site/teacher/index.html` |
| `GET /api/token` | 換 Azure 短效 token | `worker/index.mjs` |
| `POST /api/score` | 存一張卡的成績 | `worker/index.mjs` |
| `GET /api/scores?day=YYYY-MM-DD` | 讀某天全部成績（預設今天，台北時間） | `worker/index.mjs` |

```
repo
├─ wrangler.jsonc        Worker 設定：main=worker/index.mjs、assets=dist/site、D1 binding DB、rate limit binding
├─ worker/index.mjs       /api/* 路由；其他路徑交給靜態檔
├─ worker/schema.sql     D1 資料表
├─ src/read-core.js      學生頁的純邏輯（卡片、對齊、評分），建置時內嵌進學生頁與老師頁，也能用 node 測試
├─ src/read.src.html     學生頁（單檔，CSS + JS 內嵌）
├─ src/teacher.src.html  老師頁（單檔）
└─ tools/build.py        擴充：除了簡報，也輸出 read/ 與 teacher/
```

- 簡報的 Artifact 版（`dist/vanilla-cupcakes.html`）不受影響；學生頁與老師頁只有網站版。
- 學生頁與老師頁沿用 `<img data-img="...">` 與 `{{IMGMAP}}` 機制（build.py 對每個頁面各自產生對照表）。
- 視覺沿用簡報：桃色底、Fredoka / Nunito、女孩圖、`--verb` / `--noun` 色彩 token。

## 唸讀卡片（7 張，跟簡報分頁一致）
每張卡要唸「黃色標題＋句子」。4-2 和 4-1 的標題相同，所以 4-2 只唸句子。
`spoken` 是送給 Azure 的 reference text：只列出跟顯示文字不同的字（數字要拼成英文字）。

| id | 顯示文字 | 替換（顯示 → 唸法） |
|---|---|---|
| `1` | Prepare the liquids. Mix milk and honey. Heat and let it cool. | — |
| `2` | Prepare the dry ingredients. Mix and sieve cake flour, baking powder, and salt. | — |
| `3` | Whisk the eggs and sugar. Whisk eggs on high speed for 2 minutes. Add sugar and mix until creamy. | `2` → two |
| `4-1` | Add oil and flavor. Add the sunflower seed oil slowly from the side, and whisk for another 3 minutes. | `3` → three |
| `4-2` | Add the vanilla extract and the honey milk. Mix with a spatula. | — |
| `5` | Mix with flour. Add flour in 3–4 times. Mix gently. | `3–4` → three to four |
| `6` | Fill the cups and bake. Spoon the batter into cupcake cases. Bake at 180°C for 16 minutes. | `180°C` → one hundred eighty degrees；`16` → sixteen |

- 卡片資料是學生頁裡的一個常數 `CARDS`。簡報的 `STEPS` 是學習單的 6 步，用途不同，不共用；**改簡報句子時要同步改 `CARDS`**（在兩邊都加註解提醒）。
- 顯示字和唸法的對應：顯示文字用空白切成 token，每個 token 對應 1 個以上的唸法字。這個 token 的分數取它的唸法字中最低的那個，所以畫面上永遠是對「顯示的字」上色。

## 學生流程（一人約 2–3 分鐘）
1. **選組別**（Group 1–6）：只在第一次出現，存在 localStorage（`readcipe-group`），畫面角落可以改。
2. **選座號**：1–40 的大按鈕數字盤 → `Start`。
3. **7 張卡依序唸**，每張卡：
   - 大字顯示句子；`Listen` 用 iPad 內建語音（`speechSynthesis`，en-US，速度 0.85）唸示範。
   - `Start reading` → 3-2-1 → 收音，麥克風圖示跳動，唸到的字即時亮起。
   - 唸完停頓約 2.5 秒自動結束；收音中可以按 `Cancel` 取消（不算一次嘗試）。
   - 結果：每個字上色（綠 ≥ 80、黃 60–79、紅 < 60、灰＝漏唸）＋星星＋一句回饋。
   - `Try again`（每張卡最多唸 3 次，取最高分；第 3 次後只剩 `Next`）或 `Next`。
4. **總結頁**：總星星、「All 7 steps read!」標章（每張都達到「有唸」才給）、要再練的 3–5 個字（點字聽示範）、彩帶。
5. `Next classmate` → 回到選座號畫面。頁面不重新載入，所以 iPad 不會每換一位學生就再問一次麥克風權限。

中途換人：選座號畫面任何時候都能回去（左上角 `Change student`），已上傳的卡片成績會保留。

## 辨識引擎
- **Azure AI Speech：Pronunciation Assessment**，`en-US`。
  - `GradingSystem.HundredMark`、`Granularity.Word`、`enableMiscue = true`（才能判斷漏唸和多唸）、開啟 prosody。
  - 每張卡用一次 `recognizeOnceAsync`；`recognizing` 事件拿即時文字，用來讓字亮起。
  - 一張卡有 2–3 句，句子之間會停頓：把 `Speech_SegmentationSilenceTimeoutMs` 設成 2500（範圍 100–5000），避免唸完第一句就被截斷。週四實測；如果學生停太久仍會被截斷，再改用連續辨識並自己合併各段的逐字結果（完整度要自己算）。
  - `Cancel`：直接 `recognizer.close()`。
  - **單次長度風險**：一般辨識文件寫單次最多 15 秒，發音評估文件寫 30 秒。Step 3、4-1 各約 19 個字，唸很慢的學生可能超過 15 秒。週四實測；會被截斷就把這兩張卡各拆成兩張（只改 `CARDS`）。
  - Azure 回 `TooManyRequests`（超過同時連線數）時，顯示「Too many groups are reading right now. Wait a moment and try again.」，不算一次嘗試。
  - 結果：`PronunciationAssessmentResult.fromResult(result)` 取整段分數；逐字結果在 detail JSON 的 `NBest[0].Words[]`。
  - 逐字對齊：略過 `ErrorType = Insertion` 的字，剩下的照順序對到 reference 的字；`Omission` 算灰色。
  - Speech SDK browser bundle 從 jsDelivr 載入，**版本寫死**（實作時選一個發佈超過兩週的版本）。
- 每次唸完都要 `recognizer.close()`，釋放麥克風與記憶體。
- 引擎介面（之後要加方案 A 退路時只換這一層）：
  ```js
  // engine.assess(card, { onPartial(text) }) -> Promise<{
  //   tokens: [{ text, score: 0-100 | null, error: 'None'|'Omission'|'Mispronunciation'|... }],
  //   scores: { accuracy, fluency, completeness, prosody, overall }
  // }>
  ```
- 測試用 `?engine=fake`：不開麥克風，回傳固定結果，讓 Playwright 能跑完整流程。

## 評分與回饋（範本，不用 LLM）
所有門檻放在同一個 `SCORING` 設定物件，週四實測後調整。

| 條件 | 星星 | 回饋 |
|---|---|---|
| overall ≥ 85 | ★★★ | Excellent reading! |
| overall 70–84 | ★★☆ | Great job! Try "{最低分的字}" again. |
| overall 50–69 | ★☆☆ | Good try! Listen and read "{字}" one more time. |
| overall < 50 或 completeness < 50 | ☆☆☆ | Let's listen and try again. |

- **「有唸」= completeness ≥ 60**。老師最在意這點，所以總結頁和老師頁都要清楚顯示。
- 兒童語音和教室噪音會讓分數偏低，門檻刻意設得寬鬆（比原本草稿低 5–10 分）。
- 要再練的字：分數 < 70 或漏唸的字，依分數排序取前 5 個，重複的字只算一次。

## 成績資料
- 離開一張卡（按 `Next` 或 `Change student`）時，如果至少有一次結果，就上傳**這張卡最好的一次**和嘗試次數。每張卡只上傳一次。
- 上傳失敗就先存在 localStorage 佇列（`readcipe-pending`），下次上傳成功或 `online` 事件時補送，所以網路斷了也不會掉成績。

D1 資料表（`worker/schema.sql`）：
```sql
CREATE TABLE IF NOT EXISTS scores (
  day          TEXT    NOT NULL,  -- YYYY-MM-DD，台北時間，由 Worker 產生
  seat         INTEGER NOT NULL,  -- 座號 1-40
  card         TEXT    NOT NULL,  -- '1','2','3','4-1','4-2','5','6'
  grp          INTEGER NOT NULL,  -- 組別 1-6
  stars        INTEGER NOT NULL,  -- 0-3
  overall      INTEGER NOT NULL,  -- 0-100
  accuracy     INTEGER, fluency INTEGER, completeness INTEGER, prosody INTEGER,
  weak         TEXT    NOT NULL DEFAULT '[]',  -- JSON：要再練的字
  attempts     INTEGER NOT NULL DEFAULT 1,
  updated_at   INTEGER NOT NULL,  -- epoch ms
  PRIMARY KEY (day, seat, card)
);
```
- 同一天、同座號、同一張卡只留一列：分數比較高才覆蓋分數欄位，`attempts` 加上這次上傳的嘗試次數（SQLite upsert 的每個欄位用 `CASE` 判斷）。同一位學生之後重唸同一張卡，也是同樣規則。
- 主鍵不含組別：學生換組時，成績仍然算同一個人；`grp` 記錄最後一次的組別。

## API 規則（Worker）
- `GET /api/token`：用 Cloudflare secret `AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION` 呼叫 `POST https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`，回傳 `{ token, region }`（token 10 分鐘有效，前端快取 9 分鐘）。
- `POST /api/score`：嚴格檢查欄位（數字範圍、card 白名單、weak 最多 10 個字、每個字最多 30 字元、body 最多 4 KB），不合格回 400。
- `GET /api/scores`：只回傳成績欄位，沒有任何個資。
- 全部 `/api/*`：`Cache-Control: no-store`；`Origin` 存在時必須和自己的網域相同；用 Workers Rate Limiting binding 依 IP 限速（token 每分鐘 20 次、score 每分鐘 60 次），超過回 429。
- 錯誤一律回 JSON `{ error }`，Worker 內部錯誤記錄到 `console.error`，不把 Azure 的錯誤細節傳給前端。

## 老師頁
- 上方：日期（`<input type="date">`，預設今天）、最後更新時間。每 10 秒自動更新。
- 依組別分區，每組一張表：列＝座號，欄＝7 張卡（格子顯示星星；沒唸是空白；「有唸」但分數低也要看得出有唸）、「唸完 n/7」、平均分數。
- 點一列展開那位學生要再練的字。
- 不需要密碼、不能刪除資料：資料只有組別、座號和分數，沒有姓名；預設只看今天，舊資料不會干擾。

## 錯誤處理（學生頁）
| 狀況 | 畫面 |
|---|---|
| 麥克風權限被拒 | 「Please ask your teacher to allow the microphone. / 請老師幫忙開啟麥克風」＋iPad 設定步驟 |
| token 取不到（網路、Worker、Azure 金鑰） | 自動重試 1 次；失敗顯示「Please ask your teacher」，按鈕可重試 |
| 沒聽到聲音（NoMatch） | 「I couldn't hear you. Hold the iPad closer and try again.」，不算一次嘗試 |
| 辨識中斷（Canceled） | 同上，並在 console 記錄原因 |
| 上傳失敗 | 不打擾學生，放進佇列補送；老師頁看得到最後更新時間 |
| SDK 載入失敗 | 「Please check the internet and reload.」 |

所有事件處理包在 try/catch（同簡報的 `safe()` 習慣），任何錯誤都不能讓頁面卡死。

## 週五前不做（之後再加）
- 方案 A 退路（瀏覽器內建辨識）：iPad Safari 上不穩，做了幫助不大。
- 多班級區分、匯出 CSV、刪除資料、老師密碼。
- AI 寫個人化評語。
- 簡報上放學生頁的 QR code。
- 簡報裡現有的 `Read together` 按鈕維持原樣。

## 成本（2026-10 查詢；正式使用前請到 Azure 計價頁再確認）
- **要用 S0（付費層）**：免費層 F0 的即時辨識同時只能有 1 個連線，而且不能調高，6 台 iPad 同時唸會有 5 台失敗（https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits ）。F0 只適合一台裝置自己測。F0 換 S0 後配額可能要幾小時才生效，直接建 S0 最保險。
- 用量：一個學生含重唸約 2–3 分鐘，一班 30 人約 1–1.5 小時。
- 付費（S0）：即時語音轉文字約 US$1.32 / 小時，發音評估另計；保守估計每小時 US$2–3，一班約台幣 60–150 元。
- 參考：https://azure.microsoft.com/en-in/pricing/details/speech 、https://learn.microsoft.com/en-us/answers/questions/5608069/pricing-and-usage-of-pronunciation-assessment-feat

## 隱私
- 學生（未成年）的聲音會即時傳到 Microsoft 辨識；我們**不存錄音**，Azure 即時辨識預設不保留音訊（以官方文件為準）。
- 只用組別和座號，不輸入姓名。
- 建議老師事先告知學校或家長。

## 使用者要準備的
1. Azure 建立 Speech 資源：**S0**、區域 East Asia（`eastasia`），並在 Cost Management → Budgets 設預算警示（例如 US$10）。
2. `npx wrangler d1 create readcipe`，把 database_id 填進 `wrangler.jsonc`；`npx wrangler d1 execute readcipe --remote --file worker/schema.sql`。
3. `npx wrangler secret put AZURE_SPEECH_KEY`、`npx wrangler secret put AZURE_SPEECH_REGION`。**金鑰不要貼到對話或 commit 裡。**
4. `python tools/build.py` → `npx wrangler deploy`。Worker 名稱設成 `wispy-fog-b991`，部署會取代目前上傳的版本，網址不變。

## 教室使用注意
- 學校網路要能連到：`wispy-fog-b991.stanley890314.workers.dev`（學校過濾器常擋 *.workers.dev）、`cdn.jsdelivr.net`（Speech SDK）、`wss://eastasia.stt.speech.microsoft.com`（443 埠的 WebSocket）。週四要用學校 Wi-Fi 加學校 iPad 實測；jsDelivr 被擋時可以把 SDK 檔案放進 `dist/site` 自己提供。
- 學校 iPad 的螢幕使用時間或 MDM 可能擋麥克風，要請資訊組開放。學生要用 Safari 開，不要用 LINE 這類 App 內建的瀏覽器。上課時把自動鎖定設成「永不」。
- 6 組會同時各有一人在唸：請學生拿 iPad 靠近嘴巴，各組座位分開一點。
- 第一次開頁 iPad 會問麥克風權限，要按「允許」。之後同一個分頁不要重新整理。

## 測試清單
- 自動：`tools/test_read.py`（Playwright，`?engine=fake`，mock `/api/*`）跑完「選組 → 選座號 → 7 張卡 → 總結 → 下一位」，並檢查無 page error；老師頁用假資料截圖。
- Worker：`npx wrangler dev`（本機 D1）測 token、score 驗證（400）、upsert 只保留高分、scores 查詢。
- 實機：iPad Safari 麥克風權限、連續換 3 位學生不再問權限、token 超過 10 分鐘自動更新、斷網後恢復補送成績。
- 簡報：建置後跑 `tools/screenshot_all.py`，確認簡報 16 頁完全沒變（換頁規則、F1、繪圖、Fast / Real / Auto）。
