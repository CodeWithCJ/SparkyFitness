import { describe, expect, it } from 'vitest';
import {
  buildExerciseTrend,
  countedTrendSets,
  exerciseTrendChangePercent,
  exerciseTrendEntryValueKg,
  exerciseTrendPeriodStart,
  exerciseTrendWindowStart,
  type ExerciseProgressResponse,
} from '@workspace/shared';

type Set = ExerciseProgressResponse['sets'][number];

function entry(
  entryDate: string,
  sets: Partial<Set>[],
  extra: Partial<ExerciseProgressResponse> = {}
): ExerciseProgressResponse {
  return {
    exercise_entry_id: `${entryDate}-${Math.random()}`,
    entry_date: entryDate,
    duration_minutes: 0,
    calories_burned: 0,
    notes: null,
    image_url: null,
    distance: null,
    avg_heart_rate: null,
    provider_name: 'Manual',
    category: 'Strength',
    modality: 'weight_reps',
    body_weight_kg: null,
    edited: false,
    session: null,
    sets: sets.map((set, index) => ({
      set_number: index + 1,
      set_type: 'working',
      ...set,
    })) as Set[],
    ...extra,
  };
}

describe('countedTrendSets', () => {
  it('skips warm-ups', () => {
    const e = entry('2026-11-02', [
      { set_type: 'warmup', weight: 10, reps: 10 },
      { set_type: 'Warm-up', weight: 12, reps: 8 },
      { weight: 20, reps: 8 },
    ]);
    expect(countedTrendSets(e).map((s) => s.weight)).toEqual([20]);
  });

  it('skips a weight_reps set with no weight', () => {
    const e = entry('2026-11-02', [
      { weight: null, reps: 8 },
      { weight: 20, reps: 8 },
    ]);
    expect(countedTrendSets(e).map((s) => s.weight)).toEqual([20]);
  });

  it('counts a bodyweight set with no weight', () => {
    const e = entry('2026-11-02', [{ weight: null, reps: 8 }], {
      modality: 'bodyweight_reps',
      body_weight_kg: 80,
    });
    expect(countedTrendSets(e)).toHaveLength(1);
    expect(exerciseTrendEntryValueKg(e, 'volume')).toBe(640);
  });

  it('counts a workout plan row once a set is ticked', () => {
    const e = entry(
      '2026-11-02',
      [
        { weight: 20, reps: 8, completed_at: '2026-11-02T10:00:00.000Z' },
        { weight: 25, reps: 8, completed_at: null },
      ],
      { provider_name: 'Workout Plan' }
    );
    expect(countedTrendSets(e).map((s) => s.weight)).toEqual([20, 25]);
  });

  it('counts nothing on an untouched workout plan row', () => {
    const e = entry('2026-11-30', [{ weight: 30, reps: 8 }], {
      provider_name: 'Workout Plan',
    });
    expect(countedTrendSets(e)).toEqual([]);
  });

  it.each(['edited', 'session'] as const)(
    'keeps a workout plan row whose %s is missing',
    (field) => {
      const e = entry('2026-11-02', [{ weight: 30, reps: 8 }], {
        provider_name: 'Workout Plan',
      });
      delete e[field];
      expect(countedTrendSets(e)).toHaveLength(1);
    }
  );

  it('counts a workout plan row the member edited without ticking', () => {
    const e = entry('2026-11-02', [{ weight: 30, reps: 8 }], {
      provider_name: 'Workout Plan',
      edited: true,
    });
    expect(countedTrendSets(e)).toHaveLength(1);
  });

  it('counts a started set on a workout plan row', () => {
    const e = entry(
      '2026-11-02',
      [{ weight: 30, reps: 8, started_at: '2026-11-02T10:00:00.000Z' }],
      { provider_name: 'Workout Plan' }
    );
    expect(countedTrendSets(e)).toHaveLength(1);
  });

  it('follows the session: a finished plan session counts without ticks', () => {
    const session = {
      source: 'Workout Plan',
      finished_at: null as string | null,
      edited: false,
      has_plan_assignment: true,
      sets: [{ completed_at: null, started_at: null }],
    };
    const planned = entry('2026-11-02', [{ weight: 30, reps: 8 }], {
      provider_name: 'Workout Plan',
      session,
    });
    const finished = entry('2026-11-02', [{ weight: 30, reps: 8 }], {
      provider_name: 'Workout Plan',
      session: { ...session, finished_at: '2026-11-02T11:00:00.000Z' },
    });
    expect(countedTrendSets(planned)).toEqual([]);
    expect(countedTrendSets(finished)).toHaveLength(1);
  });

  it('skips sets with no reps', () => {
    const e = entry('2026-11-02', [
      { weight: 40, reps: 0 },
      { weight: 40, reps: null },
      { weight: 20, reps: 8 },
    ]);
    expect(countedTrendSets(e).map((s) => s.weight)).toEqual([20]);
  });

  it('counts every set of a form log or import without per-set ticks', () => {
    const logged = entry('2026-11-02', [{ weight: 20, reps: 8 }]);
    const imported = entry('2026-11-02', [{ weight: 20, reps: 8 }], {
      provider_name: 'Hevy',
    });
    expect(countedTrendSets(logged)).toHaveLength(1);
    expect(countedTrendSets(imported)).toHaveLength(1);
  });
});

