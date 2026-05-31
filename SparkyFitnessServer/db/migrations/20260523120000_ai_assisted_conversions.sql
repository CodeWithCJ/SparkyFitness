-- AI-Assisted Unit Conversions: schema changes
--
-- This migration adds:
--   1. user_preferences.ai_assisted_conversions toggle (per-user opt-in).
--   2. food_variants provenance columns (source / ai_confidence).
--
-- IDEMPOTENCY: column adds use IF NOT EXISTS. The trailing DROPs handle dev
-- environments that ran an earlier version of this migration which added a
-- food_variants.user_id column that's no longer used.

-- 1. Per-user preference toggle
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS ai_assisted_conversions BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Variant provenance + AI metadata
ALTER TABLE public.food_variants
  ADD COLUMN IF NOT EXISTS source         TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_estimate', 'imported')),
  ADD COLUMN IF NOT EXISTS ai_confidence  TEXT NULL
    CHECK (ai_confidence IN ('high', 'medium', 'low') OR ai_confidence IS NULL);

-- 3. Cleanup for dev environments that ran a prior revision of this migration
--    which added an unused food_variants.user_id column. No-op on fresh DBs.
DROP INDEX IF EXISTS food_variants_food_user_idx;
DROP INDEX IF EXISTS food_variants_user_id_idx;
ALTER TABLE public.food_variants
  DROP COLUMN IF EXISTS user_id;
