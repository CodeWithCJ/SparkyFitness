-- Migration: Add auto_scale_open_food_facts_imports column to user_preferences table
-- Preference controls whether OpenFoodFacts imports should automatically scale
-- Nutrition values from per-100g to the actual serving size via OpenFoodFacts

ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS auto_scale_open_food_facts_imports BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN user_preferences.auto_scale_open_food_facts_imports IS 'When enabled, OpenFoodFacts imports will automatically scale nutrition values from per-100g to the serving size provided by the product';
