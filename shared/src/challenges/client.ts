import { challengeInviteCodeSchema } from '../schemas/api/Challenges.api.zod.ts';
import type { ChallengeMetric, ChallengeRules } from './rules.ts';
import { addDays, daysBetween, instantToDay } from '../utils/timezone.ts';
import { energyFromKcal, type EnergyUnit } from '../utils/energyUnit.ts';

/**
 * Challenge helpers both apps use on what the server sends: whether a
 * challenge is upcoming, running or ended, the caller's own
 * standing, who leads a period, the invite code in pasted text, today in a
 * challenge's time zone, totals in the account's units and stepping between
 * periods. Keep web and mobile on these so they cannot drift.
 */

type StandingFields = { rank: number; total: number; me?: boolean };

/** The caller's own row, which the server marks with `me`; null when absent. */
export function ownChallengeStanding<Row extends StandingFields>(
  rows: readonly Row[]
): Row | null {
  return rows.find((row) => row.me === true) ?? null;
}

/**
 * Whether a row leads its period: rank 1 with something on the board. Rows
 * tied on 0 all get rank 1 on the first day of a period, and none of them
 * leads. This is the leader, not the winner: `winner` is set only once the
 * period is final.
 */
export function leadsChallenge(row: StandingFields | null): boolean {
  return row !== null && row.rank === 1 && row.total > 0;
}

/** Everyone who leads the period (racers who finish the same day share it). */
export function challengeLeaders<Row extends StandingFields>(
  rows: readonly Row[]
): Row[] {
  return rows.filter((row) => leadsChallenge(row));
}

const CODE_PARAM_RE = /[?&#]code=([^&#\s]+)/;
// A whole 22-character base64url token, not part of a longer one.
const CODE_TOKEN_RE = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])/g;

/**
 * The invite code in what was typed or pasted: a bare code, an invite link
 * (a `code=` parameter, or the code after `#`) or a message that carries one
 * (the last whole 22-character token, so a link's own path never shadows the
 * code at its end). Null when there is none.
 */
