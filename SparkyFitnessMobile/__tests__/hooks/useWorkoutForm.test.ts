import {
  workoutFormReducer,
  getWorkoutDraftSubmission,
  type WorkoutDraft,
  type WorkoutDraftExercise,
} from '../../src/hooks/useWorkoutForm';
import { buildExercisesPayload } from '../../src/utils/workoutSession';
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

const presetClientIds = (preset: WorkoutPreset) =>
  preset.exercises.map((e, i) => ({
    exerciseClientId: `gen-ex-${i}`,
    setClientIds: e.sets.map((_, j) => `gen-set-${i}-${j}`),
  }));

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

  describe('REPLACE_EXERCISE', () => {
    const makeReplaceState = (): WorkoutDraft => ({
      ...makeEmptyDraft(),
      exercises: [
        {
          clientId: 'first',
          serverId: 'srv-1',
          exerciseId: 'ex-1',
          exerciseName: 'Bench Press',
          exerciseCategory: 'Strength',
          images: ['bench.png'],
          supersetGroup: 1,
          notes: 'felt heavy',
          snapshot: {
            id: 'ex-1',
            name: 'Bench Press',
            category: 'Strength',
            images: null,
            primary_muscles: null,
            secondary_muscles: null,
            equipment: null,
            instructions: null,
            force: null,
            level: null,
            mechanic: null,
            calories_per_hour: null,
          },
          sets: [
            { clientId: 's1', serverId: 101, weight: '100', reps: '5', restTime: 120 },
            { clientId: 's2', serverId: 102, weight: '100', reps: '4', restTime: 120 },
          ],
        },
        {
          clientId: 'second',
          serverId: 'srv-2',
          exerciseId: 'ex-2',
          exerciseName: 'Squat',
          exerciseCategory: 'Strength',
          images: [],
          supersetGroup: 1,
          sets: [{ clientId: 's3', serverId: 103, weight: '140', reps: '3' }],
        },
      ],
    });

    it('swaps the exercise identity in place, resetting to one default set', () => {
      const state = makeReplaceState();
      const result = workoutFormReducer(state, {
        type: 'REPLACE_EXERCISE',
        clientId: 'first',
        exercise: makeExercise({ id: 'ex-9', name: 'Incline Press', images: ['incline.png'] }),
        setClientId: 'new-set',
      });

      const replaced = result.exercises[0];
      expect(replaced.exerciseId).toBe('ex-9');
      expect(replaced.exerciseName).toBe('Incline Press');
      expect(replaced.images).toEqual(['incline.png']);
      expect(replaced.sets).toEqual([
        { clientId: 'new-set', weight: '', reps: '', distance: '', restTime: 90 },
      ]);
      expect(replaced.serverId).toBeUndefined();
      expect(replaced.snapshot).toBeNull();
      // Position, draft identity, grouping, and the entry note survive.
      expect(replaced.clientId).toBe('first');
      expect(replaced.supersetGroup).toBe(1);
      expect(replaced.notes).toBe('felt heavy');
      // The sibling is untouched.
      expect(result.exercises[1]).toBe(state.exercises[1]);
    });

    it('drops serverIds so the payload takes the delete-and-recreate path for the whole session', () => {
      const state = makeReplaceState();
      const result = workoutFormReducer(state, {
        type: 'REPLACE_EXERCISE',
        clientId: 'first',
        exercise: makeExercise({ id: 'ex-9', name: 'Incline Press' }),
        setClientId: 'new-set',
      });

      const payload = buildExercisesPayload(result.exercises, 'kg');
      expect(payload.every(e => !('id' in e))).toBe(true);
      expect(payload.flatMap(e => e.sets).every(s => !('id' in s))).toBe(true);
    });
  });

  describe('CLEAR_EXERCISE_COMPLETIONS', () => {
    const makeCompletionsState = (): WorkoutDraft => ({
      ...makeEmptyDraft(),
      exercises: [
        {
          clientId: 'logged',
          exerciseId: 'ex-1',
          exerciseName: 'Bench Press',
          exerciseCategory: 'Strength',
          images: [],
          sets: [
            {
              clientId: 's1',
              weight: '100',
              reps: '5',
              completedAt: '2026-03-12T10:00:00.000Z',
              isPr: true,
            },
            { clientId: 's2', weight: '105', reps: '5' },
          ],
        },
        {
          clientId: 'other',
          exerciseId: 'ex-2',
          exerciseName: 'Squat',
          exerciseCategory: 'Strength',
          images: [],
          sets: [
            { clientId: 's3', weight: '140', reps: '3', completedAt: '2026-03-12T10:05:00.000Z' },
          ],
        },
      ],
    });

    it('un-logs every set of the target, dropping PR flags but keeping values, and round-trips into the payload', () => {
      const result = workoutFormReducer(makeCompletionsState(), {
        type: 'CLEAR_EXERCISE_COMPLETIONS',
        clientId: 'logged',
      });

      expect(result.exercises[0].sets[0].completedAt).toBeNull();
      expect(result.exercises[0].sets[0].isPr).toBe(false);
      expect(result.exercises[0].sets[0].weight).toBe('100');
      expect(result.exercises[1].sets[0].completedAt).toBe('2026-03-12T10:05:00.000Z');

      const payload = buildExercisesPayload(result.exercises, 'kg');
      expect(payload[0].sets[0].completed_at).toBeNull();
      expect(payload[0].sets[0].is_pr).toBe(false);
      expect(payload[1].sets[0].completed_at).toBe('2026-03-12T10:05:00.000Z');
    });

    it('returns the state identity when the exercise has no logged sets', () => {
      const state = workoutFormReducer(makeCompletionsState(), {
        type: 'CLEAR_EXERCISE_COMPLETIONS',
        clientId: 'logged',
      });
      const result = workoutFormReducer(state, {
        type: 'CLEAR_EXERCISE_COMPLETIONS',
        clientId: 'logged',
      });
      expect(result).toBe(state);
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

    it('copies the previous set duration onto the new set', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Plank',
            exerciseCategory: 'isometric',
            sets: [{ clientId: 'set-1', weight: '', reps: '', duration: 45 }],
          },
        ],
      };

      const result = workoutFormReducer(state, {
        type: 'ADD_SET',
        exerciseClientId: 'ex-abc',
        setClientId: 'set-new',
      });
      expect(result.exercises[0].sets[1].duration).toBe(45);
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

    it('parses duration text to integer seconds, clearing on empty/garbage', () => {
      const state: WorkoutDraft = {
        ...makeEmptyDraft(),
        exercises: [
          {
            clientId: 'ex-abc',
            exerciseId: 'ex-1',
            exerciseName: 'Plank',
            exerciseCategory: 'isometric',
            sets: [{ clientId: 'set-1', weight: '', reps: '', duration: null }],
          },
        ],
      };

      const typed = workoutFormReducer(state, {
        type: 'UPDATE_SET_FIELD',
        exerciseClientId: 'ex-abc',
        setClientId: 'set-1',
        field: 'duration',
        value: '75',
      });
      expect(typed.exercises[0].sets[0].duration).toBe(75);

      const cleared = workoutFormReducer(typed, {
        type: 'UPDATE_SET_FIELD',
        exerciseClientId: 'ex-abc',
        setClientId: 'set-1',
        field: 'duration',
        value: '',
      });
      expect(cleared.exercises[0].sets[0].duration).toBeNull();

      const garbage = workoutFormReducer(typed, {
        type: 'UPDATE_SET_FIELD',
        exerciseClientId: 'ex-abc',
        setClientId: 'set-1',
        field: 'duration',
        value: 'abc',
      });
      expect(garbage.exercises[0].sets[0].duration).toBeNull();
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
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg', distanceUnit: 'km' });

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

    it('carries the snapshot modality onto the draft exercise', () => {
      const state = makeEmptyDraft();
      const session = makeSession({
        exercises: [
          {
            exercise_id: 'ex-1',
            exercise_snapshot: {
              id: 'ex-1',
              name: 'Plank',
              category: 'isometric',
              modality: 'duration',
              calories_per_hour: 200,
              source: 'system',
            },
            duration_minutes: 5,
            calories_burned: 20,
            sets: [],
          } as any,
        ],
      });
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg', distanceUnit: 'km' });

      expect(result.exercises[0].exerciseModality).toBe('duration');
      // Old-server sessions omit it — the draft records null and resolvers
      // fall back to the category.
      const bare = workoutFormReducer(state, {
        type: 'POPULATE',
        session: makeSession(),
        weightUnit: 'kg',
        distanceUnit: 'km',
      });
      expect(bare.exercises[0].exerciseModality).toBeNull();
    });

    it('round-trips set_type, duration, notes, rpe, and completed_at into the draft so edit-saves cannot wipe them', () => {
      const state = makeEmptyDraft();
      const session = makeSession({
        exercises: [
          {
            exercise_id: 'ex-1',
            exercise_snapshot: { id: 'ex-1', name: 'Bench Press', category: 'Strength', calories_per_hour: 400, source: 'system' },
            duration_minutes: 20,
            calories_burned: 150,
            sets: [
              {
                id: 'set-1',
                set_number: 1,
                weight: 60,
                reps: 10,
                set_type: 'warmup',
                duration: 30,
                rest_time: 90,
                notes: 'slow tempo',
                rpe: 7.5,
                completed_at: '2026-03-15T10:30:00.000Z',
              } as unknown as ExerciseEntrySetResponse,
            ],
          } as any,
        ],
      });
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg', distanceUnit: 'km' });

      const set = result.exercises[0].sets[0];
      expect(set.setType).toBe('warmup');
      expect(set.duration).toBe(30);
      expect(set.notes).toBe('slow tempo');
      expect(set.rpe).toBe(7.5);
      expect(set.completedAt).toBe('2026-03-15T10:30:00.000Z');
    });

    it('round-trips the exercise-level note into the draft and payload so edit-saves cannot wipe it', () => {
      const state = makeEmptyDraft();
      const session = makeSession({
        exercises: [
          {
            exercise_id: 'ex-1',
            exercise_snapshot: { id: 'ex-1', name: 'Bench Press', category: 'Strength', calories_per_hour: 400, source: 'system' },
            duration_minutes: 20,
            calories_burned: 150,
            notes: 'felt heavy today',
            sets: [
              { id: 'set-1', set_number: 1, weight: 60, reps: 10, set_type: 'normal' } as ExerciseEntrySetResponse,
            ],
          } as any,
        ],
      });
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg', distanceUnit: 'km' });

      expect(result.exercises[0].notes).toBe('felt heavy today');
      expect(buildExercisesPayload(result.exercises, 'kg')[0].notes).toBe('felt heavy today');
    });

    it('seeds duration and calories from the session for payload round-trip', () => {
      const state = makeEmptyDraft();
      const session = makeSession();
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg', distanceUnit: 'km' });

      expect(result.exercises[0].durationMinutes).toBe(20);
      expect(result.exercises[0].calories).toBe('150');
      expect(result.exercises[0].caloriesManuallySet).toBe(false);
    });

    it('converts weight from kg to lbs', () => {
      const state = makeEmptyDraft();
      const session = makeSession();
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'lbs', distanceUnit: 'miles' });

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
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg', distanceUnit: 'km' });

      expect(result.exercises[0].sets[0].weight).toBe('');
      expect(result.exercises[0].sets[0].reps).toBe('');
    });

    it('uses today date when session entry_date is null', () => {
      const state = makeEmptyDraft();
      const session = makeSession({ entry_date: null as any });
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg', distanceUnit: 'km' });

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
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg', distanceUnit: 'km' });

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
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg', distanceUnit: 'km' });

      expect(result.exercises[0].serverId).toBe('ex-uuid-1');
      expect(result.exercises[0].sets[0].serverId).toBe(101);
      expect(result.exercises[0].sets[1].serverId).toBe(102);
      expect(result.exercises[0].sets[0].restTime).toBe(90);
      expect(result.exercises[0].sets[1].restTime).toBeNull();
    });

    it('round-trips superset_group opaquely through the draft and back into the payload', () => {
      const state = makeEmptyDraft();
      const session = makeSession({
        exercises: [
          {
            id: 'ex-uuid-1',
            exercise_id: 'ex-1',
            exercise_snapshot: null,
            duration_minutes: 20,
            calories_burned: 150,
            superset_group: 3,
            sets: [],
          } as any,
          {
            id: 'ex-uuid-2',
            exercise_id: 'ex-2',
            exercise_snapshot: null,
            duration_minutes: 20,
            calories_burned: 150,
            superset_group: 3,
            sets: [],
          } as any,
          {
            id: 'ex-uuid-3',
            exercise_id: 'ex-3',
            exercise_snapshot: null,
            duration_minutes: 20,
            calories_burned: 150,
            sets: [],
          } as any,
        ],
      });
      const result = workoutFormReducer(state, { type: 'POPULATE', session, weightUnit: 'kg', distanceUnit: 'km' });

      expect(result.exercises[0].supersetGroup).toBe(3);
      expect(result.exercises[1].supersetGroup).toBe(3);
      expect(result.exercises[2].supersetGroup).toBeNull();

      const payload = buildExercisesPayload(result.exercises, 'kg');
      expect(payload.map((e) => e.superset_group)).toEqual([3, 3, null]);
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

  describe('UPDATE_SET_META', () => {
    const stateWithSets = (): WorkoutDraft => ({
      ...makeEmptyDraft(),
      exercises: [
        {
          clientId: 'a',
          exerciseId: 'ex-1',
          exerciseName: 'Bench Press',
          exerciseCategory: null,
          images: [],
          sets: [
            { clientId: 'a-s1', weight: '100', reps: '5' },
            { clientId: 'a-s2', weight: '100', reps: '5' },
          ],
        },
      ],
    });

    it('patches setType and rpe on the targeted set only and round-trips into the payload', () => {
      let state = workoutFormReducer(stateWithSets(), {
        type: 'UPDATE_SET_META',
        exerciseClientId: 'a',
        setClientId: 'a-s1',
        patch: { setType: 'warmup' },
      });
      state = workoutFormReducer(state, {
        type: 'UPDATE_SET_META',
        exerciseClientId: 'a',
        setClientId: 'a-s1',
        patch: { rpe: 8.5 },
      });

      expect(state.exercises[0].sets[0].setType).toBe('warmup');
      expect(state.exercises[0].sets[0].rpe).toBe(8.5);
      expect(state.exercises[0].sets[1].setType).toBeUndefined();
      expect(state.exercises[0].sets[1].rpe).toBeUndefined();

      const payload = buildExercisesPayload(state.exercises, 'kg');
      expect(payload[0].sets[0].set_type).toBe('warmup');
      expect(payload[0].sets[0].rpe).toBe(8.5);
      expect(payload[0].sets[1].set_type).toBeNull();
      expect(payload[0].sets[1].rpe).toBeNull();
    });

    it('clears rpe with an explicit null patch', () => {
      let state = workoutFormReducer(stateWithSets(), {
        type: 'UPDATE_SET_META',
        exerciseClientId: 'a',
        setClientId: 'a-s1',
        patch: { rpe: 9 },
      });
      state = workoutFormReducer(state, {
        type: 'UPDATE_SET_META',
        exerciseClientId: 'a',
        setClientId: 'a-s1',
        patch: { rpe: null },
      });
      expect(state.exercises[0].sets[0].rpe).toBeNull();
    });

    it('patches a set note and round-trips it into the payload', () => {
      const state = workoutFormReducer(stateWithSets(), {
        type: 'UPDATE_SET_META',
        exerciseClientId: 'a',
        setClientId: 'a-s1',
        patch: { notes: 'slow tempo' },
      });

      expect(state.exercises[0].sets[0].notes).toBe('slow tempo');
      expect(state.exercises[0].sets[1].notes).toBeUndefined();

      const payload = buildExercisesPayload(state.exercises, 'kg');
      expect(payload[0].sets[0].notes).toBe('slow tempo');
      expect(payload[0].sets[1].notes).toBeNull();
    });
  });

  describe('SET_EXERCISE_NOTES', () => {
    const stateWithExercise = (notes?: string | null): WorkoutDraft => ({
      ...makeEmptyDraft(),
      exercises: [
        {
          clientId: 'a',
          exerciseId: 'ex-1',
          exerciseName: 'Bench Press',
          exerciseCategory: null,
          images: [],
          notes,
          sets: [{ clientId: 'a-s1', weight: '100', reps: '5' }],
        },
      ],
    });

    it('trims and stores the note, round-tripping it into the payload', () => {
      const state = workoutFormReducer(stateWithExercise(), {
        type: 'SET_EXERCISE_NOTES',
        exerciseClientId: 'a',
        notes: '  felt heavy  ',
      });
      expect(state.exercises[0].notes).toBe('felt heavy');
      expect(buildExercisesPayload(state.exercises, 'kg')[0].notes).toBe('felt heavy');
    });

    it('clears the note when the text is empty', () => {
      const state = workoutFormReducer(stateWithExercise('felt heavy'), {
        type: 'SET_EXERCISE_NOTES',
        exerciseClientId: 'a',
        notes: '   ',
      });
      expect(state.exercises[0].notes).toBeNull();
      expect(buildExercisesPayload(state.exercises, 'kg')[0].notes).toBeNull();
    });

    it('returns the state identity when nothing changes', () => {
      const state = stateWithExercise('felt heavy');
      const next = workoutFormReducer(state, {
        type: 'SET_EXERCISE_NOTES',
        exerciseClientId: 'a',
        notes: ' felt heavy ',
      });
      expect(next).toBe(state);
    });
  });

  describe('superset actions', () => {
    const makeDraftEx = (
      clientId: string,
      restTime: number,
      overrides?: Partial<WorkoutDraftExercise>,
    ): WorkoutDraftExercise => ({
      clientId,
      exerciseId: `x-${clientId}`,
      exerciseName: clientId.toUpperCase(),
      exerciseCategory: null,
      images: [],
      sets: [{ clientId: `${clientId}-s1`, weight: '100', reps: '5', restTime }],
      ...overrides,
    });

    const threeSolo = (): WorkoutDraft => ({
      ...makeEmptyDraft(),
      exercises: [makeDraftEx('a', 60), makeDraftEx('b', 120), makeDraftEx('c', 45)],
    });

    const grouped = (): WorkoutDraft => ({
      ...makeEmptyDraft(),
      exercises: [
        makeDraftEx('a', 60, { supersetGroup: 1 }),
        makeDraftEx('b', 60, { supersetGroup: 1 }),
        makeDraftEx('c', 45),
      ],
    });

    const triGroup = (): WorkoutDraft => ({
      ...makeEmptyDraft(),
      exercises: [
        makeDraftEx('a', 60, { supersetGroup: 1 }),
        makeDraftEx('b', 60, { supersetGroup: 1 }),
        makeDraftEx('c', 60, { supersetGroup: 1 }),
      ],
    });

    it('groups two non-adjacent solos: reorders adjacent, harmonizes rest to the anchor', () => {
      const next = workoutFormReducer(threeSolo(), {
        type: 'SUPERSET_WITH',
        currentClientId: 'a',
        pickedClientId: 'c',
      });

      expect(next.exercises.map(e => e.clientId)).toEqual(['a', 'c', 'b']);
      expect(next.exercises.map(e => e.supersetGroup ?? null)).toEqual([1, 1, null]);
      // c's per-set rest (45) is overwritten by the anchor's 60.
      expect(next.exercises[1].sets.map(s => s.restTime)).toEqual([60]);
    });

    it("adds a member to the current run's tail", () => {
      const next = workoutFormReducer(grouped(), {
        type: 'SUPERSET_WITH',
        currentClientId: 'a',
        pickedClientId: 'c',
      });

      expect(next.exercises.map(e => e.clientId)).toEqual(['a', 'b', 'c']);
      expect(next.exercises.map(e => e.supersetGroup)).toEqual([1, 1, 1]);
      expect(next.exercises[2].sets.map(s => s.restTime)).toEqual([60]);
    });

    it('generates a fresh group id past stale singleton values and scrubs them', () => {
      const state = threeSolo();
      state.exercises[2] = { ...state.exercises[2], supersetGroup: 5 };

      const next = workoutFormReducer(state, {
        type: 'SUPERSET_WITH',
        currentClientId: 'a',
        pickedClientId: 'b',
      });

      expect(next.exercises[0].supersetGroup).toBe(6);
      expect(next.exercises[1].supersetGroup).toBe(6);
      expect(next.exercises[2].supersetGroup).toBeNull();
    });

    it('rejects grouping with an already-grouped pick', () => {
      const state = grouped();
      const next = workoutFormReducer(state, {
        type: 'SUPERSET_WITH',
        currentClientId: 'c',
        pickedClientId: 'a',
      });
      expect(next.exercises).toBe(state.exercises);
    });

    it('ungrouping either member of a 2-group dissolves it entirely', () => {
      const next = workoutFormReducer(grouped(), {
        type: 'UNGROUP_EXERCISE',
        clientId: 'a',
      });

      expect(next.exercises.map(e => e.clientId)).toEqual(['a', 'b', 'c']);
      expect(next.exercises.map(e => e.supersetGroup ?? null)).toEqual([null, null, null]);
    });

    it('ungrouping a middle member moves it after the run so the rest stay adjacent', () => {
      const next = workoutFormReducer(triGroup(), {
        type: 'UNGROUP_EXERCISE',
        clientId: 'b',
      });

      expect(next.exercises.map(e => e.clientId)).toEqual(['a', 'c', 'b']);
      expect(next.exercises.map(e => e.supersetGroup ?? null)).toEqual([1, 1, null]);
    });

    it('ungrouping an end member of a tri-set keeps the other two grouped', () => {
      const next = workoutFormReducer(triGroup(), {
        type: 'UNGROUP_EXERCISE',
        clientId: 'c',
      });

      expect(next.exercises.map(e => e.clientId)).toEqual(['a', 'b', 'c']);
      expect(next.exercises.map(e => e.supersetGroup ?? null)).toEqual([1, 1, null]);
    });

    it('is a no-op for an ungrouped exercise', () => {
      const state = threeSolo();
      const next = workoutFormReducer(state, {
        type: 'UNGROUP_EXERCISE',
        clientId: 'a',
      });
      expect(next.exercises).toBe(state.exercises);
    });

    it('REMOVE_EXERCISE of a group member dissolves the 1-member remainder', () => {
      const next = workoutFormReducer(grouped(), {
        type: 'REMOVE_EXERCISE',
        clientId: 'b',
      });

      expect(next.exercises.map(e => e.clientId)).toEqual(['a', 'c']);
      expect(next.exercises[0].supersetGroup).toBeNull();
    });

    it('round-trips draft groups into the session payload', () => {
      const next = workoutFormReducer(threeSolo(), {
        type: 'SUPERSET_WITH',
        currentClientId: 'a',
        pickedClientId: 'b',
      });
      const payload = buildExercisesPayload(next.exercises, 'kg');
      expect(payload.map(e => e.superset_group)).toEqual([1, 1, null]);
    });

    it('REORDER_EXERCISES moves a solo exercise to a new position', () => {
      const next = workoutFormReducer(threeSolo(), {
        type: 'REORDER_EXERCISES',
        fromItemIndex: 0,
        toItemIndex: 2,
      });
      expect(next.exercises.map(e => e.clientId)).toEqual(['b', 'c', 'a']);
    });

    it('REORDER_EXERCISES moves a whole run as one block', () => {
      // grouped(): [a(1), b(1), c] → items [ab run], [c]. Move c before the run.
      const next = workoutFormReducer(grouped(), {
        type: 'REORDER_EXERCISES',
        fromItemIndex: 1,
        toItemIndex: 0,
      });
      expect(next.exercises.map(e => e.clientId)).toEqual(['c', 'a', 'b']);
      expect(next.exercises.map(e => e.supersetGroup ?? null)).toEqual([null, 1, 1]);
    });

    it('REORDER_EXERCISES is a no-op on an out-of-range index', () => {
      const state = threeSolo();
      const next = workoutFormReducer(state, {
        type: 'REORDER_EXERCISES',
        fromItemIndex: 0,
        toItemIndex: 9,
      });
      expect(next.exercises).toBe(state.exercises);
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
        clientIds: presetClientIds(preset),
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
        clientIds: presetClientIds(preset),
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
        clientIds: presetClientIds(preset),
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
        clientIds: presetClientIds(preset),
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
        clientIds: presetClientIds(preset),
      });

      expect(result.exercises[0].sets[0].restTime).toBe(120);
      expect(result.exercises[0].sets[1].restTime).toBeNull();
    });

    it('maps superset_group, set_type, duration, and notes and round-trips them to the save payload', () => {
      const state = makeEmptyDraft();
      const preset = makePreset({
        exercises: [
          {
            id: 'pe-1',
            exercise_id: 'ex-1',
            exercise_name: 'Bench Press',
            image_url: null,
            superset_group: 1,
            sets: [
              { id: 's-1', set_number: 1, set_type: 'warmup', reps: 12, weight: 40, duration: 45, rest_time: 60, notes: 'slow tempo' },
            ],
          },
          {
            id: 'pe-2',
            exercise_id: 'ex-2',
            exercise_name: 'Bent Row',
            image_url: null,
            superset_group: null,
            sets: [{ id: 's-2', set_number: 1, set_type: 'normal', reps: 10, weight: 60, duration: null, rest_time: null, notes: null }],
          },
        ],
      });
      const result = workoutFormReducer(state, {
        type: 'POPULATE_FROM_PRESET',
        preset,
        weightUnit: 'kg',
        clientIds: presetClientIds(preset),
      });

      expect(result.exercises[0].supersetGroup).toBe(1);
      expect(result.exercises[1].supersetGroup).toBeNull();
      expect(result.exercises[0].sets[0].setType).toBe('warmup');
      expect(result.exercises[0].sets[0].duration).toBe(45);
      expect(result.exercises[0].sets[0].notes).toBe('slow tempo');

      // "Log past workout" saves through buildExercisesPayload, which writes
      // every column with `?? null` — the populated draft must carry these
      // fields or the save would permanently null them.
      const payload = buildExercisesPayload(result.exercises, 'kg');
      expect(payload[0].superset_group).toBe(1);
      expect(payload[1].superset_group).toBeNull();
      expect(payload[0].sets[0].set_type).toBe('warmup');
      expect(payload[0].sets[0].duration).toBe(45);
      expect(payload[0].sets[0].notes).toBe('slow tempo');
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
        clientIds: presetClientIds(preset),
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

      const result = getWorkoutDraftSubmission(state, 'kg', 'km');

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
          notes: null,
          superset_group: null,
          sets: [
            {
              set_number: 1,
              weight: 225,
              reps: 5,
              set_type: null,
              duration: null,
              distance: null,
              notes: null,
              rpe: null,
              completed_at: null,
              is_pr: false,
            },
          ],
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

      const result = getWorkoutDraftSubmission(state, 'lbs', 'miles');

      expect(result.name).toBe('Workout');
      expect(result.exerciseCount).toBe(0);
      expect(result.canSave).toBe(false);
      expect(result.exercisesWithSets).toEqual([]);
      expect(result.payloadExercises).toEqual([]);
    });
  });
});
