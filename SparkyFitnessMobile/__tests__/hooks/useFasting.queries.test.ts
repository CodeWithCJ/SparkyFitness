import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useCurrentFast,
  useFastingStats,
  useFastingHistory,
  useStartFast,
  useEndFast,
} from '../../src/hooks/useFasting';
import {
  fetchCurrentFast,
  fetchFastingStats,
  fetchFastingHistory,
  startFast,
  endFast,
} from '../../src/services/api/fastingApi';
import { cancelScheduledNotification } from '../../src/services/notifications';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';
import type { FastingLog, FastingStats } from '../../src/types/fasting';

jest.mock('../../src/services/api/fastingApi', () => ({
  fetchCurrentFast: jest.fn(),
  fetchFastingStats: jest.fn(),
  fetchFastingHistory: jest.fn(),
  startFast: jest.fn(),
  endFast: jest.fn(),
}));

// Used by useEndFast's eager cancel; scheduling is irrelevant to these tests.
jest.mock('../../src/services/notifications', () => ({
  scheduleFastGoalNotification: jest.fn().mockResolvedValue('notif-x'),
  cancelScheduledNotification: jest.fn().mockResolvedValue(undefined),
}));

// useRefetchOnFocus relies on a navigation context we don't mount here.
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockFetchCurrent = fetchCurrentFast as jest.MockedFunction<typeof fetchCurrentFast>;
const mockFetchStats = fetchFastingStats as jest.MockedFunction<typeof fetchFastingStats>;
const mockFetchHistory = fetchFastingHistory as jest.MockedFunction<typeof fetchFastingHistory>;
const mockStartFast = startFast as jest.MockedFunction<typeof startFast>;
const mockEndFast = endFast as jest.MockedFunction<typeof endFast>;
const mockCancelNotification = cancelScheduledNotification as jest.MockedFunction<
  typeof cancelScheduledNotification
>;

const GOAL_NOTIF_STORAGE_KEY = '@Fasting:goalNotificationId';

