-- Migration: Add record timezone metadata to sleep_entries
--
-- Issue #2033: bed/wake times are stored as UTC instants with no memory of
-- the timezone they were recorded in, so displays fall back to the viewer's
-- current timezone and a trip across timezones re-labels historical nights
-- (a 7am wake-up shows as noon). Providers already have zone data in hand at
-- import time (Health Connect zone offsets, HealthKit HKTimeZone, Garmin
-- Local/GMT timestamp pairs, Oura/Polar offset-suffixed ISO strings, Fitbit
-- profile offset); these columns let import paths stamp it per entry.
--
-- Purely additive: both columns are nullable and NULL means "no recording
-- zone known" — read paths fall back to the user's profile timezone, so
-- pre-existing rows keep rendering exactly as before. entry_date bucketing
-- and the (user_id, entry_date, source) dedup key are unchanged.

ALTER TABLE public.sleep_entries
  ADD COLUMN IF NOT EXISTS record_timezone text;

ALTER TABLE public.sleep_entries
  ADD COLUMN IF NOT EXISTS record_utc_offset_minutes integer;

COMMENT ON COLUMN public.sleep_entries.record_timezone IS 'IANA timezone the entry was recorded in (e.g. America/New_York). NULL when the source provided no zone; read paths fall back to record_utc_offset_minutes, then the profile timezone.';

COMMENT ON COLUMN public.sleep_entries.record_utc_offset_minutes IS 'UTC offset in minutes at recording time (e.g. -300). Used when record_timezone is absent; NULL when the source provided no zone information.';
