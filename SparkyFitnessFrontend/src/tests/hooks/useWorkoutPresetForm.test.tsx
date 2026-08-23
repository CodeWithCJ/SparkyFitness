import { act, renderHook } from '@testing-library/react';
import { useWorkoutPresetForm } from '@/hooks/Exercises/useWorkoutPresetForm';
import type { WorkoutPreset } from '@/types/workout';
import type { Exercise } from '@/types/exercises';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ loggingLevel: 'ERROR' }),
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));

const presetWithTimedSet = {
  id: 1,
  name: 'Core',
  description: '',
  is_public: false,
  exercises: [
    {
      id: 7,
      exercise_id: 'exercise-1',
      exercise_name: 'Plank',
      sets: [
        {
          id: 1,
          set_number: 1,
          set_type: 'Working Set',
          reps: null,
          weight: null,
          duration: 355,
          rest_time: null,
          notes: null,
        },
        {
          id: 2,
          set_number: 2,
          set_type: 'Working Set',
          reps: 5,
          weight: 0,
          duration: null,
          rest_time: null,
          notes: null,
        },
      ],
    },
  ],
} as unknown as WorkoutPreset;

describe('useWorkoutPresetForm weight handling', () => {
  it('preserves null weight on time-only sets through load and save', () => {
    const onSave = jest.fn();
    const { result } = renderHook(() =>
      useWorkoutPresetForm({ initialPreset: presetWithTimedSet, onSave })
    );

    act(() => {
      result.current.handleSubmit();
    });

    const savedSets = onSave.mock.calls[0][0].exercises[0].sets;
    expect(savedSets[0]).toEqual(
      expect.objectContaining({ weight: null, duration: 355 })
    );
    // An explicit 0 is a real value and must not be nulled.
    expect(savedSets[1]).toEqual(expect.objectContaining({ weight: 0 }));
  });

  it('starts a new exercise with an empty weight instead of 0', () => {
    const onSave = jest.fn();
    const { result } = renderHook(() =>
      useWorkoutPresetForm({ initialPreset: presetWithTimedSet, onSave })
    );

    act(() => {
      result.current.handleAddExercise({
        id: 'exercise-2',
        name: 'Squat',
        category: 'strength',
        images: [],
      } as unknown as Exercise);
    });

    expect(result.current.exercises[1]?.sets[0]?.weight).toBeNull();
  });
});

describe('useWorkoutPresetForm modality seeding', () => {
  const addExercise = (exercise: Partial<Exercise>) => {
    const onSave = jest.fn();
    const { result } = renderHook(() =>
      useWorkoutPresetForm({ initialPreset: null, onSave })
    );

    act(() => {
      result.current.handleAddExercise(exercise as Exercise);
    });

    return result.current.exercises[0];
  };

  it('seeds a blank timed set and stamps the modality for a duration exercise', () => {
    const added = addExercise({
      id: 'exercise-3',
      name: 'Plank',
      category: 'isometric',
      images: [],
    });

    expect(added?.modality).toBe('duration');
    expect(added?.sets[0]).toEqual(
      expect.objectContaining({ reps: null, weight: null, duration: null })
    );
  });

  it('honours an explicit modality over the category', () => {
    const added = addExercise({
      id: 'exercise-4',
      name: 'Pull Up',
      category: 'strength',
      modality: 'reps_only',
      images: [],
    });

    expect(added?.modality).toBe('reps_only');
    expect(added?.sets[0]).toEqual(
      expect.objectContaining({ reps: 10, weight: null })
    );
  });
});

