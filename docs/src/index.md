---
layout: home

hero:
  name: "SparkyFitness"
  text: "Self-Hosted Fitness & Nutrition with AI Coaching"
  tagline: "Your fitness data, completely under your control. Track workouts, meals, body measurements, and menstrual cycles with AI nutrition assistance."
  image:
    src: /logo.png
    alt: SparkyFitness Logo
  actions:
    - theme: brand
      text: ⚡ Interactive .env Generator
      link: /install/env-generator
    - theme: alt
      text: 🚀 Quickstart Guide
      link: /install/docker-compose
    - theme: alt
      text: 📖 View Features
      link: /features/comparison

features:
  - icon: 🍎
    title: Nutrition & Diary
    details: Log meals, create custom foods, scan barcodes, and analyze macro & micro nutrient trends with zero cloud lock-in.
    link: /features/diary/meals
    linkText: Explore Nutrition Diary →
  - icon: 💪
    title: Exercise & Workouts
    details: Complete exercise database manager, workout plans, and seamless sync with external fitness trackers.
    link: /features/exercises/exercise-search
    linkText: Explore Exercises →
  - icon: 🤖
    title: AI Nutrition Assistant
    details: Multi-provider AI (OpenAI, Anthropic, Google Gemini, local models) with vision logging and intelligent coaching.
    link: /features/ai-assistant
    linkText: Learn About AI Coach →
  - icon: 🌸
    title: Cycle Hub
    details: Comprehensive menstrual cycle tracking, fertility, symptoms, and pregnancy mode.
    link: /features/cycle-hub/
    linkText: Explore Cycle Hub →
  - icon: 👥
    title: Family & Friends Sharing
    details: Real-time diary sharing, permissions, and granular privacy controls between trusted users.
    link: /features/family-friends-sharing
    linkText: View Sharing Features →
  - icon: 🔌
    title: MCP Server (Model Context Protocol)
    details: First-class native MCP tools for Claude Desktop, AI agents, and custom automations.
    link: /features/mcp-server
    linkText: View MCP Tools →
  - icon: 📱
    title: Mobile & Web Apps
    details: Cross-platform mobile app (iOS/Android) and React 19 web interface with instant synchronization.
    link: /mobile-app/mobile-app
    linkText: Mobile App Setup →
  - icon: ⚙️
    title: Settings & Integrations
    details: Connect Garmin, Polar, Health Connect, Liftosaur, Oura, Fitbit, and custom providers.
    link: /features/settings/preferences
    linkText: View Integrations →
  - icon: 📊
    title: Feature Comparison
    details: See how SparkyFitness compares directly to MyFitnessPal, MacroFactor, Cronometer, and wger.
    link: /features/comparison
    linkText: Compare Features →
---

## Overview

Welcome to the comprehensive documentation for **SparkyFitness**, a self-hosted alternative to MyFitnessPal with AI-powered nutrition assistance.

::: info
**Community & Discussions**: If you have questions, need help setting up, or want to contribute, join our [Discord community](https://discord.gg/vcnMT5cPEA) or post in our [GitHub Discussions](https://github.com/CodeWithCJ/SparkyFitness/discussions).
:::

## Documentation Navigation

- **[Installation & Deployment](./install/docker-compose)** - Docker Compose, Coolify, Portainer, Synology NAS, TrueNAS, and Kubernetes guides.
- **[Interactive .env Generator](./install/env-generator)** - Generate production-ready configuration in seconds with client-side cryptography.
- **[Features Overview](./features/comparison)** - Complete feature documentation, diary tracking, and comparison matrices.
- **[Mobile Application](./mobile-app/mobile-app)** - iOS & Android mobile setup and network proxy configuration.
- **[Developer Guide](./developer/getting-started)** - Database schema, security tiers, testing patterns, and API references.