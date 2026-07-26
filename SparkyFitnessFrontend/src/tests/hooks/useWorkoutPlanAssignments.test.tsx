import { act, renderHook } from '@testing-library/react';
import { useWorkoutPlanAssignments } from '@/hooks/Exercises/useWorkoutPlanAssignments';
import type { WorkoutPlanTemplate } from '@/types/workout';
import type { Exercise } from '@/types/exercises';

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
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));

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
