import { renderHook, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useUpdateFoodEntry } from '../../src/hooks/useUpdateFoodEntry';
import { updateFoodEntry } from '../../src/services/api/foodEntriesApi';
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  updateFoodEntry: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const mockUpdateFoodEntry = updateFoodEntry as jest.MockedFunction<typeof updateFoodEntry>;

describe('useUpdateFoodEntry', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('calls updateFoodEntry with correct entryId and payload', async () => {
    mockUpdateFoodEntry.mockResolvedValue({ id: 'entry-1' } as any);

    const { result } = renderHook(
      () => useUpdateFoodEntry({ entryId: 'entry-1', entryDate: '2026-03-01T00:00:00.000Z' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await act(async () => {
      result.current.updateEntry({ quantity: 200, unit: 'g' });
    });

    await waitFor(() => {
      expect(mockUpdateFoodEntry).toHaveBeenCalledWith('entry-1', { quantity: 200, unit: 'g' });
    });
  });

  test('calls onSuccess callback on success', async () => {
    mockUpdateFoodEntry.mockResolvedValue({ id: 'entry-1' } as any);
    const onSuccess = jest.fn();

    const { result } = renderHook(
      () => useUpdateFoodEntry({ entryId: 'entry-1', entryDate: '2026-03-01', onSuccess }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await act(async () => {
      result.current.updateEntry({ quantity: 200 });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  test('shows Alert on generic error', async () => {
    mockUpdateFoodEntry.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useUpdateFoodEntry({ entryId: 'entry-1', entryDate: '2026-03-01' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await act(async () => {
      result.current.updateEntry({ quantity: 200 });
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('Failed to save changes', 'Please try again.');
    });
  });

  test('shows permission error on 403', async () => {
    mockUpdateFoodEntry.mockRejectedValue(new Error('Server error: 403 - Forbidden'));

    const { result } = renderHook(
      () => useUpdateFoodEntry({ entryId: 'entry-1', entryDate: '2026-03-01' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await act(async () => {
      result.current.updateEntry({ quantity: 200 });
    });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Failed to save changes',
        "You don't have permission to edit this entry.",
      );
    });
  });

  test('invalidateCache invalidates dailySummaryQueryKey for entry date', () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useUpdateFoodEntry({ entryId: 'entry-1', entryDate: '2026-03-01T00:00:00.000Z' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.invalidateCache();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey('2026-03-01'),
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    invalidateSpy.mockRestore();
  });

  test('invalidateCache with newDate invalidates both old and new date', () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useUpdateFoodEntry({ entryId: 'entry-1', entryDate: '2026-03-01T00:00:00.000Z' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.invalidateCache('2026-03-05');
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey('2026-03-01'),
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey('2026-03-05'),
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);

    invalidateSpy.mockRestore();
  });
});
