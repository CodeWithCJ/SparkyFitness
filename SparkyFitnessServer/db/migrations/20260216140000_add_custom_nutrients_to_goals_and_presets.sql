-- Add custom_nutrients column to user_goals and goal_presets
ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS custom_nutrients JSONB DEFAULT '{}';
ALTER TABLE goal_presets ADD COLUMN IF NOT EXISTS custom_nutrients JSONB DEFAULT '{}';
