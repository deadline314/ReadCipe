# 頁面對照表（目前 16 頁）

「主講」是 `data-lead`，會顯示在左下角和講稿視窗。「原稿」指 `references/original-slides/` 裡對應的老師投影片。

| # | section id | 標題 | 主講 | 原稿 | 互動與動畫 | 講稿來源 |
|---|---|---|---|---|---|---|
| 1 | `s-title` | How to make vanilla cupcakes? | Teacher | 01 | 標題字逐字跳出、標題卡漂浮、Today / Next week 標籤、「Not baking today!」印章、星星閃爍、櫻桃搖擺 | 小卡 1 |
| 2 | `s-choose` | Which cupcake do you like? | Teacher | 02 | 點杯子蛋糕投票（計數、Top pick）；句型「I like number __ because it is __.」點杯子填號碼、點字卡填理由；Think · 5 s 大倒數（可點擊跳過）→「Now, talk with your partner!」；Reset | 小卡 2 |
| 3 | `s-sort` | Cut out and sort the steps | Teacher | 03 | 6 條步驟可拖曳排序、Check the order（對綠錯紅）、Shuffle；剪刀沿虛線剪的動畫；3 點操作說明 | 小卡 3 |
| 4 | `s-match` | Make your own cupcake recipe | Teacher | 04 | 學習單表格（Steps / Pictures / Notes），把 6 張圖拖進 Pictures 欄、Check；Notes 可打字；First/Then/Next/Finally；3 分鐘計時（Ready? Let's start! → 最後 10 秒抖動 → Time's up! 彩帶）＋ Skip | 小卡 4 |
| 5 | `s-video` | Watch the video and check | Teacher | YouTube 頁 | Play here（YouTube 內嵌，postMessage 設 2×）、Open on YouTube、播放本機影片檔；1× / 1.5× / 2×；5 張提醒卡可打勾；「Is your recipe correct now?」Yes（彩帶）/ Not yet（抖動） | 小卡 5 |
| 6 | `s-ingr` | Ingredients | AI | 06 | 9 張食材卡（圖示、份量、用在第幾步），點擊打勾、Ready n/9；6 / 12 / 24 份量換算；Read together（逐張亮起） | 小卡 6 |
| 7 | `s-verbs` | Kitchen words | AI | （新增） | Mix / Sieve / Whisk / Add / Spoon / Bake 翻牌卡（背面例句） | 自編 |
| 8 | `s-step1` | Step 1 · Prepare the liquids | AI | 07 | 微波爐實驗：加牛奶、加蜂蜜、加熱 30 s（轉盤、發光、溫度計）、攪拌、降溫；Group 1 Read together（逐字亮起） | 小卡 7 |
| 9 | `s-step2` | Step 2 · Prepare the dry ingredients | AI | 08 | 篩子實驗：放入麵粉、泡打粉、鹽，Shake the sieve 6 次（粉末落下、進度條） | 依小卡 7 句型 |
| 10 | `s-step3` | Step 3 · Whisk the eggs and sugar | AI | 09 | 打蛋器實驗：打 3 顆蛋、打發 2 min、加糖、打到 creamy 3 min（顏色漸變、體積變大） | 依小卡 7 句型 |
| 11 | `s-step41` | Step 4-1 · Add the oil | AI | 10 | 倒油實驗：Slow/Fast 滑桿 + 按住倒油（太快出現 Too fast!），120 g 後打發 3 min | 依小卡 7 句型 |
| 12 | `s-step42` | Step 4-2 · Add vanilla and honey milk | AI | （新增） | 加香草精、加蜂蜜牛奶（動畫），在碗上拖曳攪拌直到顏色均勻 | 依小卡 7 句型 |
| 13 | `s-step5` | Step 5 · Mix with flour | Teacher | 11 | 分 4 次加麵粉，每次都要拖曳攪拌到白粉消失才能再加 | 依小卡 7 句型 |
| 14 | `s-step6` | Step 6 · Fill the cups & bake | Teacher | 12 | 點 12 個紙杯裝麵糊（或 Fill them all），Bake 180°C 16 min（烤箱發光、蛋糕膨起變金黃）、彩帶 | 依小卡 7 句型 |
| 15 | `s-recap` | Is your recipe correct? | Teacher | 05（漫畫） | 6 格漫畫總覽＋英文說明，點圖放大 | 自編 |
| 16 | `s-thanks` | Great job, everyone! | Teacher | 13 | 進頁自動彩帶；Give yourselves a big hand!（彩帶＋橫幅）；See you next week! | 小卡 8 |

## 步驟頁共通元素（8–14 頁）
- 左：女孩、STEP 標籤、黃色副標、指令句（紅＝動詞、紫＝名詞）、Group N ＋ Read together、Try it 檢核清單（目前步驟會跳動）
- 右：標籤（Microwave / Sieve / Whisk / Add oil / Add flavor / Mix / Spoon）、實驗區卡片、照片／漫畫拍立得（點擊放大）
- 實驗區右上：Fast / Real / Auto ＋ Start over；等待中右下有 Skip；Auto 開啟時左上有紫色 AUTO 標籤
- 頁面左右交錯（`.flip`）：Step 2、4-1、5 為實驗區在左

## 資料來源（JS 常數）
- `INGREDIENTS`：9 種食材、12 份的份量（Cake flour 190 g、Baking powder 1½ tsp、Salt ¼ tsp、Sunflower oil 120 g、Sugar 110 g、Eggs 3、Vanilla extract 1 tsp、Milk 40 g、Honey 30 g）
- `STEPS`：6 個學習單步驟（標題、說明、對應的漫畫圖），供總覽、排序、配對頁共用
- `VERBS`：6 張單字卡
- `TITLES`：講稿視窗的頁標題
