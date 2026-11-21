import type { TFunction } from 'i18next';
import {
  challengeLeaders,
  challengeState,
  challengeToday,
  leadsChallenge,
  localDateTimeToUtc,
  ownChallengeStanding,
  type ChallengeFormat,
  type ChallengeMetric,
  type ChallengePeriod,
  type ChallengeRules,
  type ChallengeState,
  type ChallengeStandingsResponse,
  type ChallengeSummary,
  type EnergyUnit,
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

/** The hour (challenge time) of the "who leads this week" notification on a week's last day. */
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

/**
 * The challenge's state with its days to go (`challengeDaysToGo`): "Starts in
 * 5 days", "10 days left", "Last day", "Active" without an end date, "Ended".
 * A count of 1 has its own words, since some languages use the `_one` plural
 * for 21, 31 and so on too.
 */
export function challengeStateText(
  state: ChallengeState,
  daysToGo: number | null,
  t: TFunction
): string {
  if (state === 'ended') {
    return t('challenges.state.ended', { defaultValue: 'Ended' });
  }
  if (state === 'upcoming') {
    return daysToGo === 1
      ? t('challenges.state.startsTomorrow', {
          defaultValue: 'Starts tomorrow',
        })
      : t('challenges.state.startsIn', {
          defaultValue_one: 'Starts in {{count}} day',
          defaultValue_other: 'Starts in {{count}} days',
          defaultValue: 'Starts in {{count}} days',
          count: daysToGo ?? 0,
        });
  }
  if (daysToGo === null) {
    return t('challenges.state.active', { defaultValue: 'Active' });
  }
  return daysToGo === 1
    ? t('challenges.state.lastDay', { defaultValue: 'Last day' })
    : t('challenges.state.daysLeft', {
        defaultValue_one: '{{count}} day left',
        defaultValue_other: '{{count}} days left',
        defaultValue: '{{count}} days left',
        count: daysToGo,
      });
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

/** A trophy belongs to a final period's winners only. */
export function showsTrophy(
  standings: Pick<ChallengeStandingsResponse, 'final'>,
  row: StandingRow
): boolean {
  return standings.final && row.winner;
}

/**
 * When the week's "who leads" notification fires: 8 PM on the last day of a
 * weekly period (Sunday, or the challenge's end day when it ends mid-week),
 * in the challenge's time zone, where its week closes at midnight. Null for
 * other periods, a frozen week or a time already past.
 */
export function weekLeaderNotificationDate(
  challenge: Pick<ChallengeSummary, 'time_zone'> & {
    rules: Pick<ChallengeRules, 'period'>;
  },
  standings: Pick<ChallengeStandingsResponse, 'period_end' | 'final'>,
  now: Date
): Date | null {
  if (challenge.rules.period !== 'week' || standings.final) return null;
  const hour = String(WEEK_LEADER_NOTIFICATION_HOUR).padStart(2, '0');
  const local = `${standings.period_end}T${hour}:00`;
  let fireAt: Date;
  try {
    fireAt = localDateTimeToUtc(local, challenge.time_zone);
  } catch {
    // A zone this device's Intl data does not know: device time instead.
    fireAt = new Date(local);
  }
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
  now: Date
): ChallengeWeekNotice[] {
  const notices: ChallengeWeekNotice[] = [];
  for (const challenge of challenges) {
    if (
      challengeState(challenge, challengeToday(challenge.time_zone, now)) !==
      'running'
    )
      continue;
    const standings = standingsById.get(challenge.id);
    if (!standings) continue;
    const fireAt = weekLeaderNotificationDate(challenge, standings, now);
    const leader = challengeLeaders(standings.rows)[0] ?? null;
    if (!fireAt || !leader) continue;
    // In the units of the rules that score this week, sent with its standings
    const metric = standings.rules.metric;
    const own = ownChallengeStanding(standings.rows);
    const leaderIsMe = leadsChallenge(own);
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
