import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMeasurementsRange } from '../../src/hooks/useMeasurementsRange';
import { measurementsRangeQueryKey } from '../../src/hooks/queryKeys';
import { fetchMeasurementsRange } from '../../src/services/api/measurementsApi';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';
import type { CheckInMeasurementRange } from '../../src/types/measurements';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchMeasurementsRange: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => {
    callback();
  }),
}));

const mockFetchMeasurementsRange = fetchMeasurementsRange as jest.MockedFunction<typeof fetchMeasurementsRange>;

const makeMeasurement = (entry_date: string, steps?: number): CheckInMeasurementRange => ({
  id: `id-${entry_date}`,
  user_id: 'user-1',
  entry_date,
  steps,
  updated_at: `${entry_date}T12:00:00Z`,
});

describe('useMeasurementsRange', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    Wrapper.displayName = 'QueryClientProviderWrapper';
    return Wrapper;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
        },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('data transformation', () => {
    test('returns correct number of data points for 7d range', async () => {
      mockFetchMeasurementsRange.mockResolvedValue([]);

      const { result } = renderHook(
        () => useMeasurementsRange({ range: '7d' }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.stepsData).toHaveLength(7);
    });

    test('returns correct number of data points for 30d range', async () => {
      mockFetchMeasurementsRange.mockResolvedValue([]);

      const { result } = renderHook(
        () => useMeasurementsRange({ range: '30d' }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.stepsData).toHaveLength(30);
    });

    test('returns correct number of data points for 90d range', async () => {
      mockFetchMeasurementsRange.mockResolvedValue([]);

      const { result } = renderHook(
        () => useMeasurementsRange({ range: '90d' }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.stepsData).toHaveLength(90);
    });

    test('fills missing days with 0 steps', async () => {
      const today = getTodayDate();
      mockFetchMeasurementsRange.mockResolvedValue([
        makeMeasurement(today, 5000),
      ]);

      const { result } = renderHook(
        () => useMeasurementsRange({ range: '7d' }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Only today should have steps, rest should be 0
      const nonZero = result.current.stepsData.filter((d) => d.steps > 0);
      expect(nonZero).toHaveLength(1);
      expect(nonZero[0].day).toBe(today);
      expect(nonZero[0].steps).toBe(5000);

      const zeros = result.current.stepsData.filter((d) => d.steps === 0);
      expect(zeros).toHaveLength(6);
    });

    test('deduplicates entries per date keeping the first (most recent)', async () => {
      const today = getTodayDate();
      mockFetchMeasurementsRange.mockResolvedValue([
        { ...makeMeasurement(today, 8000), updated_at: `${today}T14:00:00Z` },
        { ...makeMeasurement(today, 5000), updated_at: `${today}T10:00:00Z` },
      ]);

      const { result } = renderHook(
        () => useMeasurementsRange({ range: '7d' }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const todayPoint = result.current.stepsData.find((d) => d.day === today);
      expect(todayPoint?.steps).toBe(8000);
    });

    test('returns data in chronological order (ascending)', async () => {
      const today = getTodayDate();
      const yesterday = addDays(today, -1);
      mockFetchMeasurementsRange.mockResolvedValue([
        makeMeasurement(today, 3000),
        makeMeasurement(yesterday, 7000),
      ]);

      const { result } = renderHook(
        () => useMeasurementsRange({ range: '7d' }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const data = result.current.stepsData;
      // Last item should be today
      expect(data[data.length - 1].day).toBe(today);
      expect(data[data.length - 2].day).toBe(yesterday);

      // Verify ascending order
      for (let i = 1; i < data.length; i++) {
        expect(data[i].day > data[i - 1].day).toBe(true);
      }
    });

    test('treats undefined steps as 0', async () => {
      const today = getTodayDate();
      mockFetchMeasurementsRange.mockResolvedValue([
        makeMeasurement(today, undefined),
      ]);

      const { result } = renderHook(
        () => useMeasurementsRange({ range: '7d' }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const todayPoint = result.current.stepsData.find((d) => d.day === today);
      expect(todayPoint?.steps).toBe(0);
    });
  });

  describe('API calls', () => {
    test('calls fetchMeasurementsRange with correct date range for 7d', async () => {
      mockFetchMeasurementsRange.mockResolvedValue([]);
      const today = getTodayDate();
      const startDate = addDays(today, -6);

      renderHook(
        () => useMeasurementsRange({ range: '7d' }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(mockFetchMeasurementsRange).toHaveBeenCalledWith(startDate, today);
      });
    });

    test('calls fetchMeasurementsRange with correct date range for 30d', async () => {
      mockFetchMeasurementsRange.mockResolvedValue([]);
      const today = getTodayDate();
      const startDate = addDays(today, -29);

      renderHook(
        () => useMeasurementsRange({ range: '30d' }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(mockFetchMeasurementsRange).toHaveBeenCalledWith(startDate, today);
      });
    });
  });

  describe('options', () => {
    test('respects enabled=false', async () => {
      mockFetchMeasurementsRange.mockResolvedValue([]);

      renderHook(
        () => useMeasurementsRange({ range: '7d', enabled: false }),
        { wrapper: createWrapper() },
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFetchMeasurementsRange).not.toHaveBeenCalled();
    });

    test('enabled defaults to true', async () => {
      mockFetchMeasurementsRange.mockResolvedValue([]);

      renderHook(
        () => useMeasurementsRange({ range: '7d' }),
        { wrapper: createWrapper() },
      );

      await waitFor(() => {
        expect(mockFetchMeasurementsRange).toHaveBeenCalled();
      });
    });
  });

  describe('query key', () => {
    test('exports correct query key function', () => {
      expect(measurementsRangeQueryKey('2024-06-01', '2024-06-07')).toEqual([
        'measurementsRange',
        '2024-06-01',
        '2024-06-07',
      ]);
    });

    test('query key changes with dates', () => {
      expect(measurementsRangeQueryKey('2024-06-01', '2024-06-07')).not.toEqual(
        measurementsRangeQueryKey('2024-06-01', '2024-06-08'),
      );
    });
  });
});
