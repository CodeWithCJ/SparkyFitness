import { describe, expect, it } from 'vitest';
import {
  challengeLeaders,
  challengeState,
  challengeStateNow,
  challengesForCard,
  challengeToday,
  leadsChallenge,
  ownChallengeStanding,
  parseChallengeInviteCode,
  sortChallenges,
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