describe('useWorkoutPresetForm replace exercise', () => {
  const presetWithWeightRepsSet = {
    id: 1,
    name: 'Push',
    description: '',
    is_public: false,
    exercises: [
      {
        id: 7,
        exercise_id: 'exercise-1',
        exercise_name: 'Bench Press',
        modality: 'weight_reps',
        sets: [
          {
            id: 1,
            set_number: 1,
            set_type: 'Working Set',
            reps: 8,
            weight: 60,
            duration: null,
            rest_time: null,
            notes: null,
          },
          {
            id: 2,
            set_number: 2,
            set_type: 'Working Set',
            reps: 6,
            weight: 70,
            duration: null,
            rest_time: null,
            notes: null,
          },
        ],
      },
    ],
  } as unknown as WorkoutPreset;

  it('preserves the existing sets when the replacement has the same modality', () => {
    const onSave = jest.fn();
    const { result } = renderHook(() =>
      useWorkoutPresetForm({ initialPreset: presetWithWeightRepsSet, onSave })
    );

    act(() => {
      result.current.handleOpenReplaceExercise(0);
    });
    act(() => {
      // Same 'strength' -> 'weight_reps' modality as the entry being replaced.
      result.current.handleAddExercise({
        id: 'exercise-2',
        name: 'Squat',
        category: 'strength',
        images: [],
      } as unknown as Exercise);
    });

    // Swapped in place, not appended.
    expect(result.current.exercises).toHaveLength(1);
    const replaced = result.current.exercises[0]!;
    expect(replaced.exercise_id).toBe('exercise-2');
    expect(replaced.exercise_name).toBe('Squat');
    expect(replaced.modality).toBe('weight_reps');
    // The already-entered sets must survive the swap — the whole point of
    // replace over remove-then-re-add.
    expect(replaced.sets).toHaveLength(2);
    expect(replaced.sets[0]).toEqual(
      expect.objectContaining({ reps: 8, weight: 60 })
    );
    expect(replaced.sets[1]).toEqual(
      expect.objectContaining({ reps: 6, weight: 70 })
    );
  });

  it('resets to a fresh default set when the replacement changes modality', () => {
    const onSave = jest.fn();
    const { result } = renderHook(() =>
      useWorkoutPresetForm({ initialPreset: presetWithWeightRepsSet, onSave })
    );

    act(() => {
      result.current.handleOpenReplaceExercise(0);
    });
    act(() => {
      // 'isometric' -> 'duration' differs from the original 'weight_reps':
      // reusing the old reps:8/weight:60 sets would show a blank reps column
      // instead of the duration default, and silently keep weight/reps
      // values the new UI hides but the server would still persist.
      result.current.handleAddExercise({
        id: 'exercise-3',
        name: 'Plank',
        category: 'isometric',
        images: [],
      } as unknown as Exercise);
    });

    expect(result.current.exercises).toHaveLength(1);
    const replaced = result.current.exercises[0]!;
    expect(replaced.exercise_id).toBe('exercise-3');
    expect(replaced.modality).toBe('duration');
    expect(replaced.sets).toHaveLength(1);
    expect(replaced.sets[0]).toEqual(
      expect.objectContaining({ reps: null, weight: null, duration: null })
    );
    // A fresh id, not one of the original two sets.
    expect(replaced.sets[0]?.id).not.toBe('1');
    expect(replaced.sets[0]?.id).not.toBe('2');
  });

  it('does not misroute a plain Add Exercise after a replace was opened then cancelled', () => {
    const onSave = jest.fn();
    const { result } = renderHook(() =>
      useWorkoutPresetForm({ initialPreset: presetWithTimedSet, onSave })
    );

    act(() => {
      result.current.handleOpenReplaceExercise(0);
    });
    // Cancel the replace: opening plain Add must drop the pending target.
    act(() => {
      result.current.handleOpenAddExercise();
    });
    act(() => {
      result.current.handleAddExercise({
        id: 'exercise-2',
        name: 'Squat',
        category: 'strength',
        images: [],
      } as unknown as Exercise);
    });

    expect(result.current.exercises).toHaveLength(2);
    expect(result.current.exercises[0]?.exercise_id).toBe('exercise-1');
    expect(result.current.exercises[1]?.exercise_id).toBe('exercise-2');
  });
});

describe('useWorkoutPresetForm duplicate exercise', () => {
  it('adds an independent copy of the exercise, with the same sets, right after it', () => {
    const onSave = jest.fn();
    const { result } = renderHook(() =>
      useWorkoutPresetForm({ initialPreset: presetWithTimedSet, onSave })
    );

    act(() => {
      result.current.handleDuplicateExercise(0);
    });

    expect(result.current.exercises).toHaveLength(2);
    const original = result.current.exercises[0]!;
    const duplicate = result.current.exercises[1]!;
    expect(duplicate.exercise_id).toBe(original.exercise_id);
    expect(duplicate.exercise_name).toBe(original.exercise_name);
    expect(duplicate.sets).toHaveLength(2);
    expect(duplicate.sets[0]).toEqual(
      expect.objectContaining({ duration: 355, weight: null })
    );
    expect(duplicate.sets[1]).toEqual(
      expect.objectContaining({ reps: 5, weight: 0 })
    );
    // Independent identity: editing one must never touch the other.
    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.sets[0]?.id).not.toBe(original.sets[0]?.id);
  });

  it("does not silently join the original exercise's superset (the web editor has no superset UI)", () => {
    const onSave = jest.fn();
    const presetInSuperset = {
      ...presetWithTimedSet,
      exercises: [{ ...presetWithTimedSet.exercises[0], superset_group: 3 }],
    } as unknown as WorkoutPreset;
    const { result } = renderHook(() =>
      useWorkoutPresetForm({ initialPreset: presetInSuperset, onSave })
    );

    act(() => {
      result.current.handleDuplicateExercise(0);
    });

    expect(result.current.exercises[0]?.superset_group).toBe(3);
    expect(result.current.exercises[1]?.superset_group).toBeNull();
  });
});
