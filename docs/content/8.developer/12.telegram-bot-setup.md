# Telegram Bot Setup Guide

This guide explains how to set up and configure the SparkyFitness Telegram bot for local development or production.

## 1. Create a Telegram Bot
1. Find [@BotFather](https://t.me/botfather) on Telegram.
2. Send `/newbot` and follow the instructions to get your **Bot Token**.
3. (Optional) Set a description, about text, and profile picture using `/setdescription`, `/setabout`, and `/setuserpic`.

## 2. Configuration
Add the following variables to your `.env` file in the project root:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://your-domain.com
```

*   **TELEGRAM_BOT_TOKEN**: The token provided by BotFather.
*   **TELEGRAM_WEBHOOK_URL**: The public URL of your SparkyFitness server (must be HTTPS). 
    *   *Tip: Use [ngrok](https://ngrok.com/) for local development.*

## 3. Webhook vs Polling
- **Production**: The bot automatically registers its webhook at `${TELEGRAM_WEBHOOK_URL}/api/telegram/webhook` on startup. 
- **Development**: If `TELEGRAM_WEBHOOK_URL` is missing, the bot defaults to **Polling Mode**, which is easier for local testing without a public URL.

## 4. Linking Your Account
Users must link their SparkyFitness account to their Telegram chat:
1. Open the SparkyFitness Web App.
2. Navigate to **Settings > Integrations > Telegram**.
3. Click "Generate Link Code".
4. Open your bot on Telegram and send: `/start <code>` (e.g., `/start A1B2C3`).
5. The bot will confirm the link, and you can start logging!

## 5. Security
The `/api/telegram/webhook` endpoint is protected by:
1. **Zod Validation**: All incoming payloads are strictly validated against `TelegramWebhookSchema`.
2. **User Matching**: The bot only processes messages from successfully linked `chat_id`s stored in the database.
