-- Inputs for the food health score (Nutri-Score + regional front-of-pack
-- warnings, see shared/src/nutrients/foodHealthScore.ts). The score itself is
-- computed on read and never stored, so it can't drift from the nutrients.
--
-- All three food columns describe the food's composition rather than one
-- serving, so they live on foods, not food_variants, and are expressed per
-- 100 g / 100 ml exactly as nutrition labels and all three regulations state
-- them. They stay NULL for "unknown": a missing added-sugar value must not be
-- read as "no added sugar", or every food would pass the sugar warnings. RLS
-- needs no change; foods and user_preferences are already covered row-wide.

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS added_sugars numeric
    CHECK (added_sugars IS NULL OR added_sugars >= 0),
  ADD COLUMN IF NOT EXISTS fruit_veg_legume_percent numeric
    CHECK (fruit_veg_legume_percent IS NULL
      OR (fruit_veg_legume_percent >= 0 AND fruit_veg_legume_percent <= 100)),
  ADD COLUMN IF NOT EXISTS provider_nutriscore_grade text
    CHECK (provider_nutriscore_grade IS NULL
      OR provider_nutriscore_grade IN ('a', 'b', 'c', 'd', 'e'));

COMMENT ON COLUMN public.foods.added_sugars IS
  'Added sugars in grams per 100 g (solids) or 100 ml (liquids). NULL = unknown.';
COMMENT ON COLUMN public.foods.fruit_veg_legume_percent IS
  'Share of fruit, vegetables and legumes (0-100) for the Nutri-Score positive component. NULL = unknown, scored as 0.';
COMMENT ON COLUMN public.foods.provider_nutriscore_grade IS
  'Nutri-Score grade as published by the provider (Open Food Facts). Preferred over the computed grade when present.';

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS front_of_pack_region text NOT NULL DEFAULT 'none'
    CHECK (front_of_pack_region IN ('none', 'brazil', 'chile', 'mexico'));