describe('exerciseTrendEntryValueKg', () => {
  const e = entry('2026-11-02', [
    { set_type: 'warmup', weight: 40, reps: 1 },
    { weight: 30, reps: 10 },
    { weight: 35, reps: 4 },
  ]);

  it('is the best estimated 1RM of the counted sets', () => {
    // 30 × (1 + 10/30) = 40; 35 × (1 + 4/30) ≈ 39.67
    expect(exerciseTrendEntryValueKg(e, 'estimated1RM')).toBeCloseTo(40, 5);
  });

  it('is the heaviest counted load, ignoring a heavier warm-up', () => {
    expect(exerciseTrendEntryValueKg(e, 'maxLoad')).toBe(35);
  });

  it('is load × reps summed over the counted sets', () => {
    expect(exerciseTrendEntryValueKg(e, 'volume')).toBe(30 * 10 + 35 * 4);
  });

  it('adds body weight for a bodyweight exercise', () => {
    const dip = entry('2026-11-02', [{ weight: 10, reps: 5 }], {
      modality: 'bodyweight_reps',
      body_weight_kg: 80,
    });
    expect(exerciseTrendEntryValueKg(dip, 'maxLoad')).toBe(90);
  });
});

describe('exerciseTrendPeriodStart', () => {
  it('snaps to the account week start', () => {
    // 2026-11-04 is a Wednesday.
    expect(exerciseTrendPeriodStart('2026-11-04', 'week', 1)).toBe(
      '2026-11-02'
    );
    expect(exerciseTrendPeriodStart('2026-11-04', 'week', 0)).toBe(
      '2026-11-01'
    );
  });

  it('snaps to the month and the year', () => {
    expect(exerciseTrendPeriodStart('2026-11-21', 'month')).toBe('2026-11-01');
    expect(exerciseTrendPeriodStart('2026-11-21', 'year')).toBe('2026-01-01');
  });
});

describe('exerciseTrendWindowStart', () => {
  it('covers 12 weeks including the current one', () => {
    // Saturday 2026-11-21, weeks from Monday: current week starts 11-16.
    expect(exerciseTrendWindowStart('2026-11-21', 'week', 1)).toBe(
      '2026-08-31'
    );
  });

  it('covers 12 months including the current one, across a year boundary', () => {
    expect(exerciseTrendWindowStart('2026-11-21', 'month')).toBe('2025-12-01');
    expect(exerciseTrendWindowStart('2026-01-15', 'month')).toBe('2025-02-01');
    expect(exerciseTrendWindowStart('2026-12-31', 'month')).toBe('2026-01-01');
  });

  it('reads all history for the year view', () => {
    expect(exerciseTrendWindowStart('2026-11-21', 'year')).toBe('1970-01-01');
  });
});

describe('buildExerciseTrend', () => {
  const entries = [
    entry('2026-10-05', [{ weight: 30, reps: 8 }]),
    entry('2026-10-20', [{ weight: 35, reps: 5 }]),
    entry('2026-11-03', [{ weight: 32.5, reps: 6 }]),
    entry('2026-11-10', [{ set_type: 'warmup', weight: 20, reps: 10 }]),
    entry('2026-11-30', [{ weight: 50, reps: 5 }], {
      provider_name: 'Workout Plan',
    }),
  ];

  it('keeps the best entry per month, oldest first', () => {
    const points = buildExerciseTrend(entries, {
      metric: 'maxLoad',
      period: 'month',
    });
    expect(points).toEqual([
      { periodStart: '2026-10-01', valueKg: 35, isRecord: true },
      { periodStart: '2026-11-01', valueKg: 32.5, isRecord: false },
    ]);
  });

  it('adds volume up within a period', () => {
    const points = buildExerciseTrend(entries, {
      metric: 'volume',
      period: 'month',
    });
    expect(points[0]).toMatchObject({
      periodStart: '2026-10-01',
      valueKg: 30 * 8 + 35 * 5,
    });
  });

  it('leaves out periods with only warm-ups or untouched plan rows', () => {
    const points = buildExerciseTrend(entries, {
      metric: 'estimated1RM',
      period: 'week',
    });
    expect(points.map((p) => p.periodStart)).toEqual([
      '2026-10-05',
      '2026-10-19',
      '2026-11-02',
    ]);
  });

  it('marks each new high as a record', () => {
    const points = buildExerciseTrend(
      [
        entry('2026-09-01', [{ weight: 20, reps: 1 }]),
        entry('2026-10-01', [{ weight: 25, reps: 1 }]),
        entry('2026-11-01', [{ weight: 25, reps: 1 }]),
      ],
      { metric: 'maxLoad', period: 'month' }
    );
    expect(points.map((p) => p.isRecord)).toEqual([true, true, false]);
  });
});

describe('exerciseTrendChangePercent', () => {
  it('compares the last point with the first', () => {
    expect(
      exerciseTrendChangePercent([
        { periodStart: '2026-10-01', valueKg: 40, isRecord: true },
        { periodStart: '2026-11-01', valueKg: 46, isRecord: true },
      ])
    ).toBe(15);
  });

  it('is null with one point or a zero start', () => {
    expect(
      exerciseTrendChangePercent([
        { periodStart: '2026-10-01', valueKg: 40, isRecord: true },
      ])
    ).toBeNull();
    expect(
      exerciseTrendChangePercent([
        { periodStart: '2026-10-01', valueKg: 0, isRecord: true },
        { periodStart: '2026-11-01', valueKg: 10, isRecord: true },
      ])
    ).toBeNull();
  });
});
