# 方案 B：AI 唸讀發音評分（下一個任務）

狀態：**已決定採用方案 B**（2026-10-27），尚未開始實作。老師原始需求與方案比較見 `teacher-request-and-plans.md`。

## 目標
學生剪貼並排好步驟順序後，各組用平板或電腦，把 Step 1 到最後一步依序唸一次。程式要：
1. **確認學生有唸、唸得出來**（老師最主要的需求）。
2. 給分數與回饋（老師說「有很好，沒有也沒關係」；已決定要做）。
3. 讓小組能自己操作，不需要老師在旁邊。

## 開工前要跟使用者確認的問題（還沒有答案）
1. 各組用什麼裝置？Chromebook、iPad、教室電腦？（影響瀏覽器相容性與麥克風）
2. 一組一起唸一次，還是每個學生輪流唸？（影響流程、結果頁與用量）
3. 放在哪裡？建議：簡報第 4 頁（做食譜）之後加一頁「Read & Check」，另外做一個獨立網址給各組的裝置用（同一份資料與引擎）。
4. 唸讀的原文要用哪一版？學習單紙條上的字可能和簡報不同，需要老師提供學習單原文。下方先用簡報上的句子當暫定版本。
5. 要不要保留結果給老師看？例如每台裝置存各組最後分數、匯總表。預設**不存錄音**，只顯示分數。
6. Step 4 在學習單上是一條，簡報分成 4-1 / 4-2。唸讀時要不要把香草精、蜂蜜牛奶那句也算進去？

## 技術選型
- **Azure AI Speech：Pronunciation Assessment（發音評估）**，語言 `en-US`。
  - 每個字給 AccuracyScore 0–100、ErrorType（None / Omission 漏唸 / Insertion 多唸 / Mispronunciation 唸錯 / UnexpectedBreak / MissingBreak / Monotone）。
  - 整段給 Accuracy、Fluency、Completeness、Prosody，以及綜合 PronScore。
  - 設定：`GradingSystem.HundredMark`、`Granularity.Phoneme`（或 Word）、`enableMiscue = true`（才能判斷漏唸和多唸）、開啟 prosody assessment。
- 前端用 Speech SDK for JavaScript（npm 套件 `microsoft-cognitiveservices-speech-sdk` 的 browser bundle，從 jsDelivr 載入，**版本要寫死**）。
  - 每一步唸一次用 `recognizeOnceAsync`（單次最長約 30 秒，一步一句足夠）。
  - 結果用 `PronunciationAssessmentResult.fromResult(result)` 取得；逐字細節在 detailResult 的 `Words[]`。
- **金鑰絕不能放在前端。** 用 Cloudflare 的小程式（Pages Function 或 Worker）換取短效 token：
  - `POST https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`，header 放 `Ocp-Apim-Subscription-Key`，token 有效 10 分鐘。
  - 前端：`SpeechConfig.fromAuthorizationToken(token, region)`，9 分鐘左右自動換新。
  - 環境變數（Cloudflare secret）：`AZURE_SPEECH_KEY`、`AZURE_SPEECH_REGION`。
  - 端點加 Origin 檢查、`Cache-Control: no-store`、簡單的速率限制，避免被濫用刷費用。
  - 注意：使用者目前是直接上傳一個 `index.html` 到 Cloudflare。Pages Functions 需要用 Wrangler 或 Git 部署含 `functions/` 資料夾的專案（Dashboard 拖拉上傳是否支援 Functions 需要確認），也可以另外開一個獨立的 Worker 當 token 端點。
- **退路（方案 A）**：token 取不到、或瀏覽器不支援麥克風時，改用瀏覽器內建語音辨識（`webkitSpeechRecognition`，Chrome / Edge），只給「唸到幾成、哪些字漏掉」，不給發音分數。畫面相同，只換辨識引擎，所以引擎要抽象成同一個介面：
  ```js
  // engine.assess(referenceText) -> Promise<{ words: [{ text, score|null, error }], scores: { accuracy, fluency, completeness, prosody, overall } | null }>
  ```

## 唸讀原文（暫定，數字要拼成英文字給 Azure 當 reference text）
| 步驟 | 顯示文字 | reference text |
|---|---|---|
| 1 | Prepare the liquids. Mix milk and honey. Heat and let it cool. | 同左 |
| 2 | Prepare the dry ingredients. Mix and sieve cake flour, baking powder, and salt. | 同左 |
| 3 | Whisk the eggs and sugar. Whisk eggs on high speed for 2 minutes. Add sugar and mix until creamy. | …for two minutes… |
| 4 | Add oil and flavor. Add the sunflower seed oil slowly from the side, and whisk for another 3 minutes. | …another three minutes. |
| 5 | Mix with flour. Add flour in 3–4 times. Mix gently. | …in three to four times… |
| 6 | Fill the cups and bake. Spoon the batter into cupcake cases. Bake at 180°C for 16 minutes. | …at one hundred eighty degrees for sixteen minutes. |

