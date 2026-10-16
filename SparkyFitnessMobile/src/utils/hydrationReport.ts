import { weekdayOfDay } from './dateUtils';
import { average } from './mathUtils';

export interface HydrationDay {
  day: string;
  milliliters: number;
}

export interface HydrationInsights {
  /** Days with any water logged. A day with none is a skipped log, not a dry day. */
  loggedDays: number;
  /** Mean millilitres over logged days; null when none were logged. */
  averageMl: number | null;
  previousAverageMl: number | null;
  totalMl: number;
  /** Days that reached their goal, out of the logged days that had one. */
  daysWithGoal: number;
  goalsMet: number;
  /** Mean of (intake / goal) over those days, as a whole percent. */
  averageGoalPct: number | null;
  bestDay: HydrationDay | null;
  lowestDay: HydrationDay | null;
  /** Run of goal-meeting days ending the window; an empty final day does not break it. */
  goalStreak: number;
  longestGoalStreak: number;
  /** Mean millilitres per weekday (0 = Sunday), only weekdays with a logged day. */
  weekdayAverages: { weekday: number; averageMl: number }[];
}

const isLogged = (point: HydrationDay) => point.milliliters > 0;

/**
 * Everything the Hydration report shows beyond the chart. `goals` is indexed by the
 * position of each day in `current`; days with no logged water are left out of every
 * average, the same rule the Nutrition report uses.
 */
export function buildHydrationInsights(
  current: HydrationDay[],
  previous: HydrationDay[],
  goals: (number | null)[]
): HydrationInsights {
  const logged = current.filter(isLogged);
  const previousLogged = previous.filter(isLogged);

  let daysWithGoal = 0;
  let goalsMet = 0;
  const ratios: number[] = [];
  const metFlags: boolean[] = [];
  current.forEach((point, index) => {
    const goal = goals[index];
    const hasGoal = goal != null && goal > 0;
    const met = hasGoal && point.milliliters >= goal;
    metFlags.push(met);
    if (!hasGoal || !isLogged(point)) return;
    daysWithGoal += 1;
    if (met) goalsMet += 1;
    ratios.push(point.milliliters / goal);
  });

  let longestGoalStreak = 0;
  let run = 0;
  for (const met of metFlags) {
    run = met ? run + 1 : 0;
    longestGoalStreak = Math.max(longestGoalStreak, run);
  }
  let end = metFlags.length - 1;
  if (end >= 0 && !metFlags[end]) end -= 1;
  let goalStreak = 0;
  for (let i = end; i >= 0 && metFlags[i]; i -= 1) goalStreak += 1;

  const buckets = new Map<number, number[]>();
  for (const point of logged) {
    const weekday = weekdayOfDay(point.day);
    buckets.set(weekday, [...(buckets.get(weekday) ?? []), point.milliliters]);
  }

  const sorted = [...logged].sort((a, b) => a.milliliters - b.milliliters);
  const meanRatio = average(ratios);

  return {
    loggedDays: logged.length,
    averageMl: average(logged.map((p) => p.milliliters)),
    previousAverageMl: average(previousLogged.map((p) => p.milliliters)),
    totalMl: logged.reduce((sum, p) => sum + p.milliliters, 0),
    daysWithGoal,
    goalsMet,
    averageGoalPct: meanRatio === null ? null : Math.round(meanRatio * 100),
    bestDay: sorted[sorted.length - 1] ?? null,
    lowestDay: sorted.length > 1 ? sorted[0] : null,
    goalStreak,
    longestGoalStreak,
    weekdayAverages: [...buckets.entries()]
      .sort(([a], [b]) => a - b)
      .map(([weekday, values]) => ({
        weekday,
        averageMl: average(values) ?? 0,
      })),
  };
}
