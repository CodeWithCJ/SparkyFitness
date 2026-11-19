import { challengeInviteCodeSchema } from '../schemas/api/Challenges.api.zod.ts';
import { instantToDay } from '../utils/timezone.ts';

/**
 * Challenge helpers both apps use on what the server sends: whether a
 * challenge is upcoming, running or ended, the caller's own
 * standing, who leads a period, the invite code in pasted text and today in a
 * challenge's time zone. Keep web and mobile on these so they cannot drift.
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
