import { renderHook, act } from '@testing-library/react-native';
import {
  presetFormReducer,
  useWorkoutPresetForm,
  type PresetDraft,
  type PresetClientIds,
} from '../../src/hooks/useWorkoutPresetForm';
import { DEFAULT_REST_SEC, buildPresetExercisesPayload } from '../../src/utils/workoutSession';
import { kgToLbs } from '../../src/utils/unitConversions';
import type { Exercise } from '../../src/types/exercise';
import type { WorkoutDraftExercise } from '../../src/types/drafts';
import type { WorkoutPreset } from '../../src/types/workoutPresets';

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex-1',
    name: 'Bench Press',
    category: 'strength',
    equipment: [],
    primary_muscles: [],
    secondary_muscles: [],
    calories_per_hour: 0,
    source: 'custom',
    images: ['bench.png'],
    tags: [],
    ...overrides,
  };
}

function draftWithExercise(): PresetDraft {
  return {
    name: 'Push',
    description: 'desc',
    exercises: [
      {
        clientId: 'e1',
        exerciseId: 'ex-1',
        exerciseName: 'Bench Press',
        exerciseCategory: 'strength',
        images: [],
        sets: [
          { clientId: 's1', weight: '100', reps: '5', restTime: 120 },
          { clientId: 's2', weight: '110', reps: '3', restTime: 120 },
        ],
      },
    ],
  };
}

