import {
  workoutFormReducer,
  getWorkoutDraftSubmission,
  type WorkoutDraft,
} from '../../src/hooks/useWorkoutForm';
import type { Exercise } from '../../src/types/exercise';
import type { PresetSessionResponse, ExerciseEntrySetResponse } from '@workspace/shared';
import type { WorkoutPreset } from '../../src/types/workoutPresets';

jest.mock('../../src/utils/dateUtils', () => ({
  getTodayDate: () => '2026-03-12',
  normalizeDate: (d: string) => d.split('T')[0],
}));

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
  tags: [],
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
            images: [],
            sets: [{ clientId: 'set-1', weight: '135', reps: '5' }],
          },
        ],
      };

      const result = workoutFormReducer(initial, { type: 'RESTORE_DRAFT', draft: restoredDraft });
      expect(result).toEqual({ ...restoredDraft, nameManuallySet: true });
    });

    it('defaults nameManuallySet to true when not present in draft', () => {
      const initial = makeEmptyDraft();
      const draft: WorkoutDraft = { ...makeEmptyDraft(), nameManuallySet: undefined };

      const result = workoutFormReducer(initial, { type: 'RESTORE_DRAFT', draft });

      expect(result.nameManuallySet).toBe(true);
    });

    it('preserves explicit nameManuallySet value from draft', () => {
      const initial = makeEmptyDraft();
      const draft: WorkoutDraft = { ...makeEmptyDraft(), nameManuallySet: false };

      const result = workoutFormReducer(initial, { type: 'RESTORE_DRAFT', draft });

      expect(result.nameManuallySet).toBe(false);
    });
  });

  describe('SET_NAME', () => {
    it('updates the workout name and marks as manually set', () => {
      const state = makeEmptyDraft();
      const result = workoutFormReducer(state, { type: 'SET_NAME', name: 'Push Day' });
      expect(result.name).toBe('Push Day');
      expect(result.nameManuallySet).toBe(true);
    });
  });

  describe('ADD_EXERCISE', () => {
    it('appends an exercise with one empty set', () => {
      const state = makeEmptyDraft();
      const exercise = makeExercise();
      const result = workoutFormReducer(state, { type: 'ADD_EXERCISE', exercise, exerciseClientId: 'ecid-1', setClientId: 'scid-1' });

      expect(result.exercises).toHaveLength(1);
      expect(result.exercises[0].exerciseId).toBe('ex-1');
      expect(result.exercises[0].exerciseName).toBe('Bench Press');
      expect(result.exercises[0].exerciseCategory).toBe('Strength');
      expect(result.exercises[0].sets).toHaveLength(1);
      expect(result.exercises[0].sets[0].weight).toBe('');
      expect(result.exercises[0].sets[0].reps).toBe('');
      expect(result.exercises[0].clientId).toBe('ecid-1');
      expect(result.exercises[0].sets[0].clientId).toBe('scid-1');
    });

    it('seeds the initial set with restTime: 90', () => {
      const state = makeEmptyDraft();
      const exercise = makeExercise();
      const result = workoutFormReducer(state, {
        type: 'ADD_EXERCISE',
        exercise,
        exerciseClientId: 'ecid-1',
        setClientId: 'scid-1',
      });
      expect(result.exercises[0].sets[0].restTime).toBe(90);
    });

    it('preserves existing exercises', () => {
      const state = makeEmptyDraft();
      const ex1 = makeExercise({ id: 'ex-1', name: 'Bench Press' });
      const ex2 = makeExercise({ id: 'ex-2', name: 'Squat' });

      let result = workoutFormReducer(state, { type: 'ADD_EXERCISE', exercise: ex1, exerciseClientId: 'ecid-1', setClientId: 'scid-1' });
      result = workoutFormReducer(result, { type: 'ADD_EXERCISE', exercise: ex2, exerciseClientId: 'ecid-2', setClientId: 'scid-2' });

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

      const result = workoutFormReducer(state, { type: 'ADD_SET', exerciseClientId: 'ex-abc', setClientId: 'set-new' });
      expect(result.exercises[0].sets).toHaveLength(2);
      expect(result.exercises[0].sets[1].weight).toBe('185');
      expect(result.exercises[0].sets[1].reps).toBe('8');
      expect(result.exercises[0].sets[1].clientId).toBe('set-new');
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

      const result = workoutFormReducer(state, { type: 'ADD_SET', exerciseClientId: 'ex-abc', setClientId: 'set-new' });
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

      const result = workoutFormReducer(state, { type: 'ADD_SET', exerciseClientId: 'ex-1', setClientId: 'set-new' });
      expect(result.exercises[0].sets).toHaveLength(2);
      expect(result.exercises[1].sets).toHaveLength(1);
    });

    it('inherits restTime from the first set, not the last', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [
              { clientId: 'set-1', weight: '100', reps: '10', restTime: 120 },
              { clientId: 'set-2', weight: '100', reps: '10', restTime: 45 },
            ],
          },
        ],
      };

      const result = workoutFormReducer(state, {
        type: 'ADD_SET',
        exerciseClientId: 'ex-abc',
        setClientId: 'set-new',
      });
      expect(result.exercises[0].sets).toHaveLength(3);
      expect(result.exercises[0].sets[2].restTime).toBe(120);
    });

    it('defaults restTime to 90 when first set has no restTime', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [{ clientId: 'set-1', weight: '100', reps: '10' }],
          },
        ],
      };

      const result = workoutFormReducer(state, {
        type: 'ADD_SET',
        exerciseClientId: 'ex-abc',
        setClientId: 'set-new',
      });
      expect(result.exercises[0].sets[1].restTime).toBe(90);
    });
  });

  describe('SET_EXERCISE_REST', () => {
    it('updates restTime for every set of the targeted exercise', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [
              { clientId: 'set-1', weight: '100', reps: '10', restTime: 60 },
              { clientId: 'set-2', weight: '100', reps: '10', restTime: 60 },
              { clientId: 'set-3', weight: '100', reps: '10', restTime: 60 },
            ],
          },
        ],
      };

      const result = workoutFormReducer(state, {
        type: 'SET_EXERCISE_REST',
        exerciseClientId: 'ex-abc',
        seconds: 180,
      });
      expect(result.exercises[0].sets.map((s) => s.restTime)).toEqual([180, 180, 180]);
    });

    it('leaves other exercises untouched', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-a',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [{ clientId: 'set-1', weight: '100', reps: '10', restTime: 60 }],
          },
          {
            clientId: 'ex-b',
            exerciseId: 'ex-2',
            exerciseName: 'Squat',
            exerciseCategory: null,
            sets: [{ clientId: 'set-2', weight: '200', reps: '5', restTime: 90 }],
          },
        ],
      };

      const result = workoutFormReducer(state, {
        type: 'SET_EXERCISE_REST',
        exerciseClientId: 'ex-a',
        seconds: 300,
      });
      expect(result.exercises[0].sets[0].restTime).toBe(300);
      expect(result.exercises[1].sets[0].restTime).toBe(90);
    });

    it('preserves set weight/reps while updating restTime', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Bench',
            exerciseCategory: null,
            sets: [{ clientId: 'set-1', weight: '225', reps: '5', restTime: 90 }],
          },
        ],
      };

      const result = workoutFormReducer(state, {
        type: 'SET_EXERCISE_REST',
        exerciseClientId: 'ex-abc',
        seconds: 45,
      });
      expect(result.exercises[0].sets[0].weight).toBe('225');
      expect(result.exercises[0].sets[0].reps).toBe('5');
      expect(result.exercises[0].sets[0].restTime).toBe(45);
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
      expect(result.name).toBe('Workout - Mar 12');
      expect(result.nameManuallySet).toBe(false);
      expect(result.exercises).toEqual([]);
      expect(result.entryDate).toBeTruthy();
    });
  });

  describe('SET_DATE', () => {
    it('updates the entry date', () => {
      const state = makeEmptyDraft();
      const result = workoutFormReducer(state, { type: 'SET_DATE', date: '2026-04-01' });
      expect(result.entryDate).toBe('2026-04-01');
    });

    it('preserves name when manually set', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        name: 'Leg Day',
        nameManuallySet: true,
        exercises: [
          {
            clientId: 'ex-1',
            exerciseId: 'uuid-1',
            exerciseName: 'Squat',
            exerciseCategory: 'Strength',
            sets: [],
          },
        ],
      };
      const result = workoutFormReducer(state, { type: 'SET_DATE', date: '2026-04-01' });
      expect(result.name).toBe('Leg Day');
      expect(result.exercises).toHaveLength(1);
    });

    it('auto-updates name when not manually set', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        nameManuallySet: false,
      };
      const result = workoutFormReducer(state, { type: 'SET_DATE', date: '2026-04-01' });
      expect(result.name).toBe('Workout - Apr 1');
    });
  });

  describe('POPULATE', () => {
    const makeSession = (overrides?: Partial<PresetSessionResponse>): PresetSessionResponse => ({
      type: 'preset',
      id: 'session-1',
      entry_date: '2026-03-15',
      workout_preset_id: null,
      name: 'Push Day',
      description: null,
      notes: null,
      source: 'sparky',
      total_duration_minutes: 60,
      activity_details: [],
      exercises: [
        {
          exercise_id: 'ex-1',
          exercise_snapshot: {
            id: 'ex-1',
            name: 'Bench Press',
            category: 'Strength',
            calories_per_hour: 400,
            source: 'system',
          },
          duration_minutes: 20,
          calories_burned: 150,
          sets: [
            { id: 'set-1', set_number: 1, weight: 60, reps: 10, set_type: 'working' } as ExerciseEntrySetResponse,
            { id: 'set-2', set_number: 2, weight: 80, reps: 8, set_type: 'working' } as ExerciseEntrySetResponse,
          ],
        } as any,
      ],
      ...overrides,
    });

    it('populates from a preset session in kg', () => {
      const state = makeEmptyDraft();
      const session = makeSession();
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg' });

      expect(result.name).toBe('Push Day');
      expect(result.nameManuallySet).toBe(true);
      expect(result.entryDate).toBe('2026-03-15');
      expect(result.exercises).toHaveLength(1);
      expect(result.exercises[0].exerciseName).toBe('Bench Press');
      expect(result.exercises[0].exerciseCategory).toBe('Strength');
      expect(result.exercises[0].sets).toHaveLength(2);
      expect(result.exercises[0].sets[0].weight).toBe('60');
      expect(result.exercises[0].sets[0].reps).toBe('10');
      expect(result.exercises[0].sets[1].weight).toBe('80');
      expect(result.exercises[0].sets[1].reps).toBe('8');
    });

    it('converts weight from kg to lbs', () => {
      const state = makeEmptyDraft();
      const session = makeSession();
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'lbs' });

      // 60 kg in lbs ≈ 132.3
      const weight1 = parseFloat(result.exercises[0].sets[0].weight);
      expect(weight1).toBeGreaterThan(100);
      // 80 kg in lbs ≈ 176.4
      const weight2 = parseFloat(result.exercises[0].sets[1].weight);
      expect(weight2).toBeGreaterThan(150);
    });

    it('handles null weight in sets', () => {
      const state = makeEmptyDraft();
      const session = makeSession({
        exercises: [
          {
            exercise_id: 'ex-1',
            exercise_snapshot: { id: 'ex-1', name: 'Plank', category: 'Core', calories_per_hour: 200, source: 'system' },
            duration_minutes: 10,
            calories_burned: 50,
            sets: [
              { id: 'set-1', set_number: 1, weight: null, reps: null, set_type: 'working' } as ExerciseEntrySetResponse,
            ],
          } as any,
        ],
      });
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg' });

      expect(result.exercises[0].sets[0].weight).toBe('');
      expect(result.exercises[0].sets[0].reps).toBe('');
    });

    it('uses today date when session entry_date is null', () => {
      const state = makeEmptyDraft();
      const session = makeSession({ entry_date: null as any });
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg' });

      expect(result.entryDate).toBe('2026-03-12');
    });

    it('handles missing exercise_snapshot gracefully', () => {
      const state = makeEmptyDraft();
      const session = makeSession({
        exercises: [
          {
            exercise_id: 'ex-1',
            exercise_snapshot: null,
            duration_minutes: 20,
            calories_burned: 150,
            sets: [],
          } as any,
        ],
      });
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg' });

      expect(result.exercises[0].exerciseName).toBe('Unknown');
      expect(result.exercises[0].exerciseCategory).toBeNull();
    });

    it('threads exercise id, set id, and rest_time onto the draft', () => {
      const state = makeEmptyDraft();
      const session = makeSession({
        exercises: [
          {
            id: 'ex-uuid-1',
            exercise_id: 'ex-1',
            exercise_snapshot: {
              id: 'ex-1',
              name: 'Bench Press',
              category: 'Strength',
              calories_per_hour: 400,
              source: 'system',
            },
            duration_minutes: 20,
            calories_burned: 150,
            sets: [
              { id: 101, set_number: 1, weight: 60, reps: 10, rest_time: 90, set_type: 'working' } as ExerciseEntrySetResponse,
              { id: 102, set_number: 2, weight: 80, reps: 8, rest_time: null, set_type: 'working' } as ExerciseEntrySetResponse,
            ],
          } as any,
        ],
      });
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg' });

      expect(result.exercises[0].serverId).toBe('ex-uuid-1');
      expect(result.exercises[0].sets[0].serverId).toBe(101);
      expect(result.exercises[0].sets[1].serverId).toBe(102);
      expect(result.exercises[0].sets[0].restTime).toBe(90);
      expect(result.exercises[0].sets[1].restTime).toBeNull();
    });
  });

  describe('RESTORE_DRAFT — old drafts without serverId/restTime', () => {
    it('rehydrates an old persisted draft without crashing; serverId/restTime are undefined', () => {
      const initial = makeEmptyDraft();
      const oldDraft: WorkoutDraft = {
        type: 'workout',
        name: 'Leg Day',
        entryDate: '2026-03-11',
        exercises: [
          {
            clientId: 'abc',
            exerciseId: 'ex-1',
            exerciseName: 'Squat',
            exerciseCategory: 'Strength',
            images: [],
            sets: [{ clientId: 'set-1', weight: '135', reps: '5' }],
          },
        ],
      };

      const result = workoutFormReducer(initial, { type: 'RESTORE_DRAFT', draft: oldDraft });
      expect(result.exercises[0].serverId).toBeUndefined();
      expect(result.exercises[0].sets[0].serverId).toBeUndefined();
      expect(result.exercises[0].sets[0].restTime).toBeUndefined();
    });
  });

  describe('POPULATE_FROM_PRESET', () => {
    const makePreset = (overrides?: Partial<WorkoutPreset>): WorkoutPreset => ({
      id: 'preset-1',
      user_id: 'user-1',
      name: 'Full Body',
      description: null,
      is_public: false,
      created_at: '2026-03-01',
      updated_at: '2026-03-01',
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Squat',
          image_url: null,
          sets: [
            { id: 's-1', set_number: 1, set_type: 'working', reps: 5, weight: 100, duration: null, rest_time: null, notes: null },
            { id: 's-2', set_number: 2, set_type: 'working', reps: 5, weight: 100, duration: null, rest_time: null, notes: null },
          ],
        },
      ],
      ...overrides,
    });

    it('populates from a workout preset in kg', () => {
      const state = makeEmptyDraft();
      const preset = makePreset();
      const result = workoutFormReducer(state, {
        type: 'POPULATE_FROM_PRESET',
        preset,
        weightUnit: 'kg',
        date: '2026-03-20',
      });

      expect(result.name).toBe('Full Body');
      expect(result.nameManuallySet).toBe(true);
      expect(result.entryDate).toBe('2026-03-20');
      expect(result.exercises).toHaveLength(1);
      expect(result.exercises[0].exerciseName).toBe('Squat');
      expect(result.exercises[0].exerciseCategory).toBeNull();
      expect(result.exercises[0].sets).toHaveLength(2);
      expect(result.exercises[0].sets[0].weight).toBe('100');
      expect(result.exercises[0].sets[0].reps).toBe('5');
    });

    it('converts weight from kg to lbs', () => {
      const state = makeEmptyDraft();
      const preset = makePreset();
      const result = workoutFormReducer(state, {
        type: 'POPULATE_FROM_PRESET',
        preset,
        weightUnit: 'lbs',
      });

      // 100 kg in lbs ≈ 220.5
      const weight = parseFloat(result.exercises[0].sets[0].weight);
      expect(weight).toBeGreaterThan(200);
    });

    it('uses today date when date is undefined', () => {
      const state = makeEmptyDraft();
      const preset = makePreset();
      const result = workoutFormReducer(state, {
        type: 'POPULATE_FROM_PRESET',
        preset,
        weightUnit: 'kg',
      });

      expect(result.entryDate).toBe('2026-03-12');
    });

    it('handles null weight and reps in preset sets', () => {
      const state = makeEmptyDraft();
      const preset = makePreset({
        exercises: [
          {
            id: 'pe-1',
            exercise_id: 'ex-1',
            exercise_name: 'Plank',
            image_url: null,
            sets: [
              { id: 's-1', set_number: 1, set_type: 'working', reps: null, weight: null, duration: 60, rest_time: null, notes: null },
            ],
          },
        ],
      });
      const result = workoutFormReducer(state, {
        type: 'POPULATE_FROM_PRESET',
        preset,
        weightUnit: 'kg',
      });

      expect(result.exercises[0].sets[0].weight).toBe('');
      expect(result.exercises[0].sets[0].reps).toBe('');
    });

    it('carries rest_time from preset sets into drafts', () => {
      const state = makeEmptyDraft();
      const preset = makePreset({
        exercises: [
          {
            id: 'pe-1',
            exercise_id: 'ex-1',
            exercise_name: 'Squat',
            image_url: null,
            sets: [
              { id: 's-1', set_number: 1, set_type: 'working', reps: 5, weight: 100, duration: null, rest_time: 120, notes: null },
              { id: 's-2', set_number: 2, set_type: 'working', reps: 5, weight: 100, duration: null, rest_time: null, notes: null },
            ],
          },
        ],
      });
      const result = workoutFormReducer(state, {
        type: 'POPULATE_FROM_PRESET',
        preset,
        weightUnit: 'kg',
      });

      expect(result.exercises[0].sets[0].restTime).toBe(120);
      expect(result.exercises[0].sets[1].restTime).toBeNull();
    });

    it('handles preset with multiple exercises', () => {
      const state = makeEmptyDraft();
      const preset = makePreset({
        exercises: [
          {
            id: 'pe-1',
            exercise_id: 'ex-1',
            exercise_name: 'Bench Press',
            image_url: null,
            sets: [{ id: 's-1', set_number: 1, set_type: 'working', reps: 8, weight: 60, duration: null, rest_time: null, notes: null }],
          },
          {
            id: 'pe-2',
            exercise_id: 'ex-2',
            exercise_name: 'Overhead Press',
            image_url: null,
            sets: [{ id: 's-2', set_number: 1, set_type: 'working', reps: 10, weight: 40, duration: null, rest_time: null, notes: null }],
          },
        ],
      });
      const result = workoutFormReducer(state, {
        type: 'POPULATE_FROM_PRESET',
        preset,
        weightUnit: 'kg',
        date: '2026-03-20',
      });

      expect(result.exercises).toHaveLength(2);
      expect(result.exercises[0].exerciseName).toBe('Bench Press');
      expect(result.exercises[1].exerciseName).toBe('Overhead Press');
    });
  });

  describe('getWorkoutDraftSubmission', () => {
    it('builds normalized submission values from exercises with sets', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        name: 'Push Day',
        entryDate: '2026-03-20',
        exercises: [
          {
            clientId: 'ex-1',
            exerciseId: 'uuid-1',
            exerciseName: 'Bench Press',
            exerciseCategory: 'Strength',
            images: [],
            sets: [{ clientId: 'set-1', weight: '225', reps: '5' }],
          },
          {
            clientId: 'ex-2',
            exerciseId: 'uuid-2',
            exerciseName: 'Accessory',
            exerciseCategory: 'Strength',
            images: [],
            sets: [],
          },
        ],
      };

      const result = getWorkoutDraftSubmission(state, 'kg');

      expect(result.name).toBe('Push Day');
      expect(result.entryDate).toBe('2026-03-20');
      expect(result.exerciseCount).toBe(1);
      expect(result.canSave).toBe(true);
      expect(result.exercisesWithSets).toHaveLength(1);
      expect(result.payloadExercises).toEqual([
        {
          exercise_id: 'uuid-1',
          sort_order: 0,
          duration_minutes: 0,
          sets: [{ set_number: 1, weight: 225, reps: 5 }],
        },
      ]);
    });

    it('falls back to default name and returns unsaveable state when no exercise has sets', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        name: '   ',
        exercises: [
          {
            clientId: 'ex-1',
            exerciseId: 'uuid-1',
            exerciseName: 'Bench Press',
            exerciseCategory: 'Strength',
            images: [],
            sets: [],
          },
        ],
      };

      const result = getWorkoutDraftSubmission(state, 'lbs');

      expect(result.name).toBe('Workout');
      expect(result.exerciseCount).toBe(0);
      expect(result.canSave).toBe(false);
      expect(result.exercisesWithSets).toEqual([]);
      expect(result.payloadExercises).toEqual([]);
    });
  });
});
