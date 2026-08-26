import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useSleepRange } from '../../src/hooks/useSleepRange';
import { sleepAnalyticsQueryKey, measurementsRangeQueryKey } from '../../src/hooks/queryKeys';
import { fetchSleepAnalytics } from '../../src/services/api/sleepApi';
import { ApiError } from '../../src/services/api/errors';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';
import type { SleepAnalyticsDay } from '../../src/types/sleep';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/sleepApi', () => ({
  fetchSleepAnalytics: jest.fn(),
}));

// Unlike the sibling measurements suite, the focus callback is captured rather than
// invoked on every render: `useRefetchOnFocus` throttles itself to one refetch per 30 s,
// so an auto-firing mock would consume the only refetch the focus case can observe.
const mockFocusCallbacks: (() => void)[] = [];

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback: () => void) => {
    mockFocusCallbacks.push(callback);
  }),
}));

const mockFetchSleepAnalytics = fetchSleepAnalytics as jest.MockedFunction<
  typeof fetchSleepAnalytics
>;

const makeSleepDay = (
  date: string,
  timeAsleep: number | null | undefined,
): SleepAnalyticsDay => ({
  date,
  totalSleepDuration: (timeAsleep ?? 0) + 1800,
  timeAsleep: timeAsleep as number,
  sleepScore: 82,
  earliestBedtime: `${date}T22:45:00.000Z`,
  latestWakeTime: `${date}T06:30:00.000Z`,
  sleepEfficiency: 93.75,
  sleepDebt: 0.5,
  stagePercentages: { deep: 20, light: 55, rem: 25 },
  awakePeriods: 2,
  totalAwakeDuration: 1800,
});

