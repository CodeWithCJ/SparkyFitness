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


-- Backfill entries logged before this migration so the immutability guarantee
-- is retroactive rather than only covering new logs. The expression mirrors
-- resolveLoggedMealPortion's template branch exactly, so this writes the same
-- denominator the live lookup returns today — behaviour is unchanged at deploy
-- time, but a later edit or deletion of the template can no longer shift the
-- entry. Rows whose template is already gone stay NULL; there is nothing left
-- to snapshot from. The > 0 guard keeps the check constraint satisfied.
UPDATE public.food_entry_meals fem
   SET entry_total_servings = CASE
         WHEN m.serving_unit = 'serving' THEN m.total_servings
         ELSE m.serving_size * m.total_servings
       END
  FROM public.meals m
 WHERE fem.meal_template_id = m.id
   AND fem.entry_total_servings IS NULL
   AND CASE
         WHEN m.serving_unit = 'serving' THEN m.total_servings
         ELSE m.serving_size * m.total_servings
       END > 0;
