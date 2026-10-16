import { addDays, daysBetween } from "./timezone.ts";
import { classifyActivitySport } from "./activitySport.ts";

/**
 * Weekly running volume, long run and aerobic efficiency from a list of
 * logged activities. Pure, so web and mobile read the same figures. Only runs
 * count: walks, rides and gym cardio are left out.
 */

/** The fields of an activity this needs (a subset of the stats query item). */
export interface RunningTrendsActivity {
  exerciseName: string;
  category: string | null;
  /** YYYY-MM-DD. */
  entryDate: string;
  durationMinutes: number;
  distanceMeters: number | null;
  avgHeartRate: number | null;
}

export interface RunningWeek {
  /** YYYY-MM-DD of the first day of the week. */
  weekStart: string;
  distanceMeters: number;
  runs: number;
  /** Longest single run that week, in metres; 0 with no runs. */
  longestRunMeters: number;
  /**
   * Aerobic efficiency: speed in metres per minute for every beat per minute,
   * averaged over the week's runs that have a heart rate. Higher is fitter at
   * the same effort. Null when no run that week qualifies.
   */
  efficiency: number | null;
}

export interface RunningTrends {
  /** Oldest first; always `weeks` entries, empty weeks included. */
  weeks: RunningWeek[];
  /** Distance in the newest (current) week. */
  thisWeekMeters: number;
  /** Average weekly distance over the four weeks before the current one. */
  previousFourWeekAverageMeters: number;
  /** Current week against that average, as a percent; null with no average. */
  weekVsAveragePercent: number | null;
  /** Longest run in the whole window. */
  longestRunMeters: number;
  /** Efficiency change from the earlier half of the window to the later half, in percent. */
  efficiencyChangePercent: number | null;
  totalRuns: number;
}

/** Runs shorter than this say little about fitness or an easy-day pace. */
const MIN_EFFICIENCY_MINUTES = 20;
/** A reading outside this heart-rate range is a sensor glitch, not a run. */
const MIN_PLAUSIBLE_HR = 60;
const MAX_PLAUSIBLE_HR = 220;
/** A run needs a believable distance and duration to count at all. */
const MIN_RUN_METERS = 100;

/** 0 = Sunday ... 6 = Saturday, as the `first_day_of_week` preference stores it. */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Reads a stored `first_day_of_week` value, falling back to Monday. */
export function toWeekStart(value: unknown, fallback: WeekStart = 1): WeekStart {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
    ? (value as WeekStart)
    : fallback;
}

/** 0 = Sunday ... 6 = Saturday, for a YYYY-MM-DD calendar day. */
function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date!)).getUTCDay();
}

/** First day of the week containing `day`. `weekStartsOn`: 0 Sunday ... 6 Saturday. */
export function startOfWeek(day: string, weekStartsOn: WeekStart = 1): string {
  const back = (weekdayOf(day) - weekStartsOn + 7) % 7;
  return addDays(day, -back);
}

export function isRunningActivity(activity: RunningTrendsActivity): boolean {
  return (
    classifyActivitySport({
      exerciseName: activity.exerciseName,
      category: activity.category,
    }).sport === "running"
  );
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Runs from the last `weeks` weeks (ending with the week containing `today`),
 * grouped by week. Activities outside the window, and non-runs, are ignored.
 */
export function buildRunningTrends(
  activities: readonly RunningTrendsActivity[],
  options: { today: string; weeks?: number; weekStartsOn?: WeekStart },
): RunningTrends {
  const weekCount = options.weeks ?? 12;
  const weekStartsOn = options.weekStartsOn ?? 1;
  const currentWeekStart = startOfWeek(options.today, weekStartsOn);
  const firstWeekStart = addDays(currentWeekStart, -7 * (weekCount - 1));

  const efficiencies: number[][] = Array.from({ length: weekCount }, () => []);
  const weeks: RunningWeek[] = Array.from({ length: weekCount }, (_, i) => ({
    weekStart: addDays(firstWeekStart, i * 7),
    distanceMeters: 0,
    runs: 0,
    longestRunMeters: 0,
    efficiency: null,
  }));

  let totalRuns = 0;
  for (const activity of activities) {
    const meters = activity.distanceMeters;
    if (meters == null || !(meters >= MIN_RUN_METERS)) continue;
    if (!(activity.durationMinutes > 0)) continue;
    if (!isRunningActivity(activity)) continue;

    const offset = daysBetween(firstWeekStart, activity.entryDate.slice(0, 10));
    if (offset < 0) continue;
    const index = Math.floor(offset / 7);
    if (index >= weekCount) continue;

    const week = weeks[index]!;
    week.distanceMeters += meters;
    week.runs += 1;
    week.longestRunMeters = Math.max(week.longestRunMeters, meters);
    totalRuns += 1;

    const hr = activity.avgHeartRate;
    if (
      hr != null &&
      hr >= MIN_PLAUSIBLE_HR &&
      hr <= MAX_PLAUSIBLE_HR &&
      activity.durationMinutes >= MIN_EFFICIENCY_MINUTES
    ) {
      efficiencies[index]!.push(meters / activity.durationMinutes / hr);
    }
  }
  weeks.forEach((week, i) => {
    const values = efficiencies[i]!;
    if (values.length > 0) week.efficiency = mean(values);
  });

  const current = weeks[weekCount - 1]!;
  const previousFour = weeks.slice(Math.max(0, weekCount - 5), weekCount - 1);
  const previousFourWeekAverageMeters =
    previousFour.length > 0
      ? mean(previousFour.map((w) => w.distanceMeters))
      : 0;

  const half = Math.floor(weekCount / 2);
  const earlier = weeks
    .slice(0, half)
    .flatMap((w) => (w.efficiency != null ? [w.efficiency] : []));
  const later = weeks
    .slice(half)
    .flatMap((w) => (w.efficiency != null ? [w.efficiency] : []));
  // A change needs readings in both halves; one or two weeks is noise.
  const efficiencyChangePercent =
    earlier.length >= 2 && later.length >= 2
      ? ((mean(later) - mean(earlier)) / mean(earlier)) * 100
      : null;

  return {
    weeks,
    thisWeekMeters: current.distanceMeters,
    previousFourWeekAverageMeters,
    weekVsAveragePercent:
      previousFourWeekAverageMeters > 0
        ? ((current.distanceMeters - previousFourWeekAverageMeters) /
            previousFourWeekAverageMeters) *
          100
        : null,
    longestRunMeters: Math.max(0, ...weeks.map((w) => w.longestRunMeters)),
    efficiencyChangePercent,
    totalRuns,
  };
}
