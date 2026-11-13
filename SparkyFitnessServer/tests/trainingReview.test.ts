import { describe, expect, it } from 'vitest';
import {
  buildTrainingReview,
  countStalledSessions,
  type ReviewEntry,
} from '@workspace/shared';

const TODAY = '2026-10-09';

function lift(
  date: string,
  name: string,
  weight: number,
  reps: number,
  extra: Partial<ReviewEntry> = {}
): ReviewEntry {
  return {
    entry_date: date,
    exercise_id: `id-${name}`,
    exercise_name: name,
    exercise_modality: 'weight_reps',
    exercise_primary_muscles: JSON.stringify(['chest']),
    sets: [
      { set_type: 'warmup', reps: 10, weight: 20 },
      { set_type: 'normal', reps, weight },
      { set_type: 'normal', reps, weight },
    ],
    ...extra,
  };
}

describe('countStalledSessions', () => {
  it('needs three sessions before calling a stall', () => {
    expect(countStalledSessions([100, 90])).toBe(0);
  });

  it('counts the consecutive recent sessions that did not beat the best before them', () => {
    expect(countStalledSessions([100, 105, 105, 104])).toBe(2);
  });

  it('is zero while the lift keeps improving', () => {
    expect(countStalledSessions([100, 102, 105, 108])).toBe(0);
  });

  it('stops counting at the last session that did improve', () => {
    expect(countStalledSessions([100, 90, 95, 110, 108, 107])).toBe(2);
  });

  it('treats less than 1% as no improvement', () => {
    expect(countStalledSessions([100, 100.5, 100.8, 100.9])).toBe(3);
  });
});

describe('buildTrainingReview', () => {
  it('reports sessions per week over the window', () => {
    const entries = [
      lift('2026-10-08', 'Bench Press', 80, 5),
      lift('2026-10-06', 'Bench Press', 80, 5),
      lift('2026-10-01', 'Bench Press', 80, 5),
      lift('2026-09-28', 'Bench Press', 80, 5),
    ];
    const review = buildTrainingReview(entries, TODAY, 28);
    expect(review.sessions).toBe(4);
    expect(review.sessionsPerWeek).toBe(1);
    expect(review.enoughData).toBe(true);
  });

  it('says there is not enough data below three sessions', () => {
    const review = buildTrainingReview(
      [lift('2026-10-08', 'Bench Press', 80, 5)],
      TODAY
    );
    expect(review.enoughData).toBe(false);
    expect(review.stalls).toEqual([]);
  });

  it('flags a lift that has stopped improving, using history before the window', () => {
    const entries = [
      lift('2026-08-20', 'Squat', 100, 5),
      lift('2026-09-20', 'Squat', 100, 5),
      lift('2026-09-27', 'Squat', 100, 5),
      lift('2026-10-04', 'Squat', 100, 5),
    ];
    const review = buildTrainingReview(entries, TODAY);
    expect(review.stalls).toHaveLength(1);
    expect(review.stalls[0]).toMatchObject({
      exerciseName: 'Squat',
      sessions: 4,
      stalledSessions: 3,
      lastDate: '2026-10-04',
    });
  });

  it('ignores warm-up sets and bodyweight and cardio entries for stalls', () => {
    const entries = [
      lift('2026-09-20', 'Push-up', 0, 20, {
        exercise_modality: 'bodyweight_reps',
      }),
      lift('2026-09-27', 'Push-up', 0, 20, {
        exercise_modality: 'bodyweight_reps',
      }),
      lift('2026-10-04', 'Push-up', 0, 20, {
        exercise_modality: 'bodyweight_reps',
      }),
      lift('2026-10-05', 'Run', 0, 0, {
        exercise_modality: 'duration_distance',
      }),
    ];
    const review = buildTrainingReview(entries, TODAY);
    expect(review.stalls).toEqual([]);
    expect(review.sessions).toBe(3);
  });

  it('ignores sets above 12 reps when estimating strength', () => {
    const entries = [
      lift('2026-09-20', 'Curl', 10, 20),
      lift('2026-09-27', 'Curl', 10, 20),
      lift('2026-10-04', 'Curl', 10, 20),
    ];
    expect(buildTrainingReview(entries, TODAY).stalls).toEqual([]);
  });

  it('reads effort and names lifts taken to failure', () => {
    const hard = (date: string): ReviewEntry =>
      lift(date, 'Deadlift', 140, 3, {
        sets: [
          { set_type: 'normal', reps: 3, weight: 140, rpe: 9.5, rir: 0 },
          { set_type: 'normal', reps: 3, weight: 140, rpe: 10, rir: 0 },
          { set_type: 'normal', reps: 3, weight: 140, rpe: 10, rir: 0 },
        ],
      });
    const review = buildTrainingReview(
      [hard('2026-10-08'), hard('2026-10-01')],
      TODAY
    );
    expect(review.effort.nearFailure).toEqual(['Deadlift']);
    expect(review.effort.averageRpe).toBe(9.8);
    expect(review.effort.averageRir).toBe(0);
  });

  it('leaves effort null when no RPE or RIR was logged', () => {
    const review = buildTrainingReview(
      [lift('2026-10-08', 'Bench Press', 80, 5)],
      TODAY
    );
    expect(review.effort).toMatchObject({
      averageRpe: null,
      averageRir: null,
      nearFailure: [],
    });
  });

  it('counts working sets per canonical muscle and finds muscles that dropped out', () => {
    const entries = [
      lift('2026-10-08', 'Bench Press', 80, 5),
      lift('2026-09-01', 'Row', 60, 8, {
        exercise_primary_muscles: JSON.stringify(['Lats']),
      }),
    ];
    const review = buildTrainingReview(entries, TODAY);
    expect(review.muscleSets).toEqual({ chest: 2 });
    expect(review.untrainedMuscles).toEqual(['lats']);
  });
});
