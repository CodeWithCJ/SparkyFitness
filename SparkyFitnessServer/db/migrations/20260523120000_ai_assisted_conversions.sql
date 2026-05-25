-- AI-Assisted Unit Conversions: schema + RLS changes
--
-- This migration adds:
--   1. user_preferences.ai_assisted_conversions toggle (per-user opt-in).
--   2. food_variants provenance columns (source / ai_confidence / ai_reasoning).
--   3. food_variants.user_id ownership column with backfill from foods.user_id,
--      enabling the "stock + personal" variant model. Existing rows backfill as
--      stock (variant.user_id = food.user_id); new writes by non-owners become
--      personal variants visible only to the creator (and their family viewers).
--   4. New RLS policies enforcing the stock+personal split.
--
-- IDEMPOTENCY: column adds use IF NOT EXISTS; the backfill UPDATE is naturally
-- idempotent; SET NOT NULL is a no-op once applied; policy DROPs use IF EXISTS
-- and cover every historical name from prior RLS migrations.
--
-- RUN NOTES: food_variants is FK-referenced from food_entries / meal_foods /
-- meal_plans. The backfill UPDATE will rewrite every row; for self-hosted
-- instances, run during a low-traffic window. If any food has user_id IS NULL
-- and has variants, the preflight DO block will RAISE EXCEPTION before
-- SET NOT NULL — resolve those rows (assign an owner or delete) and re-run.

-- 1. Per-user preference toggle
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS ai_assisted_conversions BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Variant provenance + AI metadata
ALTER TABLE public.food_variants
  ADD COLUMN IF NOT EXISTS source         TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_estimate', 'imported')),
  ADD COLUMN IF NOT EXISTS ai_confidence  TEXT NULL
    CHECK (ai_confidence IN ('high', 'medium', 'low') OR ai_confidence IS NULL),
  ADD COLUMN IF NOT EXISTS ai_reasoning   TEXT NULL;

-- 3. Variant ownership column — add as NULL, backfill from food owner, validate, then SET NOT NULL.
--    foods.user_id is nullable in the base schema, so the backfill explicitly skips
--    NULL owners; the preflight then refuses to proceed if any variant is still NULL.
ALTER TABLE public.food_variants
  ADD COLUMN IF NOT EXISTS user_id UUID NULL
    REFERENCES public."user"(id) ON DELETE CASCADE;

UPDATE public.food_variants fv
SET user_id = f.user_id
FROM public.foods f
WHERE fv.food_id = f.id
  AND fv.user_id IS NULL
  AND f.user_id IS NOT NULL;

DO $$
DECLARE
  unresolved INTEGER;
BEGIN
  SELECT COUNT(*) INTO unresolved
  FROM public.food_variants
  WHERE user_id IS NULL;

  IF unresolved > 0 THEN
    RAISE EXCEPTION
      'Cannot SET NOT NULL on food_variants.user_id: % variants still have NULL user_id (parent food has NULL user_id or is missing). Investigate and resolve before re-running this migration.',
      unresolved;
  END IF;
END $$;

ALTER TABLE public.food_variants
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS food_variants_user_id_idx
  ON public.food_variants (user_id);
CREATE INDEX IF NOT EXISTS food_variants_food_user_idx
  ON public.food_variants (food_id, user_id);

-- 4. RLS policies — rewrite for the stock+personal model.
--    Drop every known historical name so re-runs and fresh installs both end clean.
DROP POLICY IF EXISTS select_and_modify_policy    ON public.food_variants;
DROP POLICY IF EXISTS food_variants_rls           ON public.food_variants;
DROP POLICY IF EXISTS food_variants_select_policy ON public.food_variants;
DROP POLICY IF EXISTS food_variants_all_policy    ON public.food_variants;
DROP POLICY IF EXISTS food_variants_modify_policy ON public.food_variants;

-- (A) SELECT: stock variants visible to any reader of the food; personal variants
--     visible to the owner and anyone with family library/diary access.
CREATE POLICY food_variants_select_policy ON public.food_variants
FOR SELECT
USING (
  (
    -- Stock variant: variant owner == food owner, and the user can read the food.
    food_variants.user_id = (SELECT f.user_id FROM public.foods f WHERE f.id = food_variants.food_id)
    AND EXISTS (
      SELECT 1 FROM public.foods f
      WHERE f.id = food_variants.food_id
        AND public.has_library_access_with_public(
          f.user_id, f.shared_with_public,
          ARRAY['can_view_food_library', 'can_manage_diary']
        )
    )
  )
  OR
  -- Personal variant: visible to its owner and to anyone with family access to that owner.
  -- Pass FALSE for is_shared so the helper reduces to owner-or-family-access semantics.
  public.has_library_access_with_public(
    food_variants.user_id,
    FALSE,
    ARRAY['can_view_food_library', 'can_manage_diary']
  )
);

-- (B) MODIFY (INSERT/UPDATE/DELETE): only the variant owner can write, AND the
--     parent food must be accessible (defense in depth — preserves today's
--     food-level access requirement for direct-SQL writes).
CREATE POLICY food_variants_modify_policy ON public.food_variants
FOR ALL
USING (
  food_variants.user_id = current_setting('app.user_id')::uuid
  AND EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_variants.food_id
      AND public.has_library_access_with_public(
        f.user_id, f.shared_with_public,
        ARRAY['can_view_food_library', 'can_manage_diary']
      )
  )
)
WITH CHECK (
  food_variants.user_id = current_setting('app.user_id')::uuid
  AND EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_variants.food_id
      AND public.has_library_access_with_public(
        f.user_id, f.shared_with_public,
        ARRAY['can_view_food_library', 'can_manage_diary']
      )
  )
);
