import { renderHook, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { useDeleteFoodEntry } from '../../src/hooks/useDeleteFoodEntry';
import { deleteFoodEntry } from '../../src/services/api/foodEntriesApi';
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  deleteFoodEntry: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const mockDeleteFoodEntry = deleteFoodEntry as jest.MockedFunction<typeof deleteFoodEntry>;

describe('useDeleteFoodEntry', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('calls deleteFoodEntry with correct entryId', async () => {
    mockDeleteFoodEntry.mockResolvedValue(undefined);

    const { result } = renderHook(
      () => useDeleteFoodEntry({
        entryId: 'entry-123',
        entryDate: '2026-02-26T00:00:00.000Z',
      }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    // Trigger the confirmation dialog
    act(() => {
      result.current.confirmAndDelete();
    });

    // Press "Delete" in the Alert
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const deleteButton = alertCall[2].find((btn: any) => btn.text === 'Delete');
    await act(async () => {
      deleteButton.onPress();
    });

    await waitFor(() => {
      expect(mockDeleteFoodEntry).toHaveBeenCalledWith('entry-123');
    });
  });

  test('calls onSuccess callback on successful deletion', async () => {
    mockDeleteFoodEntry.mockResolvedValue(undefined);
    const onSuccess = jest.fn();

    const { result } = renderHook(
      () => useDeleteFoodEntry({
        entryId: 'entry-123',
        entryDate: '2026-02-26T00:00:00.000Z',
        onSuccess,
      }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.confirmAndDelete();
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const deleteButton = alertCall[2].find((btn: any) => btn.text === 'Delete');
    await act(async () => {
      deleteButton.onPress();
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  test('invalidateCache invalidates dailySummaryQueryKey with normalized date', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useDeleteFoodEntry({
        entryId: 'entry-123',
        entryDate: '2026-02-26T00:00:00.000Z',
      }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.invalidateCache();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey('2026-02-26'),
    });

    invalidateSpy.mockRestore();
  });

  test('shows error toast on failure', async () => {
    mockDeleteFoodEntry.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useDeleteFoodEntry({
        entryId: 'entry-123',
        entryDate: '2026-02-26T00:00:00.000Z',
      }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.confirmAndDelete();
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const deleteButton = alertCall[2].find((btn: any) => btn.text === 'Delete');
    await act(async () => {
      deleteButton.onPress();
    });

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'error',
        text1: 'Failed to delete',
        text2: 'Please try again.',
      });
    });
  });

  test('confirmAndDelete shows confirmation dialog', () => {
    const { result } = renderHook(
      () => useDeleteFoodEntry({
        entryId: 'entry-123',
        entryDate: '2026-02-26T00:00:00.000Z',
      }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.confirmAndDelete();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Entry',
      'Are you sure you want to delete this food entry?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Delete', style: 'destructive' }),
      ]),
    );
  });

  test('cancel in confirmation dialog does not trigger mutation', () => {
    const { result } = renderHook(
      () => useDeleteFoodEntry({
        entryId: 'entry-123',
        entryDate: '2026-02-26T00:00:00.000Z',
      }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.confirmAndDelete();
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const cancelButton = alertCall[2].find((btn: any) => btn.text === 'Cancel');

    // Cancel button has no onPress handler (style: 'cancel' auto-dismisses)
    expect(cancelButton.onPress).toBeUndefined();
    expect(mockDeleteFoodEntry).not.toHaveBeenCalled();
  });

  test('normalizes dates with time components', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () => useDeleteFoodEntry({
        entryId: 'entry-123',
        entryDate: '2026-03-15T14:30:00.000Z',
      }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    act(() => {
      result.current.invalidateCache();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey('2026-03-15'),
    });

    invalidateSpy.mockRestore();
  });
});
