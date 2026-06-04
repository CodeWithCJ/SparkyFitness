-- Add per-food nutrition snapshot columns to meal_foods.
-- When a user adjusts food nutrition in a meal without saving to the food
-- variant (toggle OFF), these columns store the adjusted values so the meal
-- template reflects the user's changes after save/reopen.
-- Existing rows retain NULL in all new columns, which causes the read queries
-- to fall back to the food_variants values via COALESCE (backward-compatible).
ALTER TABLE meal_foods
  ADD COLUMN IF NOT EXISTS serving_size          NUMERIC,
  ADD COLUMN IF NOT EXISTS serving_unit          TEXT,
  ADD COLUMN IF NOT EXISTS calories              NUMERIC,
  ADD COLUMN IF NOT EXISTS protein               NUMERIC,
  ADD COLUMN IF NOT EXISTS carbs                 NUMERIC,
  ADD COLUMN IF NOT EXISTS fat                   NUMERIC,
  ADD COLUMN IF NOT EXISTS saturated_fat         NUMERIC,
  ADD COLUMN IF NOT EXISTS polyunsaturated_fat   NUMERIC,
  ADD COLUMN IF NOT EXISTS monounsaturated_fat   NUMERIC,
  ADD COLUMN IF NOT EXISTS trans_fat             NUMERIC,
  ADD COLUMN IF NOT EXISTS cholesterol           NUMERIC,
  ADD COLUMN IF NOT EXISTS sodium                NUMERIC,
  ADD COLUMN IF NOT EXISTS potassium             NUMERIC,
  ADD COLUMN IF NOT EXISTS dietary_fiber         NUMERIC,
  ADD COLUMN IF NOT EXISTS sugars                NUMERIC,
  ADD COLUMN IF NOT EXISTS vitamin_a             NUMERIC,
  ADD COLUMN IF NOT EXISTS vitamin_c             NUMERIC,
  ADD COLUMN IF NOT EXISTS calcium               NUMERIC,
  ADD COLUMN IF NOT EXISTS iron                  NUMERIC,
  ADD COLUMN IF NOT EXISTS glycemic_index        TEXT,
  ADD COLUMN IF NOT EXISTS custom_nutrients      JSONB;
