import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { challengePreset } from '@workspace/shared';

vi.mock('../models/challengeRepository.js', () => ({
  default: {
    listForMember: vi.fn(),
    getForMember: vi.fn(),
    getMembersForMember: vi.fn(),
    getDailyScoresForMember: vi.fn(),
    getResultsForMember: vi.fn(),
    getRuleChangesForMember: vi.fn(),
    getMembership: vi.fn(),
    getChallenge: vi.fn(),
    getMembers: vi.fn(),
    getRuleChanges: vi.fn(),
    createWithHost: vi.fn(),
    updateRules: vi.fn(),
    setInvite: vi.fn(),
    clearInvite: vi.fn(),
    joinByInviteHash: vi.fn(),
    removeMember: vi.fn(),
    rehostOrphans: vi.fn(),
    enqueueDays: vi.fn(),
    enqueueRecentDaysForRunningChallenges: vi.fn(),
    takeQueuedDays: vi.fn(),
    ackQueuedDays: vi.fn(),
    withScoringLock: vi.fn(
      async (_c: string, _u: string, fn: () => Promise<unknown>) => fn()
    ),
    saveMemberDays: vi.fn(),
    hasResults: vi.fn(),
    frozenPeriodStarts: vi.fn(),
    getDailyScores: vi.fn(),
    insertResults: vi.fn(),
    listOpenChallenges: vi.fn(),
    markEnded: vi.fn(),
    getMemberEntries: vi.fn(),
    getMemberSteps: vi.fn(),
  },
}));
vi.mock('../models/rateLimitWindowRepository.js', () => ({
  default: { hit: vi.fn() },
}));
vi.mock('../models/globalSettingsRepository.js', () => ({
  isChallengesEnabled: vi.fn(),
}));
vi.mock('../services/heartRateZoneService.js', () => ({
  default: { resolveZonesForUser: vi.fn() },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import challengeRepository, {
  type ChallengeMemberRow,
  type ChallengeRow,
} from '../models/challengeRepository.js';
import rateLimitWindowRepository from '../models/rateLimitWindowRepository.js';
import { isChallengesEnabled } from '../models/globalSettingsRepository.js';
import heartRateZoneService from '../services/heartRateZoneService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import * as service from '../services/challengeService.js';

const repo = vi.mocked(challengeRepository);
const allRounder = challengePreset('all_rounder').rules;
const steps = challengePreset('workweek_hustle').rules;

const challenge = (overrides: Partial<ChallengeRow> = {}): ChallengeRow => ({
  id: '11111111-1111-4111-8111-111111111111',
  owner_user_id: 'host',
  name: 'Family',
  description: null,
  emoji: null,
  template: 'all_rounder',
  rules: allRounder,
  rules_version: 1,
  start_date: '2026-11-09',
  end_date: null,
  time_zone: 'UTC',
  member_limit: 50,
  late_join: true,
  invite_expires_at: null,
  invite_active: false,
  ended_at: null,
  created_at: new Date('2026-11-01T00:00:00Z'),
  updated_at: new Date('2026-11-01T00:00:00Z'),
  ...overrides,
});

const member = (
  userId: string,
  role: 'host' | 'member' = 'member'
): ChallengeMemberRow => ({
  challenge_id: challenge().id,
  user_id: userId,
  role,
  display_name: userId.toUpperCase(),
  goal_type: 'stay_active',
  share_routes: false,
  joined_at: new Date('2026-11-01T00:00:00Z'),
});

const change = (
  effective_from: string,
  rules: unknown,
  at = '2026-11-01T00:00:00Z',
  seq = String(new Date(at).getTime())
) => ({
  id: `c-${effective_from}-${at}`,
  seq,
  challenge_id: challenge().id,
  changed_by_user_id: 'host',
  changed_by_display_name: 'HOST',
  effective_from,
  rules,
  previous_rules: null,
  created_at: new Date(at),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T12:00:00Z')); // a Thursday
  vi.mocked(isChallengesEnabled).mockResolvedValue(true);
  vi.mocked(rateLimitWindowRepository.hit).mockResolvedValue({
    count: 1,
    resetInMs: 1000,
  });
  vi.mocked(loadUserTimezone).mockResolvedValue('America/New_York');
  vi.mocked(heartRateZoneService.resolveZonesForUser).mockResolvedValue({
    maxHr: 190,
    floors: [95, 114, 133, 152, 171],
  } as never);
  repo.getRuleChanges.mockResolvedValue([change('2026-11-09', allRounder)]);
  repo.frozenPeriodStarts.mockResolvedValue([]);
  repo.getMemberEntries.mockResolvedValue([]);
  repo.getMemberSteps.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('membership is checked in code, not only by RLS', () => {
  it('a non-member gets 404 and no member read is made', async () => {
    repo.getMembership.mockResolvedValue(null);
    await expect(
      service.getChallenge('stranger', challenge().id)
    ).rejects.toMatchObject({
      status: 404,
      code: 'CHALLENGE_NOT_FOUND',
    });
    await expect(
      service.getStandings('stranger', challenge().id)
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.getRuleChanges('stranger', challenge().id)
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.getForMember).not.toHaveBeenCalled();
    expect(repo.getDailyScoresForMember).not.toHaveBeenCalled();
    expect(repo.getRuleChangesForMember).not.toHaveBeenCalled();
  });

  it('a member reads through their own RLS context', async () => {
    repo.getMembership.mockResolvedValue(member('amy'));
    repo.getForMember.mockResolvedValue(challenge());
    repo.getMembersForMember.mockResolvedValue([
      member('host', 'host'),
      member('amy'),
    ]);
    const detail = await service.getChallenge('amy', challenge().id);
    expect(repo.getForMember).toHaveBeenCalledWith('amy', challenge().id);
    expect(detail.is_host).toBe(false);
    expect(detail.members.map((m) => m.display_name)).toEqual(['HOST', 'AMY']);
    // display names only: no email or other profile field leaves the service
    expect(Object.keys(detail.members[0]!).sort()).toEqual([
      'display_name',
      'joined_at',
      'role',
      'user_id',
    ]);
  });

  it('only the host changes rules or invites', async () => {
    repo.getMembership.mockResolvedValue(member('amy'));
    await expect(
      service.updateRules('amy', challenge().id, allRounder)
    ).rejects.toMatchObject({
      status: 403,
      code: 'CHALLENGE_HOST_ONLY',
    });
    await expect(
      service.createInvite('amy', challenge().id, 7)
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.revokeInvite('amy', challenge().id)
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.updateRules).not.toHaveBeenCalled();
    expect(repo.setInvite).not.toHaveBeenCalled();
    expect(repo.clearInvite).not.toHaveBeenCalled();
  });
});

describe('creating a challenge', () => {
  it('fills rules from the preset, uses the host zone and queues the days so far', async () => {
    repo.createWithHost.mockResolvedValue(challenge().id);
    repo.getMembership.mockResolvedValue(member('host', 'host'));
    repo.getForMember.mockResolvedValue(challenge());
    repo.getMembersForMember.mockResolvedValue([member('host', 'host')]);
    await service.createChallenge('host', {
      name: 'Family',
      start_date: '2026-11-10',
      display_name: 'Host',
      member_limit: 50,
      late_join: true,
    });
    expect(repo.createWithHost).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 'host',
        template: 'all_rounder',
        rules: allRounder,
        timeZone: 'America/New_York',
        endDate: null,
        goalType: 'stay_active',
      })
    );
    expect(repo.enqueueDays).toHaveBeenCalledWith(challenge().id, 'host', [
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ]);
  });

  it('a one-period challenge needs an end date', async () => {
    await expect(
      service.createChallenge('host', {
        name: 'Race',
        start_date: '2026-11-10',
        display_name: 'Host',
        rules: challengePreset('race_to_100k_steps').rules,
        member_limit: 50,
        late_join: true,
      })
    ).rejects.toMatchObject({ status: 400, code: 'CHALLENGE_INVALID_DATES' });
    expect(repo.createWithHost).not.toHaveBeenCalled();
  });
});

describe('changing the rules', () => {
  beforeEach(() => {
    repo.getMembership.mockResolvedValue(member('host', 'host'));
    repo.getForMember.mockResolvedValue(challenge());
    repo.getMembersForMember.mockResolvedValue([member('host', 'host')]);
  });

  it('before the start, a change applies from the start', async () => {
    repo.getChallenge.mockResolvedValue(
      challenge({ start_date: '2026-11-16' })
    );
    await service.updateRules('host', challenge().id, {
      ...allRounder,
      bestDaysPerWeek: 4,
    });
    expect(repo.updateRules).toHaveBeenCalledWith(
      challenge().id,
      'host',
      expect.objectContaining({ bestDaysPerWeek: 4 }),
      allRounder,
      '2026-11-16',
      1
    );
  });

  it('after the start, a change applies from the next week and is logged with the old rules', async () => {
    repo.getChallenge.mockResolvedValue(challenge());
    await service.updateRules('host', challenge().id, {
      ...allRounder,
      bestDaysPerWeek: 4,
    });
    expect(repo.updateRules.mock.calls[0]![4]).toBe('2026-11-16');
    expect(repo.updateRules.mock.calls[0]![3]).toEqual(allRounder);
  });

  it('the period cannot change once running, and an ended challenge is closed', async () => {
    repo.getChallenge.mockResolvedValue(challenge());
    await expect(
      service.updateRules('host', challenge().id, {
        ...allRounder,
        period: 'month',
      })
    ).rejects.toMatchObject({ status: 400, code: 'CHALLENGE_PERIOD_LOCKED' });
    repo.getChallenge.mockResolvedValue(challenge({ ended_at: new Date() }));
    await expect(
      service.updateRules('host', challenge().id, allRounder)
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.updateRules).not.toHaveBeenCalled();
  });

  it('a day is scored by the latest change effective on or before it', () => {
    const changes = [
      change('2026-11-09', allRounder),
      change('2026-11-16', steps, '2026-11-12T00:00:00Z'),
      change(
        '2026-11-16',
        { ...steps, dailyCap: 5000 },
        '2026-11-12T01:00:00Z'
      ),
    ];
    expect(service.rulesForDay(changes, '2026-11-12')).toEqual(allRounder);
    expect(service.rulesForDay(changes, '2026-11-16').dailyCap).toBe(5000);
    expect(service.rulesForDay(changes, '2026-11-01')).toEqual(allRounder);
  });
});

describe('invites', () => {
  it('codes are 128-bit random, stored only as a hash, and expire after 7 days by default', async () => {
    repo.getMembership.mockResolvedValue(member('host', 'host'));
    repo.getChallenge.mockResolvedValue(challenge());
    const a = await service.createInvite('host', challenge().id, 7);
    const b = await service.createInvite('host', challenge().id, 7);
    expect(a.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(Buffer.from(a.code, 'base64url')).toHaveLength(16);
    expect(a.code).not.toBe(b.code);
    const [, storedHash, expiresAt] = repo.setInvite.mock.calls[0]!;
    expect(storedHash).toBe(createHash('sha256').update(a.code).digest('hex'));
    expect(storedHash).not.toContain(a.code);
    expect((expiresAt as Date).toISOString()).toBe('2026-11-19T12:00:00.000Z');
    expect(rateLimitWindowRepository.hit).toHaveBeenCalledWith(
      'challenge-invite:host',
      service.INVITE_WINDOW_MS
    );
  });

  it('making invites is rate limited', async () => {
    repo.getMembership.mockResolvedValue(member('host', 'host'));
    vi.mocked(rateLimitWindowRepository.hit).mockResolvedValue({
      count: service.INVITES_PER_WINDOW + 1,
      resetInMs: 30_000,
    });
    await expect(
      service.createInvite('host', challenge().id, 7)
    ).rejects.toMatchObject({
      status: 429,
      code: 'CHALLENGE_RATE_LIMITED',
    });
    expect(repo.setInvite).not.toHaveBeenCalled();
  });
});

describe('joining and leaving', () => {
  const code = 'AAAAAAAAAAAAAAAAAAAAAA';

  it('joins by the hash of the code, then queues the days so far', async () => {
    repo.joinByInviteHash.mockResolvedValue({
      status: 'joined',
      challenge: challenge(),
    });
    repo.getMembership.mockResolvedValue(member('amy'));
    repo.getForMember.mockResolvedValue(challenge());
    repo.getMembersForMember.mockResolvedValue([
      member('host', 'host'),
      member('amy'),
    ]);
    await service.joinChallenge('amy', { code, display_name: 'Amy' });
    expect(repo.joinByInviteHash.mock.calls[0]![0]).toBe(
      createHash('sha256').update(code).digest('hex')
    );
    expect(repo.joinByInviteHash.mock.calls[0]![1]).toBe('amy');
    expect(repo.enqueueDays).toHaveBeenCalledWith(challenge().id, 'amy', [
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ]);
  });

  it.each([
    ['not_found', 404, 'CHALLENGE_INVITE_INVALID'],
    ['ended', 409, 'CHALLENGE_ENDED'],
    ['late_join_closed', 409, 'CHALLENGE_LATE_JOIN_CLOSED'],
    ['full', 409, 'CHALLENGE_FULL'],
  ] as const)(
    'refuses a join that comes back %s',
    async (status, http, codeName) => {
      repo.joinByInviteHash.mockResolvedValue({ status } as never);
      await expect(
        service.joinChallenge('amy', { code, display_name: 'Amy' })
      ).rejects.toMatchObject({
        status: http,
        code: codeName,
      });
      expect(repo.enqueueDays).not.toHaveBeenCalled();
    }
  );

  it('join attempts are rate limited before the code is looked up', async () => {
    vi.mocked(rateLimitWindowRepository.hit).mockResolvedValue({
      count: service.JOIN_ATTEMPTS_PER_WINDOW + 1,
      resetInMs: 60_000,
    });
    await expect(
      service.joinChallenge('amy', { code, display_name: 'Amy' })
    ).rejects.toMatchObject({ status: 429 });
    expect(repo.joinByInviteHash).not.toHaveBeenCalled();
    expect(rateLimitWindowRepository.hit).toHaveBeenCalledWith(
      'challenge-join:amy',
      service.JOIN_WINDOW_MS
    );
  });

  it('only a member can leave', async () => {
    repo.getMembership.mockResolvedValue(null);
    await expect(
      service.leaveChallenge('stranger', challenge().id)
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.removeMember).not.toHaveBeenCalled();
    repo.getMembership.mockResolvedValue(member('amy'));
    repo.removeMember.mockResolvedValue('left');
    await service.leaveChallenge('amy', challenge().id);
    expect(repo.removeMember).toHaveBeenCalledWith(challenge().id, 'amy');
  });
});

describe('scoring jobs', () => {
  it('scores a member from their own diary rows (distance km -> m, warm-up sets ignored)', async () => {
    repo.getMemberEntries.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        entry_date: '2026-11-10',
        entry_time: '07:00',
        duration_minutes: 30,
        avg_heart_rate: '150' as unknown as number,
        max_heart_rate: 170,
        exercise_name: 'Morning Run',
        category: 'Cardio',
        source: 'garmin',
        exercise_id: null,
        distance: '5.0' as unknown as number,
        active_calories: null,
        calories_burned: 300,
        elevation_gain_meters: null,
        zone_seconds: null,
        sets: null,
      },
    ]);
    repo.getMemberSteps.mockResolvedValue({ '2026-11-10': 12000 });
    await service.recomputeMember(challenge(), member('amy'), '2026-11-10');
    expect(repo.getMemberEntries).toHaveBeenCalledWith(
      'amy',
      expect.any(String),
      '2026-11-13'
    );
    const [, userId, from, to, scores, cards] =
      repo.saveMemberDays.mock.calls[0]!;
    expect([userId, from, to]).toEqual(['amy', '2026-11-10', '2026-11-13']);
    const tue = scores.find((s) => s.day === '2026-11-10')!;
    expect(tue.effort).toBe(60); // 30 min in zone 3
    expect(tue.step_points).toBe(10);
    expect(tue.total).toBe(70);
    expect(cards).toEqual([
      expect.objectContaining({
        day: '2026-11-10',
        activity_type: 'run',
        distance_meters: 5000,
        pace_seconds_per_km: 360,
        avg_heart_rate: 150,
        max_heart_rate: 170,
        points: 60,
      }),
    ]);
  });

  it('days in a frozen period are never rescored', async () => {
    repo.frozenPeriodStarts.mockResolvedValue(['2026-11-09']);
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
    await service.recomputeMember(challenge(), member('amy'), '2026-11-10');
    const [, , from] = repo.saveMemberDays.mock.calls[0]!;
    expect(from).toBe('2026-11-16');
  });

  it('a week is frozen only after its 48 h late-sync window', async () => {
    repo.listOpenChallenges.mockResolvedValue([challenge()]);
    repo.getMembers.mockResolvedValue([member('host', 'host'), member('amy')]);
    repo.getDailyScores.mockResolvedValue([
      {
        challenge_id: challenge().id,
        user_id: 'amy',
        day: '2026-11-10',
        total: 40,
        effort: 40,
        step_points: 0,
        pr_bonus: 0,
        streak_bonus: 0,
        beat_average_bonus: 0,
        minutes: 30,
        steps: 0,
        workouts: 1,
        eligible: true,
        detail: {},
      },
      {
        challenge_id: challenge().id,
        user_id: 'host',
        day: '2026-11-10',
        total: 25,
        effort: 25,
        step_points: 0,
        pr_bonus: 0,
        streak_bonus: 0,
        beat_average_bonus: 0,
        minutes: 20,
        steps: 0,
        workouts: 1,
        eligible: true,
        detail: {},
      },
    ]);
    repo.insertResults.mockResolvedValue(true);
    // Tuesday 2026-11-17: Sunday + 2 days not yet over
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    expect(await service.finalizePeriods()).toBe(0);
    expect(repo.insertResults).not.toHaveBeenCalled();
    // Wednesday: the window has passed
    vi.setSystemTime(new Date('2026-11-18T01:00:00Z'));
    expect(await service.finalizePeriods()).toBe(1);
    const [, start, end, rows] = repo.insertResults.mock.calls[0]!;
    expect([start, end]).toEqual(['2026-11-09', '2026-11-15']);
    expect(rows.map((r) => [r.user_id, r.rank, r.is_winner])).toEqual([
      ['amy', 1, true],
      ['host', 2, false],
    ]);
  });

  it('the goal bonus of each week comes from its latest scored day', () => {
    const base = {
      challenge_id: 'c',
      effort: 0,
      step_points: 0,
      pr_bonus: 0,
      streak_bonus: 0,
      beat_average_bonus: 0,
      minutes: 0,
      steps: 0,
      workouts: 0,
      eligible: true,
    };
    const standings = service.standingsFromScores(
      [member('amy')],
      [
        {
          ...base,
          user_id: 'amy',
          day: '2026-11-10',
          total: 10,
          detail: { goal: { rawBonus: 20 } },
        },
        {
          ...base,
          user_id: 'amy',
          day: '2026-11-11',
          total: 10,
          detail: { goal: { rawBonus: 35 } },
        },
      ],
      allRounder,
      { start: '2026-11-09', end: '2026-11-15' },
      '2026-11-15'
    );
    expect(standings.rows[0]!.total).toBe(55);
    expect(standings.rows[0]!.goalBonus).toBe(35);
  });

  it('jobs do nothing while Challenges is turned off', async () => {
    vi.mocked(isChallengesEnabled).mockResolvedValue(false);
    expect(await service.processScoreQueue()).toBe(0);
    expect(await service.finalizePeriods()).toBe(0);
    await service.nightlyCatchUp();
    expect(repo.takeQueuedDays).not.toHaveBeenCalled();
    expect(repo.listOpenChallenges).not.toHaveBeenCalled();
    expect(repo.enqueueRecentDaysForRunningChallenges).not.toHaveBeenCalled();
  });

  it('the queue job scores each member once from their earliest changed day and requeues on failure', async () => {
    repo.takeQueuedDays.mockResolvedValue([
      {
        challenge_id: challenge().id,
        user_id: 'amy',
        days: ['2026-11-11', '2026-11-10'],
        claim: 'lease-1',
      },
      {
        challenge_id: challenge().id,
        user_id: 'gone',
        days: ['2026-11-10'],
        claim: 'lease-1',
      },
    ]);
    repo.getChallenge.mockResolvedValue(challenge());
    repo.getMembership.mockImplementation(async (_c, userId) =>
      userId === 'amy' ? member('amy') : null
    );
    repo.saveMemberDays.mockRejectedValueOnce(new Error('boom'));
    expect(await service.processScoreQueue()).toBe(0);
    expect(repo.saveMemberDays.mock.calls[0]![2]).toBe('2026-11-10');
    expect(repo.enqueueDays).toHaveBeenCalledWith(challenge().id, 'amy', [
      '2026-11-11',
      '2026-11-10',
    ]);
    expect(repo.takeQueuedDays).toHaveBeenCalledWith(
      500,
      service.SCORE_QUIET_SECONDS,
      service.SCORE_LEASE_SECONDS
    );
    // The failed member's days stay queued; the one who left is cleared.
    expect(repo.ackQueuedDays.mock.calls.map((c) => c[0].user_id)).toEqual([
      'gone',
    ]);
  });
});

