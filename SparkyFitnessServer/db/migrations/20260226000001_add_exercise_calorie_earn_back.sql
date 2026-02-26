-- Add exercise calorie earn-back percentage to user_preferences
-- Allows users to configure what % of exercise calories to add back to daily budget
-- 100 = full add-back (current "dynamic" behaviour)
-- 0   = no add-back   (current "fixed" behaviour)
-- Any value in between creates a safety buffer
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS exercise_calorie_earn_back_percentage INTEGER DEFAULT 100;
