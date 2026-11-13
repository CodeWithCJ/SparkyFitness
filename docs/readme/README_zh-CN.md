<p align="center">
  <a href="../../README.md">English</a> ·
  <b>简体中文</b> ·
  <a href="README_zh-TW.md">繁體中文</a> ·
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

一款可自托管、隐私优先的替代方案，可替代 MyFitnessPal、Flo、Hevy、Shotsy 等应用。记录营养、运动、身体指标和健康数据，同时完全掌控你自己的数据。
<img width="5120" height="2880" alt="图片" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness 是一个自托管的健身追踪平台，由以下部分组成：

- 后端服务器（API + 数据存储）
- 基于 Web 的前端
- 适用于 iOS 和 Android 的原生移动应用

它在你掌控的基础设施上存储和管理健康数据，无需依赖第三方服务。

## 核心功能

- 营养、运动、饮水、睡眠、断食、情绪和身体围度追踪
- 目标设定与每日打卡
- 交互式图表与长期报告
- 多用户档案与家庭访问
- 浅色与深色主题
- OIDC、TOTP、Passkey、MFA 等

## SparkyFitness 与其他应用对比

**SparkyFitness 是源码可用（source-available）而非开源软件** —— 其[许可证](../../LICENSE)为非商业许可，商业使用需获得许可。

大多数应用只做一件事。一款好用的营养应用每年要花 40–100 美元；想要覆盖 SparkyFitness 的全部功能，每人需要订阅三四个服务，而且仍然无法在它们之间生成统一的报告。SparkyFitness 在一个应用中全部搞定，免费，全家都能用。

<sub>美国标价，2026 年 8 月 14 日。[完整费用明细 →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 自托管，数据始终属于你 | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 无订阅、无广告 | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| 营养、力量训练、睡眠、断食、生理周期和用药集于一处\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| 完整历史记录与自定义日期范围报告 | ✅ 免费 | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| 可穿戴设备与健康平台同步 | ✅ 8+ 项服务 | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| 带精细权限的家庭共享 | ⭐ 7 种权限 | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| CSV 导入与免费数据导出 | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| MCP 服务器 + 自带 LLM | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ 突出 &nbsp;•&nbsp; ✅ 支持 &nbsp;•&nbsp; 🟡 部分支持 &nbsp;•&nbsp; 💰 仅限付费版 &nbsp;•&nbsp; ❌ 不支持

<sub>\* 睡眠阶段、HRV 和血糖数据从你的手表、手机或血糖仪导入。SparkyFitness 负责存储、分析并绘制图表，而不是自行测量。</sub>

> **此表由被比较的项目自己编写，请据此阅读。** 已于 2026 年 8 月 14 日对照官方文档、代码仓库和应用商店页面进行核对；其中部分内容可能已经过时。如果某个单元格有误或对其他项目不公平，请[提交 issue](https://github.com/CodeWithCJ/SparkyFitness/issues) —— 让 SparkyFitness 看起来*更差*的更正同样欢迎。

**[查看完整对比 →](https://codewithcj.github.io/SparkyFitness/features/comparison)** —— 涵盖自托管、营养、专业和设备生态等类别的 17 款应用，以及它们各自胜过我们的地方。

## 健康与设备集成

SparkyFitness 可以从多个健康与健身平台同步数据：

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
- **Strava**（部分测试）
- **COROS**
- **Norish**
- **Yazio**（使用非官方 API）
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

集成会自动将步数、训练和睡眠等活动数据，以及体重和身体围度等健康指标同步到你的 SparkyFitness 服务器。

## 可选 AI 功能（Beta）

SparkyAI 提供对话式界面，用于记录数据和查看进度。

- 通过聊天记录饮食、运动、身体数据和步数
- 上传食物图片即可自动记录餐食
- 保留对话历史，方便后续追问

注意：AI 功能目前处于 Beta 阶段。

## 安装

从以下两种方式中选择一种来运行 SparkyFitness：

### 1. 自托管

使用 Docker Compose 在几分钟内运行 SparkyFitness 服务器：

```bash
# 1. 创建一个新文件夹
mkdir sparkyfitness && cd sparkyfitness

# 2. 下载 docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. 设置你的 .env 配置（任选其一）：
# 选项 A（推荐）：在浏览器中一键生成带安全密钥的自定义 .env：
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# 选项 B：最简模板 —— 只需 5 个值，其余均使用
# docker-compose 已应用的默认值。适用于大多数自托管安装。
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# 选项 C：完整参考 —— 包含所有受支持的变量，均已注释并附带
# 默认值。如需 SSO、SMTP、外部数据库或反向代理，请从这里开始。
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. 替换占位符（如果使用了选项 A 可跳过 —— 生成器
# 已经填好了这些值）。如果保持原样，服务器将拒绝启动，
# 否则数据库也会使用公开的密码进行初始化。
#   SPARKY_FITNESS_DB_PASSWORD        任意强密码
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     （64 个十六进制字符）
#   BETTER_AUTH_SECRET                openssl rand -base64 32  （44 个字符）
#   SPARKY_FITNESS_FRONTEND_URL       你将用来打开应用的 URL

# 5. 启动应用
docker compose pull && docker compose up -d

# 通过 http://localhost:3004 访问应用
```

_注意：如需完整的配置选项、反向代理和其他安装方式，请访问[文档站点](https://codewithcj.github.io/SparkyFitness/)。_

### 2. 云端（适合非技术用户）

如果你不是技术用户，也不想在自己的服务器上运行 SparkyFitness，可以使用以下任一服务商在云端部署托管实例。

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="在 PikaPods 上运行">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="使用 Zenith 部署">
</a>


> **注意：** 这些均为独立的第三方服务。建议你了解各服务商提供的功能，以确定最适合你需求的那一家。
 

## 🎥 视频教程

[![观看视频](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

2 分钟快速教程，演示如何安装 SparkyFitness（自托管健身追踪器）。

## 文档

如需完整的安装指南、配置选项和开发文档，请访问我们的[文档站点](https://codewithcj.github.io/SparkyFitness/)。

### 快速链接

- **[安装指南](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - 部署与配置
- **[交互式 .env 生成器](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - 在客户端构建 `.env` 配置
- **[功能概览](https://codewithcj.github.io/SparkyFitness/features)** - 完整的功能文档
- **[开发流程](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - 开发者指南与贡献流程
- **[iOS 应用信息](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** 和 **[Android 应用信息](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### 需要帮助？

- 在 Github issues/discussion 中发帖。
- 如需更快的响应并获得其他社区成员的帮助，**[加入我们的 Discord](https://discord.gg/vcnMT5cPEA)**

## Star 历史

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Star 历史图表" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## 翻译


**[Weblate 翻译](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="翻译状态"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="翻译状态" />
</a>

## 仓库动态

![仓库动态](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Repobeats 分析图")

## 贡献者

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="SparkyFitness 贡献者"/>
</a>

## ⚠️ 已知问题 / Beta 功能 ⚠️

SparkyFitness 正在积极开发中。
不同版本之间可能会出现破坏性变更。

- 不建议自动更新容器
- 升级前请务必阅读发布说明

以下功能目前处于 Beta 阶段，可能尚未经过充分测试。可能存在 bug 或功能不完整：

- AI 聊天机器人
- 家人与朋友访问
- API 文档

*这是英文 README 的翻译版本。如有任何不一致之处，以[英文版本](../../README.md)为准。*
