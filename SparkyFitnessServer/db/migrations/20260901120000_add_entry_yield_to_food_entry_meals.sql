-- Add snapshotted dish yield to food_entry_meals.
--
-- When a user logs a meal template (or custom meal) to the diary, its total
-- dish yield (in the meal's unit) is snapshotted into this column.
-- This ensures that historical diary entries are immutable and completely
-- immune to subsequent edits or deletions of the underlying meal template.
--
-- NULL indicates legacy entries that predate this migration (which fall back
-- to looking up the live meal template).

ALTER TABLE public.food_entry_meals
  ADD COLUMN IF NOT EXISTS entry_total_servings NUMERIC;

-- Clean up entry_serving_size if previously added during dev testing
ALTER TABLE public.food_entry_meals
  DROP COLUMN IF EXISTS entry_serving_size;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'food_entry_meals_entry_total_servings_positive'
       AND conrelid = 'public.food_entry_meals'::regclass
  ) THEN
    ALTER TABLE public.food_entry_meals
      ADD CONSTRAINT food_entry_meals_entry_total_servings_positive
        CHECK (entry_total_servings IS NULL OR entry_total_servings > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.food_entry_meals.entry_total_servings IS
  'Snapshotted total dish yield of the meal in its unit when logged. NULL falls back to the live meal template.';

