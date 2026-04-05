# Telegram Bot Setup Guide

This guide explains how to configure and link the SparkyFitness Telegram bot.

## 1. Create a Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/botfather).
2. Send `/newbot` and follow the instructions to get your **Bot Token**.
3. (Optional) Set a description and profile picture for your bot.

## 2. Configuration

Add the following environment variables to your `.env` file:

```env
# Essential
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Required for Webhook mode (Production)
TELEGRAM_WEBHOOK_URL=https://your-domain.com

# Optional (for UI display)
TELEGRAM_BOT_NAME=SparkyFitnessBot
```

## 3. Linking Your Account

1. Go to **Settings → Telegram** in the SparkyFitness web application.
2. Click **"Connect Telegram"** to generate a one-time linking code.
3. Open your bot in Telegram and send:
   `/start YOUR_CODE`
4. Use the main menu to interact with the bot!

## 4. Features

- **Activity Reports**: View your last 7 days of exercises with details (distance, heart rate).
- **Food Diary**: Access your daily food log and macros.
- **AI Coach**: Chat with SparkyFitness AI to log food, ask for advice, or analyze your progress.
- **Garmin Sync**: Trigger manual synchronization from the "Sync" menu.

## 5. Deployment Notes

### Webhook vs. Polling
- **Polling (Default)**: Best for local development. Set `TELEGRAM_BOT_TOKEN` but leave `TELEGRAM_WEBHOOK_URL` empty.
- **Webhook (Recommended for Production)**: Faster and more reliable. Ensure `TELEGRAM_WEBHOOK_URL` is set and points to your public server address.

---

### Screenshots

*Add screenshots here of the Telegram linking UI and Bot interaction.*
