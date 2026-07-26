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
