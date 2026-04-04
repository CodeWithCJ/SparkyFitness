-- Add Telegram bot settings to global_settings
ALTER TABLE global_settings ADD COLUMN telegram_bot_token TEXT;
ALTER TABLE global_settings ADD COLUMN telegram_bot_name TEXT;

-- Add telegram_chat_id and telegram_link_code to user table to link Telegram account
ALTER TABLE public."user" ADD COLUMN telegram_chat_id TEXT;
ALTER TABLE public."user" ADD COLUMN telegram_link_code TEXT;
