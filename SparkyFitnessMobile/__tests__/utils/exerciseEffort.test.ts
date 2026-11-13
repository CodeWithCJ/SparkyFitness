import type { ExerciseSessionResponse } from '@workspace/shared';
import { buildExerciseEffortSummary } from '../../src/utils/exerciseEffort';

const set = (
  id: number,
  weight: number | null,
  reps: number | null,
  rpe: number | null,
  setType: string | null = null
) => ({
  id,
  set_number: id,
  set_type: setType,
  weight,
  reps,
  rpe,
  duration: null,
  rest_time: null,
  notes: null,
});

const single = (
  id: string,
  date: string,
  exerciseId: string,
  sets: ReturnType<typeof set>[]
) =>
  ({
    type: 'individual',
    id,
    entry_date: date,
    exercise_id: exerciseId,
    sets,
  }) as unknown as ExerciseSessionResponse;

const buildExerciseEffortSubset = (sessions: ExerciseSessionResponse[]) =>
  buildExerciseEffortSummary(sessions, 'ex-1', false).trend;

describe('buildExerciseEffortSummary', () => {
  it('averages the working sets with an RPE, per session, oldest first', () => {
    const summary = buildExerciseEffortSummary(
      [
        single('b', '2026-10-05', 'ex-1', [
          set(1, 100, 5, 9),
          set(2, 100, 5, 10),
          set(3, 40, 10, 3, 'warmup'),
        ]),
        single('a', '2026-10-01', 'ex-1', [
          set(1, 100, 5, 7),
          set(2, 100, 5, null),
        ]),
      ],
      'ex-1',
      true
    );
    expect(summary.trend).toEqual([
      { id: 'individual:a', date: '2026-10-01', avgRpe: 7 },
      { id: 'individual:b', date: '2026-10-05', avgRpe: 9.5 },
    ]);
  });

  it('keeps only the most recent sessions in the trend', () => {
    const sessions = Array.from({ length: 14 }, (_, i) =>
      single(String(i), `2026-09-${String(i + 1).padStart(2, '0')}`, 'ex-1', [
        set(1, 100, 5, 8),
      ])
    );
    const trend = buildExerciseEffortSummary(sessions, 'ex-1', false).trend;
    expect(trend).toHaveLength(10);
    expect(trend[0].date).toBe('2026-09-05');
    expect(trend[9].date).toBe('2026-09-14');
  });

  it('reads only this exercise out of a preset session', () => {
    const preset = {
      type: 'preset',
      id: 'p',
      name: 'Push',
      entry_date: '2026-10-01',
      exercises: [
        { exercise_id: 'ex-1', sets: [set(1, 100, 5, 8)] },
        { exercise_id: 'ex-2', sets: [set(2, 50, 10, 6)] },
      ],
    } as unknown as ExerciseSessionResponse;
    expect(buildExerciseEffortSummary([preset], 'ex-1', false).trend).toEqual([
      { id: 'preset:p', date: '2026-10-01', avgRpe: 8 },
    ]);
  });

  describe('sessions on the same day', () => {
    const timed = (completedAt: string | null) => ({
      ...set(1, 100, 5, 8),
      completed_at: completedAt,
    });

    it('orders them by when their sets were completed', () => {
      const trend = buildExerciseEffortSummary(
        [
          single('late', '2026-10-01', 'ex-1', [timed('2026-10-01T18:00:00Z')]),
          single('early', '2026-10-01', 'ex-1', [
            timed('2026-10-01T07:00:00Z'),
          ]),
        ],
        'ex-1',
        false
      ).trend;
      expect(trend.map((point) => point.id)).toEqual([
        'individual:early',
        'individual:late',
      ]);
    });

    it('falls back to the history order, newest first, when there is no completion time', () => {
      const trend = buildExerciseEffortSummary(
        [
          single('newer', '2026-10-01', 'ex-1', [timed(null)]),
          single('older', '2026-10-01', 'ex-1', [timed(null)]),
        ],
        'ex-1',
        false
      ).trend;
      expect(trend.map((point) => point.id)).toEqual([
        'individual:older',
        'individual:newer',
      ]);
    });

    it('uses the history order for the whole day when any session has no completion time', () => {
      // History order is newest first: late, none, early. Mixing completion
      // time for the two timed sessions with history order for the rest would
      // not be a consistent ordering.
      const trend = buildExerciseEffortSubset([
        single('late', '2026-10-01', 'ex-1', [timed('2026-10-01T18:00:00Z')]),
        single('none', '2026-10-01', 'ex-1', [timed(null)]),
        single('early', '2026-10-01', 'ex-1', [timed('2026-10-01T07:00:00Z')]),
      ]);
      expect(trend.map((point) => point.id)).toEqual([
        'individual:early',
        'individual:none',
        'individual:late',
      ]);
    });

    it('gives a preset and a single entry different ids even if their ids match', () => {
      const preset = {
        type: 'preset',
        id: 'x',
        name: 'Push',
        entry_date: '2026-10-01',
        exercises: [{ exercise_id: 'ex-1', sets: [timed(null)] }],
      } as unknown as ExerciseSessionResponse;
      const trend = buildExerciseEffortSummary(
        [preset, single('x', '2026-10-01', 'ex-1', [timed(null)])],
        'ex-1',
        false
      ).trend;
      expect(new Set(trend.map((point) => point.id)).size).toBe(2);
    });
  });

  it('estimates the 1RM with and without counting the reps left', () => {
    const summary = buildExerciseEffortSummary(
      [single('a', '2026-10-01', 'ex-1', [set(1, 100, 5, 8)])],
      'ex-1',
      true
    );
    // 100 kg x 5 plain; judged as 7 reps at RPE 8.
    expect(summary.oneRepMax?.plainKg).toBeCloseTo(100 * (1 + 5 / 30));
    expect(summary.oneRepMax?.effortKg).toBeCloseTo(100 * (1 + 7 / 30));
  });

  it('skips the 1RM when asked, and when no set has an RPE', () => {
    const sessions = [single('a', '2026-10-01', 'ex-1', [set(1, 100, 5, 8)])];
    expect(
      buildExerciseEffortSummary(sessions, 'ex-1', false).oneRepMax
    ).toBeNull();
    expect(
      buildExerciseEffortSummary(
        [single('a', '2026-10-01', 'ex-1', [set(1, 100, 5, null)])],
        'ex-1',
        true
      )
    ).toEqual({ trend: [], oneRepMax: null });
  });
});
