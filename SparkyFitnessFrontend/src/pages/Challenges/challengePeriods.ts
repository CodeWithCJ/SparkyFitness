import type { TFunction } from 'i18next';
import {
  addDays,
  challengePeriodsUpTo,
  type ChallengePeriod,
  type ChallengePointsRules,
} from '@workspace/shared';

type FormatDay = (day: string, pattern: string) => string;

/** The period's name: "Mon, Nov 9", "Nov 9 – Nov 15", "November 2026". */
export function periodRangeText(
  t: TFunction,
  period: ChallengePeriod,
  start: string,
  end: string,
  formatDay: FormatDay
): string {
  if (period === 'day' || start === end) return formatDay(start, 'EEE, MMM d');
  if (period === 'month' && start.slice(0, 7) === end.slice(0, 7)) {
    return formatDay(start, 'MMMM yyyy');
  }
  return t('challenges.periodRange', '{{start}} – {{end}}', {
    start: formatDay(start, 'MMM d'),
    end: formatDay(end, 'MMM d'),
  });
}

/** A day of the period before the one starting on `start`, or null before the challenge. */
export function previousPeriodDay(
  start: string,
  challengeStart: string
): string | null {
  const day = addDays(start, -1);
  return day < challengeStart ? null : day;
}

/** A day of the period after the one ending on `end`, or null past the end or today. */
export function nextPeriodDay(
  end: string,
  challengeEnd: string | null,
  today: string
): string | null {
  const day = addDays(end, 1);
  if (challengeEnd && day > challengeEnd) return null;
  if (day > today) return null;
  return day;
}

/**
 * The start day of each of the last `count` periods up to the one holding
 * `upTo`, newest first. Used to read a member's recent periods, one
 * standings request per period.
 */
export function recentPeriodStarts(
  period: ChallengePeriod,
  challengeStart: string,
  challengeEnd: string | null,
  upTo: string,
  count: number
): string[] {
  if (upTo < challengeStart) return [];
  return challengePeriodsUpTo(period, challengeStart, challengeEnd, upTo)
    .slice(-count)
    .map((w) => w.start)
    .reverse();
}

/**
 * The points builder without its weekly goal on a daily period, which the
 * shared rules refuse (the goal would pay only on the days it lands on).
 */
export function pointsWithoutDailyGoal(
  points: ChallengePointsRules | null,
  period: ChallengePeriod
): ChallengePointsRules | null {
  return points && period === 'day' && points.goal
    ? { ...points, goal: null }
    : points;
}
