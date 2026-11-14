import type { TFunction } from 'i18next';
import type {
  ChallengeFormat,
  ChallengeMetric,
  ChallengePeriod,
  ChallengeRules,
  ChallengeStandingsResponse,
  ChallengeSummary,
  EnergyUnit,
} from '@workspace/shared';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import { formatEnergy } from './energyUnit';

type StandingRow = ChallengeStandingsResponse['rows'][number];

export type ChallengeDistanceUnit = 'km' | 'miles';

export interface ChallengeUnits {
  distanceUnit: ChallengeDistanceUnit;
  energyUnit: EnergyUnit;
}

/** `data.kind` of the week notification, for the tap handler and cancelling. */
export const CHALLENGE_WEEK_LEADER_KIND = 'challenge-week-leader';

/** The hour (device time) of the "who leads this week" notification on a week's last day. */
export const WEEK_LEADER_NOTIFICATION_HOUR = 20;

const METRES_PER_MILE = 1609.344;
const FEET_PER_METRE = 3.28084;

export function challengeMetricLabel(
  metric: ChallengeMetric,
  t: TFunction
): string {
  switch (metric) {
    case 'points':
      return t('challenges.metric.points', { defaultValue: 'Points' });
    case 'steps':
      return t('challenges.metric.steps', { defaultValue: 'Steps' });
    case 'active_minutes':
      return t('challenges.metric.activeMinutes', {
        defaultValue: 'Active minutes',
      });
    case 'hr_zone_minutes':
      return t('challenges.metric.hrZoneMinutes', {
        defaultValue: 'Heart-rate zone minutes',
      });
    case 'distance':
      return t('challenges.metric.distance', { defaultValue: 'Distance' });
    case 'workout_days':
      return t('challenges.metric.workoutDays', {
        defaultValue: 'Workout days',
      });
    case 'active_calories':
      return t('challenges.metric.activeCalories', {
        defaultValue: 'Active calories',
      });
    case 'elevation':
      return t('challenges.metric.elevation', { defaultValue: 'Elevation' });
  }
}

export function challengeFormatLabel(
  format: ChallengeFormat,
  t: TFunction
): string {
  switch (format) {
    case 'leaderboard':
      return t('challenges.format.leaderboard', {
        defaultValue: 'Leaderboard',
      });
    case 'race':
      return t('challenges.format.race', { defaultValue: 'Race to a target' });
    case 'hit_goal':
      return t('challenges.format.hitGoal', { defaultValue: 'Hit the goal' });
    case 'group_goal':
      return t('challenges.format.groupGoal', { defaultValue: 'Group goal' });
  }
}

export function challengePeriodLabel(
  period: ChallengePeriod,
  t: TFunction
): string {
  switch (period) {
    case 'day':
      return t('challenges.period.day', { defaultValue: 'Daily' });
    case 'week':
      return t('challenges.period.week', { defaultValue: 'Weekly' });
    case 'month':
      return t('challenges.period.month', { defaultValue: 'Monthly' });
    case 'challenge':
      return t('challenges.period.challenge', {
        defaultValue: 'Whole challenge',
      });
  }
}

/** Short weekday names of the counted days, or null when every day counts. */
export function challengeDaysLabel(
  days: readonly number[],
  locale: string = getAppLocale()
): string | null {
  if (days.length >= 7) return null;
  // 2024-01-01 was a Monday, so ISO weekday n is 2024-01-0n.
  return [...days]
    .sort((a, b) => a - b)
    .map((day) =>
      new Date(2024, 0, day).toLocaleDateString(locale, { weekday: 'short' })
    )
    .join(', ');
}

/** "Points · Weekly · Leaderboard", plus the counted days when not all. */
export function challengeRulesSummary(
  rules: ChallengeRules,
  t: TFunction,
  locale?: string
): string {
  const parts = [
    challengeMetricLabel(rules.metric, t),
    challengePeriodLabel(rules.period, t),
    challengeFormatLabel(rules.format, t),
  ];
  const days = challengeDaysLabel(rules.days, locale);
  if (days) parts.push(days);
  return parts.join(' · ');
}

/** A standing total in its metric's unit, using the account's distance and energy units. */
export function formatChallengeValue(
  value: number,
  metric: ChallengeMetric,
  units: ChallengeUnits,
  t: TFunction
): string {
  const whole = (n: number) =>
    formatLocalizedNumber(Math.round(n), { maximumFractionDigits: 0 });
  switch (metric) {
    case 'points':
      return t('challenges.value.points', {
        defaultValue: '{{value}} pts',
        value: formatLocalizedNumber(Math.round(value * 10) / 10, {
          maximumFractionDigits: 1,
        }),
      });
    case 'steps':
      return t('challenges.value.steps', {
        defaultValue: '{{value}} steps',
        value: whole(value),
      });
    case 'active_minutes':
    case 'hr_zone_minutes':
      return t('challenges.value.minutes', {
        defaultValue: '{{value}} min',
        value: whole(value),
      });
    case 'distance': {
      const miles = units.distanceUnit === 'miles';
      const amount = formatLocalizedNumber(
        value / (miles ? METRES_PER_MILE : 1000),
        { maximumFractionDigits: 1, minimumFractionDigits: 1 }
      );
      return miles
        ? t('challenges.value.miles', {
            defaultValue: '{{value}} mi',
            value: amount,
          })
        : t('challenges.value.km', {
            defaultValue: '{{value}} km',
            value: amount,
          });
    }
    case 'workout_days':
      return t('challenges.value.workoutDays', {
        defaultValue_one: '{{count}} day',
        defaultValue_other: '{{count}} days',
        defaultValue: '{{count}} days',
        count: Math.round(value),
      });
    case 'active_calories':
      return formatEnergy(value, units.energyUnit, t);
    case 'elevation':
      return units.distanceUnit === 'miles'
        ? t('challenges.value.feet', {
            defaultValue: '{{value}} ft',
            value: whole(value * FEET_PER_METRE),
          })
        : t('challenges.value.metres', {
            defaultValue: '{{value}} m',
            value: whole(value),
          });
  }
}

