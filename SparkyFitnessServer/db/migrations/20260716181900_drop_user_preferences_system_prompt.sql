-- Drop the vestigial system_prompt column from user_preferences.
-- This column was never read on the chat path — the system prompt is composed
-- from MD files in prompts/ and (now) from ai_service_settings.system_prompt.
-- Keeping it around wastes storage and misleads anyone reading the schema.
ALTER TABLE user_preferences DROP COLUMN IF EXISTS system_prompt;
