import type { CoachBecause } from './rules.ts';
import type { CoachSignalSnapshot } from './signals.ts';

export type DailyOutlookVerdict = 'push' | 'normal' | 'easy';

/** Sleep this far under your usual, or a load this far over your average, is
 * a day to ease off. */
export const OUTLOOK_EASY_SLEEP_MINUTES = -90;
export const OUTLOOK_EASY_LOAD_RATIO = 1.5;
export const OUTLOOK_PUSH_LOAD_RATIO = 0.8;
export const OUTLOOK_PUSH_MIN_SLEEP_MINUTES = -30;

/**
 * The morning outlook, worked out from numbers and not by the AI: the AI only
 * words it. Null when neither sleep nor training load is known.
 */
export function dailyOutlook(
  signals: CoachSignalSnapshot
): { verdict: DailyOutlookVerdict; because: CoachBecause[] } | null {
  const sleep =
    typeof signals.sleep_minutes_vs_avg === 'number'
      ? signals.sleep_minutes_vs_avg
      : null;
  const load =
    typeof signals.training_load_ratio === 'number'
      ? signals.training_load_ratio
      : null;
  if (sleep === null && load === null) return null;

  const because: CoachBecause[] = [];
  if (sleep !== null) {
    because.push({
      signal: 'sleep_minutes_vs_avg',
      value: sleep,
      op: sleep <= OUTLOOK_EASY_SLEEP_MINUTES ? 'lte' : 'gt',
      threshold: OUTLOOK_EASY_SLEEP_MINUTES,
    });
  }
  if (load !== null) {
    because.push({
      signal: 'training_load_ratio',
      value: load,
      op: load > OUTLOOK_EASY_LOAD_RATIO ? 'gt' : 'lte',
      threshold: OUTLOOK_EASY_LOAD_RATIO,
    });
  }

  const easy =
    (sleep !== null && sleep <= OUTLOOK_EASY_SLEEP_MINUTES) ||
    (load !== null && load > OUTLOOK_EASY_LOAD_RATIO);
  if (easy) return { verdict: 'easy', because };

  const rested = sleep === null || sleep >= OUTLOOK_PUSH_MIN_SLEEP_MINUTES;
  if (load !== null && load < OUTLOOK_PUSH_LOAD_RATIO && rested) {
    return { verdict: 'push', because };
  }
  return { verdict: 'normal', because };
}
