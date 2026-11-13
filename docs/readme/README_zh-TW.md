<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a> ·
  <b>繁體中文</b> ·
  <a href="README_ja.md">日本語</a> ·
  <a href="README_ko.md">한국어</a> ·
  <a href="README_hi.md">हिन्दी</a> ·
  <a href="README_th.md">ไทย</a> ·
  <a href="README_fr.md">Français</a> ·
  <a href="README_de.md">Deutsch</a> ·
  <a href="README_es.md">Español</a> ·
  <a href="README_it.md">Italiano</a> ·
  <a href="README_ru.md">Русский</a> ·
  <a href="README_pt-BR.md">Português (Brasil)</a> ·
  <a href="README_nl.md">Nederlands</a> ·
  <a href="README_pl.md">Polski</a> ·
  <a href="README_ar.md">العربية</a> ·
  <a href="README_fa.md">فارسی</a> ·
  <a href="README_tr.md">Türkçe</a> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

一款可自行架設、以隱私為優先的替代方案，可取代 MyFitnessPal、Flo、Hevy、Shotsy 等應用程式。追蹤營養、運動、身體數據與健康資料，同時完全掌控你自己的資料。
<img width="5120" height="2880" alt="圖片" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness 是一個自行架設的健身追蹤平台，由以下部分組成：

- 後端伺服器（API + 資料儲存）
- 網頁版前端
- 適用於 iOS 與 Android 的原生行動應用程式

它在你掌控的基礎設施上儲存並管理健康資料，無需仰賴第三方服務。

## 核心功能

- 營養、運動、飲水、睡眠、斷食、心情與身體圍度追蹤
- 目標設定與每日打卡
- 互動式圖表與長期報告
- 多個使用者檔案與家庭存取
- 淺色與深色主題
- OIDC、TOTP、Passkey、MFA 等

## SparkyFitness 與其他應用程式比較

**SparkyFitness 是原始碼公開（source-available），而非開放原始碼** —— 其[授權條款](../../LICENSE)為非商業用途，商業使用需取得許可。

大多數應用程式只做一件事。一款好用的營養應用程式每年要價 40–100 美元；若要涵蓋 SparkyFitness 的所有功能，每個人都需要訂閱三到四個服務，而且仍然無法跨服務產生單一報告。SparkyFitness 在一個應用程式裡全部搞定，免費，而且全家都能用。

