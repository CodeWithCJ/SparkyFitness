-- Several mood check-ins per day. Every rating is optional, so a row needs only
-- some content (mood, energy, focus, notes or tags). entry_timestamp orders a
-- day's check-ins; source separates manual check-ins from rows derived from
-- Garmin stress or health-data imports, of which there is one per day each.
--
-- unique_user_date is a constraint on most installs and a plain unique index on
-- others, so it is dropped as a constraint first and then as an index.
-- The backfills fire the table's set_timestamp trigger, so updated_at on every
-- existing row moves to the time of the migration.
-- The whole file is one transaction, so a failure leaves the table as it was.

ALTER TABLE public.mood_entries ADD COLUMN IF NOT EXISTS entry_timestamp TIMESTAMPTZ;
-- Each existing row gets a time on its own day: created_at when that falls on
-- entry_date in the user's timezone, otherwise local noon of entry_date (a
-- NULL created_at also takes noon). A missing or unknown zone counts as UTC,
-- because AT TIME ZONE with a bad name would abort the migration.
WITH zones AS (
  SELECT user_id, timezone AS tz
  FROM public.user_preferences
  WHERE timezone IN (SELECT name FROM pg_timezone_names)
),
placed AS (
  SELECT e.id, COALESCE(z.tz, 'UTC') AS tz
  FROM public.mood_entries e
  LEFT JOIN zones z ON z.user_id = e.user_id
  WHERE e.entry_timestamp IS NULL
)
UPDATE public.mood_entries m
SET entry_timestamp = CASE
    WHEN (m.created_at AT TIME ZONE placed.tz)::date = m.entry_date THEN m.created_at
    ELSE (m.entry_date + time '12:00') AT TIME ZONE placed.tz
  END
FROM placed
WHERE m.id = placed.id;
ALTER TABLE public.mood_entries ALTER COLUMN entry_timestamp SET NOT NULL;
ALTER TABLE public.mood_entries ALTER COLUMN entry_timestamp SET DEFAULT now();

ALTER TABLE public.mood_entries ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
UPDATE public.mood_entries SET source = 'garmin' WHERE notes LIKE 'Derived from Garmin Stress:%';
-- The aggregates and the derived-row index know only these three.
ALTER TABLE public.mood_entries DROP CONSTRAINT IF EXISTS mood_entries_known_source;
ALTER TABLE public.mood_entries ADD CONSTRAINT mood_entries_known_source
  CHECK (source IN ('manual', 'garmin', 'import'));

ALTER TABLE public.mood_entries ALTER COLUMN mood_value DROP NOT NULL;

-- The same rule as hasMoodContent in models/moodRepository.ts: whitespace-only
-- notes and blank tags are not content. The notes branch keeps its NULL guard
-- because a CHECK that evaluates to NULL lets the row through.
ALTER TABLE public.mood_entries DROP CONSTRAINT IF EXISTS mood_entries_has_content;
ALTER TABLE public.mood_entries ADD CONSTRAINT mood_entries_has_content
  CHECK (
    mood_value IS NOT NULL
    OR energy_value IS NOT NULL
    OR focus_value IS NOT NULL
    OR (notes IS NOT NULL AND notes ~ '\S')
    OR array_to_string(mood_tags, '') ~ '\S'
  );

ALTER TABLE public.mood_entries DROP CONSTRAINT IF EXISTS unique_user_date;
DROP INDEX IF EXISTS public.unique_user_date;

CREATE UNIQUE INDEX IF NOT EXISTS mood_entries_derived_source_day
  ON public.mood_entries (user_id, entry_date, source) WHERE source <> 'manual';
CREATE INDEX IF NOT EXISTS mood_entries_user_day_time
  ON public.mood_entries (user_id, entry_date, entry_timestamp);

