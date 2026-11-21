import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { useUpdateFoodEntry } from '../../src/hooks/useUpdateFoodEntry';
import { updateFoodEntry } from '../../src/services/api/foodEntriesApi';
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  updateFoodEntry: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockQueueQuantity = jest.fn();
const mockEditWaiting = jest.fn();
jest.mock('../../src/offline/foodEntryUpdateHandOver', () => ({
  displayFromPatch: jest.requireActual(
    '../../src/offline/foodEntryUpdateHandOver'
  ).displayFromPatch,
  queueFoodEntryUpdate: (...args: unknown[]) => mockQueueQuantity(...args),
  editWaitingEntryQuantity: (...args: unknown[]) => mockEditWaiting(...args),
}));

const mockUpdateFoodEntry = updateFoodEntry as jest.MockedFunction<
  typeof updateFoodEntry
>;

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
      () =>
        useUpdateFoodEntry({
          entryId: 'entry-1',
          entryDate: '2026-03-01T00:00:00.000Z',
        }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await act(async () => {
      result.current.updateEntry({ quantity: 200, unit: 'g' });
    });

    await waitFor(() => {
      expect(mockUpdateFoodEntry).toHaveBeenCalledWith('entry-1', {
        quantity: 200,
        unit: 'g',
      });
    });
  });

  test('calls onSuccess callback on success', async () => {
    mockUpdateFoodEntry.mockResolvedValue({ id: 'entry-1' } as any);
    const onSuccess = jest.fn();

    const { result } = renderHook(
      () =>
        useUpdateFoodEntry({
          entryId: 'entry-1',
          entryDate: '2026-03-01',
          onSuccess,
        }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await act(async () => {
      result.current.updateEntry({ quantity: 200 });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  test('shows toast on generic error', async () => {
    mockUpdateFoodEntry.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useUpdateFoodEntry({ entryId: 'entry-1', entryDate: '2026-03-01' }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await act(async () => {
      result.current.updateEntry({ quantity: 200 });
    });

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'error',
        text1: 'Failed to save changes',
        text2: 'Please try again.',
      });
    });
  });

  test('shows permission error on 403', async () => {
    mockUpdateFoodEntry.mockRejectedValue(
      new Error('Server error: 403 - Forbidden')
    );

    const { result } = renderHook(
      () => useUpdateFoodEntry({ entryId: 'entry-1', entryDate: '2026-03-01' }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await act(async () => {
      result.current.updateEntry({ quantity: 200 });
    });

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'error',
        text1: 'Failed to save changes',
        text2: "You don't have permission to edit this entry.",
      });
    });
  });

  test('invalidateCache invalidates dailySummary and caffeine keys for entry date', () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useUpdateFoodEntry({
          entryId: 'entry-1',
          entryDate: '2026-03-01T00:00:00.000Z',
        }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    act(() => {
      result.current.invalidateCache();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey('2026-03-01'),
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['caffeineActive', '2026-03-01'],
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['waterIntakeLog', '2026-03-01'],
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['foods'],
    });

    invalidateSpy.mockRestore();
  });

  test('invalidateCache with newDate invalidates both old and new date', () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(
      () =>
        useUpdateFoodEntry({
          entryId: 'entry-1',
          entryDate: '2026-03-01T00:00:00.000Z',
        }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    act(() => {
      result.current.invalidateCache('2026-03-05');
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey('2026-03-01'),
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['caffeineActive', '2026-03-01'],
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: dailySummaryQueryKey('2026-03-05'),
      refetchType: 'all',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['caffeineActive', '2026-03-05'],
      refetchType: 'all',
    });

    invalidateSpy.mockRestore();
  });
});

describe('useUpdateFoodEntry while the server is unreachable', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => queryClient.clear());

  test('keeps a new amount on the phone', async () => {
    mockUpdateFoodEntry.mockRejectedValue(
      new TypeError('Network request failed')
    );
    mockQueueQuantity.mockResolvedValue(true);
    const onKeptOnPhone = jest.fn();
    const { result } = renderHook(
      () =>
        useUpdateFoodEntry({
          entryId: 'e1',
          entryDate: '2026-11-21',
          onKeptOnPhone,
        }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await act(async () => {
      result.current.updateEntry({ quantity: 3 });
    });

    await waitFor(() => expect(onKeptOnPhone).toHaveBeenCalledTimes(1));
    expect(mockQueueQuantity).toHaveBeenCalledWith(
      'e1',
      '2026-11-21',
      { quantity: 3 },
      { quantity: 3 }
    );
  });

  test('keeps a change of several fields, with what the server works out for the entry', async () => {
    mockUpdateFoodEntry.mockRejectedValue(
      new TypeError('Network request failed')
    );
    mockQueueQuantity.mockResolvedValue(true);
    const onKeptOnPhone = jest.fn();
    const { result } = renderHook(
      () =>
        useUpdateFoodEntry({
          entryId: 'e1',
          entryDate: '2026-11-21',
          onKeptOnPhone,
        }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await act(async () => {
      result.current.updateEntry(
        { quantity: 3, meal_type_id: 'm2', entry_time: '19:30' },
        { meal_type: 'Dinner' }
      );
    });

    await waitFor(() => expect(onKeptOnPhone).toHaveBeenCalledTimes(1));
    expect(onKeptOnPhone).toHaveBeenCalledWith({
      quantity: 3,
      meal_type_id: 'm2',
      entry_time: '19:30',
      meal_type: 'Dinner',
    });
    expect(mockQueueQuantity).toHaveBeenCalledWith(
      'e1',
      '2026-11-21',
      { quantity: 3, meal_type_id: 'm2', entry_time: '19:30' },
      expect.objectContaining({ meal_type: 'Dinner' })
    );
  });

  test('does not keep a change to a waiting entry other than its amount', async () => {
    const { result } = renderHook(
      () =>
        useUpdateFoodEntry({ entryId: 'pending-abc', entryDate: '2026-11-21' }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await act(async () => {
      result.current.updateEntry({ quantity: 3, unit: 'g' });
    });

    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      )
    );
    expect(mockUpdateFoodEntry).not.toHaveBeenCalled();
    expect(mockQueueQuantity).not.toHaveBeenCalled();
  });

  test('changes a waiting entry where it waits, without asking the server', async () => {
    mockEditWaiting.mockResolvedValue('edited');
    const onKeptOnPhone = jest.fn();
    const { result } = renderHook(
      () =>
        useUpdateFoodEntry({
          entryId: 'pending-abc',
          entryDate: '2026-11-21',
          onKeptOnPhone,
        }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await act(async () => {
      result.current.updateEntry({ quantity: 2 });
    });

    await waitFor(() => expect(onKeptOnPhone).toHaveBeenCalledTimes(1));
    expect(mockEditWaiting).toHaveBeenCalledWith('abc', 2);
    expect(mockUpdateFoodEntry).not.toHaveBeenCalled();
  });
});