老師原本投影片 Step 3 寫的是 “in high speed”，簡報改成 “on high speed”；以老師學習單為準。

## 畫面流程（建議）
1. 選組別（Group 1–6）→ 麥克風權限說明 → Start。
2. 一次一步：大字顯示句子 → 按「Start reading」（或倒數 3 秒自動開始）→ 收音時麥克風圖示跳動 → 收音結束後，每個字依分數上色（綠 ≥ 80、黃 60–79、紅 < 60、灰＝漏唸），顯示這一步的星星與一句回饋 → 「Try again」或「Next step」。
3. 結果頁：6 步的分數條、總星星、要再練的字（分數最低的 3–5 個字，可以點擊用 TTS 聽示範：`speechSynthesis`，或 Azure TTS）、「Great job, Group N!」彩帶。
4. 沿用簡報的視覺（桃色格紋、女孩、Fredoka 字型）以及 `countdown` / `banner` / `celebrate` 等工具。

## 評分與回饋規則（範本，不用 LLM）
| 綜合分數 | 星星 | 回饋範例 |
|---|---|---|
| ≥ 90 | ★★★ | Excellent reading! |
| 75–89 | ★★☆ | Great job! Try “{最低分的字}” again. |
| 60–74 | ★☆☆ | Good try! Listen and read “{字}” one more time. |
| < 60 或 Completeness < 50 | ☆☆☆ | Let's read it together again. |

- 「有沒有唸」主要看 Completeness（唸到的字的比例）。老師最在意這點，所以畫面要清楚顯示「6 個步驟都唸完了」。
- 兒童語音、教室噪音會讓分數偏低。門檻要寬鬆，實測後再調整，門檻值放在同一個設定物件裡。
- 若之後要讓 AI 寫個人化評語：把分數和錯字丟給 LLM，產生 1–2 句英文鼓勵。成本很低，但不是必要。

## 成本（2026-10 查詢；正式使用前請到 Azure 計價頁或計算機再確認）
- 免費層（F0）：語音轉文字每月 5 小時免費（Standard 與 Custom 共用）。
- 付費（S0）：即時語音轉文字約 US$1.32 / 小時（Microsoft Q&A 社群回答，2025-11，US East）。官方計價頁把 Pronunciation Assessment 列為「Enhanced add-on features」另外按小時計費，但查詢時頁面沒有顯示金額。所以保守估計每小時 US$2–3。
- 用量估計：6 步約 70 個字，唸一次約 1 分鐘。6 組各唸 3 次約 20 分鐘；每人都唸約 30–50 分鐘。每班約 US$0.3–1.5（約台幣 10–50 元），多半在免費額度內。
- 參考來源：
  - https://azure.microsoft.com/en-in/pricing/details/speech
  - https://learn.microsoft.com/en-us/answers/questions/5608069/pricing-and-usage-of-pronunciation-assessment-feat

## 隱私
- 學生（未成年）的聲音會傳到 Microsoft 做即時辨識。我們不儲存錄音；Azure 即時辨識預設不保留音訊（以官方文件為準）。
- 建議老師事先告知學校或家長。畫面不要求輸入學生姓名，只用組別。

## 測試清單
- 實際裝置：Chrome / Edge 桌機、Chromebook、iPad Safari（麥克風權限流程）。
- 教室噪音：多組同時唸；建議分散座位或使用耳麥。
- Token 過期（超過 10 分鐘）時自動更新；網路斷線時的錯誤訊息與方案 A 退路。
- Skip / Try again / 換組別的狀態重置；連續使用時的記憶體（關閉麥克風、釋放 recognizer：`recognizer.close()`）。
- 不能破壞現有簡報功能（換頁規則、F1、繪圖、Fast / Real / Auto）。

## 實作順序建議
1. 建 Azure Speech 資源（F0），取得 key 與 region。
2. 寫 token 端點（Cloudflare Pages Function 或 Worker），本機用 `wrangler dev` 測試。
3. 做引擎抽象：`AzureEngine` 與 `WebSpeechEngine`（方案 A 退路）。
4. 做 Read & Check 頁（獨立網址）＋ 簡報裡的入口頁。
5. 用自己錄的唸讀實測，調整分數門檻。
6. 部署並寫部署說明（環境變數、Functions）。
