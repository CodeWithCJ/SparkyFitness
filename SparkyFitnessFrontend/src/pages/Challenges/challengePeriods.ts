import type { TFunction } from 'i18next';
import {
  addDays,
  challengePeriodsUpTo,
  type ChallengePeriod,
  type ChallengeRuleChange,
  type ChallengeRules,
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
 * The rules that score `day`, from the rule log (as the server picks them):
 * the newest change in effect by then, else the earliest one. Falls back to
 * `current` while the log is loading. `upcoming` is a change that has been
 * made but does not count yet.
 */
export function rulesInEffect(
  changes: readonly ChallengeRuleChange[] | undefined,
  day: string,
  current: ChallengeRules
): { rules: ChallengeRules; upcoming: ChallengeRuleChange | null } {
  if (!changes?.length) return { rules: current, upcoming: null };
  // The server lists changes by effective_from, then write order (seq);
  // the sort is stable, so same-day changes keep that order.
  const ordered = [...changes].sort((a, b) =>
    a.effective_from.localeCompare(b.effective_from)
  );
  let chosen = ordered[0] as ChallengeRuleChange;
  let upcoming: ChallengeRuleChange | null = null;
  for (const change of ordered) {
    if (change.effective_from <= day) chosen = change;
    else upcoming = change;
  }
  return { rules: chosen.rules, upcoming };
}
