import { workoutFormReducer, type WorkoutDraft } from '../../src/hooks/useWorkoutForm';
import type { Exercise } from '../../src/types/exercise';

const makeExercise = (overrides?: Partial<Exercise>): Exercise => ({
  id: 'ex-1',
  name: 'Bench Press',
  category: 'Strength',
  equipment: ['barbell'],
  primary_muscles: ['chest'],
  secondary_muscles: ['triceps'],
  calories_per_hour: 400,
  source: 'system',
  images: [],
  ...overrides,
});

const makeEmptyDraft = (): WorkoutDraft => ({
  type: 'workout',
  name: 'Workout',
  entryDate: '2026-03-12',
  exercises: [],
});

describe('workoutFormReducer', () => {
  describe('RESTORE_DRAFT', () => {
    it('replaces entire state with the provided draft', () => {
      const initial = makeEmptyDraft();
      const restoredDraft: WorkoutDraft = {
        type: 'workout',
        name: 'Leg Day',
        entryDate: '2026-03-11',
        exercises: [
          {
            clientId: 'abc',
            exerciseId: 'ex-1',
            exerciseName: 'Squat',
            exerciseCategory: 'Strength',
            sets: [{ clientId: 'set-1', weight: '135', reps: '5' }],
          },
        ],
      };

      const result = workoutFormReducer(initial, { type: 'RESTORE_DRAFT', draft: restoredDraft });
      expect(result).toEqual(restoredDraft);
    });
  });

  describe('SET_NAME', () => {
    it('updates the workout name', () => {
      const state = makeEmptyDraft();
      const result = workoutFormReducer(state, { type: 'SET_NAME', name: 'Push Day' });
      expect(result.name).toBe('Push Day');
    });
  });

  describe('ADD_EXERCISE', () => {
    it('appends an exercise with one empty set', () => {
      const state = makeEmptyDraft();
      const exercise = makeExercise();
      const result = workoutFormReducer(state, { type: 'ADD_EXERCISE', exercise });

      expect(result.exercises).toHaveLength(1);
      expect(result.exercises[0].exerciseId).toBe('ex-1');
      expect(result.exercises[0].exerciseName).toBe('Bench Press');
      expect(result.exercises[0].exerciseCategory).toBe('Strength');
      expect(result.exercises[0].sets).toHaveLength(1);
      expect(result.exercises[0].sets[0].weight).toBe('');
      expect(result.exercises[0].sets[0].reps).toBe('');
      expect(result.exercises[0].clientId).toBeTruthy();
      expect(result.exercises[0].sets[0].clientId).toBeTruthy();
    });

    it('preserves existing exercises', () => {
      const state = makeEmptyDraft();
      const ex1 = makeExercise({ id: 'ex-1', name: 'Bench Press' });
      const ex2 = makeExercise({ id: 'ex-2', name: 'Squat' });

      let result = workoutFormReducer(state, { type: 'ADD_EXERCISE', exercise: ex1 });
      result = workoutFormReducer(result, { type: 'ADD_EXERCISE', exercise: ex2 });

      expect(result.exercises).toHaveLength(2);
      expect(result.exercises[0].exerciseName).toBe('Bench Press');
      expect(result.exercises[1].exerciseName).toBe('Squat');
    });
  });

  describe('REMOVE_EXERCISE', () => {
    it('removes an exercise by clientId', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'keep-me',
            exerciseId: 'ex-1',
            exerciseName: 'Bench Press',
            exerciseCategory: 'Strength',
            sets: [],
          },
          {
            clientId: 'remove-me',
            exerciseId: 'ex-2',
            exerciseName: 'Squat',
            exerciseCategory: 'Strength',
            sets: [],
          },
        ],
      };

      const result = workoutFormReducer(state, { type: 'REMOVE_EXERCISE', clientId: 'remove-me' });
      expect(result.exercises).toHaveLength(1);
      expect(result.exercises[0].clientId).toBe('keep-me');
    });

    it('does nothing if clientId not found', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [],
          },
        ],
      };

      const result = workoutFormReducer(state, { type: 'REMOVE_EXERCISE', clientId: 'nonexistent' });
      expect(result.exercises).toHaveLength(1);
    });
  });

  describe('ADD_SET', () => {
    it('adds a set pre-filled from the previous set values', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [{ clientId: 'set-1', weight: '185', reps: '8' }],
          },
        ],
      };

      const result = workoutFormReducer(state, { type: 'ADD_SET', exerciseClientId: 'ex-abc' });
      expect(result.exercises[0].sets).toHaveLength(2);
      expect(result.exercises[0].sets[1].weight).toBe('185');
      expect(result.exercises[0].sets[1].reps).toBe('8');
      expect(result.exercises[0].sets[1].clientId).not.toBe('set-1');
    });

    it('adds an empty set when the exercise has no sets', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [],
          },
        ],
      };

      const result = workoutFormReducer(state, { type: 'ADD_SET', exerciseClientId: 'ex-abc' });
      expect(result.exercises[0].sets).toHaveLength(1);
      expect(result.exercises[0].sets[0].weight).toBe('');
      expect(result.exercises[0].sets[0].reps).toBe('');
    });

    it('does not affect other exercises', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-1',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [{ clientId: 'set-1', weight: '100', reps: '10' }],
          },
          {
            clientId: 'ex-2',
            exerciseId: 'ex-2',
            exerciseName: 'Squat',
            exerciseCategory: null,
            sets: [{ clientId: 'set-2', weight: '200', reps: '5' }],
          },
        ],
      };

      const result = workoutFormReducer(state, { type: 'ADD_SET', exerciseClientId: 'ex-1' });
      expect(result.exercises[0].sets).toHaveLength(2);
      expect(result.exercises[1].sets).toHaveLength(1);
    });
  });

  describe('REMOVE_SET', () => {
    it('removes a set by clientId from the correct exercise', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [
              { clientId: 'set-1', weight: '135', reps: '10' },
              { clientId: 'set-2', weight: '155', reps: '8' },
            ],
          },
        ],
      };

      const result = workoutFormReducer(state, {
        type: 'REMOVE_SET',
        exerciseClientId: 'ex-abc',
        setClientId: 'set-1',
      });
      expect(result.exercises[0].sets).toHaveLength(1);
      expect(result.exercises[0].sets[0].clientId).toBe('set-2');
    });
  });

  describe('UPDATE_SET_FIELD', () => {
    it('updates weight for a specific set', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [
              { clientId: 'set-1', weight: '', reps: '' },
              { clientId: 'set-2', weight: '', reps: '' },
            ],
          },
        ],
      };

      const result = workoutFormReducer(state, {
        type: 'UPDATE_SET_FIELD',
        exerciseClientId: 'ex-abc',
        setClientId: 'set-1',
        field: 'weight',
        value: '225',
      });
      expect(result.exercises[0].sets[0].weight).toBe('225');
      expect(result.exercises[0].sets[0].reps).toBe('');
      expect(result.exercises[0].sets[1].weight).toBe('');
    });

    it('updates reps for a specific set', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [{ clientId: 'set-1', weight: '135', reps: '' }],
          },
        ],
      };

      const result = workoutFormReducer(state, {
        type: 'UPDATE_SET_FIELD',
        exerciseClientId: 'ex-abc',
        setClientId: 'set-1',
        field: 'reps',
        value: '12',
      });
      expect(result.exercises[0].sets[0].reps).toBe('12');
      expect(result.exercises[0].sets[0].weight).toBe('135');
    });
  });

  describe('RESET', () => {
    it('returns a fresh empty draft', () => {
      const state: WorkoutDraft = {
        type: 'workout',
        name: 'Push Day',
        entryDate: '2026-03-11',
        exercises: [
          {
            clientId: 'ex-1',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: 'Strength',
            sets: [{ clientId: 'set-1', weight: '225', reps: '5' }],
          },
        ],
      };

      const result = workoutFormReducer(state, { type: 'RESET' });
      expect(result.type).toBe('workout');
      expect(result.name).toBe('Workout');
      expect(result.exercises).toEqual([]);
      expect(result.entryDate).toBeTruthy();
    });
  });
});
