import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import {
  compareQuerySchema,
  compareResponseSchema,
  compareResultSchema,
  type CompareResult,
} from '@workspace/shared';
import type { z } from 'zod';
import { cardioPredicateSql } from '../utils/exerciseLoadSql.js';
import compareRepository from '../models/compareRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('compareQuerySchema', () => {
  const base = {
    a: 'mood',
    b: 'timeAsleep',
    start: '2026-01-01',
    end: '2026-03-01',
  };
  const issues = (input: unknown) => {
    const r = compareQuerySchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it('accepts the defaults', () => {
    const r = compareQuerySchema.parse(base);
    expect(r.mode).toBe('day');
    expect(r.timing).toBe(0);
  });

  it('coerces timing from a query string', () => {
    expect(compareQuerySchema.parse({ ...base, timing: '-1' }).timing).toBe(-1);
  });

  it('rejects the same metric twice', () => {
    expect(issues({ ...base, b: 'mood' }).join()).toMatch(/different/i);
  });

  it('rejects an unknown metric', () => {
    expect(issues({ ...base, a: 'nope' }).length).toBeGreaterThan(0);
  });

  it('rejects start after end', () => {
    expect(
      issues({ ...base, start: '2026-03-02', end: '2026-03-01' }).join()
    ).toMatch(/start/i);
  });

  // Span is counted inclusively: 2026-01-01 .. 2026-06-29 is 180 days.
  it('accepts a 180-day span and rejects 181', () => {
    expect(
      compareQuerySchema.safeParse({ ...base, end: '2026-06-29' }).success
    ).toBe(true);
    expect(issues({ ...base, end: '2026-06-30' }).join()).toMatch(/180/);
  });

  it('allows up to 366 days in week mode and rejects 367', () => {
    const wk = { ...base, mode: 'week' };
    expect(
      compareQuerySchema.safeParse({ ...wk, end: '2027-01-01' }).success
    ).toBe(true);
    expect(issues({ ...wk, end: '2027-01-02' }).join()).toMatch(/366/);
  });

  it('rejects timing -1 in week mode', () => {
    expect(issues({ ...base, mode: 'week', timing: -1 }).join()).toMatch(
      /timing/i
    );
  });

  it('rejects a metric with no weekly form in week mode', () => {
    expect(
      issues({ ...base, mode: 'week', b: 'meditationSessions7d' }).join()
    ).toMatch(/week/i);
    expect(
      compareQuerySchema.safeParse({ ...base, b: 'meditationSessions7d' })
        .success
    ).toBe(true);
  });
});

describe('compare response schema', () => {
  it('mirrors CompareResult', () => {
    expectTypeOf<
      z.infer<typeof compareResultSchema>
    >().toEqualTypeOf<CompareResult>();
    expect(
      compareResponseSchema.safeParse({
        a: { key: 'mood', values: { '2026-01-01': 3 } },
        b: { key: 'steps', values: {} },
        deviations: { a: {}, b: {} },
        through: '2026-01-31',
        result: {
          status: 'not_enough',
          n: 0,
          needed: 14,
          reason: 'tooFew',
          checks: { ownNormal: true },
        },
      }).success
    ).toBe(true);
  });

  it('documents the through day and requires it', () => {
    expect(compareResponseSchema.shape.through.description).toMatch(
      /Last day included; today — or the current week — is left out until it's over/
    );
    expect(
      compareResponseSchema.safeParse({
        a: { key: 'mood', values: {} },
        b: { key: 'steps', values: {} },
        deviations: { a: {}, b: {} },
        result: {
          status: 'not_enough',
          n: 0,
          needed: 14,
          checks: { ownNormal: true },
        },
      }).success
    ).toBe(false);
  });

  it('says which yes/no group is short', () => {
    for (const reason of ['fewYes', 'fewNo'] as const) {
      expect(
        compareResultSchema.safeParse({
          status: 'not_enough',
          n: 3,
          needed: 5,
          reason,
          checks: { ownNormal: true },
        }).success
      ).toBe(true);
    }
  });

  it('documents the direction check and the yes/no deviations', () => {
    expect(
      compareResultSchema.shape.checks.shape.direction.description
    ).toMatch(
      /Timing 0: 'firstComesFirst' = A leads B by a day; 'strongerOtherWay' = B leads A by a day\./
    );
    expect(compareResponseSchema.shape.deviations.description).toMatch(
      /raw 0\/1/
    );
  });
});

