import { addDays } from './timezone.ts';

/**
 * Consecutive logged days ending today. The streak may start from yesterday
 * when nothing is logged today yet. `daysNewestFirst` has no duplicate days.
 */
export function loggingStreak(
  daysNewestFirst: readonly string[],
  today: string
): number {
  const first = daysNewestFirst[0];
  if (first === undefined) return 0;
  if (first !== today && first !== addDays(today, -1)) return 0;
  let streak = 1;
  for (
    let i = 1;
    i < daysNewestFirst.length && daysNewestFirst[i] === addDays(first, -i);
    i++
  ) {
    streak++;
  }
  return streak;
}
