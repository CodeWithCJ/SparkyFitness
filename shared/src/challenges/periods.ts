import { addDays, dayOfWeek } from '../utils/timezone.ts';
import { weekStartOf } from '../utils/trainingConsistency.ts';
import type { ChallengePeriod } from './rules.ts';

/** ISO weekday of a YYYY-MM-DD day: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(day: string): number {
  const dow = dayOfWeek(day);
  return dow === 0 ? 7 : dow;
}

function monthEnd(day: string): string {
  const [y, m] = day.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${day.slice(0, 8)}${String(last).padStart(2, '0')}`;
}

export interface ChallengeWindow {
  start: string;
  end: string;
}

/**
 * The period of a challenge that contains `day`, clipped to the challenge's
 * own dates. A `challenge` period is the whole challenge, so it needs an end
 * date (the server refuses one without).
 */
export function challengePeriodWindow(
  period: ChallengePeriod,
  day: string,
  challengeStart: string,
  challengeEnd: string | null
): ChallengeWindow {
  let start: string;
  let end: string;
  if (period === 'day') {
    start = day;
    end = day;
  } else if (period === 'week') {
    // Challenge weeks always run Monday to Sunday
    start = weekStartOf(day, 1);
    end = addDays(start, 6);
  } else if (period === 'month') {
    start = `${day.slice(0, 8)}01`;
    end = monthEnd(day);
  } else {
    start = challengeStart;
    end = challengeEnd ?? '9999-12-31';
  }
  if (start < challengeStart) start = challengeStart;
  if (challengeEnd && end > challengeEnd) end = challengeEnd;
  return { start, end };
}

/** Every period window of a challenge that has started on or before `upTo`. */
export function challengePeriodsUpTo(
  period: ChallengePeriod,
  challengeStart: string,
  challengeEnd: string | null,
  upTo: string
): ChallengeWindow[] {
  const out: ChallengeWindow[] = [];
  const last = challengeEnd && challengeEnd < upTo ? challengeEnd : upTo;
  for (let day = challengeStart; day <= last;) {
    const w = challengePeriodWindow(period, day, challengeStart, challengeEnd);
    out.push(w);
    if (w.end >= '9999-12-31') break;
    day = addDays(w.end, 1);
  }
  return out;
}

/**
 * The first day a rules change can take effect once a challenge has started:
 * the start of the next period (the next day for a daily challenge), so a
 * running period is never scored by rules changed part-way through it.
 * Before the start, a change applies from the start.
 */
export function challengeRulesEffectiveFrom(
  period: ChallengePeriod,
  today: string,
  challengeStart: string,
  challengeEnd: string | null
): string {
  if (today < challengeStart) return challengeStart;
  const current = challengePeriodWindow(
    period,
    today,
    challengeStart,
    challengeEnd
  );
  return addDays(current.end, 1);
}
