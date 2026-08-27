/**
 * One day's aggregated sleep, as returned by `GET /api/sleep/analytics`.
 *
 * The server buckets every sleep entry by `entry_date` and sums the durations, so one
 * element here can represent several sleep sessions on the same day.
 */
export interface SleepAnalyticsDay {
  /** Calendar day (`YYYY-MM-DD`), not a UTC instant. */
  date: string;
  /** Bedtime-to-waketime span in seconds, including time awake in bed. */
  totalSleepDuration: number;
  /** Seconds actually asleep, excluding awake periods. */
  timeAsleep: number;
  sleepScore: number;
  earliestBedtime: string | null;
  latestWakeTime: string | null;
  /** Percentage, `timeAsleep / totalSleepDuration`. */
  sleepEfficiency: number;
  /** Hours short of the server's 8-hour target; negative when the target is beaten. */
  sleepDebt: number;
  stagePercentages: Record<string, number>;
  awakePeriods: number;
  totalAwakeDuration: number;
}

/**
 * A single plotted bar on the Dashboard sleep trend.
 *
 * Declared as a type alias rather than an interface because victory-native's
 * `CartesianChart` requires its row type to satisfy `Record<string, unknown>`. Object
 * literal type aliases get that implicit index signature; interfaces never do, so
 * converting this to an interface breaks the chart's generic inference.
 */
export type SleepDataPoint = {
  /** Calendar day (`YYYY-MM-DD`). */
  day: string;
  hours: number;
};

/**
 * One stage segment within a sleep session, from the `stage_events` aggregate on
 * `GET /api/sleep`.
 *
 * `stage_type` is an unconstrained `varchar(50)` server-side, but every ingest path
 * normalizes into `SleepStageType` (`src/types/healthRecords.ts`): HealthKit via
 * `SLEEP_STAGE_OUTPUT`, Health Connect via `mapHealthConnectSleepStage`, and Garmin /
 * Withings / Fitbit / Oura server-side. It stays a plain `string` here because the column
 * has no database constraint, so an unrecognized value must render rather than throw.
 */
export interface SleepStageEvent {
  id: string;
  entry_id: string;
  stage_type: string;
  /** ISO instant. Postgres JSON aggregation emits `+00:00`, other paths emit `Z`. */
  start_time: string;
  end_time: string;
  duration_in_seconds: number;
}

/**
 * One sleep session row, as returned by `GET /api/sleep`.
 *
 * Only the fields the mobile UI reads are declared; the row carries more columns
 * (respiration, HRV, body battery, stress) that nothing here displays yet.
 *
 * Two of these types are load-bearing and easy to get wrong. The server's pool sets
 * `NUMERIC -> parseFloat` and `DATE -> identity` (`db/poolManager.ts`), so `sleep_score`
 * arrives as a JS number rather than a string, and `entry_date` stays a `'YYYY-MM-DD'`
 * calendar-day string rather than becoming a timestamp.
 */
export interface SleepEntry {
  id: string;
  /** Calendar day (`YYYY-MM-DD`) the server filed this session under. */
  entry_date: string;
  /** ISO instant. */
  bedtime: string;
  /** ISO instant. */
  wake_time: string;
  /** Bedtime-to-waketime span, including time awake in bed. Never null. */
  duration_in_seconds: number;
  /** Seconds actually asleep. Null for sources that do not report it. */
  time_asleep_in_seconds: number | null;
  sleep_score: number | null;
  source: string;
  deep_sleep_seconds: number | null;
  light_sleep_seconds: number | null;
  rem_sleep_seconds: number | null;
  awake_sleep_seconds: number | null;
  average_spo2_value: number | null;
  lowest_spo2_value: number | null;
  highest_spo2_value: number | null;
  resting_heart_rate: number | null;
  /** Ordered by `start_time` server-side; defaults to `[]` when the session has no stages. */
  stage_events: SleepStageEvent[];
}

/**
 * A single Diary day's sleep, split into the three cards.
 *
 * `bedTime` is the main sleep of the *next* day: synced sessions are filed under the day
 * the user woke up, so the sleep begun on day D lives in D+1's record.
 */
export interface SleepDayBuckets {
  wakeUp: SleepEntry | null;
  naps: SleepEntry[];
  bedTime: SleepEntry | null;
}