describe('presetFormReducer', () => {
  const empty: PresetDraft = { name: '', description: '', exercises: [] };

  it('SET_NAME / SET_DESCRIPTION update only their field', () => {
    expect(presetFormReducer(empty, { type: 'SET_NAME', name: 'Leg Day' })).toEqual({
      ...empty,
      name: 'Leg Day',
    });
    expect(presetFormReducer(empty, { type: 'SET_DESCRIPTION', description: 'heavy' })).toEqual({
      ...empty,
      description: 'heavy',
    });
  });

  it('ADD_EXERCISE appends an exercise seeded with one default set', () => {
    const next = presetFormReducer(empty, {
      type: 'ADD_EXERCISE',
      exercise: exercise(),
      exerciseClientId: 'e1',
      setClientId: 's1',
    });

    expect(next.exercises).toHaveLength(1);
    expect(next.exercises[0]).toEqual({
      clientId: 'e1',
      exerciseId: 'ex-1',
      exerciseName: 'Bench Press',
      exerciseCategory: 'strength',
      images: ['bench.png'],
      sets: [{ clientId: 's1', weight: '', reps: '', restTime: DEFAULT_REST_SEC }],
    });
  });

  it('ADD_EXERCISE defaults missing images to an empty array', () => {
    const next = presetFormReducer(empty, {
      type: 'ADD_EXERCISE',
      exercise: exercise({ images: undefined as unknown as string[] }),
      exerciseClientId: 'e1',
      setClientId: 's1',
    });
    expect(next.exercises[0].images).toEqual([]);
  });

  it('REMOVE_EXERCISE drops the matching exercise only', () => {
    const state = draftWithExercise();
    expect(
      presetFormReducer(state, { type: 'REMOVE_EXERCISE', clientId: 'e1' }).exercises,
    ).toHaveLength(0);
    expect(
      presetFormReducer(state, { type: 'REMOVE_EXERCISE', clientId: 'nope' }).exercises,
    ).toHaveLength(1);
  });

  it('ADD_SET copies the last set values and the first set rest time', () => {
    const state = draftWithExercise();
    const next = presetFormReducer(state, {
      type: 'ADD_SET',
      exerciseClientId: 'e1',
      setClientId: 's3',
    });

    const sets = next.exercises[0].sets;
    expect(sets).toHaveLength(3);
    // Inherits the last set's weight/reps...
    expect(sets[2]).toEqual({ clientId: 's3', weight: '110', reps: '3', restTime: 120 });
  });

  it('ADD_SET falls back to empty values and the default rest when the exercise has no sets', () => {
    const state: PresetDraft = {
      name: '',
      description: '',
      exercises: [
        {
          clientId: 'e1',
          exerciseId: 'ex-1',
          exerciseName: 'Bench Press',
          exerciseCategory: 'strength',
          images: [],
          sets: [],
        },
      ],
    };
    const next = presetFormReducer(state, {
      type: 'ADD_SET',
      exerciseClientId: 'e1',
      setClientId: 's1',
    });
    expect(next.exercises[0].sets).toEqual([
      { clientId: 's1', weight: '', reps: '', restTime: DEFAULT_REST_SEC },
    ]);
  });

  it('REMOVE_SET removes only the targeted set', () => {
    const state = draftWithExercise();
    const next = presetFormReducer(state, {
      type: 'REMOVE_SET',
      exerciseClientId: 'e1',
      setClientId: 's1',
    });
    expect(next.exercises[0].sets.map((s) => s.clientId)).toEqual(['s2']);
  });

  it('UPDATE_SET_FIELD updates only the targeted field on the targeted set', () => {
    const state = draftWithExercise();
    const next = presetFormReducer(state, {
      type: 'UPDATE_SET_FIELD',
      exerciseClientId: 'e1',
      setClientId: 's2',
      field: 'reps',
      value: '8',
    });
    expect(next.exercises[0].sets[1].reps).toBe('8');
    // Untouched fields/sets are preserved.
    expect(next.exercises[0].sets[1].weight).toBe('110');
    expect(next.exercises[0].sets[0].reps).toBe('5');
  });

  it('SET_EXERCISE_REST applies the rest time to every set of the exercise', () => {
    const state = draftWithExercise();
    const next = presetFormReducer(state, {
      type: 'SET_EXERCISE_REST',
      exerciseClientId: 'e1',
      seconds: 45,
    });
    expect(next.exercises[0].sets.every((s) => s.restTime === 45)).toBe(true);
  });

  describe('UPDATE_SET_META', () => {
    it('patches setType on the targeted set and round-trips into the preset payload', () => {
      const next = presetFormReducer(draftWithExercise(), {
        type: 'UPDATE_SET_META',
        exerciseClientId: 'e1',
        setClientId: 's1',
        patch: { setType: 'warmup' },
      });

      expect(next.exercises[0].sets[0].setType).toBe('warmup');
      expect(next.exercises[0].sets[1].setType).toBeUndefined();

      const payload = buildPresetExercisesPayload(next.exercises, 'kg');
      expect(payload[0].sets[0].set_type).toBe('warmup');
      // Preset sets have no rpe column; a stray rpe patch must not leak out.
      expect(payload[0].sets[0]).not.toHaveProperty('rpe');
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

    const threeSolo = (): PresetDraft => ({
      name: 'Push',
      description: '',
      exercises: [makeDraftEx('a', 60), makeDraftEx('b', 120), makeDraftEx('c', 45)],
    });

    it('groups two solos: reorders adjacent, harmonizes rest, round-trips into the payload', () => {
      const next = presetFormReducer(threeSolo(), {
        type: 'SUPERSET_WITH',
        currentClientId: 'a',
        pickedClientId: 'c',
      });

      expect(next.exercises.map(e => e.clientId)).toEqual(['a', 'c', 'b']);
      expect(next.exercises.map(e => e.supersetGroup ?? null)).toEqual([1, 1, null]);
      expect(next.exercises[1].sets.map(s => s.restTime)).toEqual([60]);

      const payload = buildPresetExercisesPayload(next.exercises, 'kg');
      expect(payload.map(e => e.superset_group)).toEqual([1, 1, null]);
    });

    it('ungrouping either member of a 2-group dissolves it entirely', () => {
      const groupedState = presetFormReducer(threeSolo(), {
        type: 'SUPERSET_WITH',
        currentClientId: 'a',
        pickedClientId: 'b',
      });
      const next = presetFormReducer(groupedState, {
        type: 'UNGROUP_EXERCISE',
        clientId: 'b',
      });

      expect(next.exercises.map(e => e.supersetGroup ?? null)).toEqual([null, null, null]);
    });

    it('REMOVE_EXERCISE of a group member dissolves the 1-member remainder', () => {
      const groupedState = presetFormReducer(threeSolo(), {
        type: 'SUPERSET_WITH',
        currentClientId: 'a',
        pickedClientId: 'b',
      });
      const next = presetFormReducer(groupedState, {
        type: 'REMOVE_EXERCISE',
        clientId: 'a',
      });

      expect(next.exercises.map(e => e.clientId)).toEqual(['b', 'c']);
      expect(next.exercises[0].supersetGroup).toBeNull();
    });

    it('REORDER_EXERCISES moves a solo exercise to a new position', () => {
      const next = presetFormReducer(threeSolo(), {
        type: 'REORDER_EXERCISES',
        fromItemIndex: 2,
        toItemIndex: 0,
      });
      expect(next.exercises.map(e => e.clientId)).toEqual(['c', 'a', 'b']);
    });

    it('REORDER_EXERCISES moves a whole run as one block', () => {
      const groupedState = presetFormReducer(threeSolo(), {
        type: 'SUPERSET_WITH',
        currentClientId: 'a',
        pickedClientId: 'b',
      });
      // items after grouping: [ab run], [c]. Move c before the run.
      const next = presetFormReducer(groupedState, {
        type: 'REORDER_EXERCISES',
        fromItemIndex: 1,
        toItemIndex: 0,
      });
      expect(next.exercises.map(e => e.clientId)).toEqual(['c', 'a', 'b']);
      expect(next.exercises.map(e => e.supersetGroup ?? null)).toEqual([null, 1, 1]);
    });
  });

  describe('POPULATE_FROM_PRESET', () => {
    function preset(overrides: Partial<WorkoutPreset> = {}): WorkoutPreset {
      return {
        id: 'p1',
        user_id: 'u1',
        name: 'Imported',
        description: 'from server',
        is_public: false,
        created_at: '',
        updated_at: '',
        exercises: [
          {
            id: 'pe1',
            exercise_id: 'ex-1',
            image_url: 'img.png',
            exercise_name: 'Squat',
            category: 'legs',
            sets: [
              {
                id: 'ps1',
                set_number: 1,
                set_type: 'working',
                reps: 5,
                weight: 100,
                duration: null,
                rest_time: 90,
                notes: 'go deep',
              },
              {
                id: 'ps2',
                set_number: 2,
                set_type: 'warmup',
                reps: null,
                weight: null,
                duration: 30,
                rest_time: 60,
                notes: null,
              },
            ],
          },
        ],
        ...overrides,
      };
    }

    const clientIds: PresetClientIds = [
      { exerciseClientId: 'e1', setClientIds: ['s1', 's2'] },
    ];

    it('maps a preset to a draft, keeping weight in kg when the unit is kg', () => {
      const next = presetFormReducer(
        { name: '', description: '', exercises: [] },
        { type: 'POPULATE_FROM_PRESET', preset: preset(), weightUnit: 'kg', clientIds },
      );

      expect(next.name).toBe('Imported');
      expect(next.description).toBe('from server');
      expect(next.exercises[0]).toMatchObject({
        clientId: 'e1',
        exerciseId: 'ex-1',
        exerciseName: 'Squat',
        exerciseCategory: 'legs',
        images: ['img.png'],
      });
      expect(next.exercises[0].sets[0]).toMatchObject({
        clientId: 's1',
        restTime: 90,
        weight: '100',
        reps: '5',
        setType: 'working',
        duration: null,
        notes: 'go deep',
      });
    });

    it('converts stored kg weights to lbs when the unit is lbs', () => {
      const next = presetFormReducer(
        { name: '', description: '', exercises: [] },
        { type: 'POPULATE_FROM_PRESET', preset: preset(), weightUnit: 'lbs', clientIds },
      );
      const expected = String(parseFloat(kgToLbs(100).toFixed(1)));
      expect(next.exercises[0].sets[0].weight).toBe(expected);
    });

    it('renders null weights/reps as empty strings', () => {
      const next = presetFormReducer(
        { name: '', description: '', exercises: [] },
        { type: 'POPULATE_FROM_PRESET', preset: preset(), weightUnit: 'kg', clientIds },
      );
      expect(next.exercises[0].sets[1].weight).toBe('');
      expect(next.exercises[0].sets[1].reps).toBe('');
    });

    it('maps superset_group into the draft, defaulting to null', () => {
      const grouped = preset({
        exercises: [
          { ...preset().exercises[0], superset_group: 3 },
          { ...preset().exercises[0], id: 802, exercise_id: 'ex-2', superset_group: null },
        ],
      });
      const next = presetFormReducer(
        { name: '', description: '', exercises: [] },
        {
          type: 'POPULATE_FROM_PRESET',
          preset: grouped,
          weightUnit: 'kg',
          clientIds: [
            { exerciseClientId: 'e1', setClientIds: ['s1', 's2'] },
            { exerciseClientId: 'e2', setClientIds: ['s3', 's4'] },
          ],
        },
      );
      expect(next.exercises[0].supersetGroup).toBe(3);
      expect(next.exercises[1].supersetGroup).toBeNull();
    });

    it('falls back to an empty description and no images when those are absent', () => {
      const bare = preset({
        description: null,
        exercises: [
          {
            id: 'pe1',
            exercise_id: 'ex-9',
            image_url: null,
            exercise_name: 'Plank',
            category: null,
            sets: [
              {
                id: 'ps1',
                set_number: 1,
                set_type: 'working',
                reps: null,
                weight: null,
                duration: 60,
                rest_time: null,
                notes: null,
              },
            ],
          },
        ],
      });
      const next = presetFormReducer(
        { name: '', description: '', exercises: [] },
        {
          type: 'POPULATE_FROM_PRESET',
          preset: bare,
          weightUnit: 'kg',
          clientIds: [{ exerciseClientId: 'e1', setClientIds: ['s1'] }],
        },
      );
      expect(next.description).toBe('');
      expect(next.exercises[0].images).toEqual([]);
      expect(next.exercises[0].exerciseCategory).toBeNull();
    });
  });

  it('returns the current state for an unknown action', () => {
    const state = draftWithExercise();
    expect(presetFormReducer(state, { type: 'UNKNOWN' } as never)).toBe(state);
  });
});

describe('useWorkoutPresetForm', () => {
  it('starts with an empty draft and unmodified refs', () => {
    const { result } = renderHook(() => useWorkoutPresetForm());
    expect(result.current.state).toEqual({ name: '', description: '', exercises: [] });
    expect(result.current.exercisesModifiedRef.current).toBe(false);
    expect(result.current.initialDescriptionRef.current).toBe('');
  });

  it('setName / setDescription update the draft', () => {
    const { result } = renderHook(() => useWorkoutPresetForm());
    act(() => result.current.setName('Pull Day'));
    act(() => result.current.setDescription('back focus'));
    expect(result.current.state.name).toBe('Pull Day');
    expect(result.current.state.description).toBe('back focus');
  });

  it('addExercise returns fresh ids, appends the exercise, and marks it modified', () => {
    const { result } = renderHook(() => useWorkoutPresetForm());

    let ids: { exerciseClientId: string; setClientId: string } | undefined;
    act(() => {
      ids = result.current.addExercise(exercise());
    });

    expect(ids?.exerciseClientId).toBeTruthy();
    expect(ids?.setClientId).toBeTruthy();
    expect(ids?.exerciseClientId).not.toBe(ids?.setClientId);
    expect(result.current.state.exercises).toHaveLength(1);
    expect(result.current.state.exercises[0].clientId).toBe(ids?.exerciseClientId);
    expect(result.current.exercisesModifiedRef.current).toBe(true);
  });

  it('addSet returns a new set id and marks the form modified', () => {
    const { result } = renderHook(() => useWorkoutPresetForm());

    let exerciseClientId = '';
    act(() => {
      exerciseClientId = result.current.addExercise(exercise()).exerciseClientId;
    });
    result.current.exercisesModifiedRef.current = false;

    let setId = '';
    act(() => {
      setId = result.current.addSet(exerciseClientId);
    });

    expect(setId).toBeTruthy();
    expect(result.current.state.exercises[0].sets).toHaveLength(2);
    expect(result.current.state.exercises[0].sets[1].clientId).toBe(setId);
    expect(result.current.exercisesModifiedRef.current).toBe(true);
  });

  it('removeExercise / removeSet / updateSetField / setExerciseRest all flag modification', () => {
    const { result } = renderHook(() => useWorkoutPresetForm());

    let exerciseClientId = '';
    let setClientId = '';
    act(() => {
      const ids = result.current.addExercise(exercise());
      exerciseClientId = ids.exerciseClientId;
      setClientId = ids.setClientId;
    });

    result.current.exercisesModifiedRef.current = false;
    act(() => result.current.updateSetField(exerciseClientId, setClientId, 'weight', '50'));
    expect(result.current.state.exercises[0].sets[0].weight).toBe('50');
    expect(result.current.exercisesModifiedRef.current).toBe(true);

    result.current.exercisesModifiedRef.current = false;
    act(() => result.current.setExerciseRest(exerciseClientId, 30));
    expect(result.current.state.exercises[0].sets[0].restTime).toBe(30);
    expect(result.current.exercisesModifiedRef.current).toBe(true);

    result.current.exercisesModifiedRef.current = false;
    act(() => result.current.removeSet(exerciseClientId, setClientId));
    expect(result.current.exercisesModifiedRef.current).toBe(true);

    result.current.exercisesModifiedRef.current = false;
    act(() => result.current.removeExercise(exerciseClientId));
    expect(result.current.state.exercises).toHaveLength(0);
    expect(result.current.exercisesModifiedRef.current).toBe(true);
  });

  it('reorderExercises reorders the draft and flips the modified flag (guards the silent-save bug)', () => {
    const { result } = renderHook(() => useWorkoutPresetForm());

    let firstId = '';
    let secondId = '';
    act(() => {
      firstId = result.current.addExercise(exercise()).exerciseClientId;
    });
    act(() => {
      secondId = result.current.addExercise(
        exercise({ id: 'ex-2', name: 'Squat' }),
      ).exerciseClientId;
    });

    // Reset the flag so we prove a reorder *alone* flips it — that is exactly
    // what makes buildPresetEditPayload include exercises for a reorder-only
    // preset edit instead of silently goBack()ing on an empty payload.
    result.current.exercisesModifiedRef.current = false;
    act(() => result.current.reorderExercises(0, 1));

    expect(result.current.state.exercises.map(e => e.clientId)).toEqual([
      secondId,
      firstId,
    ]);
    expect(result.current.exercisesModifiedRef.current).toBe(true);
  });

  it('populateFromPreset returns the exercise client ids and resets the modified ref', () => {
    const { result } = renderHook(() => useWorkoutPresetForm());

    // Dirty the form first so we can prove populate resets the flag.
    act(() => {
      result.current.addExercise(exercise());
    });
    expect(result.current.exercisesModifiedRef.current).toBe(true);

    const preset: WorkoutPreset = {
      id: 'p1',
      user_id: 'u1',
      name: 'Imported',
      description: 'server desc',
      is_public: false,
      created_at: '',
      updated_at: '',
      exercises: [
        {
          id: 'pe1',
          exercise_id: 'ex-1',
          image_url: null,
          exercise_name: 'Squat',
          category: 'legs',
          sets: [
            {
              id: 'ps1',
              set_number: 1,
              set_type: 'working',
              reps: 5,
              weight: 100,
              duration: null,
              rest_time: 90,
              notes: null,
            },
          ],
        },
      ],
    };

    let returnedIds: string[] = [];
    act(() => {
      returnedIds = result.current.populateFromPreset(preset, 'kg');
    });

    expect(returnedIds).toHaveLength(1);
    expect(result.current.state.name).toBe('Imported');
    expect(result.current.state.exercises[0].clientId).toBe(returnedIds[0]);
    expect(result.current.exercisesModifiedRef.current).toBe(false);
    expect(result.current.initialDescriptionRef.current).toBe('server desc');
  });
});
