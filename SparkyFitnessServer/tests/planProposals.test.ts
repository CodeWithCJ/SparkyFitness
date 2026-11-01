import { describe, expect, it } from 'vitest';
import {
  proposePlanChanges,
  type ExerciseCoachingSignal,
  type PerformedSession,
  type PlanProposalAssignment,
} from '@workspace/shared';

const squat: PlanProposalAssignment = {
  assignmentId: 7,
  exerciseId: 'ex-squat',
  exerciseName: 'Squat',
  modality: 'weight_reps',
  sets: [
    { id: 1, setType: 'Warmup', reps: 5, weight: 40 },
    { id: 2, setType: 'Working Set', reps: 5, weight: 100 },
    { id: 3, setType: 'Working Set', reps: 5, weight: 100 },
  ],
};

const session = (
  day: string,
  weight: number,
  reps: number,
  extra: { rpe?: number } = {}
): PerformedSession => ({
  day,
  sets: [
    { setType: 'Warmup', reps: 5, weight: 40 },
    { setType: 'Working Set', reps, weight, ...extra },
    { setType: 'Working Set', reps, weight, ...extra },
  ],
});

const signal = (
  overrides: Partial<ExerciseCoachingSignal>
): ExerciseCoachingSignal => ({
  exercise_id: 'ex-squat',
  last_performed_date: '2026-10-12',
  days_since_last_performed: 2,
  last_difficulty: null,
  last_pain: null,
  too_easy_streak: 0,
  too_hard_streak: 0,
  pain_streak: 0,
  avg_rpe: null,
  avg_rir: null,
  sessions_in_variation_window: 4,
  ...overrides,
});

const propose = (
  overrides: Partial<Parameters<typeof proposePlanChanges>[0]> = {}
) =>
  proposePlanChanges({
    assignments: [squat],
    history: {
      'ex-squat': [
        session('2026-10-12', 100, 5),
        session('2026-10-08', 100, 5),
      ],
    },
    signals: {},
    stalledExerciseIds: [],
    unit: 'kg',
    ...overrides,
  });

describe('proposePlanChanges', () => {
  it('adds a step when the plan was met in each of the last two sessions', () => {
    expect(propose()).toEqual([
      {
        assignmentId: 7,
        exerciseId: 'ex-squat',
        exerciseName: 'Squat',
        kind: 'increase',
        reason: 'hit_plan_twice',
        suggestAlternative: false,
        setChanges: [
          { setId: 2, fromKg: 100, toKg: 102.5 },
          { setId: 3, fromKg: 100, toKg: 102.5 },
        ],
      },
    ]);
  });

  it('never changes warm-up sets', () => {
    const [proposal] = propose();
    expect(proposal!.setChanges.map((c) => c.setId)).not.toContain(1);
  });

  it('uses a 5 lb step for a lbs lifter, stored in kg', () => {
    const [proposal] = propose({ unit: 'lbs' });
    expect(proposal!.setChanges[0]).toEqual({
      setId: 2,
      fromKg: 100,
      toKg: 102.268,
    });
  });

  it('needs two sessions that met the plan', () => {
    expect(
      propose({ history: { 'ex-squat': [session('2026-10-12', 100, 5)] } })
    ).toEqual([]);
    expect(
      propose({
        history: {
          'ex-squat': [
            session('2026-10-12', 100, 5),
            session('2026-10-08', 100, 4),
          ],
        },
      })
    ).toEqual([]);
    expect(
      propose({
        history: {
          'ex-squat': [
            session('2026-10-12', 95, 5),
            session('2026-10-08', 100, 5),
          ],
        },
      })
    ).toEqual([]);
  });

  it('does not progress when the sets were a grind', () => {
    expect(
      propose({
        history: {
          'ex-squat': [
            session('2026-10-12', 100, 5, { rpe: 9.5 }),
            session('2026-10-08', 100, 5, { rpe: 9 }),
          ],
        },
      })
    ).toEqual([]);
  });

  it('lightens after repeated pain and offers an alternative', () => {
    const [proposal] = propose({
      signals: {
        'ex-squat': signal({ last_pain: 'exercise', pain_streak: 2 }),
      },
    });
    expect(proposal).toMatchObject({
      kind: 'reduce',
      reason: 'pain_repeated',
      suggestAlternative: true,
    });
    expect(proposal!.setChanges).toEqual([
      { setId: 2, fromKg: 100, toKg: 90 },
      { setId: 3, fromKg: 100, toKg: 90 },
    ]);
  });

  it('holds after a too-hard session, even if the plan was met', () => {
    const [proposal] = propose({
      signals: { 'ex-squat': signal({ last_difficulty: 'too_hard' }) },
    });
    expect(proposal).toMatchObject({
      kind: 'hold',
      reason: 'too_hard',
      setChanges: [],
    });
  });

  it('adds a step after two too-easy sessions without needing the history', () => {
    const [proposal] = propose({
      history: {},
      signals: {
        'ex-squat': signal({
          last_difficulty: 'too_easy',
          too_easy_streak: 2,
        }),
      },
    });
    expect(proposal).toMatchObject({
      kind: 'increase',
      reason: 'too_easy_repeated',
    });
    expect(proposal!.setChanges[0]).toEqual({
      setId: 2,
      fromKg: 100,
      toKg: 102.5,
    });
  });

  it('holds a stalled lift rather than adding weight', () => {
    expect(propose({ stalledExerciseIds: ['ex-squat'] })).toEqual([
      expect.objectContaining({
        kind: 'hold',
        reason: 'stalled',
        setChanges: [],
      }),
    ]);
  });

  it('skips bodyweight lifts and sets with no planned weight', () => {
    expect(
      propose({ assignments: [{ ...squat, modality: 'bodyweight_reps' }] })
    ).toEqual([]);
    expect(
      propose({
        assignments: [
          {
            ...squat,
            sets: [{ id: 2, setType: 'Working Set', reps: 5, weight: 0 }],
          },
        ],
      })
    ).toEqual([]);
  });
});
