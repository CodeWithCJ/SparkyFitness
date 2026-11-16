-- Migration: server-backed workout session lifecycle (#1995, phase 1)
-- Date: 2026-11-10
-- Re-runnable: every statement is guarded.
--
-- The session status (planned / in_progress / partial / completed) is NOT a
-- column. It is derived per request from the persisted set completion data
-- plus these two columns, so it can never drift out of sync with the rows
-- that define it:
--
--   finished_at  stamped when the client ends the session; splits partial
--                from completed once every trackable set is checked off.
--   revision     monotonic write counter for optimistic concurrency; a
--                client that last saw an older revision gets a 409 instead
--                of silently overwriting edits made from another device.

ALTER TABLE public.exercise_preset_entries
    ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

COMMENT ON COLUMN public.exercise_preset_entries.finished_at IS
    'Client-stamped moment the live workout session was ended. NULL = still planned or in progress. Split point between the derived partial and completed statuses.';

ALTER TABLE public.exercise_preset_entries
    ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.exercise_preset_entries.revision IS
    'Monotonic write counter for optimistic concurrency, incremented on every update. A client presenting an older revision is rejected with 409 instead of overwriting newer edits.';

-- Backfill: existing sessions with any completed set predate finished_at and
-- would otherwise surface as in_progress. Stamp them finished at their last
-- update so historical workouts read as completed (or partial where sets were
-- skipped).
UPDATE public.exercise_preset_entries AS pe
SET finished_at = pe.updated_at
WHERE pe.finished_at IS NULL
  AND EXISTS (
      SELECT 1
      FROM public.exercise_entry_sets AS ees
      JOIN public.exercise_entries AS ee ON ee.id = ees.exercise_entry_id
      WHERE ee.exercise_preset_entry_id = pe.id
        AND ees.completed_at IS NOT NULL
  );

-- Backfill (continued): legacy live sessions ("sparky") with no checked sets
-- were never finished by builds in the field (they predate finished_at), so
-- they would surface as in_progress forever. Stamp them finished at their
-- last update so history reads as completed. Untouched plan-generated rows
-- are deliberately left NULL to stay "planned" until they are started.
UPDATE public.exercise_preset_entries AS pe
SET finished_at = pe.updated_at
WHERE pe.finished_at IS NULL
  AND pe.source ILIKE 'sparky'
  AND NOT EXISTS (
      SELECT 1
      FROM public.exercise_entry_sets AS ees
      JOIN public.exercise_entries AS ee ON ee.id = ees.exercise_entry_id
      WHERE ee.exercise_preset_entry_id = pe.id
        AND ees.completed_at IS NOT NULL
  );
