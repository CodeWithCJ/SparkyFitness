-- Add the unique (user_id, entry_date) indexes the MCP check-in upserts require.
--
-- The MCP check-in tool runs `INSERT ... ON CONFLICT (user_id, entry_date) DO UPDATE`
-- against check_in_measurements (log_biometrics / weight) and mood_entries (log_mood),
-- but no migration ever created a matching unique index on check_in_measurements. On a
-- standard install Postgres rejects the ON CONFLICT with error 42P10
-- ("there is no unique or exclusion constraint matching the ON CONFLICT specification"),
-- so weight logging via the MCP always fails. See issue #1424.
--
-- These tables are meant to hold one row per user per day, so the unique index is also
-- the correct invariant. Any pre-existing duplicate (user_id, entry_date) rows are
-- removed first (keeping the most recently updated row, tie-broken by id) so the index
-- can be created on installs that accumulated duplicates before the constraint existed.

-- check_in_measurements
DELETE FROM public.check_in_measurements a
USING public.check_in_measurements b
WHERE a.user_id = b.user_id
  AND a.entry_date = b.entry_date
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS check_in_measurements_user_date_unique
  ON public.check_in_measurements (user_id, entry_date);

-- mood_entries already carries a unique index named unique_user_date on most installs;
-- IF NOT EXISTS with the same name makes this a no-op there and creates it where missing.
DELETE FROM public.mood_entries a
USING public.mood_entries b
WHERE a.user_id = b.user_id
  AND a.entry_date = b.entry_date
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS unique_user_date
  ON public.mood_entries (user_id, entry_date);
