import { draftExercisesReducer } from '../../src/hooks/draftExercisesSlice';
import { buildPresetExercisesPayload } from '../../src/utils/workoutSession';
import { getDefaultRestSec } from '../../src/stores/appPreferencesStore';
import type { WorkoutDraftExercise } from '../../src/types/drafts';
import type { Exercise } from '../../src/types/exercise';

function buildWeightRepsExercise(): WorkoutDraftExercise {
  return {
    clientId: 'ex-1',
    exerciseId: 'exercise-1',
    exerciseName: 'Bench Press',
    exerciseCategory: 'strength',
    exerciseModality: 'weight_reps',
    images: [],
    sets: [
      { clientId: 'set-1', weight: '60', reps: '8', distance: '' },
      { clientId: 'set-2', weight: '70', reps: '6', distance: '' },
    ],
  } as unknown as WorkoutDraftExercise;
}

describe('draftExercisesReducer REPLACE_EXERCISE', () => {
  it('preserves the existing sets when the replacement has the same effective modality', () => {
    const exercises = [buildWeightRepsExercise()];

    const next = draftExercisesReducer(exercises, {
      type: 'REPLACE_EXERCISE',
      clientId: 'ex-1',
      exercise: {
        id: 'exercise-2',
        name: 'Squat',
        category: 'strength',
      } as Exercise,
      setClientId: 'new-set',
      serverId: 'new-entry',
      preserveSets: true,
    });

    expect(next[0].exerciseId).toBe('exercise-2');
    expect(next[0].sets).toHaveLength(2);
    expect(next[0].sets[0]).toEqual(
      expect.objectContaining({ clientId: 'set-1', weight: '60', reps: '8' })
    );
    expect(next[0].sets[1]).toEqual(
      expect.objectContaining({ clientId: 'set-2', weight: '70', reps: '6' })
    );
  });

  it('resets to a fresh default set when the replacement changes modality', () => {
    const exercises = [buildWeightRepsExercise()];

    const next = draftExercisesReducer(exercises, {
      type: 'REPLACE_EXERCISE',
      clientId: 'ex-1',
      exercise: {
        id: 'exercise-3',
        name: 'Plank',
        category: 'isometric',
      } as Exercise,
      setClientId: 'new-set',
      serverId: 'new-entry',
      preserveSets: true,
    });

    expect(next[0].exerciseId).toBe('exercise-3');
    expect(next[0].sets).toEqual([
      {
        clientId: 'new-set',
        weight: '',
        reps: '',
        distance: '',
        restTime: getDefaultRestSec(),
      },
    ]);
  });

  it('still resets when preserveSets is not requested, regardless of modality', () => {
    const exercises = [buildWeightRepsExercise()];

    const next = draftExercisesReducer(exercises, {
      type: 'REPLACE_EXERCISE',
      clientId: 'ex-1',
      exercise: {
        id: 'exercise-2',
        name: 'Squat',
        category: 'strength',
      } as Exercise,
      setClientId: 'new-set',
      serverId: 'new-entry',
      preserveSets: false,
    });

    expect(next[0].sets).toHaveLength(1);
    expect(next[0].sets[0]?.clientId).toBe('new-set');
  });
});

describe('draftExercisesReducer SET_EXERCISE_PROGRESSION', () => {
  it('lands editor patches on the draft fields the preset payload saves', () => {
    const [exercise] = draftExercisesReducer([buildWeightRepsExercise()], {
      type: 'SET_EXERCISE_PROGRESSION',
      exerciseClientId: 'ex-1',
      patch: {
        progressionMode: 'fixed',
        repGoal: 8,
        incrementValue: 2.5,
        rampIncrement: -4.54,
      },
    });

    const [payload] = buildPresetExercisesPayload([exercise], 'kg');
    expect(payload).toMatchObject({
      progression_mode: 'fixed',
      rep_goal: 8,
      increment_value: 2.5,
      ramp_increment: -4.54,
    });
  });

  it('saves no ramp by default', () => {
    const [payload] = buildPresetExercisesPayload(
      [buildWeightRepsExercise()],
      'kg'
    );
    expect(payload.ramp_increment).toBeNull();
  });
});

describe('draftExercisesReducer ADD_WARMUP_SETS', () => {
  const ramp = [
    { clientId: 'w1', weight: '24.0', reps: '5' },
    { clientId: 'w2', weight: '36.0', reps: '5' },
  ];

  it('puts the ramp ahead of the working sets as unlogged warm-ups', () => {
    const next = draftExercisesReducer([buildWeightRepsExercise()], {
      type: 'ADD_WARMUP_SETS',
      exerciseClientId: 'ex-1',
      sets: ramp,
      restSec: 60,
    });

    expect(next[0].sets.map((s) => s.clientId)).toEqual([
      'w1',
      'w2',
      'set-1',
      'set-2',
    ]);
    expect(next[0].sets.slice(0, 2)).toEqual([
      expect.objectContaining({
        setType: 'warmup',
        weight: '24.0',
        reps: '5',
        restTime: 60,
      }),
      expect.objectContaining({ setType: 'warmup', weight: '36.0' }),
    ]);
    // The working sets are untouched.
    expect(next[0].sets[2]).toMatchObject({ weight: '60', reps: '8' });
  });

  it('replaces warm-ups that were not logged instead of stacking them', () => {
    const once = draftExercisesReducer([buildWeightRepsExercise()], {
      type: 'ADD_WARMUP_SETS',
      exerciseClientId: 'ex-1',
      sets: ramp,
      restSec: 60,
    });
    const twice = draftExercisesReducer(once, {
      type: 'ADD_WARMUP_SETS',
      exerciseClientId: 'ex-1',
      sets: [{ clientId: 'w3', weight: '30.0', reps: '4' }],
      restSec: 60,
    });
    expect(twice[0].sets.map((s) => s.clientId)).toEqual([
      'w3',
      'set-1',
      'set-2',
    ]);
  });

  it('leaves the exercise alone once a warm-up has been logged, or with nothing to add', () => {
    const once = draftExercisesReducer([buildWeightRepsExercise()], {
      type: 'ADD_WARMUP_SETS',
      exerciseClientId: 'ex-1',
      sets: ramp,
      restSec: 60,
    });
    const logged = once.map((e) => ({
      ...e,
      sets: e.sets.map((s, i) =>
        i === 0 ? { ...s, completedAt: '2026-10-06T10:00:00Z' } : s
      ),
    }));
    expect(
      draftExercisesReducer(logged, {
        type: 'ADD_WARMUP_SETS',
        exerciseClientId: 'ex-1',
        sets: ramp,
        restSec: 60,
      })
    ).toBe(logged);
    expect(
      draftExercisesReducer(once, {
        type: 'ADD_WARMUP_SETS',
        exerciseClientId: 'ex-1',
        sets: [],
        restSec: 60,
      })
    ).toBe(once);
  });
});
