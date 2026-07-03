import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { useCreateExerciseEntry } from '../../src/hooks/useExerciseMutations';
import { createExerciseEntry } from '../../src/services/api/exerciseApi';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  suggestedExercisesQueryKey,
  dailySummaryQueryKey,
} from '../../src/hooks/queryKeys';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/exerciseApi', () => ({
  createExerciseEntry: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockCreateExerciseEntry = createExerciseEntry as jest.MockedFunction<typeof createExerciseEntry>;

describe('useCreateExerciseEntry', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const testPayload = {
    exercise_id: 'ex-1',
    duration_minutes: 30,
    calories_burned: 300,
    entry_date: '2026-03-12',
    distance: 5.5,
    notes: 'Morning run',
  };

  test('calls createExerciseEntry with correct payload', async () => {
    mockCreateExerciseEntry.mockResolvedValue({ id: 'new-entry-1' } as any);

    const { result } = renderHook(
      () => useCreateExerciseEntry(),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await act(async () => {
      await result.current.createEntry(testPayload);
    });

    await waitFor(() => {
      expect(mockCreateExerciseEntry).toHaveBeenCalledWith(testPayload);
    });
  });

  test('shows error toast on failure', async () => {
    mockCreateExerciseEntry.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useCreateExerciseEntry(),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await act(async () => {
      try {
        await result.current.createEntry(testPayload);
      } catch {
        // mutateAsync re-throws
      }
    });

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'error',
        text1: 'Failed to save activity',
        text2: 'Please try again.',
      });
    });
  });

  test('invalidateCache invalidates active exercise history and removes inactive pages', () => {
    const removeSpy = jest.spyOn(queryClient, 'removeQueries');
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useCreateExerciseEntry(),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.invalidateCache('2026-03-12');
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [...exerciseHistoryQueryKey],
    });
    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: [...exerciseHistoryQueryKey],
      type: 'inactive',
    });

    invalidateSpy.mockRestore();
    removeSpy.mockRestore();
  });

  test('invalidateCache sets exercise history reset key', () => {
    const setDataSpy = jest.spyOn(queryClient, 'setQueryData');

    const { result } = renderHook(
      () => useCreateExerciseEntry(),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.invalidateCache('2026-03-12');
    });

    expect(setDataSpy).toHaveBeenCalledWith(
      exerciseHistoryResetQueryKey,
      expect.any(Number),
    );

    setDataSpy.mockRestore();
  });

  test('invalidateCache invalidates suggested exercises', () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useCreateExerciseEntry(),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.invalidateCache('2026-03-12');
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [...suggestedExercisesQueryKey],
    });

    invalidateSpy.mockRestore();
  });

  test('invalidateCache invalidates daily summary for the entry date', () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useCreateExerciseEntry(),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.invalidateCache('2026-03-12');
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey('2026-03-12'),
    });

    invalidateSpy.mockRestore();
  });
});
