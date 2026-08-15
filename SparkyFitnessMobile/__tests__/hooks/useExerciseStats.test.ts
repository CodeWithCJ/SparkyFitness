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
      recentSessions: [],
    };
    mockFetchStats.mockResolvedValue(data);

    const { result } = renderHook(() => useExerciseStats('ex-1'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(data);
    });
    expect(mockFetchStats).toHaveBeenCalledWith('ex-1', undefined, undefined);
  });

  it('passes populated recentSessions through untouched', async () => {
    const data = {
      bestSet: null,
      lastSet: { entryDate: '2026-04-10', weight: 95, reps: 5, setNumber: 1 },
      recentSessions: [
        {
          entryDate: '2026-04-10',
          sets: [
            { setNumber: 1, setType: 'warmup', weight: 60, reps: 8 },
            { setNumber: 2, setType: null, weight: 95, reps: 5 },
          ],
        },
      ],
    };
    mockFetchStats.mockResolvedValue(data);

    const { result } = renderHook(() => useExerciseStats('ex-1'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(data);
    });
  });

  it('forwards excludePresetEntryId to the fetch and query key', async () => {
    mockFetchStats.mockResolvedValue({
      bestSet: null,
      lastSet: null,
      recentSessions: [],
    });

    const { result } = renderHook(
      () => useExerciseStats('ex-1', 'session-1'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mockFetchStats).toHaveBeenCalledWith('ex-1', 'session-1', undefined);
  });

  it('forwards presetId to the fetch and query key', async () => {
    mockFetchStats.mockResolvedValue({
      bestSet: null,
      lastSet: null,
      recentSessions: [],
    });

    const { result } = renderHook(
      () => useExerciseStats('ex-1', 'session-1', 42),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mockFetchStats).toHaveBeenCalledWith('ex-1', 'session-1', 42);
  });

  it('treats different presetId values as distinct query keys', async () => {
    mockFetchStats.mockResolvedValue({
      bestSet: null,
      lastSet: null,
      recentSessions: [],
    });

    const { result: resultA } = renderHook(
      () => useExerciseStats('ex-1', undefined, 1),
      { wrapper: createQueryWrapper(queryClient) },
    );
    const { result: resultB } = renderHook(
      () => useExerciseStats('ex-1', undefined, 2),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(resultA.current.isSuccess).toBe(true);
      expect(resultB.current.isSuccess).toBe(true);
    });
    expect(mockFetchStats).toHaveBeenCalledWith('ex-1', undefined, 1);
    expect(mockFetchStats).toHaveBeenCalledWith('ex-1', undefined, 2);
    expect(mockFetchStats).toHaveBeenCalledTimes(2);
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