function activeFast(overrides: Partial<FastingLog> = {}): FastingLog {
  return {
    id: 'fast-1',
    user_id: 'user-1',
    start_time: '2026-06-27T08:00:00Z',
    end_time: null,
    target_end_time: '2026-06-27T16:00:00Z',
    duration_minutes: null,
    fasting_type: '16:8 Leangains',
    status: 'ACTIVE',
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('useFasting queries and mutations', () => {
  let queryClient: QueryClient;
  let wrapper: ReturnType<typeof createQueryWrapper>;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    queryClient = createTestQueryClient();
    wrapper = createQueryWrapper(queryClient);
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('useCurrentFast', () => {
    it('returns the active fast from the API', async () => {
      const fast = activeFast();
      mockFetchCurrent.mockResolvedValue(fast);

      const { result } = renderHook(() => useCurrentFast(), { wrapper });

      await waitFor(() => expect(result.current.data).toEqual(fast));
      expect(mockFetchCurrent).toHaveBeenCalledTimes(1);
    });

    it('does not fetch when disabled', () => {
      const { result } = renderHook(() => useCurrentFast({ enabled: false }), { wrapper });

      expect(mockFetchCurrent).not.toHaveBeenCalled();
      expect(result.current.fetchStatus).toBe('idle');
    });
  });

  describe('useFastingStats', () => {
    it('returns fasting stats from the API', async () => {
      const stats: FastingStats = {
        total_completed_fasts: 12,
        total_minutes_fasted: 9600,
        average_duration_minutes: 800,
      };
      mockFetchStats.mockResolvedValue(stats);

      const { result } = renderHook(() => useFastingStats(), { wrapper });

      await waitFor(() => expect(result.current.data).toEqual(stats));
    });

    it('does not fetch when disabled', () => {
      renderHook(() => useFastingStats({ enabled: false }), { wrapper });
      expect(mockFetchStats).not.toHaveBeenCalled();
    });
  });

  describe('useFastingHistory', () => {
    it('forwards the limit and offset to the API', async () => {
      const history = [activeFast({ id: 'h1', status: 'COMPLETED' })];
      mockFetchHistory.mockResolvedValue(history);

      const { result } = renderHook(() => useFastingHistory(5, 10), { wrapper });

      await waitFor(() => expect(result.current.data).toEqual(history));
      expect(mockFetchHistory).toHaveBeenCalledWith({ limit: 5, offset: 10 });
    });

    it('caches each limit/offset combination under its own key', async () => {
      mockFetchHistory.mockResolvedValue([]);

      renderHook(() => useFastingHistory(1, 0), { wrapper });
      renderHook(() => useFastingHistory(1, 1), { wrapper });

      await waitFor(() => {
        expect(mockFetchHistory).toHaveBeenCalledWith({ limit: 1, offset: 0 });
        expect(mockFetchHistory).toHaveBeenCalledWith({ limit: 1, offset: 1 });
      });
    });

    it('defaults to limit 1, offset 0 when called with no arguments', async () => {
      mockFetchHistory.mockResolvedValue([]);

      renderHook(() => useFastingHistory(), { wrapper });

      await waitFor(() => {
        expect(mockFetchHistory).toHaveBeenCalledWith({ limit: 1, offset: 0 });
      });
    });
  });

  describe('useStartFast', () => {
    it('starts a fast and invalidates fasting + daily-summary caches', async () => {
      mockStartFast.mockResolvedValue(activeFast());
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useStartFast(), { wrapper });

      const params = {
        startTime: '2026-06-27T08:00:00Z',
        targetEndTime: '2026-06-27T16:00:00Z',
        fastingType: '16:8 Leangains',
      };
      await act(async () => {
        await result.current.mutateAsync(params);
      });

      expect(mockStartFast).toHaveBeenCalledWith(params);
      const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
      expect(invalidatedKeys).toEqual(
        expect.arrayContaining([['fasting'], ['dailySummary']]),
      );
    });

    it('surfaces the error without invalidating on failure', async () => {
      mockStartFast.mockRejectedValue(new Error('network'));
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useStartFast(), { wrapper });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            startTime: 's',
            targetEndTime: 't',
            fastingType: 'x',
          }),
        ).rejects.toThrow('network');
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('useEndFast', () => {
    it('ends a fast, eagerly cancels the goal notification, and invalidates caches', async () => {
      mockEndFast.mockResolvedValue(activeFast({ status: 'COMPLETED', end_time: '2026-06-27T16:00:00Z' }));
      // Seed a stored goal notification so the eager cancel has something to clear.
      await AsyncStorage.setItem(
        GOAL_NOTIF_STORAGE_KEY,
        JSON.stringify({ fastId: 'fast-1', target: '2026-06-27T16:00:00Z', notificationId: 'notif-1' }),
      );
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useEndFast(), { wrapper });

      const params = {
        id: 'fast-1',
        startTime: '2026-06-27T08:00:00Z',
        endTime: '2026-06-27T16:00:00Z',
      };
      await act(async () => {
        await result.current.mutateAsync(params);
      });

      expect(mockEndFast).toHaveBeenCalledWith(params);

      // The eager cancel is fire-and-forget (`void`), so wait for both its
      // notification cancel and its storage cleanup to settle.
      await waitFor(async () => {
        expect(mockCancelNotification).toHaveBeenCalledWith('notif-1');
        expect(await AsyncStorage.getItem(GOAL_NOTIF_STORAGE_KEY)).toBeNull();
      });

      const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
      expect(invalidatedKeys).toEqual(
        expect.arrayContaining([['fasting'], ['dailySummary']]),
      );
    });

    it('does not cancel the notification or invalidate caches when ending fails', async () => {
      mockEndFast.mockRejectedValue(new Error('network'));
      // A stored notification must survive a failed end (the eager cancel is
      // wired into onSuccess only, never onError/onSettled).
      await AsyncStorage.setItem(
        GOAL_NOTIF_STORAGE_KEY,
        JSON.stringify({ fastId: 'fast-1', target: '2026-06-27T16:00:00Z', notificationId: 'notif-1' }),
      );
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useEndFast(), { wrapper });

      await act(async () => {
        await expect(
          result.current.mutateAsync({ id: 'fast-1', startTime: 's', endTime: 'e' }),
        ).rejects.toThrow('network');
      });

      expect(mockCancelNotification).not.toHaveBeenCalled();
      expect(invalidateSpy).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(GOAL_NOTIF_STORAGE_KEY)).not.toBeNull();
    });
  });
});