describe('review fixes (PR #3585)', () => {
  const ok = () => {
    repo.createWithHost.mockResolvedValue(challenge().id);
    repo.getMembership.mockResolvedValue(member('host', 'host'));
    repo.getForMember.mockResolvedValue(challenge());
    repo.getMembersForMember.mockResolvedValue([member('host', 'host')]);
  };
  const create = (start_date: string) =>
    service.createChallenge('host', {
      name: 'Family',
      start_date,
      display_name: 'Host',
      member_limit: 50,
      late_join: true,
    });

  it('a new challenge cannot start long ago or far ahead', async () => {
    ok();
    for (const start of ['0100-01-01', '2026-10-11', '2027-11-13']) {
      await expect(create(start)).rejects.toMatchObject({
        status: 400,
        code: 'CHALLENGE_INVALID_DATES',
      });
    }
    expect(repo.createWithHost).not.toHaveBeenCalled();
    // 31 days back (host zone: 2026-11-12 in New York) is still fine
    await create('2026-10-12');
    expect(repo.createWithHost).toHaveBeenCalledTimes(1);
  });

  it('joining a long-running challenge queues at most one maximum-length span', async () => {
    repo.joinByInviteHash.mockResolvedValue({
      status: 'joined',
      challenge: challenge({ start_date: '2024-01-01' }),
    });
    repo.getMembership.mockResolvedValue(member('amy'));
    repo.getForMember.mockResolvedValue(challenge());
    repo.getMembersForMember.mockResolvedValue([member('amy')]);
    await service.joinChallenge('amy', {
      code: 'AAAAAAAAAAAAAAAAAAAAAA',
      display_name: 'Amy',
    });
    const days = repo.enqueueDays.mock.calls[0]![2];
    expect(days).toHaveLength(365);
    expect(days[days.length - 1]).toBe('2026-11-12');
  });

  it('the latest rules change is the last one written, not the earliest transaction', () => {
    const changes = [
      change('2026-11-09', allRounder),
      // started first, written second
      change(
        '2026-11-16',
        { ...steps, dailyCap: 7000 },
        '2026-11-12T00:00:00Z',
        '3'
      ),
      change(
        '2026-11-16',
        { ...steps, dailyCap: 5000 },
        '2026-11-12T00:00:01Z',
        '2'
      ),
    ];
    expect(service.rulesForDay(changes, '2026-11-16').dailyCap).toBe(7000);
  });

  it('a member is scored inside their scoring lock, and the queue acks only after the save', async () => {
    let locked = false;
    repo.withScoringLock.mockImplementationOnce(async (_c, _u, fn) => {
      locked = true;
      try {
        return await fn();
      } finally {
        locked = false;
      }
    });
    let savedLocked: boolean | null = null;
    repo.saveMemberDays.mockImplementationOnce(async () => {
      savedLocked = locked;
    });
    repo.takeQueuedDays.mockResolvedValue([
      {
        challenge_id: challenge().id,
        user_id: 'amy',
        days: ['2026-11-10'],
        claim: 'lease-1',
      },
    ]);
    repo.getChallenge.mockResolvedValue(challenge());
    repo.getMembership.mockResolvedValue(member('amy'));
    expect(await service.processScoreQueue()).toBe(1);
    expect(repo.withScoringLock).toHaveBeenCalledWith(
      challenge().id,
      'amy',
      expect.any(Function)
    );
    expect(savedLocked).toBe(true);
    expect(repo.ackQueuedDays).toHaveBeenCalledTimes(1);
    expect(repo.saveMemberDays.mock.invocationCallOrder[0]!).toBeLessThan(
      repo.ackQueuedDays.mock.invocationCallOrder[0]!
    );
  });

  it('the weekly goal counts only the workouts the rules count', async () => {
    const rules = {
      ...allRounder,
      activities: { ...allRounder.activities, manualEntries: 'ignore' },
    };
    repo.getRuleChanges.mockResolvedValue([change('2026-11-09', rules)]);
    repo.getMemberEntries.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        entry_date: '2026-11-10',
        entry_time: null,
        duration_minutes: 30,
        avg_heart_rate: null,
        max_heart_rate: null,
        exercise_name: 'Walk',
        category: null,
        source: null,
        exercise_id: null,
        distance: null,
        active_calories: null,
        calories_burned: null,
        elevation_gain_meters: null,
        zone_seconds: null,
        sets: null,
      },
    ]);
    await service.recomputeMember(
      challenge({ rules }),
      member('amy'),
      '2026-11-10'
    );
    const scores = repo.saveMemberDays.mock.calls[0]![4];
    const goal = scores.find((d) => d.day === '2026-11-10')!.detail.goal as {
      done: number;
      rawBonus: number;
    };
    expect(goal.done).toBe(0);
    expect(goal.rawBonus).toBe(0);
  });

  it('finalising rescores only the period being frozen', async () => {
    repo.listOpenChallenges.mockResolvedValue([challenge()]);
    repo.getMembers.mockResolvedValue([member('amy')]);
    repo.getDailyScores.mockResolvedValue([]);
    repo.insertResults.mockResolvedValue(true);
    vi.setSystemTime(new Date('2026-11-26T12:00:00Z')); // two weeks overdue
    expect(await service.finalizePeriods()).toBe(2);
    expect(repo.saveMemberDays.mock.calls.map((c) => [c[2], c[3]])).toEqual([
      ['2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-22'],
    ]);
  });
});