export function parseChallengeInviteCode(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const candidates: string[] = [];
  const param = CODE_PARAM_RE.exec(trimmed);
  if (param?.[1]) {
    try {
      candidates.push(decodeURIComponent(param[1]));
    } catch {
      // Bad percent-encoding: not a code.
    }
  }
  candidates.push(trimmed);
  const hash = trimmed.lastIndexOf('#');
  if (hash >= 0) candidates.push(trimmed.slice(hash + 1));
  const tokens = trimmed.match(CODE_TOKEN_RE);
  if (tokens) candidates.push(tokens[tokens.length - 1]!);
  for (const candidate of candidates) {
    const parsed = challengeInviteCodeSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/**
 * Today in a challenge's time zone (as the server counts its days). A zone
 * this runtime's Intl data does not know (the server's list can be newer)
 * falls back to the device's own day rather than throwing.
 */
export function challengeToday(
  timeZone: string,
  now: Date = new Date()
): string {
  try {
    return instantToDay(now, timeZone);
  } catch {
    return instantToDay(now, Intl.DateTimeFormat().resolvedOptions().timeZone);
  }
}

export type ChallengeState = 'upcoming' | 'running' | 'ended';

type StateFields = {
  start_date: string;
  end_date: string | null;
  ended_at: string | null;
};

/**
 * Where a challenge stands on `today` (a day in its own time zone): ended once
 * the server has closed it or today is past its end date (the server closes it
 * up to two days later), upcoming before its start, running otherwise.
 */
export function challengeState(
  challenge: StateFields,
  today: string
): ChallengeState {
  if (challenge.ended_at) return 'ended';
  if (challenge.end_date && today > challenge.end_date) return 'ended';
  if (today < challenge.start_date) return 'upcoming';
  return 'running';
}

/** `challengeState` on today in the challenge's own time zone. */
export function challengeStateNow(
  challenge: StateFields & { time_zone: string },
  now: Date = new Date()
): ChallengeState {
  return challengeState(challenge, challengeToday(challenge.time_zone, now));
}

const STATE_ORDER: Record<ChallengeState, number> = {
  running: 0,
  upcoming: 1,
  ended: 2,
};

/**
 * Running first, then upcoming, then ended; newest start first within each.
 * `today` is one day for all, or each challenge's own today (its time zone).
 */
export function sortChallenges<T extends StateFields>(
  challenges: readonly T[],
  today: string | ((challenge: T) => string)
): T[] {
  const rank = new Map(
    challenges.map((c) => [
      c,
      STATE_ORDER[
        challengeState(c, typeof today === 'string' ? today : today(c))
      ],
    ])
  );
  return [...challenges].sort(
    (a, b) =>
      rank.get(a)! - rank.get(b)! || b.start_date.localeCompare(a.start_date)
  );
}

/**
 * The challenges a dashboard card shows: those not ended (each judged on today
 * in its own time zone), running before upcoming, newest start first, at most
 * `limit`.
 */
export function challengesForCard<
  T extends StateFields & { time_zone: string },
>(challenges: readonly T[], limit: number, now: Date = new Date()): T[] {
  const today = (c: T) => challengeToday(c.time_zone, now);
  return sortChallenges(challenges, today)
    .filter((c) => challengeState(c, today(c)) !== 'ended')
    .slice(0, limit);
}

/**
 * Days to go on a challenge: until it starts while upcoming, left including
 * today while running (a challenge ending today has 1), null once ended or
 * while it has no end date.
 */
export function challengeDaysToGo(
  challenge: StateFields & { time_zone: string },
  now: Date = new Date()
): number | null {
  const today = challengeToday(challenge.time_zone, now);
  const state = challengeState(challenge, today);
  if (state === 'upcoming') return daysBetween(today, challenge.start_date);
  if (state === 'running' && challenge.end_date) {
    return daysBetween(today, challenge.end_date) + 1;
  }
  return null;
}

/**
 * How far a standings row is, from 0 to 1: toward the target in a race or a
 * hit-the-goal period total, the share of days hit for a daily goal, and the
 * share of the top total in a plain leaderboard (`basis` says which). Null
 * for a group goal, which has one shared bar, and for a daily goal with no
 * day to count yet.
 */
export function standingProgress(
  rules: Pick<ChallengeRules, 'format' | 'target' | 'targetPer'>,
  row: { total: number; days_hit?: number; days_eligible?: number },
  topTotal: number
): { fraction: number; basis: 'target' | 'days' | 'leader' } | null {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  if (rules.format === 'group_goal') return null;
  if (rules.format === 'leaderboard') {
    return {
      fraction: topTotal > 0 ? clamp(row.total / topTotal) : 0,
      basis: 'leader',
    };
  }
  if (rules.format === 'hit_goal' && rules.targetPer === 'day') {
    if (row.days_hit === undefined || !row.days_eligible) return null;
    return {
      fraction: clamp(row.days_hit / row.days_eligible),
      basis: 'days',
    };
  }
  if (!rules.target) return null;
  return { fraction: clamp(row.total / rules.target), basis: 'target' };
}

/** A standings list shows its find-a-member box from this many rows. */
export const CHALLENGE_FIND_FROM_ROWS = 6;

/** Lower case without accents, so "jose" finds "José". */
const foldName = (name: string) =>
  name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * The rows whose display name holds `query`, ignoring case and accents; all
 * of them for an empty query.
 */
export function filterStandingsByName<Row extends { display_name: string }>(
  rows: readonly Row[],
  query: string
): Row[] {
  const folded = foldName(query.trim());
  return rows.filter((row) => foldName(row.display_name).includes(folded));
}

/**
 * Which words name a challenge's state, from `challengeState` and
 * `challengeDaysToGo`: each app maps them to its own strings. A count of 1
 * has its own words, as some languages use the `_one` plural for 21, 31 and
 * so on too.
 */
export type ChallengeStateWords =
  | { key: 'ended' | 'startsTomorrow' | 'active' | 'lastDay' }
  | { key: 'startsIn' | 'daysLeft'; count: number };

export function challengeStateWords(
  state: ChallengeState,
  daysToGo: number | null
): ChallengeStateWords {
  if (state === 'ended') return { key: 'ended' };
  if (state === 'upcoming') {
    return daysToGo === 1
      ? { key: 'startsTomorrow' }
      : { key: 'startsIn', count: daysToGo ?? 0 };
  }
  if (daysToGo === null) return { key: 'active' };
  return daysToGo === 1
    ? { key: 'lastDay' }
    : { key: 'daysLeft', count: daysToGo };
}

/**
 * How often an open period's standings are read again: the server scores a
 * saved workout a minute or so later (score queue, 30 s quiet time), so the
 * read right after the save still gets the old score. A final period never
 * moves. Pass it as a query's `refetchInterval`.
 */
export const CHALLENGE_STANDINGS_REFETCH_MS = 60 * 1000;

export function challengeStandingsRefetchInterval(query: {
  state: { data?: { final: boolean } };
}): number | false {
  return query.state.data?.final ? false : CHALLENGE_STANDINGS_REFETCH_MS;
}

export type ChallengeDistanceUnit = 'km' | 'miles';

export interface ChallengeValueUnits {
  distanceUnit: ChallengeDistanceUnit;
  energyUnit: EnergyUnit;
}

const METRES_PER_KM = 1000;
const METRES_PER_MILE = 1609.344;
const METRES_PER_FOOT = 0.3048;

/** Stored metres of distance in the account's distance unit. */
export function challengeDistanceFromMetres(
  metres: number,
  unit: ChallengeDistanceUnit
): number {
  return metres / (unit === 'miles' ? METRES_PER_MILE : METRES_PER_KM);
}

/** A distance in the account's unit as the metres the server stores. */
export function challengeDistanceToMetres(
  value: number,
  unit: ChallengeDistanceUnit
): number {
  return value * (unit === 'miles' ? METRES_PER_MILE : METRES_PER_KM);
}

/**
 * Stored metres of elevation in the account's unit: feet for a miles
 * account, metres otherwise (as the workout stats show climbing).
 */
export function challengeElevationFromMetres(
  metres: number,
  unit: ChallengeDistanceUnit
): number {
  return unit === 'miles' ? metres / METRES_PER_FOOT : metres;
}

/** An elevation in the account's unit as the metres the server stores. */
export function challengeElevationToMetres(
  value: number,
  unit: ChallengeDistanceUnit
): number {
  return unit === 'miles' ? value * METRES_PER_FOOT : value;
}

/**
 * A metric amount ready to show: `amount` in the unit `key` names, already
 * rounded, to be formatted with these fraction digits and the app's own
 * words for `key` (`energy` takes the energy unit's label). Distance shows
 * one decimal (`distanceDigits` more, to tell two saved values apart).
 */
export interface ChallengeValueParts {
  key:
    | 'points'
    | 'steps'
    | 'minutes'
    | 'km'
    | 'miles'
    | 'days'
    | 'energy'
    | 'metres'
    | 'feet';
  amount: number;
  minimumFractionDigits: number;
  maximumFractionDigits: number;
}

/** How a stored total of `metric` shows in the account's units. */
export function challengeValueParts(
  metric: ChallengeMetric,
  value: number,
  units: ChallengeValueUnits,
  distanceDigits = 1
): ChallengeValueParts {
  const whole = (
    key: ChallengeValueParts['key'],
    amount: number
  ): ChallengeValueParts => ({
    key,
    amount: Math.round(amount),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  switch (metric) {
    case 'points':
      return {
        key: 'points',
        amount: Math.round(value * 10) / 10,
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      };
    case 'steps':
      return whole('steps', value);
    case 'active_minutes':
    case 'hr_zone_minutes':
      return whole('minutes', value);
    case 'distance': {
      const digits = Math.max(1, distanceDigits);
      const factor = 10 ** digits;
      return {
        key: units.distanceUnit === 'miles' ? 'miles' : 'km',
        amount:
          Math.round(
            challengeDistanceFromMetres(value, units.distanceUnit) * factor
          ) / factor,
        minimumFractionDigits: 1,
        maximumFractionDigits: digits,
      };
    }
    case 'workout_days':
      return whole('days', value);
    case 'active_calories':
      return whole('energy', energyFromKcal(value, units.energyUnit));
    case 'elevation':
      return whole(
        units.distanceUnit === 'miles' ? 'feet' : 'metres',
        challengeElevationFromMetres(value, units.distanceUnit)
      );
  }
}

/**
 * A day of the period before the one starting on `periodStart`, or null when
 * that period would start before the challenge.
 */
export function previousChallengePeriodDay(
  periodStart: string,
  challengeStart: string
): string | null {
  const day = addDays(periodStart, -1);
  return day < challengeStart ? null : day;
}

/**
 * Where Next goes from the period ending on `periodEnd`: null when there is
 * no next period yet (past the challenge's end, or after `today`, which the
 * server answers with the last period again); `{ day: null }` for the current
 * period, so the screen follows today into the next one once it ends; or
 * `{ day }`, a day of the next period. Pass `today` read when Next is
 * pressed, not when the screen last drew. `current` is the current period as
 * last loaded; it counts only while it still holds today, since one loaded
 * before midnight would make Next skip a period.
 */
export function nextChallengePeriodDay(
  periodEnd: string,
  challengeEnd: string | null,
  today: string,
  current?: { period_start: string; period_end: string } | null
): { day: string | null } | null {
  const day = addDays(periodEnd, 1);
  if (challengeEnd && day > challengeEnd) return null;
  if (day > today) return null;
  const reachesCurrent =
    !!current &&
    current.period_start <= today &&
    today <= current.period_end &&
    day >= current.period_start;
  return { day: reachesCurrent ? null : day };
}
