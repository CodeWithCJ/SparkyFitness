import type { HealthMetricSamples } from '../schemas/database/HealthMetricSamples.zod.ts';

/** Minutes between two points of the day timeline. */
export const HEART_RATE_TIMELINE_STEP_MINUTES = 5;
const MINUTES_PER_DAY = 1440;

/** One heart rate reading placed on the day, in whole minutes since midnight. */
export interface TimelineReading {
  minutes: number;
  bpm: number;
}

export interface TimelineWorkoutBand {
  id: string;
  name: string;
  startMinutes: number;
  endMinutes: number;
}

/**
 * Where sleep sits on the day: asleep before `wakeMinutes` (morning) and from
 * `bedMinutes` (evening). Either may be unknown. `bedAfterMidnight` marks a
 * bedtime that falls on the next day: `bedMinutes` is then only an anchor for
 * drawing (23:45), and the day's statistics do not count it as sleep.
 */
export interface TimelineSleepWindow {
  wakeMinutes: number | null;
  bedMinutes: number | null;
  bedAfterMidnight?: boolean;
}

export type DayHeartRatePoint = {
  minutes: number;
  /** null where nothing was recorded, so the line breaks there */
  bpm: number | null;
  isSleep: boolean;
  workoutName: string | null;
};

export interface DayHeartRateTimeline {
  points: DayHeartRatePoint[];
  daytimeAvg: number | null;
  sleepingAvg: number | null;
  /** Sleeping average against the daytime average, in whole percent (negative is a dip) */
  sleepDipPct: number | null;
  minBpm: number | null;
  minMinutes: number | null;
  maxBpm: number | null;
  maxMinutes: number | null;
}

const average = (values: number[]): number | null =>
  values.length > 0
    ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
    : null;

export function isAsleepAt(minutes: number, sleep: TimelineSleepWindow) {
  return (
    (sleep.wakeMinutes !== null && minutes < sleep.wakeMinutes) ||
    (sleep.bedMinutes !== null && minutes >= sleep.bedMinutes)
  );
}

/**
 * Groups one day's readings into 5-minute points (a point per step even where
 * nothing was recorded, null bpm), flags sleep and workout time, and works out
 * the day's statistics. Readings are recorded ones only; nothing is invented.
 */
export function buildDayHeartRateTimeline(
  readings: readonly TimelineReading[],
  workouts: readonly TimelineWorkoutBand[],
  sleep: TimelineSleepWindow
): DayHeartRateTimeline {
  const step = HEART_RATE_TIMELINE_STEP_MINUTES;
  const totalSteps = MINUTES_PER_DAY / step;
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const r of readings) {
    if (!Number.isFinite(r.bpm) || r.bpm <= 0) continue;
    const index = Math.min(totalSteps, Math.round(r.minutes / step));
    const bucket = buckets.get(index) ?? { sum: 0, count: 0 };
    bucket.sum += r.bpm;
    bucket.count += 1;
    buckets.set(index, bucket);
  }

  const points: DayHeartRatePoint[] = [];
  if (buckets.size > 0) {
    for (let i = 0; i <= totalSteps; i++) {
      const minutes = Math.min(MINUTES_PER_DAY, i * step);
      const bucket = buckets.get(i);
      const workout = workouts.find(
        (w) => minutes >= w.startMinutes && minutes <= w.endMinutes
      );
      points.push({
        minutes,
        bpm: bucket ? Math.round(bucket.sum / bucket.count) : null,
        isSleep: isAsleepAt(minutes, sleep),
        workoutName: workout?.name ?? null,
      });
    }
  }

  const recorded = points.filter(
    (p): p is DayHeartRatePoint & { bpm: number } => p.bpm !== null
  );
  if (recorded.length === 0) {
    return {
      points,
      daytimeAvg: null,
      sleepingAvg: null,
      sleepDipPct: null,
      minBpm: null,
      minMinutes: null,
      maxBpm: null,
      maxMinutes: null,
    };
  }

  const bpms = recorded.map((p) => p.bpm);
  const minBpm = Math.min(...bpms);
  const maxBpm = Math.max(...bpms);
  // A bedtime after midnight belongs to the next day's sleep, so its 23:45
  // anchor is drawn but not counted in this day's figures
  const statsSleep: TimelineSleepWindow = sleep.bedAfterMidnight
    ? { wakeMinutes: sleep.wakeMinutes, bedMinutes: null }
    : sleep;
  const sleepingAvg = average(
    recorded.filter((p) => isAsleepAt(p.minutes, statsSleep)).map((p) => p.bpm)
  );
  const daytimeAvg = average(
    recorded.filter((p) => !isAsleepAt(p.minutes, statsSleep)).map((p) => p.bpm)
  );
  return {
    points,
    daytimeAvg,
    sleepingAvg,
    sleepDipPct:
      daytimeAvg && sleepingAvg && daytimeAvg > 0
        ? Math.round(((sleepingAvg - daytimeAvg) / daytimeAvg) * 100)
        : null,
    minBpm,
    minMinutes: recorded.find((p) => p.bpm === minBpm)?.minutes ?? null,
    maxBpm,
    maxMinutes: recorded.find((p) => p.bpm === maxBpm)?.minutes ?? null,
  };
}

