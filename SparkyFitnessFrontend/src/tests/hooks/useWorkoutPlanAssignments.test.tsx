import { act, renderHook } from '@testing-library/react';
import { useWorkoutPlanAssignments } from '@/hooks/Exercises/useWorkoutPlanAssignments';
import type { WorkoutPlanTemplate, WorkoutPreset } from '@/types/workout';
import type { Exercise } from '@/types/exercises';
import { toast } from '@/hooks/use-toast';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
    weightUnit: 'kg',
    convertWeight: (value: number) => value,
  }),
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

jest.mock('@/hooks/Exercises/useWorkoutPresets', () => ({
  useWorkoutPresets: () => ({ data: undefined }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrValues?: unknown) => {
      if (typeof defaultValueOrValues === 'string') {
        return defaultValueOrValues;
      }
      if (defaultValueOrValues && typeof defaultValueOrValues === 'object') {
        const values = defaultValueOrValues as Record<string, unknown>;
        // Mirrors the en/translation.json templates these toasts interpolate.
        if (key === 'addWorkoutPlanDialog.copiedToastDescription') {
          return `${values['itemName']} copied to clipboard.`;
        }
        if (key === 'addWorkoutPlanDialog.pastedToastDescription') {
          return `Pasted ${values['itemName']} to the new day.`;
        }
      }
      return key;
    },
  }),
}));

const mockedToast = toast as jest.MockedFunction<typeof toast>;

const planWithTimedSet = {
  id: 'plan-1',
  user_id: 'user-1',
  plan_name: 'Core',
  assignments: [
    {
      id: 'assignment-1',
      template_id: 'plan-1',
      day_of_week: 1,
      exercise_id: 'exercise-1',
      exercise_name: 'Plank',
      sets: [
        {
          id: 1,
          set_number: 1,
          set_type: 'Working Set',
          reps: null,
          weight: null,
          duration: 45,
        },
        {
          id: 2,
          set_number: 2,
          set_type: 'Working Set',
          reps: 5,
          weight: 0,
          duration: null,
        },
      ],
    },
  ],
} as unknown as WorkoutPlanTemplate;

const planWithWeightedSet = {
  id: 'plan-2',
  user_id: 'user-1',
  plan_name: 'Push',
  assignments: [
    {
      id: 'assignment-2',
      template_id: 'plan-2',
      day_of_week: 1,
      exercise_id: 'exercise-4',
      exercise_name: 'Bench Press',
      sets: [
        {
          id: 3,
          set_number: 1,
          set_type: 'Working Set',
          reps: 5,
          weight: 100,
          duration: null,
        },
      ],
    },
  ],
} as unknown as WorkoutPlanTemplate;

const addExercise = (exercise: Partial<Exercise>) => {
  const { result } = renderHook(() => useWorkoutPlanAssignments(null));

  act(() => {
    result.current.setSelectedDayForAssignment(2);
  });
  act(() => {
    result.current.handleAddExerciseOrPreset(exercise as Exercise, 'internal');
  });

  return result.current.assignments[0];
};

describe('useWorkoutPlanAssignments weight handling', () => {
  it('preserves null weight on time-only sets through load and save', () => {
    const { result } = renderHook(() =>
      useWorkoutPlanAssignments(planWithTimedSet)
    );

    const savedSets = result.current.buildAssignmentsForSave()[0]?.sets;

    expect(savedSets?.[0]).toEqual(
      expect.objectContaining({ weight: null, duration: 45 })
    );
    // An explicit 0 is a real value and must not be nulled.
    expect(savedSets?.[1]).toEqual(expect.objectContaining({ weight: 0 }));
  });

  it('keeps a populated weight unchanged through load and save (no unit conversion)', () => {
    const { result } = renderHook(() =>
      useWorkoutPlanAssignments(planWithWeightedSet)
    );

    expect(result.current.assignments[0]?.sets?.[0]?.weight).toBe(100);

    const savedSets = result.current.buildAssignmentsForSave()[0]?.sets;

    expect(savedSets?.[0]).toEqual(expect.objectContaining({ weight: 100 }));
  });
});

describe('useWorkoutPlanAssignments modality seeding', () => {
  it('stamps category and modality and seeds a blank timed set for cardio', () => {
    const added = addExercise({
      id: 'exercise-2',
      name: 'Outdoor Run',
      category: 'cardio',
    });

    expect(added?.category).toBe('cardio');
    expect(added?.modality).toBe('duration_distance');
    expect(added?.sets[0]).toEqual(
      expect.objectContaining({ reps: null, weight: null, duration: null })
    );
  });

  it('seeds a rep-based set for a strength exercise', () => {
    const added = addExercise({
      id: 'exercise-3',
      name: 'Squat',
      category: 'strength',
    });

    expect(added?.modality).toBe('weight_reps');
    expect(added?.sets[0]).toEqual(
      expect.objectContaining({ reps: 10, weight: null })
    );
  });
});

// The preset query only ever loads one page, so a preset outside it is missing
// from `workoutPresets`; the assignment's own joined name has to be used.
const planWithLaterPreset = {
  id: 'plan-2',
  user_id: 'user-1',
  plan_name: 'Split',
  assignments: [
    {
      id: 'assignment-9',
      template_id: 'plan-2',
      day_of_week: 1,
      workout_preset_id: 'preset-42',
      workout_preset_name: 'Push Day A',
      sets: [],
    },
  ],
} as unknown as WorkoutPlanTemplate;

describe('useWorkoutPlanAssignments preset naming', () => {
  beforeEach(() => {
    mockedToast.mockReset();
  });

  it('names a preset that is not on the loaded page in the copy toast', () => {
    const { result } = renderHook(() =>
      useWorkoutPlanAssignments(planWithLaterPreset)
    );

    act(() => {
      result.current.handleCopyAssignment(result.current.assignments[0]!);
    });

    expect(mockedToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Preset: Push Day A copied to clipboard.',
      })
    );
  });

  it('names the preset in the paste toast as well', () => {
    const { result } = renderHook(() =>
      useWorkoutPlanAssignments(planWithLaterPreset)
    );

    act(() => {
      result.current.handleCopyAssignment(result.current.assignments[0]!);
    });
    act(() => {
      result.current.handlePasteAssignment(3);
    });

    expect(mockedToast).toHaveBeenLastCalledWith(
      expect.objectContaining({
        description: 'Pasted Preset: Push Day A to the new day.',
      })
    );
  });

  it('carries the preset name onto a preset added from the picker', () => {
    const { result } = renderHook(() => useWorkoutPlanAssignments(null));

    act(() => {
      result.current.setSelectedDayForAssignment(2);
    });
    act(() => {
      result.current.handleAddExerciseOrPreset(
        { id: 'preset-42', name: 'Push Day A' } as unknown as WorkoutPreset,
        'preset'
      );
    });

    expect(result.current.assignments[0]).toEqual(
      expect.objectContaining({
        workout_preset_id: 'preset-42',
        workout_preset_name: 'Push Day A',
      })
    );
  });
});
