import { challengeRulesSchema } from '@workspace/shared';
import type {
  ChallengeDetail,
  ChallengeRulesInput,
  ChallengeStandingsResponse,
  ChallengeSummary,
} from '@workspace/shared';

export const ME = '11111111-1111-4111-8111-111111111111';
export const FRIEND = '22222222-2222-4222-8222-222222222222';

export function makeChallenge(
  overrides: Partial<ChallengeSummary> & { rules?: ChallengeRulesInput } = {}
): ChallengeDetail {
  const { rules, ...rest } = overrides;
  return {
    id: 'c1',
    name: 'Family Cup',
    description: null,
    emoji: null,
    template: 'all_rounder',
    rules: challengeRulesSchema.parse(
      rules ?? {
        version: 1,
        metric: 'points',
        period: 'week',
        bestDaysPerWeek: 5,
        points: {},
      }
    ),
    pending_rules: null,
    start_date: '2026-11-02',
    end_date: null,
    time_zone: 'UTC',
    member_limit: 50,
    late_join: true,
    ended_at: null,
    is_host: false,
    member_count: 2,
    invite_active: false,
    invite_expires_at: null,
    members: [],
    ...rest,
  };
}

/**
 * A week's standings: Alex leads Sam (the signed-in user, `me`). As on the
 * server, `winner` is only set once the period is final.
 */
export function makeStandings(
  overrides: Partial<ChallengeStandingsResponse> = {}
): ChallengeStandingsResponse {
  const final = overrides.final ?? false;
  return {
    challenge_id: 'c1',
    period_start: '2026-11-09',
    period_end: '2026-11-15',
    rules: challengeRulesSchema.parse({
      version: 1,
      metric: 'points',
      period: 'week',
      bestDaysPerWeek: 5,
      points: {},
    }),
    final: false,
    group_total: 650,
    group_reached: false,
    rows: [
      {
        user_id: FRIEND,
        display_name: 'Alex',
        rank: 1,
        total: 400,
        minutes: 180,
        winner: final,
        reached_on: null,
      },
      {
        user_id: ME,
        display_name: 'Sam',
        rank: 2,
        total: 250,
        minutes: 120,
        winner: false,
        me: true,
        reached_on: null,
      },
    ],
    ...overrides,
  };
}

/** The same standings as seen by another member: `me` moves to their row. */
export function standingsSeenBy(
  standings: ChallengeStandingsResponse,
  userId: string
): ChallengeStandingsResponse {
  return {
    ...standings,
    rows: standings.rows.map(({ me: _me, ...row }) =>
      row.user_id === userId ? { ...row, me: true } : row
    ),
  };
}

/** A race where both members finished the same day and share first place. */
export function makeSharedLeadStandings(): ChallengeStandingsResponse {
  const standings = makeStandings();
  return {
    ...standings,
    rows: standings.rows.map((row) => ({
      ...row,
      rank: 1,
      total: 100000,
      reached_on: '2026-11-12',
    })),
  };
}
