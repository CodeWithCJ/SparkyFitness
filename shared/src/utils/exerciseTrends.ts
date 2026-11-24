import {
  isBodyweightModality,
  isPlannedEntryRow,
  resolveExerciseModality,
} from '../constants/exercise.ts';
import type { ExerciseProgressResponse } from '../schemas/api/ExerciseEntries.api.zod.ts';
import { isWarmupSetType } from './dropSetCalculator.ts';
import {
  effectiveLoadKg,
  epleyOneRepMaxKg,
  setVolumeKg,
} from './exerciseLoad.ts';
import { startOfWeek, type WeekStart } from './runningTrends.ts';
import { addDays } from './timezone.ts';

type ProgressSet = ExerciseProgressResponse['sets'][number];

/** What an exercise trend measures per entry, all in kg. */
export type ExerciseTrendMetric = 'estimated1RM' | 'maxLoad' | 'volume';

/** How an exercise trend groups entries along its x axis. */
export type ExerciseTrendPeriod = 'week' | 'month' | 'year';

/** Periods shown for the week and month views; the year view shows them all. */
export const EXERCISE_TREND_PERIOD_COUNT = 12;

/** Where the year view starts reading, so it covers all history. */
export const EXERCISE_TREND_ALL_HISTORY_START = '1970-01-01';

/**
 * The sets of an entry that count toward a trend: none while the entry is only
 * planned (the shared `isPlannedEntryRow`, the rule challenges score by: a
 * prefilled plan row counts once it is started, ticked, finished or edited),
 * otherwise every set with reps and a weight that is not a warm-up (a
 * bodyweight exercise needs no weight: body weight is the load). A response
 * missing `edited` or `session` (both optional in the contract) says nothing
 * about the row, so its sets stay counted.
 */
export function countedTrendSets(
  entry: Pick<
    ExerciseProgressResponse,
    'provider_name' | 'sets' | 'edited' | 'session' | 'modality' | 'category'
  >
): ProgressSet[] {
  const planned =
    entry.edited !== undefined &&
    entry.session !== undefined &&
    isPlannedEntryRow({
      source: entry.provider_name,
      edited: entry.edited,
      sets: entry.sets,
      session: entry.session,
    });
  if (planned) return [];
  const needsWeight = !isBodyweightModality(
    resolveExerciseModality(entry.modality, entry.category)
  );
  return entry.sets.filter(
    (set) =>
      !isWarmupSetType(set.set_type) &&
      (Number(set.reps) || 0) > 0 &&
      (!needsWeight || set.weight != null)
  );
}

function trendValueKg(
  entry: ExerciseProgressResponse,
  sets: readonly ProgressSet[],
  metric: ExerciseTrendMetric
): number {
  const modality = resolveExerciseModality(entry.modality, entry.category);
  if (metric === 'volume') {
    return sets.reduce(
      (sum, set) => sum + setVolumeKg(set, modality, entry.body_weight_kg),
      0
    );
  }
  return sets.reduce((best, set) => {
    const load = effectiveLoadKg(set.weight, modality, entry.body_weight_kg);
    const value =
      metric === 'maxLoad' ? load : epleyOneRepMaxKg(load, set.reps);
    return Math.max(best, value);
  }, 0);
}

/**
 * One entry's value for a trend metric, in kg (volume in kg × reps): the best
 * estimated 1RM of its counted sets, their heaviest load, or their summed
 * load × reps. 0 when no set counts.
 */
export function exerciseTrendEntryValueKg(
  entry: ExerciseProgressResponse,
  metric: ExerciseTrendMetric
): number {
  return trendValueKg(entry, countedTrendSets(entry), metric);
}

/** The first day of the week, month or year holding `day` (YYYY-MM-DD). */
export function exerciseTrendPeriodStart(
  day: string,
  period: ExerciseTrendPeriod,
  weekStartsOn: WeekStart = 1
): string {
  const date = day.slice(0, 10);
  if (period === 'week') return startOfWeek(date, weekStartsOn);
  if (period === 'month') return `${date.slice(0, 7)}-01`;
  return `${date.slice(0, 4)}-01-01`;
}

/**
 * The first day a trend view reads, ending on `today`: the last 12 weeks or
 * the last 12 months, each counting the current one, or all history.
 */
export function exerciseTrendWindowStart(
  today: string,
  period: ExerciseTrendPeriod,
  weekStartsOn: WeekStart = 1
): string {
  if (period === 'year') return EXERCISE_TREND_ALL_HISTORY_START;
  const current = exerciseTrendPeriodStart(today, period, weekStartsOn);
  if (period === 'week') {
    return addDays(current, -7 * (EXERCISE_TREND_PERIOD_COUNT - 1));
  }
  const year = Number(current.slice(0, 4));
  const monthIndex =
    year * 12 + Number(current.slice(5, 7)) - EXERCISE_TREND_PERIOD_COUNT;
  const startYear = Math.floor(monthIndex / 12);
  const startMonth = (monthIndex % 12) + 1;
  return `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
}

export interface ExerciseTrendPoint {
  /** First day of the period (YYYY-MM-DD). */
  periodStart: string;
  /** Best estimated 1RM or heaviest load in the period, or its total volume. */
  valueKg: number;
  /** The highest value so far in the series (the first point counts). */
  isRecord: boolean;
}

/**
 * One point per week, month or year that has a counted set, oldest first.
 * Estimated 1RM and heaviest load keep the period's best entry; volume adds
 * up every entry in the period. Records are judged within the series, so a
 * point is a record when it beats every earlier point shown.
 */
export function buildExerciseTrend(
  entries: readonly ExerciseProgressResponse[],
  options: {
    metric: ExerciseTrendMetric;
    period: ExerciseTrendPeriod;
    weekStartsOn?: WeekStart;
  }
): ExerciseTrendPoint[] {
  const { metric, period, weekStartsOn = 1 } = options;
  const byPeriod = new Map<string, number>();
  for (const entry of entries) {
    const sets = countedTrendSets(entry);
    if (sets.length === 0) continue;
    const key = exerciseTrendPeriodStart(
      entry.entry_date,
      period,
      weekStartsOn
    );
    const value = trendValueKg(entry, sets, metric);
    const previous = byPeriod.get(key);
    byPeriod.set(
      key,
      previous == null
        ? value
        : metric === 'volume'
          ? previous + value
          : Math.max(previous, value)
    );
  }
  let best = -Infinity;
  return [...byPeriod.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([periodStart, valueKg]) => {
      const isRecord = valueKg > best;
      if (isRecord) best = valueKg;
      return { periodStart, valueKg, isRecord };
    });
}

/**
 * Percent change from the first to the last point, rounded to a whole
 * number; null with fewer than two points or a first value of 0.
 */
export function exerciseTrendChangePercent(
  points: readonly ExerciseTrendPoint[]
): number | null {
  if (points.length < 2) return null;
  const first = points[0]!.valueKg;
  const last = points[points.length - 1]!.valueKg;
  if (first <= 0) return null;
  return Math.round(((last - first) / first) * 100);
}
