import { act, renderHook } from '@testing-library/react';
import { useAddCustomExerciseForm } from '@/hooks/Exercises/useAddCustomExerciseForm';

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/hooks/Exercises/useExercises', () => ({
  useCreateExerciseMutation: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));

const renderForm = () =>
  renderHook(() => useAddCustomExerciseForm(jest.fn(), jest.fn()));

describe('useAddCustomExerciseForm modality', () => {
  it('follows the selected category until the user picks a modality', () => {
    const { result } = renderForm();

    expect(result.current.newExerciseModality).toBe('weight_reps');

    act(() => {
      result.current.setNewExerciseCategory('cardio');
    });
    expect(result.current.newExerciseModality).toBe('duration_distance');

    act(() => {
      result.current.setNewExerciseCategory('isometric');
    });
    expect(result.current.newExerciseModality).toBe('duration');
  });

  it('keeps a pinned modality when the category changes', () => {
    const { result } = renderForm();

    act(() => {
      result.current.setNewExerciseModality('reps_only');
    });
    act(() => {
      result.current.setNewExerciseCategory('cardio');
    });

    expect(result.current.newExerciseModality).toBe('reps_only');
  });
});
