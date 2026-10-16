import type { NutritionTrendPoint } from '../services/api/reportsApi';
import type { DailyGoals } from '../types/goals';
import { addDays } from './dateUtils';
import { average } from './mathUtils';

/** The daily caffeine ceiling health agencies commonly give for adults, used when there is no goal. */
export const CAFFEINE_DAILY_LIMIT_MG = 400;

export interface SubstanceDay {
  day: string;
  caffeineMg: number;
  alcoholG: number;
  /** Whether anything at all was logged that day, so an empty day is not read as alcohol-free. */
  logged: boolean;
  /** That day's caffeine ceiling: its goal when set, otherwise the default. */
  limitMg: number;
}

export interface SubstanceWeek {
  startDate: string;
  endDate: string;
  alcoholG: number;
  caffeineAvgMg: number | null;
}

export interface SubstancesReport {
  days: SubstanceDay[];
  caffeine: {
    /** Mean mg over days with any caffeine; null when there were none. */
    averageMg: number | null;
    previousAverageMg: number | null;
    daysWithCaffeine: number;
    /** Days above that day's own limit (its goal when set, else `CAFFEINE_DAILY_LIMIT_MG`). */
    daysOverLimit: number;
    /** The only limit when every day shares one, otherwise the most common (later days win a tie). */
    limitMg: number;
    /** True when the days were not all held to `limitMg`. */
    limitVaries: boolean;
    peak: { day: string; mg: number } | null;
  };
  alcohol: {
    totalG: number;
    previousTotalG: number;
    /** Mean grams over days with alcohol. */
    averagePerDrinkingDayG: number | null;
    drinkingDays: number;
    /** Days anything was logged, the base the alcohol-free count is out of. */
    loggedDays: number;
    /** Logged days with no alcohol. */
    alcoholFreeDays: number;
    peak: { day: string; g: number } | null;
  };
  /** Newest first, in blocks of seven days counted back from the end of the window. */
  weeks: SubstanceWeek[];
}

const num = (point: NutritionTrendPoint, key: string): number => {
  const raw = point[key];
  const value = typeof raw === 'number' ? raw : parseFloat(String(raw));
  return Number.isFinite(value) ? value : 0;
};

const toDays = (
  points: NutritionTrendPoint[]
): Omit<SubstanceDay, 'limitMg'>[] =>
  points.map((point) => ({
    day: point.date,
    caffeineMg: num(point, 'caffeine_mg'),
    alcoholG: num(point, 'alcohol_g'),
    logged: num(point, 'calories') > 0 || num(point, 'water_ml') > 0,
  }));

const peakOf = <K extends 'caffeineMg' | 'alcoholG'>(
  days: SubstanceDay[],
  key: K
) => {
  const withAny = days.filter((d) => d[key] > 0);
  if (withAny.length === 0) return null;
  return withAny.reduce((best, d) => (d[key] > best[key] ? d : best));
};

/**
 * Caffeine and alcohol over a window from the same daily nutrition totals the Nutrition
 * report reads. `goals` is indexed like `current`; a day's caffeine goal replaces the
 * default ceiling when it has one.
 */
export function buildSubstancesReport(
  current: NutritionTrendPoint[],
  previous: NutritionTrendPoint[],
  goals: (DailyGoals | null | undefined)[]
): SubstancesReport {
  const days = toDays(current).map((day, index) => {
    const goal = goals[index]?.caffeine_mg;
    return {
      ...day,
      limitMg: goal != null && goal > 0 ? goal : CAFFEINE_DAILY_LIMIT_MG,
    };
  });
  const previousDays = toDays(previous);

  const caffeineDays = days.filter((d) => d.caffeineMg > 0);
  const previousCaffeine = previousDays.filter((d) => d.caffeineMg > 0);
  const drinkingDays = days.filter((d) => d.alcoholG > 0);

  const limits = days.map((d) => d.limitMg);
  const daysOverLimit = days.filter((d) => d.caffeineMg > d.limitMg).length;
  const limitCounts = new Map<number, number>();
  for (const limit of limits) {
    limitCounts.set(limit, (limitCounts.get(limit) ?? 0) + 1);
  }
  let limitMg = CAFFEINE_DAILY_LIMIT_MG;
  let bestCount = -1;
  for (const limit of limits) {
    const count = limitCounts.get(limit) ?? 0;
    if (count >= bestCount) {
      bestCount = count;
      limitMg = limit;
    }
  }
  const limitVaries = limitCounts.size > 1;

  const weeks: SubstanceWeek[] = [];
  for (let end = days.length; end > 0; end -= 7) {
    const slice = days.slice(Math.max(0, end - 7), end);
    const withCaffeine = slice.filter((d) => d.caffeineMg > 0);
    weeks.push({
      startDate: slice[0].day,
      endDate: slice[slice.length - 1].day,
      alcoholG: slice.reduce((sum, d) => sum + d.alcoholG, 0),
      caffeineAvgMg: average(withCaffeine.map((d) => d.caffeineMg)),
    });
  }

  const caffeinePeak = peakOf(days, 'caffeineMg');
  const alcoholPeak = peakOf(days, 'alcoholG');

  return {
    days,
    caffeine: {
      averageMg: average(caffeineDays.map((d) => d.caffeineMg)),
      previousAverageMg: average(previousCaffeine.map((d) => d.caffeineMg)),
      daysWithCaffeine: caffeineDays.length,
      daysOverLimit,
      limitMg,
      limitVaries,
      peak: caffeinePeak
        ? { day: caffeinePeak.day, mg: caffeinePeak.caffeineMg }
        : null,
    },
    alcohol: {
      totalG: days.reduce((sum, d) => sum + d.alcoholG, 0),
      previousTotalG: previousDays.reduce((sum, d) => sum + d.alcoholG, 0),
      averagePerDrinkingDayG: average(drinkingDays.map((d) => d.alcoholG)),
      drinkingDays: drinkingDays.length,
      loggedDays: days.filter((d) => d.logged).length,
      alcoholFreeDays: days.filter((d) => d.logged && d.alcoholG === 0).length,
      peak: alcoholPeak
        ? { day: alcoholPeak.day, g: alcoholPeak.alcoholG }
        : null,
    },
    weeks,
  };
}

/** A zero-filled series covering `days` days from `startDate`, in the shape the report builds from. */
export function padSubstancePoints(
  points: NutritionTrendPoint[],
  startDate: string,
  days: number
): NutritionTrendPoint[] {
  const byDay = new Map(points.map((p) => [p.date, p]));
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(startDate, i);
    return (
      byDay.get(day) ??
      ({
        date: day,
        calories: 0,
        caffeine_mg: 0,
        alcohol_g: 0,
      } as NutritionTrendPoint)
    );
  });
}
