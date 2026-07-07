import { renderHook, waitFor } from '@testing-library/react-native';
import { useExerciseStats } from '../../src/hooks/useExerciseStats';
import { fetchExerciseStats } from '../../src/services/api/exerciseApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/exerciseApi', () => ({
  fetchExerciseStats: jest.fn(),
}));

const mockFetchStats = fetchExerciseStats as jest.MockedFunction<typeof fetchExerciseStats>;

describe('useExerciseStats', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('returns fetched data when exerciseId is provided', async () => {
    const data = {
      bestSet: { entryDate: '2026-04-01', weight: 100, reps: 5, setNumber: 1 },
      lastSet: { entryDate: '2026-04-10', weight: 95, reps: 5, setNumber: 1 },
    };
    mockFetchStats.mockResolvedValue(data);

    const { result } = renderHook(() => useExerciseStats('ex-1'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(data);
    });
    expect(mockFetchStats).toHaveBeenCalledWith('ex-1', undefined);
  });

  it('forwards excludePresetEntryId to the fetch and query key', async () => {
    mockFetchStats.mockResolvedValue({ bestSet: null, lastSet: null });

    const { result } = renderHook(
      () => useExerciseStats('ex-1', 'session-1'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mockFetchStats).toHaveBeenCalledWith('ex-1', 'session-1');
  });

  it('does not fire when exerciseId is null/undefined', () => {
    renderHook(() => useExerciseStats(null), {
      wrapper: createQueryWrapper(queryClient),
    });
    renderHook(() => useExerciseStats(undefined), {
      wrapper: createQueryWrapper(queryClient),
    });
    expect(mockFetchStats).not.toHaveBeenCalled();
  });

  it('does not fire when exerciseId is empty string', () => {
    renderHook(() => useExerciseStats(''), {
      wrapper: createQueryWrapper(queryClient),
    });
    expect(mockFetchStats).not.toHaveBeenCalled();
  });
});
