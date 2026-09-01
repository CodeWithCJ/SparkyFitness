import type { RecordZone } from '@workspace/shared';

/**
 * The sleep stages the app renders, ordered from lightest to deepest.
 *
 * Lives here rather than in `Hypnogram.tsx` because both the Sleep Details hypnogram and
 * the Dashboard sleep timeline lay stages out by name, and a chart importing its
 * vocabulary from another chart is the wrong dependency direction. `Hypnogram` re-exports
 * these under their original names so its own lane ordering keeps reading as lanes.
 */
export const SLEEP_STAGE_LANES = [
  'awake',
  'rem',
  'light',
  'deep',
  'other',
] as const;

export type SleepStageLane = (typeof SLEEP_STAGE_LANES)[number];

const FALLBACK_STAGE_LANE: SleepStageLane = 'other';

/**
 * Normalizes a server `stage_type` onto a lane.
 *
 * `stage_type` is an unconstrained `varchar(50)`, so anything outside the named stages
 * (`in_bed`, `unknown`, whatever a future source invents) has to render as *something*
 * rather than throw — that is what `other` is for. `other` is deliberately not accepted as
 * an input value: a source naming a stage "other" means the same unknown thing.
 */
export const laneForStageType = (stageType: string): SleepStageLane => {
  const normalized = stageType.toLowerCase();
  const isNamedStage =
    (SLEEP_STAGE_LANES as readonly string[]).includes(normalized) &&
    normalized !== FALLBACK_STAGE_LANE;

  return isNamedStage ? (normalized as SleepStageLane) : FALLBACK_STAGE_LANE;
};

/** One contiguous run of a single stage, as absolute instants. */
export interface SleepTimelineSegment {
  stage: SleepStageLane;
  startMs: number;
  endMs: number;
}

/**
 * One plotted column on the Dashboard sleep timeline.
 *
 * Holds the day's **main sleep only** — naps are excluded, because a nap sits hours from
 * the night on a shared clock axis and would stretch that axis far enough to squash every
 * real night in the window.
 *
 * Present for every day in the window, including days with no sleep at all — the chart
 * needs a slot per day so its x-axis labels stay aligned with the nights it drew.
 *
 * `day` comes straight from the server's `entry_date`, which files a session under the day
 * the user *woke up*. A night therefore sits under the morning that ended it, and its
 * segments legitimately begin before that day's midnight; the clock axis is what places
 * them, so nothing here clamps them into the day.
 */
export interface SleepTimelineDay {
  /** Calendar day (`YYYY-MM-DD`). */
  day: string;
  timeInBedSeconds: number;
  /** Null, not zero, when no session that day reported time asleep. */
  timeAsleepSeconds: number | null;
  segments: SleepTimelineSegment[];
  /**
   * The zone this night's segments are placed on the clock axis in — the session's
   * recording zone, else the profile timezone. Null when neither is usable, which leaves
   * the night on the device's clock.
   *
   * Per day rather than per chart because a window can span a flight: a night recorded in
   * Tokyo and a night recorded in Berlin each belong at the hour they were slept.
   */
  zone: RecordZone | null;
}

/**
 * A window of sleep, plus the headline averages drawn above the chart.
 *
 * The two averages have deliberately different denominators: time in bed is known for
 * every session, but time asleep is nullable, so averaging both over the same days would
 * drag the asleep figure down by every source that does not report it.
 */
export interface SleepTimelineSummary {
  days: SleepTimelineDay[];
  /** Averaged over days holding at least one session; null when the window has none. */
  averageTimeInBedSeconds: number | null;
  /** Averaged over days that reported time asleep; null when none did. */
  averageTimeAsleepSeconds: number | null;
  nightsWithData: number;
}

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
  /**
   * IANA timezone the session was recorded in, when the source reported one. Null for
   * rows written before the column existed and for sources that only report an offset.
   */
  record_timezone: string | null;
  /**
   * UTC offset the session was recorded at, for sources that report an offset rather than
   * a zone. A fixed offset cannot follow DST, so a night spanning a transition can show up
   * to an hour of skew on one endpoint.
   */
  record_utc_offset_minutes: number | null;
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
