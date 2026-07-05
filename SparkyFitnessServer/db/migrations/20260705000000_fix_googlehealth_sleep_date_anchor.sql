-- SparkyFitnessServer/db/migrations/20260705000000_fix_googlehealth_sleep_date_anchor.sql
-- Re-anchor existing Google Health sleep entries to the wake-up day.
--
-- processGoogleSleep previously filed a session under the day it started (the
-- "night of"): entry_date = start-day, minus one when the session started before
-- noon local time. That put overnight sleeps one day earlier than Google Health
-- / Fitbit, which file a sleep under the day it ends. The processor now anchors
-- to the wake-up day (instantToDay(wake_time, tz)).
--
-- The old anchor was NOT uniformly one day early: a same-day daytime nap that
-- started at or after noon already had the correct (wake-day) date, so a blind
-- +1 would break those rows. Instead we recompute each row's date from its own
-- wake_time in the user's timezone, exactly as the processor now does, which is
-- correct for overnight sleeps, past-midnight sleeps, and naps alike and is
-- idempotent for rows that were already right.
--
-- Timezone resolution mirrors loadUserTimezone: the user's stored timezone when
-- it is a zone Postgres recognises, otherwise UTC (covers a missing preferences
-- row, a NULL timezone, or an unrecognised value). wake_time is NOT NULL.
-- See: https://github.com/CodeWithCJ/SparkyFitness/issues/1723

-- Resolve the timezone once via a join rather than a per-row correlated scan of
-- pg_timezone_names (a filesystem-backed view). The se/se2 self-join is required:
-- driving the update straight off user_preferences would inner-join away rows for
-- users with no preferences row, leaving them un-migrated instead of UTC-anchored.
UPDATE public.sleep_entries se
SET entry_date = (se.wake_time AT TIME ZONE COALESCE(tzn.name, 'UTC'))::date,
    updated_at = CURRENT_TIMESTAMP
FROM public.sleep_entries se2
LEFT JOIN public.user_preferences up ON up.user_id = se2.user_id
LEFT JOIN pg_timezone_names tzn ON tzn.name = up.timezone
WHERE se.id = se2.id
  AND se2.source = 'Google Health';