export type ChallengeState = 'upcoming' | 'running' | 'ended';

export function challengeState(
  challenge: Pick<ChallengeSummary, 'start_date' | 'end_date' | 'ended_at'>,
  today: string
): ChallengeState {
  if (challenge.ended_at) return 'ended';
  if (challenge.end_date && today > challenge.end_date) return 'ended';
  if (today < challenge.start_date) return 'upcoming';
  return 'running';
}

/** Running first, then upcoming, then ended; newest start first within each. */
export function sortChallenges<
  T extends Pick<ChallengeSummary, 'start_date' | 'end_date' | 'ended_at'>,
>(challenges: readonly T[], today: string): T[] {
  const order: Record<ChallengeState, number> = {
    running: 0,
    upcoming: 1,
    ended: 2,
  };
  return [...challenges].sort(
    (a, b) =>
      order[challengeState(a, today)] - order[challengeState(b, today)] ||
      b.start_date.localeCompare(a.start_date)
  );
}

const INVITE_CODE_RE = /[A-Za-z0-9_-]{22}/g;

/**
 * The invite code in what was typed or pasted: the bare code, or a link or
 * message that carries it. Codes are 22 base64url characters; the last match
 * wins so a link's own path never shadows the code at its end.
 */
export function parseInviteCode(text: string): string | null {
  const matches = text.trim().match(INVITE_CODE_RE);
  return matches?.[matches.length - 1] ?? null;
}

/** The signed-in user's row, which the server marks with `me`. */
export function ownStanding(rows: readonly StandingRow[]): StandingRow | null {
  return rows.find((row) => row.me === true) ?? null;
}

/**
 * Who leads a period: the first rank-1 row with something on the board, else
 * nobody. Several rows can share rank 1 (racers who finished the same day).
 * This is the leader, not the winner: `winner` is only set once the period is
 * final.
 */
export function standingsLeader(
  rows: readonly StandingRow[]
): StandingRow | null {
  const leader = rows.find((row) => row.rank === 1);
  return leader && leader.total > 0 ? leader : null;
}

/** Whether the user shares or holds first place. */
export function isLeading(own: StandingRow | null): boolean {
  return own !== null && own.rank === 1 && own.total > 0;
}

/** A trophy belongs to a final period's winners only. */
export function showsTrophy(
  standings: Pick<ChallengeStandingsResponse, 'final'>,
  row: StandingRow
): boolean {
  return standings.final && row.winner;
}

/**
 * When the week's "who leads" notification fires: 8 PM device time on
 * the last day of a weekly period (Sunday, or the challenge's end day when it
 * ends mid-week). Null for other periods, a frozen week or a time already past.
 */
export function weekLeaderNotificationDate(
  rules: Pick<ChallengeRules, 'period'>,
  standings: Pick<ChallengeStandingsResponse, 'period_end' | 'final'>,
  now: Date
): Date | null {
  if (rules.period !== 'week' || standings.final) return null;
  const [year, month, day] = standings.period_end.split('-').map(Number);
  const fireAt = new Date(
    year,
    month - 1,
    day,
    WEEK_LEADER_NOTIFICATION_HOUR,
    0,
    0
  );
  return fireAt.getTime() > now.getTime() ? fireAt : null;
}

/** One weekly challenge's "who leads" notification, already formatted. */
export interface ChallengeWeekNotice {
  challengeId: string;
  /** With the challenge's emoji in front when it has one. */
  challengeName: string;
  fireAt: Date;
  leaderName: string;
  /** The leader's total with its unit, e.g. "412 pts". */
  leaderTotal: string;
  leaderIsMe: boolean;
  /** The user's own place, when they are not the leader. */
  own: { rank: number; total: string } | null;
}

/**
 * The week notifications to schedule: one per running weekly challenge whose
 * week has a leader and whose evening is still ahead. Standings come from the
 * last time the app loaded them, so the text says who leads, not who won.
 */
export function buildChallengeWeekNotices(
  challenges: readonly ChallengeSummary[],
  standingsById: ReadonlyMap<string, ChallengeStandingsResponse>,
  units: ChallengeUnits,
  t: TFunction,
  now: Date,
  today: string
): ChallengeWeekNotice[] {
  const notices: ChallengeWeekNotice[] = [];
  for (const challenge of challenges) {
    if (challengeState(challenge, today) !== 'running') continue;
    const standings = standingsById.get(challenge.id);
    if (!standings) continue;
    const fireAt = weekLeaderNotificationDate(challenge.rules, standings, now);
    const leader = standingsLeader(standings.rows);
    if (!fireAt || !leader) continue;
    const metric = challenge.rules.metric;
    const own = ownStanding(standings.rows);
    const leaderIsMe = isLeading(own);
    notices.push({
      challengeId: challenge.id,
      challengeName: challenge.emoji
        ? `${challenge.emoji} ${challenge.name}`
        : challenge.name,
      fireAt,
      leaderName: leader.display_name,
      leaderTotal: formatChallengeValue(leader.total, metric, units, t),
      leaderIsMe,
      own:
        own && !leaderIsMe
          ? {
              rank: own.rank,
              total: formatChallengeValue(own.total, metric, units, t),
            }
          : null,
    });
  }
  return notices;
}
