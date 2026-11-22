import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_STANDINGS_REFETCH_MS,
  challengeDaysToGo,
  challengeDistanceFromMetres,
  challengeDistanceToMetres,
  challengeElevationFromMetres,
  challengeElevationToMetres,
  challengeValueParts,
  nextChallengePeriodDay,
  previousChallengePeriodDay,
  challengeStandingsRefetchInterval,
  challengeStateWords,
  filterStandingsByName,
  challengeLeaders,
  challengeState,
  challengeStateNow,
  challengesForCard,
  challengeToday,
  leadsChallenge,
  ownChallengeStanding,
  parseChallengeInviteCode,
  sortChallenges,
  standingProgress,
} from '@workspace/shared';

// The challenge helpers web and mobile share (shared/src/challenges/client.ts).

const CODE = 'AbCdEfGhIjKlMnOpQrStUv';

describe('parseChallengeInviteCode', () => {
  it('reads a bare code, a fragment link or a code= link', () => {
    expect(parseChallengeInviteCode(`  ${CODE} `)).toBe(CODE);
    expect(parseChallengeInviteCode(`#${CODE}`)).toBe(CODE);
    expect(
      parseChallengeInviteCode(`https://fit.example/challenges/join#${CODE}`)
    ).toBe(CODE);
    expect(
      parseChallengeInviteCode(
        `https://fit.example/challenges/join?code=${CODE}&x=1`
      )
    ).toBe(CODE);
  });

  it('finds the code in a pasted message, last whole token first', () => {
    expect(
      parseChallengeInviteCode(
        `Join my challenge with code ${CODE} before Sunday`
      )
    ).toBe(CODE);
    expect(
      parseChallengeInviteCode(
        `https://fit.example/abcdefghijklmnopqrstuv/join/${CODE}`
      )
    ).toBe(CODE);
  });

  it('returns null when there is no whole code', () => {
    expect(parseChallengeInviteCode('')).toBeNull();
    expect(parseChallengeInviteCode('not a code')).toBeNull();
    expect(parseChallengeInviteCode(`${CODE}x`)).toBeNull();
    expect(
      parseChallengeInviteCode('whatsapp_share_message_from_alex')
    ).toBeNull();
  });

  it('reads bad percent-encoding as no code instead of throwing', () => {
    expect(
      parseChallengeInviteCode('https://fit.example/join?code=%E0')
    ).toBeNull();
    expect(parseChallengeInviteCode('?code=%')).toBeNull();
  });
});

