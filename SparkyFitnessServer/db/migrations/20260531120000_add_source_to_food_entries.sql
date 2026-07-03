-- Migration: Add source / source_id to food_entries
-- Created at: 2026-05-31 12:00:00
--
-- Enables idempotent ingestion of externally-sourced food entries (e.g. Health
-- Connect NutritionRecord sync), mirroring the existing source / source_id
-- columns on exercise_entries. `source` identifies the provider (e.g.
-- 'health_connect') and `source_id` is the provider's stable record id. Ingestion
-- upserts on (user_id, source, source_id) so re-syncing the same record updates
-- it in place instead of duplicating — without touching manually-logged rows
-- (which leave source NULL) and without needing a destructive range-delete.

ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS source character varying(50),
  ADD COLUMN IF NOT EXISTS source_id character varying(255);

COMMENT ON COLUMN public.food_entries.source IS 'Provider that produced this entry (e.g. ''health_connect''). NULL for manual/web entries.';
COMMENT ON COLUMN public.food_entries.source_id IS 'Provider-stable record id for idempotent re-sync. NULL for manual/web entries.';

-- Idempotency key for provider-sourced entries: re-syncing the same record
-- upserts in place. Partial so manually-logged rows (source/source_id NULL) are
-- unconstrained. This is also the ON CONFLICT arbiter used by createFoodEntry.
CREATE UNIQUE INDEX IF NOT EXISTS idx_food_entries_user_source_source_id
  ON public.food_entries USING btree (user_id, source, source_id)
  WHERE source IS NOT NULL AND source_id IS NOT NULL;