<sub>美國牌價，2026 年 8 月 14 日。[完整費用明細 →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 自行架設，資料始終屬於你 | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 免訂閱、無廣告 | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| 營養、重量訓練、睡眠、斷食、生理週期與用藥集中一處\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| 完整歷史紀錄與自訂日期範圍報告 | ✅ 免費 | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| 穿戴裝置與健康平台同步 | ✅ 8+ 項服務 | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| 具備細部權限的家庭共享 | ⭐ 7 種權限 | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| CSV 匯入與免費資料匯出 | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| MCP 伺服器 + 自備 LLM | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ 突出 &nbsp;•&nbsp; ✅ 支援 &nbsp;•&nbsp; 🟡 部分支援 &nbsp;•&nbsp; 💰 僅限付費方案 &nbsp;•&nbsp; ❌ 不支援

<sub>\* 睡眠階段、HRV 與血糖資料是從你的手錶、手機或血糖機匯入。SparkyFitness 負責儲存、分析並繪製圖表，而非自行量測。</sub>

> **這張表格是由被比較的專案自己撰寫的，請以此角度閱讀。** 已於 2026 年 8 月 14 日對照官方文件、程式碼儲存庫與應用程式商店頁面查核；部分內容可能已經過時。如果某個欄位有誤或對其他專案不公平，請[提出 issue](https://github.com/CodeWithCJ/SparkyFitness/issues) —— 讓 SparkyFitness 看起來*更差*的更正同樣歡迎。

**[查看完整比較 →](https://codewithcj.github.io/SparkyFitness/features/comparison)** —— 涵蓋自行架設、營養、專業與裝置生態系等類別的 17 款應用程式，以及它們各自勝過我們的地方。

## 健康與裝置整合

SparkyFitness 可以從多個健康與健身平台同步資料：

- **Apple Health** (iOS)
- **Google Health Connect** (Android)
- **Google Health API** 
- **Fitbit**
- **Garmin Connect**
- **Withings**
- **Polar Flow** 
- **Oura**
- **Hevy**
- **OpenFoodFacts**
- **USDA**
- **Fatsecret**
- **Nutritionix**
- **Mealie**
- **Tandoor**
- **Strava**（部分測試）
- **COROS**
- **Norish**
- **Yazio**（使用非官方 API）
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

整合功能會自動將步數、訓練與睡眠等活動資料，以及體重與身體圍度等健康指標同步到你的 SparkyFitness 伺服器。

## 選用 AI 功能（Beta）

SparkyAI 提供對話式介面，用來記錄資料與檢視進度。

- 透過聊天記錄飲食、運動、身體數據與步數
- 上傳食物照片即可自動記錄餐點
- 保留對話紀錄，方便後續追問

注意：AI 功能目前仍處於 Beta 階段。

## 安裝

從以下兩種方式中選擇一種來執行 SparkyFitness：

### 1. 自行架設

使用 Docker Compose 在幾分鐘內啟動 SparkyFitness 伺服器：

```bash
# 1. 建立一個新資料夾
mkdir sparkyfitness && cd sparkyfitness

# 2. 下載 docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. 設定你的 .env 組態（擇一）：
# 選項 A（建議）：在瀏覽器中一鍵產生含安全金鑰的自訂 .env：
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# 選項 B：精簡範本 —— 只需 5 個值，其餘皆使用
# docker-compose 已套用的預設值。適用於大多數自行架設的安裝。
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# 選項 C：完整參考 —— 列出所有支援的變數，皆已註解並附上
# 預設值。若需要 SSO、SMTP、外部資料庫或反向代理，請從這裡開始。
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. 替換預留位置（若使用選項 A 可略過 —— 產生器
# 已經填好這些值）。若維持原樣，伺服器將拒絕啟動，
# 否則資料庫也會以公開的密碼進行初始化。
#   SPARKY_FITNESS_DB_PASSWORD        任何高強度密碼
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     （64 個十六進位字元）
#   BETTER_AUTH_SECRET                openssl rand -base64 32  （44 個字元）
#   SPARKY_FITNESS_FRONTEND_URL       你將用來開啟應用程式的 URL

# 5. 啟動應用程式
docker compose pull && docker compose up -d

# 透過 http://localhost:3004 存取應用程式
```

_注意：如需完整的組態選項、反向代理與其他安裝方式，請造訪[文件網站](https://codewithcj.github.io/SparkyFitness/)。_

### 2. 雲端（適合非技術使用者）

如果你不是技術使用者，也不想在自己的伺服器上執行 SparkyFitness，可以使用以下任一服務供應商在雲端部署代管執行個體。

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="在 PikaPods 上執行">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="使用 Zenith 部署">
</a>


> **注意：** 這些都是獨立的第三方服務。建議你先了解各供應商提供的功能，再決定最符合你需求的一家。
 

## 🎥 影片教學

[![觀看影片](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

2 分鐘快速教學，示範如何安裝 SparkyFitness（自行架設的健身追蹤器）。

## 文件

如需完整的安裝指南、組態選項與開發文件，請造訪我們的[文件網站](https://codewithcj.github.io/SparkyFitness/)。

### 快速連結

- **[安裝指南](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - 部署與組態
- **[互動式 .env 產生器](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - 在用戶端建立 `.env` 組態
- **[功能總覽](https://codewithcj.github.io/SparkyFitness/features)** - 完整的功能文件
- **[開發流程](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - 開發者指南與貢獻流程
- **[iOS 應用程式資訊](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** 與 **[Android 應用程式資訊](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### 需要協助？

- 在 Github issues/discussion 發文。
- 若想更快獲得回覆並得到其他社群成員的協助，**[加入我們的 Discord](https://discord.gg/vcnMT5cPEA)**

## Star 歷史

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Star 歷史圖表" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## 翻譯


**[Weblate 翻譯](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="翻譯狀態"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="翻譯狀態" />
</a>

## 儲存庫動態

![儲存庫動態](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Repobeats 分析圖")

## 貢獻者

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="SparkyFitness 貢獻者"/>
</a>

## ⚠️ 已知問題 / Beta 功能 ⚠️

SparkyFitness 正在積極開發中。
不同版本之間可能會出現破壞性變更。

- 不建議自動更新容器
- 升級前請務必閱讀版本說明

以下功能目前處於 Beta 階段，可能尚未經過完整測試。可能會有錯誤或功能不完整的情況：

- AI 聊天機器人
- 家人與朋友存取
- API 文件

*這是英文 README 的翻譯版本。如有任何差異，以[英文版本](../../README.md)為準。*
