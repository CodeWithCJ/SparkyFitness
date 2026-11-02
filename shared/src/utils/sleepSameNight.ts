/**
 * One night recorded by two sources.
 *
 * `sleep_entries` can hold several rows per day, also from one source: the
 * same night recorded twice (a watch and a ring, or Google Health and Health
 * Connect both carrying a Fitbit night), or a night and a nap, from the same
 * source or another. Records of the same day that overlap for most of the
 * shorter one are one sleep: only the most detailed of them should count,
 * while a nap that does not overlap, or only clips the night, still counts.
 */

/** Records are one sleep when they overlap for at least this share of the shorter one. */
const SAME_SLEEP_MIN_OVERLAP = 0.5;
/** A record shorter than this share of the longest record of its sleep is partial and never wins. */
const COMPLETE_SHARE = 0.8;

/** How much a recorded sleep tells; compared field by field, the first difference decides. */
export interface SleepDetail {
  /** Distinct stages recorded among deep, light, REM and awake. */
  stageKinds: number;
  /** Other measures recorded with the sleep, such as a score, HRV or resting heart rate. */
  measures: number;
  /** Stage segments, so finer staging wins a tie. */
  segments: number;
  durationSeconds: number;
}

/** Where a record sits: its day, its times (epoch ms) and its detail. */
export interface SleepPlacement {
  day: string;
  start: number;
  end: number;
  detail: SleepDetail;
}

/** Positive when `a` is the more detailed. */
function compareDetail(a: SleepDetail, b: SleepDetail): number {
  return (
    a.stageKinds - b.stageKinds ||
    a.measures - b.measures ||
    a.segments - b.segments ||
    a.durationSeconds - b.durationSeconds
  );
}

/**
 * The records to count: of each day's records that are one sleep (also
 * through a chain), the most detailed one that covers most of it, ties going
 * to the earlier start and then to the earlier record. Sleeps that only touch
 * stay separate. Records keep their order.
 */
export function keepMostDetailedSleep<T>(
  items: readonly T[],
  place: (item: T) => SleepPlacement
): T[] {
  const placed = items.map((item, index) => ({ index, ...place(item) }));
  const byDay = new Map<string, typeof placed>();
  for (const p of placed) {
    const day = byDay.get(p.day);
    if (day) day.push(p);
    else byDay.set(p.day, [p]);
  }

  const kept = new Set<number>();
  for (const day of byDay.values()) {
    day.sort((a, b) => a.start - b.start || a.index - b.index);
    let sleep: typeof placed = [];
    let sleepStart = 0;
    let sleepEnd = 0;
    for (const p of day) {
      const overlap = Math.min(sleepEnd, p.end) - p.start;
      const shorter = Math.min(p.end - p.start, sleepEnd - sleepStart);
      if (
        sleep.length > 0 &&
        overlap > 0 &&
        overlap >= SAME_SLEEP_MIN_OVERLAP * shorter
      ) {
        sleep.push(p);
        sleepEnd = Math.max(sleepEnd, p.end);
      } else {
        if (sleep.length > 0) kept.add(mostDetailed(sleep).index);
        sleep = [p];
        sleepStart = p.start;
        sleepEnd = p.end;
      }
    }
    if (sleep.length > 0) kept.add(mostDetailed(sleep).index);
  }
  return items.filter((_, index) => kept.has(index));
}

/**
 * The most detailed record among those covering most of one sleep; the first
 * on a tie. A lone record with its wake time before its bedtime has a negative
 * length and covers nothing, so it is returned as it is.
 */
function mostDetailed<P extends SleepPlacement>(sleep: P[]): P {
  const longest = Math.max(...sleep.map((p) => p.end - p.start));
  const complete = sleep.filter(
    (p) => p.end - p.start >= COMPLETE_SHARE * longest
  );
  return (complete.length > 0 ? complete : sleep).reduce((best, p) =>
    compareDetail(p.detail, best.detail) > 0 ? p : best
  );
}

const STAGE_KINDS = ['deep', 'light', 'rem', 'awake'] as const;

/** The fields of a `sleep_entries` row the rule reads, as the server and the web app hold it. */
export interface SameNightSleepEntry {
  /** `YYYY-MM-DD`, or that day with a time part. */
  entry_date: string;
  bedtime: string | Date;
  wake_time: string | Date;
  duration_in_seconds: number | null;
  stage_events?: readonly { stage_type: string }[] | null;
  deep_sleep_seconds?: number | null;
  light_sleep_seconds?: number | null;
  rem_sleep_seconds?: number | null;
  awake_sleep_seconds?: number | null;
  sleep_score?: number | null;
  avg_overnight_hrv?: number | null;
  resting_heart_rate?: number | null;
  average_spo2_value?: number | null;
  average_respiration_value?: number | null;
  avg_sleep_stress?: number | null;
  body_battery_change?: number | null;
}

/** What a stored sleep record tells, for `keepMostDetailedSleep`. */
export function sleepEntryDetail(entry: SameNightSleepEntry): SleepDetail {
  const events = entry.stage_events ?? [];
  const stageKinds =
    events.length > 0
      ? STAGE_KINDS.filter((kind) => events.some((e) => e.stage_type === kind))
          .length
      : [
          entry.deep_sleep_seconds,
          entry.light_sleep_seconds,
          entry.rem_sleep_seconds,
          entry.awake_sleep_seconds,
        ].filter((seconds) => (seconds ?? 0) > 0).length;
  const measures = [
    entry.sleep_score,
    entry.avg_overnight_hrv,
    entry.resting_heart_rate,
    entry.average_spo2_value,
    entry.average_respiration_value,
    entry.avg_sleep_stress,
    entry.body_battery_change,
  ].filter((value) => value !== null && value !== undefined).length;
  return {
    stageKinds,
    measures,
    segments: events.length,
    durationSeconds: entry.duration_in_seconds ?? 0,
  };
}

/** The stored sleep records to count: one per night, the most detailed, plus the day's naps. */
export function keepMostDetailedSleepEntries<
  A extends readonly SameNightSleepEntry[],
>(entries: A): A[number][] {
  return keepMostDetailedSleep(entries, (entry) => ({
    day: entry.entry_date.slice(0, 10),
    start: new Date(entry.bedtime).getTime(),
    end: new Date(entry.wake_time).getTime(),
    detail: sleepEntryDetail(entry),
  }));
}

/** The fields `mainSleepEntry` ranks a day's sleep records by. */
export interface MainSleepCandidate {
  duration_in_seconds?: number | string | null;
  bedtime?: string | Date | null;
}

function bedtimeMs(entry: MainSleepCandidate): number {
  const ms = entry.bedtime ? new Date(entry.bedtime).getTime() : NaN;
  return Number.isNaN(ms) ? Infinity : ms;
}

/** Negative when `a` is the main sleep rather than `b`. */
function compareMainSleep(a: MainSleepCandidate, b: MainSleepCandidate) {
  return (
    Number(b.duration_in_seconds ?? 0) - Number(a.duration_in_seconds ?? 0) ||
    bedtimeMs(a) - bedtimeMs(b)
  );
}

/**
 * A day's main sleep among its records (a night and its naps): the longest,
 * the earlier bedtime on a tie, then the first. The same rule as the
 * server's `MAIN_SLEEP_ORDER_SQL`, so a nap never stands in for the night.
 */
export function mainSleepEntry<T extends MainSleepCandidate>(
  entries: readonly T[]
): T | undefined {
  return entries.reduce<T | undefined>(
    (main, entry) =>
      main === undefined || compareMainSleep(entry, main) < 0 ? entry : main,
    undefined
  );
}
