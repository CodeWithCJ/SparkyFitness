-- Migration: Add source_id to water_intake_entries
--
-- Enables idempotent per-record sync of hydration entries from mobile health
-- providers (HealthKit uuid / Health Connect metadata.id), mirroring the
-- existing source/source_id pattern on food_entries and exercises. Sync
-- ingestion upserts on (user_id, source, source_id) instead of destructively
-- deleting-and-replacing a date window, so re-syncing the same record updates
-- it in place without risking loss of other entries in that window.
--
-- Purely additive: source_id is nullable and the new unique index only
-- applies where both source and source_id are non-null, so pre-existing
-- synced rows (source <> 'manual', source_id NULL, written by whatever path
-- populated this table before this migration) are left untouched. They will
-- simply not participate in the new upsert-by-source_id dedup key going
-- forward, which can cause a one-time harmless overlap the next time that
-- exact record re-syncs (an extra row for the same real-world entry) rather
-- than any data loss.

ALTER TABLE public.water_intake_entries
  ADD COLUMN IF NOT EXISTS source_id character varying(255);

COMMENT ON COLUMN public.water_intake_entries.source_id IS 'Provider-stable record id for idempotent re-sync (e.g. HealthKit uuid, Health Connect metadata.id). NULL for manual or pre-migration synced entries.';

-- Idempotency key for provider-sourced entries; partial so manual rows
-- (source = 'manual', source_id NULL) and pre-existing synced rows without
-- a source_id are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_water_intake_entries_user_source_source_id
  ON public.water_intake_entries USING btree (user_id, source, source_id)
  WHERE source IS NOT NULL AND source_id IS NOT NULL;
