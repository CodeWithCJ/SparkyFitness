ALTER TABLE user_goals
ADD COLUMN IF NOT EXISTS custom_meal_percentages JSONB DEFAULT '{}'::jsonb;

ALTER TABLE user_goals
DROP CONSTRAINT IF EXISTS chk_meal_percentages_sum;

ALTER TABLE goal_presets
ADD COLUMN IF NOT EXISTS custom_meal_percentages JSONB DEFAULT '{}'::jsonb;

ALTER TABLE goal_presets
DROP CONSTRAINT IF EXISTS chk_meal_percentages_sum;