describe('compareRepository', () => {
  const query = vi.fn();
  const release = vi.fn();
  const run = async (
    rows: Record<string, unknown>[],
    fn: () => Promise<unknown>
  ) => {
    query.mockResolvedValue({ rows });
    return fn();
  };
  const sqlOf = () => query.mock.calls[0]![0] as string;
  const paramsOf = () => query.mock.calls[0]![1] as unknown[];

  beforeEach(() => {
    vi.mocked(getClient).mockResolvedValue({ query, release } as never);
  });
  afterEach(() => vi.clearAllMocks());

  it('releases the client when the query throws', async () => {
    query.mockRejectedValue(new Error('boom'));
    await expect(
      compareRepository.getCheckInDays('u1', '2026-01-01', '2026-01-31')
    ).rejects.toThrow('boom');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('mood: manual rows only, numbers mapped, nulls kept', async () => {
    const out = await run(
      [{ day: '2026-01-01', mood: '4', energy: '3.5', focus: null }],
      () =>
        compareRepository.getManualMoodDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    expect(sqlOf()).toContain("source = 'manual'");
    expect(sqlOf()).toContain("TO_CHAR(entry_date, 'YYYY-MM-DD')");
    expect(paramsOf()).toEqual(['u1', '2026-01-01', '2026-01-31']);
    expect(out).toEqual([
      { day: '2026-01-01', mood: 4, energy: 3.5, focus: null },
    ]);
    expect(release).toHaveBeenCalled();
  });

  it('sleep: longest sleep per day, mapped', async () => {
    const out = await run(
      [
        {
          day: '2026-01-01',
          time_asleep_seconds: '25000',
          sleep_score: '81',
          overnight_hrv: null,
          resting_heart_rate: '52.5',
          bedtime: '2026-01-01T06:00:00.000Z',
          record_timezone: 'Europe/Oslo',
          record_utc_offset_minutes: '60',
        },
      ],
      () => compareRepository.getMainSleepDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    expect(sqlOf()).toContain('DISTINCT ON (entry_date)');
    expect(sqlOf()).toContain(
      'ORDER BY entry_date, duration_in_seconds DESC, bedtime ASC, id'
    );
    // Null stays null, as the mobile sleep analytics shows it.
    expect(sqlOf()).not.toContain('COALESCE(time_asleep_in_seconds');
    expect(sqlOf()).toContain("TO_CHAR(entry_date, 'YYYY-MM-DD')");
    expect(out).toEqual([
      {
        day: '2026-01-01',
        timeAsleepSeconds: 25000,
        sleepScore: 81,
        overnightHrv: null,
        restingHeartRate: 52.5,
        bedtime: '2026-01-01T06:00:00.000Z',
        recordTimezone: 'Europe/Oslo',
        recordUtcOffsetMinutes: 60,
      },
    ]);
  });

  it('sleep: null time asleep stays null and a Date bedtime becomes ISO', async () => {
    const out = (await run(
      [
        {
          day: '2026-01-01',
          time_asleep_seconds: null,
          sleep_score: null,
          overnight_hrv: null,
          resting_heart_rate: null,
          bedtime: new Date('2026-01-01T06:00:00.000Z'),
          record_timezone: null,
          record_utc_offset_minutes: null,
        },
      ],
      () => compareRepository.getMainSleepDays('u1', '2026-01-01', '2026-01-31')
    )) as { timeAsleepSeconds: number | null; bedtime: string | null }[];
    expect(out[0]!.timeAsleepSeconds).toBeNull();
    expect(out[0]!.bedtime).toBe('2026-01-01T06:00:00.000Z');
  });

  it('meditation days and first day', async () => {
    const out = await run(
      [{ day: '2026-01-01', minutes: '12.5', sessions: '2' }],
      () =>
        compareRepository.getMeditationDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    expect(sqlOf()).toContain("TO_CHAR(entry_date, 'YYYY-MM-DD')");
    expect(out).toEqual([{ day: '2026-01-01', minutes: 12.5, sessions: 2 }]);

    query.mockClear();
    expect(
      await run([{ day: '2025-12-01' }], () =>
        compareRepository.getMeditationFirstDay('u1')
      )
    ).toBe('2025-12-01');
    expect(sqlOf()).toContain('MIN(entry_date)');
    expect(sqlOf()).toContain('FROM mindfulness_sessions');
    expect(sqlOf()).toMatch(/WHERE user_id = \$1\s*$/);
    expect(paramsOf()).toEqual(['u1']);
    query.mockClear();
    expect(
      await run([{ day: null }], () =>
        compareRepository.getMeditationFirstDay('u1')
      )
    ).toBeNull();
  });

  it('cardio minutes', async () => {
    const out = await run([{ day: '2026-01-02', minutes: '30' }], () =>
      compareRepository.getCardioMinuteDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    // The same classification as Exercise Statistics' Cardio view, so a
    // Fitbit/Google workout stored under 'Other' still counts.
    expect(sqlOf()).toContain(cardioPredicateSql());
    expect(sqlOf()).toContain('COALESCE(distance, 0) > 0');
    expect(sqlOf()).not.toContain("LOWER(category) = 'cardio'");
    expect(sqlOf()).toContain("exercise_name != 'Active Calories'");
    expect(sqlOf()).toContain("TO_CHAR(entry_date, 'YYYY-MM-DD')");
    expect(out).toEqual([{ day: '2026-01-02', minutes: 30 }]);
  });

  it('strength volume uses the shared set load SQL', async () => {
    const out = await run([{ day: '2026-01-02', volume_kg: '1234.5' }], () =>
      compareRepository.getStrengthVolumeDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    expect(sqlOf()).toContain('bodyweight_reps');
    expect(sqlOf()).toContain('LATERAL');
    expect(sqlOf()).toContain("exercise_name != 'Active Calories'");
    expect(sqlOf()).toContain("TO_CHAR(e.entry_date, 'YYYY-MM-DD')");
    expect(out).toEqual([{ day: '2026-01-02', volumeKg: 1234.5 }]);
  });

  it('exercise first day', async () => {
    expect(
      await run([{ day: '2025-11-03' }], () =>
        compareRepository.getExerciseFirstDay('u1')
      )
    ).toBe('2025-11-03');
    expect(sqlOf()).toContain('MIN(entry_date)');
    expect(sqlOf()).toContain('FROM exercise_entries');
    expect(sqlOf()).toMatch(
      /WHERE user_id = \$1\s+AND exercise_name != 'Active Calories'\s*$/
    );
    expect(paramsOf()).toEqual(['u1']);
  });

  it('check-ins map weight and steps', async () => {
    const out = await run(
      [
        { day: '2026-01-01', weight: '80.2', steps: 9000 },
        { day: '2026-01-02', weight: null, steps: null },
      ],
      () => compareRepository.getCheckInDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    expect(sqlOf()).toContain("TO_CHAR(entry_date, 'YYYY-MM-DD')");
    expect(out).toEqual([
      { day: '2026-01-01', weight: 80.2, steps: 9000 },
      { day: '2026-01-02', weight: null, steps: null },
    ]);
  });

  it('food logged days: days with a food entry, never supplements alone', async () => {
    const out = await run([{ day: '2026-01-01' }, { day: '2026-01-03' }], () =>
      compareRepository.getFoodLoggedDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain(
      "SELECT DISTINCT TO_CHAR(entry_date, 'YYYY-MM-DD') AS day"
    );
    expect(sqlOf()).toContain('FROM food_entries');
    expect(sqlOf()).toContain(
      'WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3'
    );
    expect(sqlOf()).not.toContain('medication_entries');
    expect(paramsOf()).toEqual(['u1', '2026-01-01', '2026-01-31']);
    expect(out).toEqual(['2026-01-01', '2026-01-03']);
  });
});
