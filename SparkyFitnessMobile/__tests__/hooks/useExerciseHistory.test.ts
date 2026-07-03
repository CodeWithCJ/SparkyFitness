import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useExerciseHistory } from '../../src/hooks/useExerciseHistory';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
} from '../../src/hooks/queryKeys';
import { fetchExerciseHistory } from '../../src/services/api/exerciseApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';
import type { InfiniteData } from '@tanstack/react-query';
import type { ExerciseHistoryResponse } from '@workspace/shared';

jest.mock('../../src/services/api/exerciseApi', () => ({
  fetchExerciseHistory: jest.fn(),
}));

jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));

const mockFetchExerciseHistory = fetchExerciseHistory as jest.MockedFunction<
  typeof fetchExerciseHistory
>;

const makePage = (
  sessions: ExerciseHistoryResponse['sessions'],
  page: number,
  hasMore: boolean,
  totalCount?: number,
): ExerciseHistoryResponse => ({
  sessions,
  pagination: { page, pageSize: 20, totalCount: totalCount ?? sessions.length, hasMore },
});

const makeIndividualSession = (id: string, name: string) => ({
  type: 'individual' as const,
  id,
  exercise_id: `ex-${id}`,
  duration_minutes: 30,
  calories_burned: 200,
  entry_date: '2024-06-15',
  notes: null,
  distance: null,
  avg_heart_rate: null,
  source: null,
  sets: [],
  exercise_snapshot: { id: `snap-${id}`, name, category: 'Strength' },
  activity_details: [],
});

