-- Inputs for the food health score (Nutri-Score + regional front-of-pack
-- warnings, see shared/src/nutrients/foodHealthScore.ts). The score itself is
-- computed on read and never stored, so it can't drift from the nutrients.
--
-- added_sugars is a real nutrient, in grams per serving_size exactly like
-- sugars: on food_variants, and snapshotted on food_entries and meal_foods so a
-- diary stays self-contained and daily added sugars can be totalled and held
-- against a limit (user_goals / goal_presets). It is informational and never
-- feeds calories (sugars are already inside carbs and calories).
--
-- On food_variants it stays NULL for "unknown" (no DEFAULT 0, unlike
-- alcohol_g): a missing added-sugar value must not be read as "no added
-- sugar", or every food would pass the sugar warnings. food_entries and
-- meal_foods are NULL on rows predating the column.
--
-- The remaining food-level columns describe the food's composition or its
-- provenance, so they live on foods. RLS needs no change; the touched tables
-- and user_preferences are already covered row-wide.

ALTER TABLE public.food_variants
  ADD COLUMN IF NOT EXISTS added_sugars numeric;

ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS added_sugars numeric;

ALTER TABLE public.meal_foods
  ADD COLUMN IF NOT EXISTS added_sugars numeric;

-- Daily limit, direction "maximum" via shared BUILTIN_MAXIMUM_GOAL_NUTRIENTS.
-- Nullable with no default, like the caffeine and alcohol goals: NULL means
-- "no limit set", the user never made a goal they did not choose.
ALTER TABLE public.user_goals
  ADD COLUMN IF NOT EXISTS added_sugars numeric;

ALTER TABLE public.goal_presets
  ADD COLUMN IF NOT EXISTS added_sugars numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'food_variants_added_sugars_nonnegative'
                   AND conrelid = 'public.food_variants'::regclass) THEN
    ALTER TABLE public.food_variants
      ADD CONSTRAINT food_variants_added_sugars_nonnegative
      CHECK (added_sugars IS NULL OR added_sugars >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.food_variants.added_sugars IS
  'Grams of added sugars per serving_size, like sugars. NULL = unknown, which is not the same as 0: an unknown value must not pass the added-sugar warnings.';
COMMENT ON COLUMN public.food_entries.added_sugars IS
  'Log-time snapshot of the variant''s added_sugars. NULL on rows predating this column or when the variant did not know it.';
COMMENT ON COLUMN public.meal_foods.added_sugars IS
  'Log-time snapshot of the variant''s added_sugars. NULL on rows predating this column.';
COMMENT ON COLUMN public.user_goals.added_sugars IS
  'Daily added-sugars ceiling in grams. NULL means no limit set.';
COMMENT ON COLUMN public.goal_presets.added_sugars IS
  'Daily added-sugars ceiling in grams. NULL means no limit set.';

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS fruit_veg_legume_percent numeric
    CHECK (fruit_veg_legume_percent IS NULL
      OR (fruit_veg_legume_percent >= 0 AND fruit_veg_legume_percent <= 100)),
  ADD COLUMN IF NOT EXISTS provider_nutriscore_grade text
    CHECK (provider_nutriscore_grade IS NULL
      OR provider_nutriscore_grade IN ('a', 'b', 'c', 'd', 'e')),
  ADD COLUMN IF NOT EXISTS nutri_score_category text
    CHECK (nutri_score_category IS NULL
      OR nutri_score_category IN ('general', 'beverage', 'fat_oil_nut'));

COMMENT ON COLUMN public.foods.fruit_veg_legume_percent IS
  'Share of fruit, vegetables and legumes (0-100) for the Nutri-Score positive component. NULL = unknown, scored as 0.';
COMMENT ON COLUMN public.foods.provider_nutriscore_grade IS
  'Nutri-Score grade as published by Open Food Facts. Set only by the server''s import path, never from a client payload. Preferred over the computed grade when present.';
COMMENT ON COLUMN public.foods.nutri_score_category IS
  'Which Nutri-Score algorithm applies: general, beverage or fat_oil_nut. NULL = general. A volume serving unit never implies a beverage (soup and nut butters are measured by volume too).';

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS front_of_pack_region text NOT NULL DEFAULT 'none'
    CHECK (front_of_pack_region IN ('none', 'brazil', 'chile', 'mexico')),
  ADD COLUMN IF NOT EXISTS nutri_score_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_preferences.nutri_score_enabled IS
  'Show the Nutri-Score badge. Off by default: the label is regional and rejected or restricted in several countries.';
