-- Issue #1023: separate meal yield count from per-serving quantity.
--
-- Today meals.serving_size is overloaded:
--   serving_unit = 'serving' → it acts as yield count (and the backend math
--                              special-cases unit='serving' to multiplier=quantity,
--                              ignoring serving_size entirely).
--   serving_unit = 'ml'/'g'/...→ it acts as the whole-recipe quantity.
--
-- After this migration:
--   serving_size   = quantity of ONE serving in serving_unit (same semantic
--                    as food_variants.serving_size).
--   total_servings = how many servings the recipe yields.
--   Full recipe   = serving_size × total_servings.
--   Multiplier    = quantity_consumed / (serving_size × total_servings),
--                   uniform — no unit==='serving' special case.

-- New columns
ALTER TABLE public.meals
  ADD COLUMN total_servings NUMERIC DEFAULT 1.0 NOT NULL;

ALTER TABLE public.food_entry_meals
  ADD COLUMN legacy_serving_unit_math BOOLEAN DEFAULT FALSE NOT NULL;

-- Serving-unit meals: today's serving_size encodes the yield count and the
-- backend math ignores it via the special case. Move that yield to
-- total_servings; set serving_size = 1 so one serving means one serving.
UPDATE public.meals
SET total_servings = serving_size,
    serving_size   = 1
WHERE serving_unit = 'serving';

-- Non-serving meals (g/ml/cup/...): today's serving_size IS the whole-recipe
-- quantity. Re-interpret it as "one serving = that quantity" with
-- total_servings = 1. The new uniform math reproduces the old behavior
-- exactly: quantity / (serving_size × 1) = quantity / serving_size, so no
-- diary entries shift. Users who want true per-serving math can update
-- both serving_size and total_servings on the meal when they next edit it.
-- (Column default of 1.0 already covers this — explicit for clarity.)
UPDATE public.meals
SET total_servings = 1
WHERE serving_unit <> 'serving';

-- Compatibility flag for historical diary entries logged under the
-- unit === 'serving' → multiplier = quantity special case. Marked by row
-- property only (do not join through meal_template_id, which is nullable
-- and may have been rebound).
UPDATE public.food_entry_meals
SET legacy_serving_unit_math = TRUE
WHERE unit = 'serving';

COMMENT ON COLUMN public.meals.serving_size IS
  'Quantity of one serving in serving_unit (e.g. 250 for a 250 ml serving, or 1 when serving_unit = ''serving''). Same semantic as food_variants.serving_size.';
COMMENT ON COLUMN public.meals.total_servings IS
  'How many servings the recipe yields. Full recipe quantity = serving_size × total_servings.';
COMMENT ON COLUMN public.food_entry_meals.legacy_serving_unit_math IS
  'TRUE for diary entries logged before the serving-model migration where unit=''serving'' had special-case multiplier semantics. Read by foodEntryService recompute/unscale paths.';