describe('challengeToday', () => {
  const now = new Date('2026-11-18T23:30:00Z');

  it('counts the day in the challenge zone', () => {
    expect(challengeToday('UTC', now)).toBe('2026-11-18');
    expect(challengeToday('Pacific/Kiritimati', now)).toBe('2026-11-19');
    expect(challengeToday('America/Los_Angeles', now)).toBe('2026-11-18');
  });

  it('falls back to the device day for a zone it does not know', () => {
    expect(() => challengeToday('Not/AZone', now)).not.toThrow();
    expect(challengeToday('Not/AZone', now)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('standings', () => {
  const row = (user_id: string, rank: number, total: number, me?: boolean) => ({
    user_id,
    rank,
    total,
    ...(me ? { me } : {}),
  });

  it('finds the caller own row, null when the server marks none', () => {
    const rows = [row('b', 1, 340), row('a', 2, 295, true)];
    expect(ownChallengeStanding(rows)?.user_id).toBe('a');
    expect(ownChallengeStanding([row('b', 1, 340)])).toBeNull();
  });

  it('leads only on rank 1 with something on the board', () => {
    const rows = [row('b', 1, 340), row('c', 1, 340), row('a', 2, 295, true)];
    expect(challengeLeaders(rows).map((r) => r.user_id)).toEqual(['b', 'c']);
    expect(leadsChallenge(rows[0]!)).toBe(true);
    expect(leadsChallenge(rows[2]!)).toBe(false);
    expect(leadsChallenge(null)).toBe(false);
  });

  it('has no leader while everyone is tied on 0 at the start of a period', () => {
    const rows = [row('a', 1, 0, true), row('b', 1, 0)];
    expect(challengeLeaders(rows)).toEqual([]);
    expect(leadsChallenge(rows[0]!)).toBe(false);
  });
});

describe('challengeState and challengesForCard', () => {
  const challenge = (
    id: string,
    start_date: string,
    end_date: string | null = null,
    ended_at: string | null = null,
    time_zone = 'UTC'
  ) => ({ id, start_date, end_date, ended_at, time_zone });
  const today = '2026-11-16';

  it('ends a challenge once the server closed it or its end date has passed', () => {
    expect(challengeState(challenge('a', '2026-11-01'), today)).toBe('running');
    expect(challengeState(challenge('b', '2026-11-17'), today)).toBe(
      'upcoming'
    );
    expect(
      challengeState(challenge('c', '2026-11-01', '2026-11-16'), today)
    ).toBe('running');
    expect(
      challengeState(challenge('d', '2026-11-01', '2026-11-15'), today)
    ).toBe('ended');
    expect(
      challengeState(
        challenge('e', '2026-11-01', null, '2026-11-10T00:00:00Z'),
        today
      )
    ).toBe('ended');
  });

  it('sorts running, upcoming, ended, newest start first within each', () => {
    const list = [
      challenge('ended', '2026-11-05', '2026-11-10'),
      challenge('later', '2026-12-01'),
      challenge('old', '2026-10-01'),
      challenge('new', '2026-11-09'),
    ];
    expect(sortChallenges(list, today).map((c) => c.id)).toEqual([
      'new',
      'old',
      'later',
      'ended',
    ]);
  });

  it('judges each challenge on today in its own zone for the card', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    const list = [
      challenge('yesterday', '2026-11-01', '2026-11-15'),
      challenge(
        'honolulu',
        '2026-11-01',
        '2026-11-16',
        null,
        'Pacific/Honolulu'
      ),
      challenge(
        'kiritimati',
        '2026-11-01',
        '2026-11-16',
        null,
        'Pacific/Kiritimati'
      ),
      challenge('next', '2026-12-01'),
    ];
    expect(challengesForCard(list, 2, now).map((c) => c.id)).toEqual([
      'honolulu',
      'next',
    ]);
    expect(challengeStateNow(list[2]!, now)).toBe('ended');
    expect(() =>
      challengesForCard(
        [challenge('odd', '2026-11-01', null, null, 'Not/AZone')],
        2,
        now
      )
    ).not.toThrow();
  });
});

describe('challengeDaysToGo', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  const challenge = (
    start_date: string,
    end_date: string | null,
    ended_at: string | null = null
  ) => ({ start_date, end_date, ended_at, time_zone: 'UTC' });

  it('counts the days left including today, and the days until the start', () => {
    expect(challengeDaysToGo(challenge('2026-10-31', '2026-11-29'), now)).toBe(
      10
    );
    expect(challengeDaysToGo(challenge('2026-11-01', '2026-11-20'), now)).toBe(
      1
    );
    expect(challengeDaysToGo(challenge('2026-11-30', '2026-12-30'), now)).toBe(
      10
    );
  });

  it('has none once ended or with no end date', () => {
    expect(
      challengeDaysToGo(challenge('2026-11-01', '2026-11-19'), now)
    ).toBeNull();
    expect(
      challengeDaysToGo(
        challenge('2026-11-01', '2026-11-29', '2026-11-19T00:00:00Z'),
        now
      )
    ).toBeNull();
    expect(challengeDaysToGo(challenge('2026-11-01', null), now)).toBeNull();
  });

  it('counts on the device day for a zone this runtime does not know', () => {
    expect(
      challengeDaysToGo(
        { ...challenge('2026-10-31', '2026-11-29'), time_zone: 'Mars/Base' },
        now
      )
    ).not.toBeNull();
  });
});

describe('standingProgress', () => {
  const rules = (
    format: 'leaderboard' | 'race' | 'hit_goal' | 'group_goal',
    target: number | null = null,
    targetPer: 'day' | 'period' = 'period'
  ) => ({ format, target, targetPer });

  it('shares the top total in a plain leaderboard, 0 while nobody scored', () => {
    expect(standingProgress(rules('leaderboard'), { total: 30 }, 120)).toEqual({
      fraction: 0.25,
      basis: 'leader',
    });
    expect(standingProgress(rules('leaderboard'), { total: 0 }, 0)).toEqual({
      fraction: 0,
      basis: 'leader',
    });
  });

  it('runs toward the target in a race and a period goal, capped at 1', () => {
    expect(
      standingProgress(rules('race', 100_000), { total: 25_000 }, 25_000)
    ).toEqual({ fraction: 0.25, basis: 'target' });
    expect(
      standingProgress(rules('hit_goal', 50), { total: 80 }, 80)?.fraction
    ).toBe(1);
  });

  it('counts days hit for a daily goal, and has no row bar for a group goal', () => {
    expect(
      standingProgress(
        rules('hit_goal', 8000, 'day'),
        { total: 30_000, days_hit: 3, days_eligible: 4 },
        30_000
      )
    ).toEqual({ fraction: 0.75, basis: 'days' });
    expect(
      standingProgress(rules('hit_goal', 8000, 'day'), { total: 0 }, 0)
    ).toBeNull();
    expect(
      standingProgress(
        rules('hit_goal', 8000, 'day'),
        { total: 0, days_hit: 0, days_eligible: 0 },
        0
      )
    ).toBeNull();
    expect(
      standingProgress(rules('group_goal', 500), { total: 40 }, 40)
    ).toBeNull();
  });
});

describe('filterStandingsByName', () => {
  const rows = ['Alex', 'José', 'JOSEPHINE', 'Mia'].map((display_name) => ({
    display_name,
  }));

  it('ignores case and accents, and trims the query', () => {
    expect(
      filterStandingsByName(rows, '  jose ').map((r) => r.display_name)
    ).toEqual(['José', 'JOSEPHINE']);
    expect(
      filterStandingsByName(rows, 'Jos\u00e9').map((r) => r.display_name)
    ).toEqual(['José', 'JOSEPHINE']);
  });

  it('keeps every row for an empty query and none for no match', () => {
    expect(filterStandingsByName(rows, '')).toHaveLength(4);
    expect(filterStandingsByName(rows, 'zed')).toEqual([]);
  });
});

describe('challengeStateWords', () => {
  it.each([
    ['ended', null, { key: 'ended' }],
    ['ended', 3, { key: 'ended' }],
    ['upcoming', 1, { key: 'startsTomorrow' }],
    ['upcoming', 5, { key: 'startsIn', count: 5 }],
    ['upcoming', 21, { key: 'startsIn', count: 21 }],
    ['running', null, { key: 'active' }],
    ['running', 1, { key: 'lastDay' }],
    ['running', 10, { key: 'daysLeft', count: 10 }],
  ] as const)('%s with %s days to go', (state, days, words) => {
    expect(challengeStateWords(state, days)).toEqual(words);
  });
});

describe('challengeStandingsRefetchInterval', () => {
  it('polls an open or unloaded period every minute and a final one never', () => {
    expect(challengeStandingsRefetchInterval({ state: {} })).toBe(
      CHALLENGE_STANDINGS_REFETCH_MS
    );
    expect(
      challengeStandingsRefetchInterval({ state: { data: { final: false } } })
    ).toBe(60 * 1000);
    expect(
      challengeStandingsRefetchInterval({ state: { data: { final: true } } })
    ).toBe(false);
  });
});

describe('challengeValueParts', () => {
  const km = { distanceUnit: 'km', energyUnit: 'kcal' } as const;
  const miles = { distanceUnit: 'miles', energyUnit: 'kJ' } as const;
  const shown = (p: ReturnType<typeof challengeValueParts>) => [
    p.key,
    p.amount,
    p.minimumFractionDigits,
    p.maximumFractionDigits,
  ];

  it('shows elevation in feet for a miles account and metres otherwise', () => {
    expect(shown(challengeValueParts('elevation', 100, km))).toEqual([
      'metres',
      100,
      0,
      0,
    ]);
    expect(shown(challengeValueParts('elevation', 100, miles))).toEqual([
      'feet',
      328,
      0,
      0,
    ]);
  });

  it('shows distance to exactly one decimal, or more when asked', () => {
    expect(shown(challengeValueParts('distance', 5000, km))).toEqual([
      'km',
      5,
      1,
      1,
    ]);
    expect(shown(challengeValueParts('distance', 42195, miles))).toEqual([
      'miles',
      26.2,
      1,
      1,
    ]);
    expect(challengeValueParts('distance', 5250, km, 3)).toMatchObject({
      amount: 5.25,
      minimumFractionDigits: 1,
      maximumFractionDigits: 3,
    });
  });

  it('rounds points to one decimal, counts to whole numbers, energy in its unit', () => {
    expect(challengeValueParts('points', 98.25, km)).toMatchObject({
      key: 'points',
      amount: 98.3,
      maximumFractionDigits: 1,
    });
    expect(challengeValueParts('steps', 12345.6, km).amount).toBe(12346);
    expect(challengeValueParts('hr_zone_minutes', 95.4, km)).toMatchObject({
      key: 'minutes',
      amount: 95,
    });
    expect(challengeValueParts('workout_days', 4, km).key).toBe('days');
    expect(challengeValueParts('active_calories', 100, miles)).toMatchObject({
      key: 'energy',
      amount: 418,
    });
  });

  it('converts typed distance and elevation to stored metres and back', () => {
    expect(challengeDistanceToMetres(10, 'km')).toBe(10000);
    expect(challengeDistanceFromMetres(1609.344, 'miles')).toBe(1);
    expect(challengeElevationToMetres(500, 'km')).toBe(500);
    expect(challengeElevationFromMetres(500, 'km')).toBe(500);
    expect(challengeElevationToMetres(1000, 'miles')).toBeCloseTo(304.8);
    expect(challengeElevationFromMetres(304.8, 'miles')).toBeCloseTo(1000);
  });
});

describe('period steps', () => {
  const current = { period_start: '2026-11-09', period_end: '2026-11-15' };

  it('steps back without leaving the challenge', () => {
    expect(previousChallengePeriodDay('2026-11-09', '2026-11-02')).toBe(
      '2026-11-08'
    );
    expect(previousChallengePeriodDay('2026-11-02', '2026-11-02')).toBeNull();
  });

  it('steps forward, never past today or the end', () => {
    expect(nextChallengePeriodDay('2026-11-08', null, '2026-11-14')).toEqual({
      day: '2026-11-09',
    });
    expect(nextChallengePeriodDay('2026-11-15', null, '2026-11-14')).toBeNull();
    expect(
      nextChallengePeriodDay('2026-11-08', '2026-11-08', '2026-11-14')
    ).toBeNull();
  });

  it('opens the current period when Next reaches it', () => {
    expect(
      nextChallengePeriodDay('2026-11-08', null, '2026-11-14', current)
    ).toEqual({ day: null });
  });

  it('steps one period after midnight when the loaded current period has ended', () => {
    // Loaded on Sunday Nov 15; Next pressed on Monday Nov 16.
    expect(
      nextChallengePeriodDay('2026-11-08', null, '2026-11-16', current)
    ).toEqual({ day: '2026-11-09' });
  });
});
