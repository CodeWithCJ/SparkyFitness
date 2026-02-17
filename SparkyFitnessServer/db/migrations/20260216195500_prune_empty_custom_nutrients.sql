-- Migration: Prune empty strings from custom_nutrients JSONB columns
-- This prevents "invalid input syntax for type numeric" errors during data aggregation.

-- 1. Clean up food entry snapshots
UPDATE public.food_entries 
SET custom_nutrients = (
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM jsonb_each_text(custom_nutrients)
  WHERE value != ''
)
WHERE custom_nutrients != '{}'::jsonb;

-- 2. Clean up food variants (the blueprints for future entries)
UPDATE public.food_variants 
SET custom_nutrients = (
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM jsonb_each_text(custom_nutrients)
  WHERE value != ''
)
WHERE custom_nutrients != '{}'::jsonb;

-- 3. Clean up user goals
UPDATE public.user_goals
SET custom_nutrients = (
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM jsonb_each_text(custom_nutrients)
  WHERE value != ''
)
WHERE custom_nutrients IS NOT NULL AND custom_nutrients != '{}'::jsonb;

-- 4. Clean up goal presets
UPDATE public.goal_presets
SET custom_nutrients = (
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM jsonb_each_text(custom_nutrients)
  WHERE value != ''
)
WHERE custom_nutrients IS NOT NULL AND custom_nutrients != '{}'::jsonb;
