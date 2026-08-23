import { draftExercisesReducer } from '../../src/hooks/draftExercisesSlice';
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
      exercise: { id: 'exercise-2', name: 'Squat', category: 'strength' } as Exercise,
      setClientId: 'new-set',
      preserveSets: true,
    });

    expect(next[0].exerciseId).toBe('exercise-2');
    expect(next[0].sets).toHaveLength(2);
    expect(next[0].sets[0]).toEqual(
      expect.objectContaining({ clientId: 'set-1', weight: '60', reps: '8' }),
    );
    expect(next[0].sets[1]).toEqual(
      expect.objectContaining({ clientId: 'set-2', weight: '70', reps: '6' }),
    );
  });

  it('resets to a fresh default set when the replacement changes modality', () => {
    const exercises = [buildWeightRepsExercise()];

    const next = draftExercisesReducer(exercises, {
      type: 'REPLACE_EXERCISE',
      clientId: 'ex-1',
      exercise: { id: 'exercise-3', name: 'Plank', category: 'isometric' } as Exercise,
      setClientId: 'new-set',
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
      exercise: { id: 'exercise-2', name: 'Squat', category: 'strength' } as Exercise,
      setClientId: 'new-set',
      preserveSets: false,
    });

    expect(next[0].sets).toHaveLength(1);
    expect(next[0].sets[0]?.clientId).toBe('new-set');
  });
});