describe('useExerciseHistory', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fetches page 1 on mount when enabled', async () => {
    mockFetchExerciseHistory.mockResolvedValue(makePage([], 1, false));

    renderHook(() => useExerciseHistory({ enabled: true }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockFetchExerciseHistory).toHaveBeenCalledWith(1);
    });
  });

  test('does not fetch when enabled is false', async () => {
    const { result } = renderHook(() => useExerciseHistory({ enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetchExerciseHistory).not.toHaveBeenCalled();
  });

  test('returns empty sessions when API returns empty', async () => {
    mockFetchExerciseHistory.mockResolvedValue(makePage([], 1, false));

    const { result } = renderHook(() => useExerciseHistory(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.hasMore).toBe(false);
  });

  test('returns sessions from page 1', async () => {
    const session1 = makeIndividualSession('1', 'Bench Press');
    const session2 = makeIndividualSession('2', 'Squat');
    mockFetchExerciseHistory.mockResolvedValue(makePage([session1, session2], 1, true, 40));

    const { result } = renderHook(() => useExerciseHistory(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });

    expect(result.current.sessions[0].id).toBe('1');
    expect(result.current.sessions[1].id).toBe('2');
    expect(result.current.hasMore).toBe(true);
  });

  test('loadMore fetches next page and appends sessions', async () => {
    const page1Session = makeIndividualSession('1', 'Bench Press');
    const page2Session = makeIndividualSession('2', 'Deadlift');

    mockFetchExerciseHistory.mockResolvedValueOnce(makePage([page1Session], 1, true, 2));

    const { result } = renderHook(() => useExerciseHistory(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    mockFetchExerciseHistory.mockResolvedValueOnce(makePage([page2Session], 2, false, 2));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });

    expect(result.current.sessions[0].id).toBe('1');
    expect(result.current.sessions[1].id).toBe('2');
    expect(result.current.hasMore).toBe(false);
  });

  test('refetch resets to page 1', async () => {
    const page1Session = makeIndividualSession('1', 'Bench Press');
    mockFetchExerciseHistory.mockResolvedValue(makePage([page1Session], 1, false));

    const { result } = renderHook(() => useExerciseHistory(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    const freshSession = makeIndividualSession('3', 'Overhead Press');
    mockFetchExerciseHistory.mockResolvedValue(makePage([freshSession], 1, false));

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
      expect(result.current.sessions[0].id).toBe('3');
    });

    expect(mockFetchExerciseHistory).toHaveBeenLastCalledWith(1);
  });

  test('hasMore reflects pagination response', async () => {
    mockFetchExerciseHistory.mockResolvedValue(makePage([], 1, true, 50));

    const { result } = renderHook(() => useExerciseHistory(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.hasMore).toBe(true);
    });
  });

  test('loadMore is a no-op when hasMore is false', async () => {
    const session = makeIndividualSession('1', 'Bench Press');
    mockFetchExerciseHistory.mockResolvedValue(makePage([session], 1, false));

    const { result } = renderHook(() => useExerciseHistory(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    const callCountBefore = mockFetchExerciseHistory.mock.calls.length;

    act(() => {
      result.current.loadMore();
    });

    // No additional fetch should be triggered
    expect(mockFetchExerciseHistory.mock.calls.length).toBe(callCountBefore);
    expect(result.current.sessions).toHaveLength(1);
  });

  test('isError is true on fetch failure', async () => {
    mockFetchExerciseHistory.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useExerciseHistory(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
    expect(result.current.sessions).toEqual([]);
  });

  test('refetch after loadMore clears accumulated sessions', async () => {
    const page1Session = makeIndividualSession('1', 'Bench Press');
    const page2Session = makeIndividualSession('2', 'Deadlift');

    mockFetchExerciseHistory.mockResolvedValueOnce(makePage([page1Session], 1, true, 2));

    const { result } = renderHook(() => useExerciseHistory(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    mockFetchExerciseHistory.mockResolvedValueOnce(makePage([page2Session], 2, false, 2));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });

    // Now refetch — should reset to only fresh page 1 data
    const freshSession = makeIndividualSession('3', 'Overhead Press');
    mockFetchExerciseHistory.mockResolvedValue(makePage([freshSession], 1, false));

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
      expect(result.current.sessions[0].id).toBe('3');
    });

    expect(mockFetchExerciseHistory).toHaveBeenLastCalledWith(1);
  });

  test('external history reset returns the hook to page 1 without duplicating sessions', async () => {
    const page1Session = makeIndividualSession('1', 'Bench Press');
    const page2Session = makeIndividualSession('2', 'Deadlift');

    mockFetchExerciseHistory.mockResolvedValueOnce(makePage([page1Session], 1, true, 2));

    const { result } = renderHook(() => useExerciseHistory(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    mockFetchExerciseHistory.mockResolvedValueOnce(makePage([page2Session], 2, false, 2));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });

    const freshSession = makeIndividualSession('3', 'Overhead Press');
    mockFetchExerciseHistory.mockResolvedValue(makePage([freshSession], 1, false));

    await act(async () => {
      queryClient.removeQueries({ queryKey: exerciseHistoryQueryKey });
      queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
      expect(result.current.sessions[0].id).toBe('3');
    });

    expect(mockFetchExerciseHistory).toHaveBeenLastCalledWith(1);
  });

  test('cache updates to a loaded later page replace sessions without duplicating rows', async () => {
    const page1Session = makeIndividualSession('1', 'Bench Press');
    const page2Session = makeIndividualSession('2', 'Deadlift');

    mockFetchExerciseHistory.mockResolvedValueOnce(makePage([page1Session], 1, true, 2));

    const { result } = renderHook(() => useExerciseHistory(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    mockFetchExerciseHistory.mockResolvedValueOnce(makePage([page2Session], 2, false, 2));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });

    act(() => {
      queryClient.setQueryData<InfiniteData<ExerciseHistoryResponse>>(
        exerciseHistoryQueryKey,
        existing => {
          expect(existing).toBeDefined();
          return {
            ...existing!,
            pages: existing!.pages.map(page =>
              page.pagination.page === 2
                ? {
                    ...page,
                    sessions: [{ ...page2Session, name: 'Updated Deadlift' }],
                  }
                : page,
            ),
          };
        },
      );
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
      expect(result.current.sessions[1].name).toBe('Updated Deadlift');
    });
  });

  test('cache updates to an earlier loaded page still update visible sessions', async () => {
    const page1Session = makeIndividualSession('1', 'Bench Press');
    const page2Session = makeIndividualSession('2', 'Deadlift');

    mockFetchExerciseHistory.mockResolvedValueOnce(makePage([page1Session], 1, true, 2));

    const { result } = renderHook(() => useExerciseHistory(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1);
    });

    mockFetchExerciseHistory.mockResolvedValueOnce(makePage([page2Session], 2, false, 2));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
    });

    act(() => {
      queryClient.setQueryData<InfiniteData<ExerciseHistoryResponse>>(
        exerciseHistoryQueryKey,
        existing => {
          expect(existing).toBeDefined();
          return {
            ...existing!,
            pages: existing!.pages.map(page =>
              page.pagination.page === 1
                ? {
                    ...page,
                    sessions: [{ ...page1Session, name: 'Updated Bench Press' }],
                  }
                : page,
            ),
          };
        },
      );
    });

    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(2);
      expect(result.current.sessions[0].name).toBe('Updated Bench Press');
    });
  });

  test('exports correct query key', () => {
    expect(exerciseHistoryQueryKey).toEqual(['exerciseHistory']);
  });
});
