
<div align="right">
  <details>
    <summary >🌐 Language</summary>
    <div>
      <div align="right">
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=en">English</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=zh-CN">简体中文</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=zh-TW">繁體中文</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=ja">日本語</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=ko">한국어</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=hi">हिन्दी</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=th">ไทย</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=fr">Français</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=de">Deutsch</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=es">Español</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=it">Italiano</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=ru">Русский</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=pt">Português</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=nl">Nederlands</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=pl">Polski</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=ar">العربية</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=fa">فارسی</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=tr">Türkçe</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=vi">Tiếng Việt</a></p>
        <p><a href="https://openaitx.github.io/view.html?user=CodeWithCJ&project=SparkyFitness&lang=id">Bahasa Indonesia</a></p>
      </div>
    </div>
  </details>
</div>

# SparkyFitness

A self hosted, privacy-first alternative to MyFitnessPal. Track nutrition, exercise, body metrics, and health data while keeping full control of your data.


![Screenshot](./docs/public/web_screenshot.png)


SparkyFitness is a self hosted fitness tracking platform made up of:

- A backend server (API + data storage)
- A web-based frontend
- Native mobile apps for iOS and Android

It stores and manages health data on infrastructure you control, without relying on third party services.

## Core Features

- Nutrition, exercise, hydration, and body measurement tracking
- Goal setting and daily check-ins
- Interactive charts and long-term reports
- Multiple user profiles and family access
- Light and dark themes

## Health & Device Integrations

SparkyFitness can sync data from multiple health and fitness platforms:

- **Apple Health** (iOS)
- **Google Health Connect** (Android)
- **Fitbit API**
- **Garmin API**

Integrations automatically sync activity data such as steps, workouts, and sleep, along with health metrics like weight and body measurements, to your SparkyFitness server.

## Optional AI Features (Beta)

SparkyAI provides a conversational interface for logging data and reviewing progress.

- Log food, exercise, body stats, and steps via chat
- Upload food images for automatic meal logging
- Retains conversation history for follow ups

Note: AI features are currently in beta.


## Quick Start (Server)

Get a SparkyFitness server running in minutes using Docker Compose.

```bash
# 1. Create a new folder
mkdir sparkyfitness && cd sparkyfitness

# 2. Download Docker files only
curl -o docker-compose.yml https://github.com/CodeWithCJ/SparkyFitness/releases/latest/download/docker-compose.prod.yml
curl -L -o .env https://github.com/CodeWithCJ/SparkyFitness/releases/latest/download/default.env.example

# 3. (Optional) Edit .env to customize database credentials, ports, etc.

# 4. Start the app
docker compose pull && docker compose up -d

# Access application at http://localhost:8080
```

## Documentation

For full installation guides, configuration options, and development docs, please visit our [Documentation Site](https://codewithcj.github.io/SparkyFitness/).

### Quick Links

- **[Installation Guide](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Deployment and configurations
- **[Features Overview](https://codewithcj.github.io/SparkyFitness/features)** - Complete feature documentation
- **[Development Workflow](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Developer guide and contribution process
- **[iOS App Info](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** and **[Android App Info](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)**

### Need Help?

- **[Join our Discord](https://discord.gg/vcnMT5cPEA)**

## Star History

<a href="https://star-history.com/#CodeWithCJ/SparkyFitness&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=CodeWithCJ/SparkyFitness&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=CodeWithCJ/SparkyFitness&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=CodeWithCJ/SparkyFitness&type=Date" width="100%" />
  </picture>
</a>

## Translations

**[Weblate Translations](https://hosted.weblate.org/engage/sparkyfitness)**

<a href="https://hosted.weblate.org/engage/sparkyfitness/">
<img src="https://hosted.weblate.org/widget/sparkyfitness/sparkyfitness-translations/multi-auto.svg" alt="Translation status" />
</a>

## Repository activity

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Repobeats analytics image")

## Contributors

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%"/>
</a>

## ⚠️ Known Issues / Beta Features ⚠️

SparkyFitness is under active development.
Breaking changes may occur between releases.

- Auto-updating containers is not recommended
- Always review release notes before upgrading

The following features are currently in beta and may not have been thoroughly tested. Expect potential bugs or incomplete functionality:

- AI Chatbot
- Family & Friends access
- API documentation