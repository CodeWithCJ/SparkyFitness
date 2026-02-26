ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS exercise_calorie_percentage INTEGER DEFAULT 100;
