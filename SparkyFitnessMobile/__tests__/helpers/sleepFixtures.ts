import type { SleepEntry, SleepStageEvent } from '../../src/types/sleep';

/**
 * Shared sleep fixtures for the Diary card, detail screen, hook, and utility suites.
 *
 * The defaults mirror what the server actually sends, which several cases depend on:
 * `entry_date` is a `'YYYY-MM-DD'` string and `sleep_score` a JS number (the pool sets
 * `DATE -> identity` and `NUMERIC -> parseFloat`), `duration_in_seconds` is never null,
 * and `stage_events` defaults to `[]`.
 */
export const buildSleepEntry = (
  overrides: Partial<SleepEntry> = {}
): SleepEntry => ({
  id: 'entry-main',
  entry_date: '2026-08-23',
  bedtime: '2026-08-22T22:45:00+00:00',
  wake_time: '2026-08-23T06:45:00+00:00',
  duration_in_seconds: 28800,
  time_asleep_in_seconds: 27000,
  sleep_score: 82,
  source: 'Garmin',
  deep_sleep_seconds: 5400,
  light_sleep_seconds: 14400,
  rem_sleep_seconds: 7200,
  awake_sleep_seconds: 1800,
  average_spo2_value: 95,
  lowest_spo2_value: 89,
  highest_spo2_value: 99,
  resting_heart_rate: 52,
  record_timezone: null,
  record_utc_offset_minutes: null,
  stage_events: [],
  ...overrides,
});

/** Postgres JSON aggregation emits `+00:00` offsets, so that is the default here. */
export const buildStageEvent = (
  overrides: Partial<SleepStageEvent> = {}
): SleepStageEvent => ({
  id: 'stage-1',
  entry_id: 'entry-main',
  stage_type: 'light',
  start_time: '2026-08-22T23:10:00+00:00',
  end_time: '2026-08-22T23:40:00+00:00',
  duration_in_seconds: 1800,
  ...overrides,
});
