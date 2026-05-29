-- AI-Assisted Unit Conversions: schema changes
--
-- This migration adds:
--   1. user_preferences.ai_assisted_conversions toggle (per-user opt-in).
--   2. food_variants provenance columns (source / ai_confidence).
--   3. food_variants.user_id ownership column with backfill from foods.user_id.
--      Existing rows backfill from the parent food owner; new variants stamp
--      the creator. Used for AI-conversion provenance; access is still gated
--      by the existing food_variants RLS in rls_policies.sql.
--
-- IDEMPOTENCY: column adds use IF NOT EXISTS; the backfill UPDATE is naturally
-- idempotent; SET NOT NULL is a no-op once applied.
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
    CHECK (ai_confidence IN ('high', 'medium', 'low') OR ai_confidence IS NULL);

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

