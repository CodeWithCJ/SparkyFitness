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
    getRuleLogsForMember: vi.fn(),
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
    enqueueDaysForAllMembers: vi.fn(),
    takeQueuedDays: vi.fn(),
    ackQueuedDays: vi.fn(),
    withScoringLock: vi.fn(
      async (_c: string, _u: string, fn: (lock: unknown) => Promise<unknown>) =>
        fn({ lockClient: true })
    ),
    saveMemberDays: vi.fn(),
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
vi.mock('../utils/shutdownHooks.js', () => ({
  isShuttingDown: vi.fn(() => false),
}));

import challengeRepository, {
  type ChallengeMemberRow,
  type ChallengeRow,
  type MemberEntryRow,
} from '../models/challengeRepository.js';
import { log } from '../config/logging.js';
import { isShuttingDown } from '../utils/shutdownHooks.js';
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
  repo.getRuleChangesForMember.mockResolvedValue([]);
  repo.getRuleLogsForMember.mockResolvedValue([]);
  repo.getMemberEntries.mockResolvedValue([]);
  repo.getMemberSteps.mockResolvedValue({});
  repo.setInvite.mockResolvedValue(true);
  repo.updateRules.mockResolvedValue(true);
  vi.mocked(isShuttingDown).mockReturnValue(false);
  repo.clearInvite.mockResolvedValue(true);
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
      '2026-11-16',
      1,
      expect.any(Function)
    );
  });

  it('after the start, a change applies from the next week', async () => {
    repo.getChallenge.mockResolvedValue(challenge());
    await service.updateRules('host', challenge().id, {
      ...allRounder,
      bestDaysPerWeek: 4,
    });
    expect(repo.updateRules.mock.calls[0]![3]).toBe('2026-11-16');
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

  it('the day a change takes effect is decided again under the row lock', async () => {
    // Sunday 23:59 in the challenge's zone: from Monday 11-16. The save then
    // waits on the row lock past midnight, so it applies from 11-23.
    vi.setSystemTime(new Date('2026-11-15T23:59:00Z'));
    repo.getChallenge.mockResolvedValue(challenge());
    let decided = '';
    repo.updateRules.mockImplementation(
      async (_id, _by, _rules, early, _version, recheck) => {
        expect(early).toBe('2026-11-16');
        vi.setSystemTime(new Date('2026-11-16T00:01:00Z'));
        decided = recheck!(challenge());
        return true;
      }
    );
    await service.updateRules('host', challenge().id, {
      ...allRounder,
      bestDaysPerWeek: 4,
    });
    expect(decided).toBe('2026-11-23');
  });

  it('a period change accepted before the start is refused if the challenge started by the save', async () => {
    vi.setSystemTime(new Date('2026-11-15T23:59:00Z'));
    const upcoming = challenge({ start_date: '2026-11-16' });
    repo.getChallenge.mockResolvedValue(upcoming);
    repo.updateRules.mockImplementation(
      async (_id, _by, _rules, _early, _version, recheck) => {
        vi.setSystemTime(new Date('2026-11-16T00:01:00Z'));
        recheck!(upcoming);
        return true;
      }
    );
    await expect(
      service.updateRules('host', upcoming.id, {
        ...allRounder,
        period: 'day',
      })
    ).rejects.toMatchObject({ status: 400, code: 'CHALLENGE_PERIOD_LOCKED' });
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
    const [, hostUserId, storedHash, expiresAt] = repo.setInvite.mock.calls[0]!;
    expect(hostUserId).toBe('host');
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
        calories_applied: null,
        calorie_link_id: null,
        calorie_link_resolution: null,
        calorie_link_sources: null,
        elevation_gain_meters: null,
        zone_seconds: null,
        edited: false,
        sets: null,
        session: null,
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
    const [, start, end, build] = repo.insertResults.mock.calls[0]!;
    expect([start, end]).toEqual(['2026-11-09', '2026-11-15']);
    // The freeze hands the builder the scores it read under its lock
    const rows = build(await repo.getDailyScores(challenge().id, start, end));
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
    expect(repo.enqueueDaysForAllMembers).not.toHaveBeenCalled();
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
    const lockClient = { lockClient: 'held' } as never;
    repo.withScoringLock.mockImplementationOnce(async (_c, _u, fn) => {
      locked = true;
      try {
        return await fn(lockClient);
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
    // Saved on the connection that holds the lock, so a lost lock fails the save
    expect(repo.saveMemberDays.mock.calls[0]![6]).toBe(lockClient);
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
        calories_applied: null,
        calorie_link_id: null,
        calorie_link_resolution: null,
        calorie_link_sources: null,
        elevation_gain_meters: null,
        zone_seconds: null,
        edited: false,
        sets: null,
        session: null,
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

  it('freezes the standings of the scores read under the freeze lock, not an earlier read', async () => {
    repo.listOpenChallenges.mockResolvedValue([challenge()]);
    repo.getMembers.mockResolvedValue([member('host', 'host'), member('amy')]);
    const row = (user_id: string, total: number) => ({
      challenge_id: challenge().id,
      user_id,
      day: '2026-11-10',
      total,
      effort: total,
      step_points: 0,
      pr_bonus: 0,
      streak_bonus: 0,
      beat_average_bonus: 0,
      minutes: 20,
      steps: 0,
      workouts: 1,
      eligible: true,
      detail: {},
    });
    // What a read before the lock would have seen: host ahead. A rescore of
    // amy's late sync then saved 40, which the freeze reads under its lock.
    repo.getDailyScores.mockResolvedValue([row('amy', 10), row('host', 25)]);
    let frozen: Array<{ user_id: string; rank: number }> = [];
    repo.insertResults.mockImplementation(async (_id, _start, _end, build) => {
      frozen = build([row('amy', 40), row('host', 25)]);
      return true;
    });
    vi.setSystemTime(new Date('2026-11-18T01:00:00Z'));
    expect(await service.finalizePeriods()).toBe(1);
    expect(frozen.map((r) => [r.user_id, r.rank])).toEqual([
      ['amy', 1],
      ['host', 2],
    ]);
    expect(repo.getDailyScores).not.toHaveBeenCalled();
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

  describe('standings', () => {
    const score = (user_id: string, total: number) => ({
      challenge_id: challenge().id,
      user_id,
      day: '2026-11-10',
      total,
      effort: total,
      step_points: 0,
      pr_bonus: 0,
      streak_bonus: 0,
      beat_average_bonus: 0,
      minutes: 30,
      steps: 0,
      workouts: 1,
      eligible: true,
      detail: {},
    });
    beforeEach(() => {
      repo.getMembership.mockResolvedValue(member('amy'));
      repo.getForMember.mockResolvedValue(challenge());
      repo.getRuleChangesForMember.mockResolvedValue([
        change('2026-11-09', allRounder),
      ]);
      repo.getMembersForMember.mockResolvedValue([
        member('host', 'host'),
        member('amy'),
      ]);
    });

    it("a running period has no winner yet, and the caller's row is marked", async () => {
      repo.getResultsForMember.mockResolvedValue([]);
      repo.getDailyScoresForMember.mockResolvedValue([
        score('amy', 40),
        score('host', 25),
      ]);
      const res = await service.getStandings('amy', challenge().id);
      expect(res.final).toBe(false);
      expect(res.rows.map((r) => [r.user_id, r.rank, r.winner, r.me])).toEqual([
        ['amy', 1, false, true],
        ['host', 2, false, false],
      ]);
    });

    it('a frozen period stays final when its result rows went with deleted accounts', async () => {
      repo.getResultsForMember.mockResolvedValue([]);
      repo.frozenPeriodStarts.mockResolvedValue(['2026-11-09']);
      repo.getDailyScoresForMember.mockResolvedValue([score('amy', 40)]);
      const res = await service.getStandings(
        'amy',
        challenge().id,
        '2026-11-10'
      );
      expect(res.final).toBe(true);
      expect(res.rows).toEqual([]);
      expect(repo.getDailyScoresForMember).not.toHaveBeenCalled();
      // The marker is read before the rows, so a period frozen in between
      // is never shown final without its rows
      expect(
        repo.frozenPeriodStarts.mock.invocationCallOrder.at(-1)!
      ).toBeLessThan(repo.getResultsForMember.mock.invocationCallOrder.at(-1)!);
    });

    it('a frozen period keeps its winner and marks the caller', async () => {
      repo.getResultsForMember.mockResolvedValue(
        ['amy', 'host'].map((user_id, i) => ({
          challenge_id: challenge().id,
          period_start: '2026-11-09',
          period_end: '2026-11-15',
          user_id,
          display_name: user_id.toUpperCase(),
          rank: i + 1,
          total: 40 - i * 15,
          minutes: 30,
          is_winner: i === 0,
          reached_on: null,
          detail: {},
          finalized_at: new Date(),
        }))
      );
      const res = await service.getStandings('host', challenge().id);
      expect(res.final).toBe(true);
      expect(res.rows.map((r) => [r.user_id, r.winner, r.me])).toEqual([
        ['amy', true, false],
        ['host', false, true],
      ]);
    });
  });
});

describe('review fixes from Jerrys-modz (PR #3585)', () => {
  const row = (overrides: Partial<MemberEntryRow> = {}): MemberEntryRow => ({
    id: '33333333-3333-4333-8333-333333333333',
    entry_date: '2026-11-10',
    entry_time: '07:00',
    duration_minutes: 45,
    avg_heart_rate: null,
    max_heart_rate: null,
    exercise_name: 'Bench Press',
    category: 'Strength',
    source: 'Workout Plan',
    exercise_id: null,
    distance: null,
    active_calories: null,
    calories_burned: 200,
    calories_applied: null,
    calorie_link_id: null,
    calorie_link_resolution: null,
    calorie_link_sources: null,
    elevation_gain_meters: null,
    zone_seconds: null,
    edited: false,
    sets: [
      {
        weight: 60,
        reps: 8,
        set_type: 'Working Set',
        completed_at: null,
        started_at: null,
      },
    ],
    session: null,
    ...overrides,
  });
  const session = (
    overrides: Partial<NonNullable<MemberEntryRow['session']>> = {}
  ): NonNullable<MemberEntryRow['session']> => ({
    source: 'Workout Plan',
    finished_at: null,
    edited: false,
    has_plan_assignment: true,
    sets: [{ completed_at: null }, { completed_at: null }],
    ...overrides,
  });

  it('a planned workout from a prefill plan earns nothing until it is done', async () => {
    // Untouched rows a plan generated: a single row and a grouped session
    expect(service.isPlannedEntryRow(row())).toBe(true);
    expect(service.isPlannedEntryRow(row({ session: session() }))).toBe(true);
    // Plan-linked session logged under another source, still untouched
    expect(
      service.isPlannedEntryRow(
        row({ source: 'Manual', session: session({ source: 'Manual' }) })
      )
    ).toBe(true);
    // Done: a set checked off, the session finished, the row edited or started
    expect(
      service.isPlannedEntryRow(
        row({
          session: session({
            sets: [
              { completed_at: '2026-11-10T07:30:00Z' },
              { completed_at: null },
            ],
          }),
        })
      )
    ).toBe(false);
    expect(
      service.isPlannedEntryRow(
        row({ session: session({ finished_at: '2026-11-10T08:00:00Z' }) })
      )
    ).toBe(false);
    expect(service.isPlannedEntryRow(row({ edited: true }))).toBe(false);
    // Reps and weights filled in on a plan session, nothing ticked: the
    // plan regeneration keeps it as the member's workout, so it counts
    expect(
      service.isPlannedEntryRow(row({ session: session({ edited: true }) }))
    ).toBe(false);
    expect(
      service.isPlannedEntryRow(
        row({
          sets: [
            {
              weight: 60,
              reps: 8,
              set_type: null,
              completed_at: null,
              started_at: '2026-11-10T07:05:00Z',
            },
          ],
        })
      )
    ).toBe(false);
    // Anything not from a plan was logged, so it counts
    expect(service.isPlannedEntryRow(row({ source: 'Manual' }))).toBe(false);
    expect(service.isPlannedEntryRow(row({ source: 'garmin' }))).toBe(false);

    // Scoring runs to tomorrow; tomorrow's planned workout is not scored
    repo.getMemberEntries.mockResolvedValue([
      row({ id: 'planned-today', entry_date: '2026-11-12' }),
      row({
        id: 'planned-tomorrow',
        entry_date: '2026-11-13',
        session: session(),
      }),
      row({ id: 'logged', entry_date: '2026-11-12', source: 'Manual' }),
    ]);
    await service.recomputeMember(challenge(), member('amy'), '2026-11-12');
    const [, , , , scores, cards] = repo.saveMemberDays.mock.calls[0]!;
    expect(cards.map((c) => c.exercise_entry_id)).toEqual(['logged']);
    expect(scores.find((d) => d.day === '2026-11-12')!.workouts).toBe(1);
    expect(scores.find((d) => d.day === '2026-11-13')!.workouts).toBe(0);
    expect(scores.find((d) => d.day === '2026-11-13')!.total).toBe(0);
  });

  it("warm-up sets are left out of a lift's best with the shared isWarmupSetType", () => {
    const sets = (setType: string) => [
      {
        weight: 140,
        reps: 1,
        set_type: setType,
        completed_at: null,
        started_at: null,
      },
      {
        weight: 100,
        reps: 5,
        set_type: 'Working Set',
        completed_at: null,
        started_at: null,
      },
    ];
    const working = service.toChallengeEntry(
      row({ sets: sets('Working Set') })
    );
    for (const warmup of ['Warm-up', 'warmup', 'WARM UP']) {
      const entry = service.toChallengeEntry(row({ sets: sets(warmup) }));
      expect(entry.bestE1rm, warmup).toBeLessThan(working.bestE1rm!);
      expect(entry.bestE1rm, warmup).toBeCloseTo(
        service.toChallengeEntry(row({ sets: sets('Working Set').slice(1) }))
          .bestE1rm!
      );
    }
  });

  it("carries a calorie link's id and resolution to the scorer", () => {
    const entry = service.toChallengeEntry(
      row({
        source: 'sparky',
        calories_applied: 0,
        calorie_link_id: '44444444-4444-4444-8444-444444444444',
        calorie_link_resolution: 'custom',
      })
    );
    expect(entry).toMatchObject({
      activeCalories: 0,
      caloriesEstimate: 200,
      calorieLinkId: '44444444-4444-4444-8444-444444444444',
      calorieLinkResolution: 'custom',
    });
  });

  it('an explicit end_date: null makes an open-ended challenge, not the preset length', async () => {
    repo.createWithHost.mockResolvedValue(challenge().id);
    repo.getMembership.mockResolvedValue(member('host', 'host'));
    repo.getForMember.mockResolvedValue(challenge());
    repo.getMembersForMember.mockResolvedValue([member('host', 'host')]);
    const base = {
      name: 'Hustle',
      start_date: '2026-11-10',
      display_name: 'Host',
      preset: 'workweek_hustle',
      member_limit: 50,
      late_join: true,
    } as const;
    await service.createChallenge('host', { ...base, end_date: null });
    expect(repo.createWithHost.mock.calls[0]![0].endDate).toBeNull();
    // Left out, the preset's 5 weekdays still apply (Tuesday to Monday)
    await service.createChallenge('host', base);
    expect(repo.createWithHost.mock.calls[1]![0].endDate).toBe('2026-11-16');
  });

  it("the nightly catch-up works out each challenge's days in its own zone, and one bad zone does not stop the others", async () => {
    vi.setSystemTime(new Date('2026-11-12T03:00:00Z')); // 11-11 in New York
    repo.rehostOrphans.mockResolvedValue(0);
    repo.listOpenChallenges.mockResolvedValue([
      challenge({ id: 'bad', time_zone: 'Not/AZone' }),
      challenge({ id: 'ny', time_zone: 'America/New_York' }),
      challenge({ id: 'utc', start_date: '2026-11-11' }),
      challenge({
        id: 'ended',
        start_date: '2026-10-01',
        end_date: '2026-10-31',
      }),
    ]);
    repo.enqueueDaysForAllMembers.mockResolvedValue(1);
    await service.nightlyCatchUp();
    expect(repo.enqueueDaysForAllMembers.mock.calls).toEqual([
      ['ny', ['2026-11-09', '2026-11-10', '2026-11-11']],
      ['utc', ['2026-11-11', '2026-11-12']],
    ]);
    expect(vi.mocked(log)).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('bad'),
      expect.anything()
    );
  });

  it('creating challenges and changing rules are rate limited', async () => {
    vi.mocked(rateLimitWindowRepository.hit).mockResolvedValue({
      count: service.CREATES_PER_WINDOW + 1,
      resetInMs: 5000,
    });
    await expect(
      service.createChallenge('host', {
        name: 'Family',
        start_date: '2026-11-10',
        display_name: 'Host',
        member_limit: 50,
        late_join: true,
      })
    ).rejects.toMatchObject({ status: 429, code: 'CHALLENGE_RATE_LIMITED' });
    expect(rateLimitWindowRepository.hit).toHaveBeenLastCalledWith(
      'challenge-create:host',
      service.CREATE_WINDOW_MS
    );
    expect(repo.createWithHost).not.toHaveBeenCalled();

    repo.getMembership.mockResolvedValue(member('host', 'host'));
    repo.getChallenge.mockResolvedValue(challenge());
    vi.mocked(rateLimitWindowRepository.hit).mockResolvedValue({
      count: service.RULE_CHANGES_PER_WINDOW + 1,
      resetInMs: 5000,
    });
    await expect(
      service.updateRules('host', challenge().id, allRounder)
    ).rejects.toMatchObject({ status: 429, code: 'CHALLENGE_RATE_LIMITED' });
    expect(rateLimitWindowRepository.hit).toHaveBeenLastCalledWith(
      `challenge-rules:${challenge().id}`,
      service.RULE_CHANGE_WINDOW_MS
    );
    expect(repo.updateRules).not.toHaveBeenCalled();

    // Refused attempts do not use up the allowance: a change that is not
    // allowed, a bad start date, a member who is not the host
    vi.mocked(rateLimitWindowRepository.hit).mockClear();
    await expect(
      service.updateRules('host', challenge().id, {
        ...allRounder,
        period: 'month',
      })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.createChallenge('host', {
        name: 'Family',
        start_date: '2020-01-01',
        display_name: 'Host',
        member_limit: 50,
        late_join: true,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(rateLimitWindowRepository.hit).not.toHaveBeenCalled();
    repo.getMembership.mockResolvedValue(member('amy'));
    await expect(
      service.updateRules('amy', challenge().id, allRounder)
    ).rejects.toMatchObject({ status: 403 });
    expect(rateLimitWindowRepository.hit).not.toHaveBeenCalled();
  });
});

describe('bot review follow-ups (PRs #3594 and #3595)', () => {
  it('an invite is set or cleared only while the caller is still the host', async () => {
    repo.getMembership.mockResolvedValue(member('host', 'host'));
    repo.getChallenge.mockResolvedValue(challenge());
    repo.setInvite.mockResolvedValue(false); // hosting passed on meanwhile
    await expect(
      service.createInvite('host', challenge().id, 7)
    ).rejects.toMatchObject({ status: 403, code: 'CHALLENGE_HOST_ONLY' });
    repo.clearInvite.mockResolvedValue(false);
    await expect(
      service.revokeInvite('host', challenge().id)
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.clearInvite).toHaveBeenCalledWith(challenge().id, 'host');
  });

  it('a repeated join queues the backfill again', async () => {
    repo.joinByInviteHash.mockResolvedValue({
      status: 'already_member',
      challenge: challenge(),
    });
    repo.getMembership.mockResolvedValue(member('amy'));
    repo.getForMember.mockResolvedValue(challenge());
    repo.getMembersForMember.mockResolvedValue([member('amy')]);
    await service.joinChallenge('amy', {
      code: 'AAAAAAAAAAAAAAAAAAAAAA',
      display_name: 'Amy',
    });
    expect(repo.enqueueDays).toHaveBeenCalledWith(challenge().id, 'amy', [
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ]);
  });

  it('tomorrow is scored for members ahead of the zone but is an eligible day only with activity', async () => {
    await service.recomputeMember(challenge(), member('amy'), '2026-11-12');
    let scores = repo.saveMemberDays.mock.calls[0]![4];
    expect(scores.map((d) => [d.day, d.eligible])).toEqual([
      ['2026-11-12', true],
      ['2026-11-13', false],
    ]);
    repo.getMemberSteps.mockResolvedValue({ '2026-11-13': 4000 });
    await service.recomputeMember(challenge(), member('amy'), '2026-11-12');
    scores = repo.saveMemberDays.mock.calls[1]![4];
    expect(scores.find((d) => d.day === '2026-11-13')!.eligible).toBe(true);
  });

  it("tomorrow's daily calorie total makes it eligible only where the challenge counts it", async () => {
    const calories = { ...allRounder, metric: 'active_calories' as const };
    const sportOnly = {
      ...calories,
      activities: { ...calories.activities, includeSports: ['running'] },
    } as typeof calories;
    repo.getMemberEntries.mockResolvedValue([
      {
        id: '77777777-7777-4777-8777-777777777771',
        entry_date: '2026-11-13',
        entry_time: null,
        duration_minutes: 0,
        avg_heart_rate: null,
        max_heart_rate: null,
        exercise_name: 'Active Calories',
        category: 'Other',
        source: 'garmin',
        exercise_id: null,
        distance: null,
        active_calories: null,
        calories_burned: 50,
        calories_applied: null,
        calorie_link_id: null,
        calorie_link_resolution: null,
        calorie_link_sources: null,
        elevation_gain_meters: null,
        zone_seconds: null,
        edited: false,
        sets: null,
        session: null,
      },
    ]);
    const tomorrow = async (rules: typeof calories, call: number) => {
      repo.getRuleChanges.mockResolvedValue([
        change(challenge().start_date, rules),
      ]);
      await service.recomputeMember(
        challenge({ rules }),
        member('amy'),
        '2026-11-12'
      );
      return repo.saveMemberDays.mock.calls[call]![4].find(
        (d) => d.day === '2026-11-13'
      )!;
    };
    expect((await tomorrow(calories, 0)).eligible).toBe(true);
    const filtered = await tomorrow(sportOnly, 1);
    expect(filtered.eligible).toBe(false);
    expect(filtered.total).toBe(0);
  });

  it('a race finish counts the goal bonus on the day it was earned', () => {
    const race = {
      ...allRounder,
      format: 'race' as const,
      target: 100,
    };
    const day = (date: string, total: number) => ({
      challenge_id: challenge().id,
      user_id: 'amy',
      day: date,
      total,
      effort: total,
      step_points: 0,
      pr_bonus: 0,
      streak_bonus: 0,
      beat_average_bonus: 0,
      minutes: 30,
      steps: 0,
      workouts: 1,
      eligible: true,
      detail: { goal: { rawBonus: date >= '2026-11-11' ? 30 : 10 } },
    });
    const { rows } = service.standingsFromScores(
      [member('amy')],
      [
        day('2026-11-09', 40),
        day('2026-11-10', 20),
        day('2026-11-11', 15),
        day('2026-11-12', 0),
      ],
      race,
      { start: '2026-11-09', end: '2026-11-15' },
      '2026-11-12'
    );
    // 40 + 20 + 15 = 75, plus the goal's 30 by Wednesday = 105
    expect(rows[0]!.reachedOn).toBe('2026-11-11');
    expect(rows[0]!.total).toBe(105);
  });
});

describe('bot review follow-ups, second round', () => {
  const diaryRow = (
    overrides: Partial<MemberEntryRow> = {}
  ): MemberEntryRow => ({
    id: '44444444-4444-4444-8444-444444444444',
    entry_date: '2026-11-07',
    entry_time: '09:00',
    duration_minutes: 60,
    avg_heart_rate: null,
    max_heart_rate: null,
    exercise_name: 'Run',
    category: 'Cardio',
    source: 'garmin',
    exercise_id: null,
    distance: null,
    active_calories: null,
    calories_burned: null,
    calories_applied: null,
    calorie_link_id: null,
    calorie_link_resolution: null,
    calorie_link_sources: null,
    elevation_gain_meters: null,
    zone_seconds: null,
    edited: false,
    sets: null,
    session: null,
    ...overrides,
  });

  it('a plan session with a started set is under way, so it counts', () => {
    const session = {
      source: 'Workout Plan',
      finished_at: null,
      edited: false,
      has_plan_assignment: true,
      sets: [{ completed_at: null, started_at: null }],
    };
    expect(service.isPlannedEntryRow(diaryRow({ session }))).toBe(true);
    expect(
      service.isPlannedEntryRow(
        diaryRow({
          session: {
            ...session,
            sets: [{ completed_at: null, started_at: '2026-11-07T09:01:00Z' }],
          },
        })
      )
    ).toBe(false);
  });

  it('the weekly goal counts only workouts on the weekdays the challenge counts', async () => {
    const weekdays = { ...allRounder, days: [1, 2, 3, 4, 5] };
    const start = challenge({ start_date: '2026-11-02', rules: weekdays });
    repo.getRuleChanges.mockResolvedValue([change('2026-11-02', weekdays)]);
    repo.getMemberEntries.mockResolvedValue([diaryRow()]); // a Saturday run
    await service.recomputeMember(start, member('amy'), '2026-11-02');
    const goalOn = (call: number, day: string) =>
      (
        repo.saveMemberDays.mock.calls[call]![4].find((d) => d.day === day)!
          .detail.goal as { done: number }
      ).done;
    expect(goalOn(0, '2026-11-08')).toBe(0);
    // The same run on a challenge that counts every day does count
    repo.getRuleChanges.mockResolvedValue([change('2026-11-02', allRounder)]);
    await service.recomputeMember(
      challenge({ start_date: '2026-11-02' }),
      member('amy'),
      '2026-11-02'
    );
    expect(goalOn(1, '2026-11-08')).toBeGreaterThan(0);
  });

  it('daily Active Calories summaries are not workouts: no workouts, streak or goal', async () => {
    const start = challenge({ start_date: '2026-11-02' });
    repo.getRuleChanges.mockResolvedValue([change('2026-11-02', allRounder)]);
    // What upsertExerciseEntryData stores for a synced daily calorie total
    const summary = (day: string, id: string) =>
      diaryRow({
        id,
        entry_date: day,
        entry_time: null,
        duration_minutes: 0,
        exercise_name: 'Active Calories',
        category: 'Other',
        calories_burned: 600,
      });
    repo.getMemberEntries.mockResolvedValue([
      summary('2026-11-02', '55555555-5555-4555-8555-555555555551'),
      summary('2026-11-03', '55555555-5555-4555-8555-555555555552'),
      summary('2026-11-04', '55555555-5555-4555-8555-555555555553'),
    ]);
    await service.recomputeMember(start, member('amy'), '2026-11-02');
    const days = repo.saveMemberDays.mock.calls[0]![4];
    for (const d of days.filter((x) => x.day <= '2026-11-04')) {
      expect(d.workouts, d.day).toBe(0);
      expect(d.streak_bonus, d.day).toBe(0);
      expect((d.detail.goal as { done: number }).done, d.day).toBe(0);
    }
    expect(repo.saveMemberDays.mock.calls[0]![5]).toEqual([]);
    // An active-calories challenge still counts the daily total, as before
    const calories = { ...allRounder, metric: 'active_calories' as const };
    repo.getRuleChanges.mockResolvedValue([change('2026-11-02', calories)]);
    await service.recomputeMember(
      challenge({ start_date: '2026-11-02', rules: calories }),
      member('amy'),
      '2026-11-02'
    );
    const kcal = repo.saveMemberDays.mock.calls[1]![4];
    expect(kcal.find((d) => d.day === '2026-11-03')!.total).toBe(600);
    // ...but a day holding only the daily total has no workout
    expect(kcal.find((d) => d.day === '2026-11-03')!.workouts).toBe(0);
    expect(repo.saveMemberDays.mock.calls[1]![5]).toEqual([]);
  });

  it("a workout's calories follow the Diary's override, and under cap the measured figure", async () => {
    const calories = { ...allRounder, metric: 'active_calories' as const };
    const capped = {
      ...calories,
      activities: { ...calories.activities, manualEntries: 'cap' as const },
    } as typeof calories;
    // A watch run measured at 300 active kcal (450 with resting energy) that
    // the member set to 500 in the Diary, and one set to 0
    repo.getMemberEntries.mockResolvedValue([
      diaryRow({
        id: '88888888-8888-4888-8888-888888888881',
        entry_date: '2026-11-03',
        active_calories: 300,
        calories_burned: 450,
        calories_applied: 500,
      }),
      diaryRow({
        id: '88888888-8888-4888-8888-888888888882',
        entry_date: '2026-11-04',
        active_calories: 300,
        calories_burned: 450,
        calories_applied: 0,
      }),
      diaryRow({
        id: '88888888-8888-4888-8888-888888888883',
        entry_date: '2026-11-05',
        active_calories: 300,
        calories_burned: 450,
      }),
    ]);
    const run = async (rules: typeof calories, call: number) => {
      repo.getRuleChanges.mockResolvedValue([change('2026-11-02', rules)]);
      await service.recomputeMember(
        challenge({ start_date: '2026-11-02', rules }),
        member('amy'),
        '2026-11-02'
      );
      const days = repo.saveMemberDays.mock.calls[call]![4];
      return (day: string) => days.find((d) => d.day === day)!;
    };
    const full = await run(calories, 0);
    expect(full('2026-11-03').total).toBe(500);
    expect(full('2026-11-04').total).toBe(0);
    // No override: the measured active part, not the total with resting energy
    expect(full('2026-11-05').total).toBe(300);
    // The override changes calories only: each is still a workout with a card
    expect(full('2026-11-04').workouts).toBe(1);
    expect(repo.saveMemberDays.mock.calls[0]![5]).toHaveLength(3);
    const cap = await run(capped, 1);
    expect(cap('2026-11-03').total).toBe(300);
    expect(cap('2026-11-04').total).toBe(300);
  });

  it('a calorie link across two dates scores the same in one rescore as in two daily finalizations', async () => {
    const capped = {
      ...allRounder,
      metric: 'active_calories' as const,
      activities: {
        ...allRounder.activities,
        manualEntries: 'cap' as const,
        manualMinutesCap: 15,
      },
    } as typeof allRounder;
    repo.getRuleChanges.mockResolvedValue([change('2026-11-02', capped)]);
    // A 300 kcal Garmin run on Nov 5 linked to a 30-minute Manual copy on
    // Nov 6 with a custom 800: the link writes 0 on the Garmin side
    const link = {
      calorie_link_id: '77777777-7777-4777-8777-777777777770',
      calorie_link_resolution: 'custom' as const,
    };
    const rows = [
      diaryRow({
        id: '77777777-7777-4777-8777-777777777771',
        entry_date: '2026-11-05',
        duration_minutes: 30,
        active_calories: 300,
        calories_applied: 0,
        ...link,
        calorie_link_sources: ['Manual'],
      }),
      diaryRow({
        id: '77777777-7777-4777-8777-777777777772',
        entry_date: '2026-11-06',
        duration_minutes: 30,
        source: 'Manual',
        calories_burned: 250,
        calories_applied: 800,
        ...link,
        calorie_link_sources: ['garmin'],
      }),
    ];
    // The member read returns only the rows inside the dates asked for
    repo.getMemberEntries.mockImplementation(
      async (_user: string, from: string, to: string) =>
        rows.filter((r) => r.entry_date >= from && r.entry_date <= to)
    );
    const totals = async (from: string, to: string) => {
      await service.recomputeMember(
        challenge({ start_date: '2026-11-02', rules: capped }),
        member('amy'),
        from,
        to
      );
      const days = repo.saveMemberDays.mock.calls.at(-1)![4];
      return Object.fromEntries(
        days
          .filter((d) => d.day >= from && d.day <= to)
          .map((d) => [d.day, d.total])
      );
    };
    const rescore = await totals('2026-11-05', '2026-11-06');
    expect(rescore).toEqual({ '2026-11-05': 300, '2026-11-06': 0 });
    expect({
      ...(await totals('2026-11-05', '2026-11-05')),
      ...(await totals('2026-11-06', '2026-11-06')),
    }).toEqual(rescore);
  });

  it('an active-calories day with a daily total and a run scores the larger, not both', async () => {
    const calories = { ...allRounder, metric: 'active_calories' as const };
    repo.getRuleChanges.mockResolvedValue([change('2026-11-02', calories)]);
    // A 600 kcal Garmin day with a 300 kcal run inside it, and a 200 kcal day
    // with the same run, and a day holding only the run
    const daily = (day: string, id: string, kcal: number) =>
      diaryRow({
        id,
        entry_date: day,
        entry_time: null,
        duration_minutes: 0,
        exercise_name: 'Active Calories',
        category: 'Other',
        calories_burned: kcal,
      });
    const runOn = (day: string, id: string) =>
      diaryRow({ id, entry_date: day, active_calories: 300 });
    repo.getMemberEntries.mockResolvedValue([
      daily('2026-11-03', '66666666-6666-4666-8666-666666666661', 600),
      runOn('2026-11-03', '66666666-6666-4666-8666-666666666662'),
      daily('2026-11-04', '66666666-6666-4666-8666-666666666663', 200),
      runOn('2026-11-04', '66666666-6666-4666-8666-666666666664'),
      runOn('2026-11-05', '66666666-6666-4666-8666-666666666665'),
    ]);
    await service.recomputeMember(
      challenge({ start_date: '2026-11-02', rules: calories }),
      member('amy'),
      '2026-11-02'
    );
    const days = repo.saveMemberDays.mock.calls[0]![4];
    const on = (day: string) => days.find((d) => d.day === day)!;
    expect(on('2026-11-03').total).toBe(600);
    expect(on('2026-11-04').total).toBe(300);
    expect(on('2026-11-05').total).toBe(300);
    // The run is still one workout and one card each day; the total is neither
    expect(on('2026-11-03').workouts).toBe(1);
    expect(repo.saveMemberDays.mock.calls[0]![5]).toHaveLength(3);
  });

  it('a long streak threshold reads enough history', async () => {
    const rules = {
      ...allRounder,
      points: { ...allRounder.points!, streak: { fromDay: 60, bonus: 5 } },
    };
    repo.getRuleChanges.mockResolvedValue([change('2026-11-09', rules)]);
    await service.recomputeMember(
      challenge({ rules }),
      member('amy'),
      '2026-11-12'
    );
    expect(repo.getMemberEntries.mock.calls[0]![1] <= '2026-09-12').toBe(true);
  });

  it('the queue job starts no member run once shutdown begins and hands the days back', async () => {
    repo.takeQueuedDays.mockResolvedValue([
      {
        challenge_id: challenge().id,
        user_id: 'amy',
        days: ['2026-11-10'],
        claim: 'lease-1',
      },
    ]);
    vi.mocked(isShuttingDown).mockReturnValue(true);
    expect(await service.processScoreQueue()).toBe(0);
    expect(repo.saveMemberDays).not.toHaveBeenCalled();
    expect(repo.enqueueDays).toHaveBeenCalledWith(challenge().id, 'amy', [
      '2026-11-10',
    ]);
    repo.listOpenChallenges.mockResolvedValue([challenge()]);
    repo.rehostOrphans.mockResolvedValue(0);
    await service.nightlyCatchUp();
    expect(repo.enqueueDaysForAllMembers).not.toHaveBeenCalled();
    expect(await service.finalizePeriods()).toBe(0);
  });

  it('a frozen group goal compares the rounded group total with the target', async () => {
    const group = {
      ...allRounder,
      metric: 'active_minutes' as const,
      format: 'group_goal' as const,
      target: 0.8,
    };
    repo.getMembership.mockResolvedValue(member('amy'));
    repo.getForMember.mockResolvedValue(challenge({ rules: group }));
    repo.getRuleChangesForMember.mockResolvedValue([
      change('2026-11-09', group),
    ]);
    repo.getResultsForMember.mockResolvedValue(
      [0.1, 0.7].map((total, i) => ({
        challenge_id: challenge().id,
        period_start: '2026-11-09',
        period_end: '2026-11-15',
        user_id: i ? 'host' : 'amy',
        display_name: 'X',
        rank: 1,
        total,
        minutes: 0,
        is_winner: true,
        reached_on: null,
        detail: {},
        finalized_at: new Date(),
      }))
    );
    const res = await service.getStandings('amy', challenge().id);
    expect(res.group_total).toBe(0.8);
    expect(res.group_reached).toBe(true);
  });

  it('a rules change from a host who left meanwhile is refused', async () => {
    repo.getMembership.mockResolvedValue(member('host', 'host'));
    repo.getChallenge.mockResolvedValue(challenge());
    repo.updateRules.mockResolvedValue(false);
    await expect(
      service.updateRules('host', challenge().id, allRounder)
    ).rejects.toMatchObject({ status: 403, code: 'CHALLENGE_HOST_ONLY' });
  });
});

describe('CodeWithCJ review (PR #3585)', () => {
  const scoreRow = (
    user_id: string,
    day: string,
    total: number,
    detail: Record<string, unknown> = {}
  ) => ({
    challenge_id: challenge().id,
    user_id,
    day,
    total,
    effort: total,
    step_points: 0,
    pr_bonus: 0,
    streak_bonus: 0,
    beat_average_bonus: 0,
    minutes: 30,
    steps: 0,
    workouts: 1,
    eligible: true,
    detail,
  });

  describe('periods freeze in order', () => {
    it('a frozen period after an open one does not make a rescore skip the open one', async () => {
      // Week 2 (11-16) was frozen while week 1 (11-09) was not
      repo.frozenPeriodStarts.mockResolvedValue(['2026-11-16']);
      vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
      await service.recomputeMember(
        challenge(),
        member('amy'),
        '2026-11-10',
        '2026-11-15'
      );
      const [, , from, to] = repo.saveMemberDays.mock.calls[0]!;
      expect([from, to]).toEqual(['2026-11-10', '2026-11-15']);
    });

    it('a frozen period holding the first day is still skipped', async () => {
      repo.frozenPeriodStarts.mockResolvedValue(['2026-11-09', '2026-11-16']);
      vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
      await service.recomputeMember(challenge(), member('amy'), '2026-11-10');
      const [, , from] = repo.saveMemberDays.mock.calls[0]!;
      expect(from).toBe('2026-11-23');
    });

    it('a middle period that is refused stops the run, so later periods wait', async () => {
      repo.getMembers.mockResolvedValue([
        member('host', 'host'),
        member('amy'),
      ]);
      repo.getDailyScores.mockResolvedValue([
        scoreRow('amy', '2026-11-10', 40),
        scoreRow('host', '2026-11-10', 25),
      ]);
      // Weeks of 11-09, 11-16 and 11-23 are all past their late-sync window;
      // the second is refused (someone joined or left meanwhile).
      vi.setSystemTime(new Date('2026-12-03T12:00:00Z'));
      repo.insertResults
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      expect(await service.finalizeChallenge(challenge())).toBe(1);
      expect(repo.insertResults.mock.calls.map((c) => c[1])).toEqual([
        '2026-11-09',
        '2026-11-16',
      ]);
      // The next run starts again at the refused week
      repo.frozenPeriodStarts.mockResolvedValue(['2026-11-09']);
      repo.insertResults.mockReset().mockResolvedValue(true);
      expect(await service.finalizeChallenge(challenge())).toBe(2);
      expect(repo.insertResults.mock.calls.map((c) => c[1])).toEqual([
        '2026-11-16',
        '2026-11-23',
      ]);
    });
  });

  describe('the weekly goal in a week cut by the period', () => {
    it("a weekly challenge that starts on a Thursday pays its first week's goal", () => {
      const standings = service.standingsFromScores(
        [member('amy')],
        [
          scoreRow('amy', '2026-11-12', 10, { goal: { rawBonus: 20 } }),
          scoreRow('amy', '2026-11-13', 10, { goal: { rawBonus: 35 } }),
        ],
        allRounder,
        { start: '2026-11-12', end: '2026-11-15' },
        '2026-11-15'
      );
      expect(standings.rows[0]!.goalBonus).toBe(35);
      expect(standings.rows[0]!.total).toBe(55);
    });

    it("scores the goal on the week's part inside the period", async () => {
      // Starts Thursday 11-12; Monday's run is before the start
      const run = (id: string, entry_date: string) => ({
        id,
        entry_date,
        entry_time: '07:00',
        duration_minutes: 30,
        avg_heart_rate: 150,
        max_heart_rate: null,
        exercise_name: 'Run',
        category: 'Cardio',
        source: 'garmin',
        exercise_id: null,
        distance: null,
        active_calories: null,
        calories_burned: null,
        calories_applied: null,
        calorie_link_id: null,
        calorie_link_resolution: null,
        calorie_link_sources: null,
        elevation_gain_meters: null,
        zone_seconds: null,
        edited: false,
        sets: null,
        session: null,
      });
      repo.getMemberEntries.mockResolvedValue([
        run('a', '2026-11-09'),
        run('b', '2026-11-12'),
      ]);
      await service.recomputeMember(
        challenge({ start_date: '2026-11-12' }),
        member('amy'),
        '2026-11-12'
      );
      const scores = repo.saveMemberDays.mock.calls[0]![4];
      const thu = scores.find((x) => x.day === '2026-11-12')!;
      const goal = thu.detail.goal as { target: number; done: number };
      // Thursday to Sunday: 4 of 7 days of the 3-day floor, and only
      // Thursday's run counts
      expect(goal.target).toBe(1.7);
      expect(goal.done).toBe(1);
    });

    it('a daily points challenge stores no goal', async () => {
      const daily = {
        ...allRounder,
        period: 'day' as const,
        points: { ...allRounder.points!, goal: null },
      };
      repo.getRuleChanges.mockResolvedValue([change('2026-11-09', daily)]);
      await service.recomputeMember(
        challenge({ rules: daily }),
        member('amy'),
        '2026-11-10'
      );
      const scores = repo.saveMemberDays.mock.calls[0]![4];
      expect(scores.every((x) => x.detail.goal === null)).toBe(true);
    });
  });

  describe('rules in force', () => {
    const later = { ...allRounder, bestDaysPerWeek: 3 };
    beforeEach(() => {
      repo.getMembership.mockResolvedValue(member('amy'));
      // The newest save is already in challenges.rules
      repo.getForMember.mockResolvedValue(challenge({ rules: later }));
      repo.getMembersForMember.mockResolvedValue([member('amy')]);
      repo.getRuleChangesForMember.mockResolvedValue([
        change('2026-11-09', allRounder, '2026-11-01T00:00:00Z'),
        change('2026-11-16', later, '2026-11-11T00:00:00Z'),
      ]);
    });

    it('GET /:id returns the rules scoring today, with the change waiting in pending_rules', async () => {
      const detail = await service.getChallenge('amy', challenge().id);
      expect(detail.rules.bestDaysPerWeek).toBe(allRounder.bestDaysPerWeek);
      expect(detail.pending_rules).toEqual({
        rules: later,
        effective_from: '2026-11-16',
      });
      // From its first day the change is in force and nothing is pending
      vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
      const next = await service.getChallenge('amy', challenge().id);
      expect(next.rules.bestDaysPerWeek).toBe(3);
      expect(next.pending_rules).toBeNull();
    });

    it('the list carries the same rules and pending change', async () => {
      repo.listForMember.mockResolvedValue([
        { ...challenge({ rules: later }), role: 'member', member_count: 2 },
      ]);
      repo.getRuleLogsForMember.mockResolvedValue(
        [
          change('2026-11-09', allRounder, '2026-11-01T00:00:00Z'),
          change('2026-11-16', later, '2026-11-11T00:00:00Z'),
        ].map(({ challenge_id, effective_from, rules, seq }) => ({
          challenge_id,
          effective_from,
          rules,
          seq,
        }))
      );
      const [summary] = await service.listChallenges('amy');
      expect(repo.getRuleLogsForMember).toHaveBeenCalledWith('amy', [
        challenge().id,
      ]);
      expect(summary!.rules.bestDaysPerWeek).toBe(allRounder.bestDaysPerWeek);
      expect(summary!.pending_rules?.effective_from).toBe('2026-11-16');
    });

    it('before the start the rules from the start are in force, with nothing pending', async () => {
      repo.getForMember.mockResolvedValue(
        challenge({ rules: later, start_date: '2026-11-20' })
      );
      repo.getRuleChangesForMember.mockResolvedValue([
        change('2026-11-20', allRounder, '2026-11-01T00:00:00Z'),
        change('2026-11-20', later, '2026-11-11T00:00:00Z'),
      ]);
      const detail = await service.getChallenge('amy', challenge().id);
      expect(detail.rules.bestDaysPerWeek).toBe(3);
      expect(detail.pending_rules).toBeNull();
    });

    it('once a challenge is over, the rules of its last day are in force', async () => {
      repo.getForMember.mockResolvedValue(
        challenge({ rules: later, end_date: '2026-11-12' })
      );
      vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
      const detail = await service.getChallenge('amy', challenge().id);
      expect(detail.rules.bestDaysPerWeek).toBe(allRounder.bestDaysPerWeek);
      expect(detail.pending_rules).toBeNull();
    });

    it('standings carry the rules that scored that period', async () => {
      repo.getResultsForMember.mockResolvedValue([]);
      repo.getDailyScoresForMember.mockResolvedValue([
        scoreRow('amy', '2026-11-10', 40),
      ]);
      const now = await service.getStandings('amy', challenge().id);
      expect(now.rules).toEqual(allRounder);
      const next = await service.getStandings(
        'amy',
        challenge().id,
        '2026-11-17'
      );
      expect(next.rules).toEqual(later);
    });
  });
});
