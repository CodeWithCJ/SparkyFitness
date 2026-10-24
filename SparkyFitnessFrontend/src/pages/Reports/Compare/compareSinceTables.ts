import {
  addDays,
  COMPARE_METRICS,
  compareDays,
  hasActiveDays,
  type CompareSinceResponse,
} from '@workspace/shared';

export interface SinceMonthRow {
  month: string; // 'YYYY-MM'
  isStartMonth: boolean; // holds result.start
  habitDays: number | null; // hasActiveDays(habit): days with a value > 0; else null
  habitTotal: number | null; // the sum of the values, when hasActiveDays(habit) and it is not yes/no; else null
  habitMean: number | null; // the mean value, for any other habit; else null
  outcomeMean: number | null; // stored scale; null with no outcome value
  shareAtOrAbove: number | null; // of the days with an outcome value, the share >= result.line; null for a yes/no outcome or no values
  valueDays: number; // days with an outcome value
}

interface MonthTally {
  habitActive: number;
  habitSum: number;
  habitCount: number;
  outcomeSum: number;
  outcomeCount: number;
  outcomeAtOrAbove: number;
}

/**
 * The since answer month by month, oldest first. Only the days inside the
 * before and since stretches count: the server also returns the days between
 * them (when the start is over a year ago), which belong to neither.
 */
export function sinceMonthRows(
  response: CompareSinceResponse
): SinceMonthRow[] {
  const { result, habit, outcome } = response;
  const { before, since } = result;
  if (!since) return [];

  const stretches = [before && before.days > 0 ? before : null, since].filter(
    (s) => s !== null
  );
  const eventHabit = hasActiveDays(habit.key);
  const yesNoHabit = COMPARE_METRICS[habit.key].kind === 'binary';
  const yesNoOutcome = COMPARE_METRICS[outcome.key].kind === 'binary';

  const tallies = new Map<string, MonthTally>();
  for (const stretch of stretches) {
    for (
      let day = stretch.from;
      compareDays(day, stretch.to) <= 0;
      day = addDays(day, 1)
    ) {
      const month = day.slice(0, 7);
      let t = tallies.get(month);
      if (!t) {
        t = {
          habitActive: 0,
          habitSum: 0,
          habitCount: 0,
          outcomeSum: 0,
          outcomeCount: 0,
          outcomeAtOrAbove: 0,
        };
        tallies.set(month, t);
      }
      const h = habit.values[day];
      if (h !== undefined) {
        t.habitCount++;
        t.habitSum += h;
        if (h > 0) t.habitActive++;
      }
      const o = outcome.values[day];
      if (o !== undefined) {
        t.outcomeCount++;
        t.outcomeSum += o;
        if (o >= result.line) t.outcomeAtOrAbove++;
      }
    }
  }

  const startMonth = result.start?.slice(0, 7) ?? null;
  return [...tallies.keys()].sort().map((month) => {
    const t = tallies.get(month)!;
    return {
      month,
      isStartMonth: month === startMonth,
      habitDays: eventHabit ? t.habitActive : null,
      habitTotal: eventHabit && !yesNoHabit ? t.habitSum : null,
      habitMean:
        !eventHabit && t.habitCount > 0 ? t.habitSum / t.habitCount : null,
      outcomeMean: t.outcomeCount > 0 ? t.outcomeSum / t.outcomeCount : null,
      shareAtOrAbove:
        !yesNoOutcome && t.outcomeCount > 0
          ? t.outcomeAtOrAbove / t.outcomeCount
          : null,
      valueDays: t.outcomeCount,
    };
  });
}