export type DailyHeartRateAverage = {
  day: string;
  avgBpm: number;
  minBpm: number;
  maxBpm: number;
};

/**
 * One average per calendar day across every source's row for that day, in day
 * order. Days with no valid reading are left out.
 */
export function dailyHeartRateAverages(
  rows: readonly HealthMetricSamples[] | null | undefined
): DailyHeartRateAverage[] {
  const byDay = new Map<
    string,
    { sum: number; count: number; min: number; max: number }
  >();
  for (const row of rows ?? []) {
    const day = String(row.entry_date || '').slice(0, 10);
    if (!day || !Array.isArray(row.samples)) continue;
    for (const sample of row.samples) {
      const bpm = (sample as { bpm?: unknown }).bpm;
      if (typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm <= 0)
        continue;
      const acc = byDay.get(day) ?? { sum: 0, count: 0, min: bpm, max: bpm };
      acc.sum += bpm;
      acc.count += 1;
      acc.min = Math.min(acc.min, bpm);
      acc.max = Math.max(acc.max, bpm);
      byDay.set(day, acc);
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, a]) => ({
      day,
      avgBpm: Math.round(a.sum / a.count),
      minBpm: a.min,
      maxBpm: a.max,
    }));
}

export interface ClockParts {
  /** Calendar day 'YYYY-MM-DD' of the instant in the zone being charted */
  day: string;
  hour: number;
  minute: number;
}

export interface SleepSessionTimes {
  entry_date?: string | null;
  bedtime?: string | null;
  wake_time?: string | null;
}

const nextDayOf = (day: string): string => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Where sleep sits on `day`: the session that ended that day (the earliest
 * wake, so a later nap does not replace the night) and the one that began that
 * evening (from 18:00), or just after midnight, which is drawn from 23:45.
 * `clockParts` turns an instant into the wall clock of the zone being charted,
 * null when it cannot.
 */
export function sleepWindowForDay(
  sessions: readonly SleepSessionTimes[],
  day: string,
  clockParts: (instant: string) => ClockParts | null
): TimelineSleepWindow {
  const next = nextDayOf(day);

  let wakeMinutes: number | null = null;
  for (const s of sessions) {
    const wake = s.wake_time ? clockParts(s.wake_time) : null;
    if (!wake || wake.day !== day) continue;
    const minutes = wake.hour * 60 + wake.minute;
    if (wakeMinutes === null || minutes < wakeMinutes) wakeMinutes = minutes;
  }

  // The evening's sleep is the session whose bedtime falls this evening (from
  // 18:00) or just after midnight. A session that wakes on the next day is
  // the night itself and wins over an evening nap that started earlier;
  // among equals the earliest bedtime wins. Being filed on the next day says
  // nothing about the bedtime, so it is not used.
  let best: { rank: number; overnight: boolean } | null = null;
  for (const s of sessions) {
    const bed = s.bedtime ? clockParts(s.bedtime) : null;
    if (!bed) continue;
    let rank: number;
    if (bed.day === day && bed.hour >= 18) {
      rank = bed.hour * 60 + bed.minute;
    } else if (bed.day === next && bed.hour <= 5) {
      // After midnight: drawn from 23:45, ranked by the real time
      rank = MINUTES_PER_DAY + bed.hour * 60 + bed.minute;
    } else {
      continue;
    }
    const overnight = s.wake_time
      ? clockParts(s.wake_time)?.day === next
      : false;
    if (
      !best ||
      (overnight && !best.overnight) ||
      (overnight === best.overnight && rank < best.rank)
    ) {
      best = { rank, overnight };
    }
  }
  const bedAfterMidnight = best !== null && best.rank >= MINUTES_PER_DAY;
  const bedMinutes = best === null ? null : bedAfterMidnight ? 1425 : best.rank;
  return { wakeMinutes, bedMinutes, bedAfterMidnight };
}