describe('useSleepRange', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusCallbacks.length = 0;
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('data transformation', () => {
    test('returns 7 / 30 / 90 data points for the matching range', async () => {
      mockFetchSleepAnalytics.mockResolvedValue([]);
      const wrapper = createQueryWrapper(queryClient);

      const seven = renderHook(() => useSleepRange({ range: '7d' }), { wrapper });
      await waitFor(() => expect(seven.result.current.isLoading).toBe(false));
      expect(seven.result.current.sleepData).toHaveLength(7);

      const thirty = renderHook(() => useSleepRange({ range: '30d' }), { wrapper });
      await waitFor(() => expect(thirty.result.current.isLoading).toBe(false));
      expect(thirty.result.current.sleepData).toHaveLength(30);

      const ninety = renderHook(() => useSleepRange({ range: '90d' }), { wrapper });
      await waitFor(() => expect(ninety.result.current.isLoading).toBe(false));
      expect(ninety.result.current.sleepData).toHaveLength(90);
    });

    test('converts timeAsleep seconds to hours', async () => {
      const today = getTodayDate();
      mockFetchSleepAnalytics.mockResolvedValue([makeSleepDay(today, 27000)]);

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.sleepData.find((d) => d.day === today)?.hours).toBe(7.5);
    });

    test("uses the server's per-date aggregate as a single value", async () => {
      const today = getTodayDate();
      // The server sums every session on a date into one row: 19800 + 7200 = 27000 s.
      mockFetchSleepAnalytics.mockResolvedValue([makeSleepDay(today, 19800 + 7200)]);

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const nonZero = result.current.sleepData.filter((d) => d.hours > 0);
      expect(nonZero).toHaveLength(1);
      expect(nonZero[0].hours).toBe(7.5);
    });

    test('keeps the first row when the server returns two rows for one date', async () => {
      const today = getTodayDate();
      mockFetchSleepAnalytics.mockResolvedValue([
        makeSleepDay(today, 27000),
        makeSleepDay(today, 3600),
      ]);

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.sleepData.find((d) => d.day === today)?.hours).toBe(7.5);
    });

    test('fills days with no sleep record with 0 hours', async () => {
      const today = getTodayDate();
      mockFetchSleepAnalytics.mockResolvedValue([makeSleepDay(today, 27000)]);

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const data = result.current.sleepData;
      expect(data.filter((d) => d.hours > 0)).toHaveLength(1);
      expect(data.filter((d) => d.hours === 0)).toHaveLength(6);

      const expectedDays = Array.from({ length: 7 }, (_, i) => addDays(today, -(6 - i)));
      expect(data.map((d) => d.day)).toEqual(expectedDays);
    });

    test('treats null / undefined / 0 timeAsleep as 0 hours', async () => {
      const today = getTodayDate();
      const yesterday = addDays(today, -1);
      const dayBefore = addDays(today, -2);
      mockFetchSleepAnalytics.mockResolvedValue([
        makeSleepDay(today, null),
        makeSleepDay(yesterday, undefined),
        makeSleepDay(dayBefore, 0),
      ]);

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const data = result.current.sleepData;
      expect(data).toHaveLength(7);
      for (const day of [today, yesterday, dayBefore]) {
        const point = data.find((d) => d.day === day);
        expect(point?.hours).toBe(0);
        expect(Number.isNaN(point?.hours)).toBe(false);
      }
    });

    test('returns days ascending even when the server returns them out of order', async () => {
      const today = getTodayDate();
      mockFetchSleepAnalytics.mockResolvedValue([
        makeSleepDay(today, 27000),
        makeSleepDay(addDays(today, -3), 21600),
        makeSleepDay(addDays(today, -1), 18000),
      ]);

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const data = result.current.sleepData;
      expect(data[data.length - 1].day).toBe(today);
      for (let i = 1; i < data.length; i++) {
        expect(data[i].day > data[i - 1].day).toBe(true);
      }
    });

    test('ignores response dates outside the requested window', async () => {
      const today = getTodayDate();
      const tomorrow = addDays(today, 1);
      const longAgo = addDays(today, -100);
      mockFetchSleepAnalytics.mockResolvedValue([
        makeSleepDay(tomorrow, 27000),
        makeSleepDay(longAgo, 21600),
      ]);

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const days = result.current.sleepData.map((d) => d.day);
      expect(days).toHaveLength(7);
      expect(days).not.toContain(tomorrow);
      expect(days).not.toContain(longAgo);
    });

    test('returns an empty array before the query resolves', async () => {
      let resolveFetch: (value: SleepAnalyticsDay[]) => void = () => {};
      mockFetchSleepAnalytics.mockReturnValue(
        new Promise<SleepAnalyticsDay[]>((resolve) => {
          resolveFetch = resolve;
        }),
      );

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.sleepData).toEqual([]);

      await act(async () => {
        resolveFetch([]);
      });
    });
  });

  describe('API calls', () => {
    test('requests the 7d window as [today-6, today]', async () => {
      mockFetchSleepAnalytics.mockResolvedValue([]);
      const today = getTodayDate();

      renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockFetchSleepAnalytics).toHaveBeenCalledWith(addDays(today, -6), today);
      });
    });

    test('requests the 30d and 90d windows', async () => {
      mockFetchSleepAnalytics.mockResolvedValue([]);
      const today = getTodayDate();
      const wrapper = createQueryWrapper(queryClient);

      renderHook(() => useSleepRange({ range: '30d' }), { wrapper });
      await waitFor(() => {
        expect(mockFetchSleepAnalytics).toHaveBeenCalledWith(addDays(today, -29), today);
      });

      renderHook(() => useSleepRange({ range: '90d' }), { wrapper });
      await waitFor(() => {
        expect(mockFetchSleepAnalytics).toHaveBeenCalledWith(addDays(today, -89), today);
      });
    });
  });

  describe('options', () => {
    test('respects enabled=false', async () => {
      mockFetchSleepAnalytics.mockResolvedValue([]);

      renderHook(() => useSleepRange({ range: '7d', enabled: false }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFetchSleepAnalytics).not.toHaveBeenCalled();
    });

    test('enabled defaults to true', async () => {
      mockFetchSleepAnalytics.mockResolvedValue([]);

      renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(mockFetchSleepAnalytics).toHaveBeenCalled());
    });

    test('refetches on focus when enabled', async () => {
      mockFetchSleepAnalytics.mockResolvedValue([]);

      const enabled = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });
      await waitFor(() => expect(mockFetchSleepAnalytics).toHaveBeenCalledTimes(1));

      await act(async () => {
        mockFocusCallbacks[mockFocusCallbacks.length - 1]();
      });
      await waitFor(() => expect(mockFetchSleepAnalytics).toHaveBeenCalledTimes(2));
      enabled.unmount();

      // Disabled: focusing must not reach the network at all.
      jest.clearAllMocks();
      mockFocusCallbacks.length = 0;
      const disabledClient = createTestQueryClient();

      renderHook(() => useSleepRange({ range: '7d', enabled: false }), {
        wrapper: createQueryWrapper(disabledClient),
      });
      await act(async () => {
        mockFocusCallbacks[mockFocusCallbacks.length - 1]();
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFetchSleepAnalytics).not.toHaveBeenCalled();
      disabledClient.clear();
    });
  });

  describe('permissions and errors', () => {
    test('surfaces isError when the API rejects', async () => {
      mockFetchSleepAnalytics.mockRejectedValue(new Error('Network request failed'));

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.sleepData).toEqual([]);
    });

    test('treats a 403 as no data rather than an error', async () => {
      mockFetchSleepAnalytics.mockRejectedValue(
        new ApiError('Server error: 403 - Forbidden', 403, 'Forbidden'),
      );

      const { result } = renderHook(() => useSleepRange({ range: '7d' }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // A delegate holding `checkin` but not `reports` is refused only this request; the
      // pager should hide the sleep page rather than show an error state.
      expect(result.current.isError).toBe(false);
      expect(result.current.sleepData).toEqual([]);
    });
  });

  describe('query key', () => {
    test('sleepAnalyticsQueryKey returns the namespaced tuple', () => {
      expect(sleepAnalyticsQueryKey('2026-06-01', '2026-06-07')).toEqual([
        'sleepAnalytics',
        '2026-06-01',
        '2026-06-07',
      ]);
    });

    test('query key differs across range switches', () => {
      const today = '2026-06-30';
      const sevenDay = sleepAnalyticsQueryKey(addDays(today, -6), today);
      const thirtyDay = sleepAnalyticsQueryKey(addDays(today, -29), today);
      const ninetyDay = sleepAnalyticsQueryKey(addDays(today, -89), today);

      expect(sevenDay).not.toEqual(thirtyDay);
      expect(thirtyDay).not.toEqual(ninetyDay);
      expect(sevenDay).not.toEqual(ninetyDay);

      // Identical dates must not collide with the measurements range cache entry.
      expect(sevenDay).not.toEqual(measurementsRangeQueryKey(addDays(today, -6), today));
    });
  });
});
