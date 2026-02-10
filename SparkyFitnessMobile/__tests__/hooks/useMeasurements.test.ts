import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMeasurements } from '../../src/hooks/useMeasurements';
import { measurementsQueryKey } from '../../src/hooks/queryKeys';
import { fetchMeasurements } from '../../src/services/api/measurementsApi';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchMeasurements: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => {
    callback();
  }),
}));

const mockFetchMeasurements = fetchMeasurements as jest.MockedFunction<typeof fetchMeasurements>;

describe('useMeasurements', () => {
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

  const testDate = '2024-06-15';

  describe('query behavior', () => {
    test('fetches measurements on mount', async () => {
      mockFetchMeasurements.mockResolvedValue({
        entry_date: testDate,
        weight: 75,
      });

      renderHook(() => useMeasurements({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFetchMeasurements).toHaveBeenCalledWith(testDate);
      });
    });

    test('returns measurements data', async () => {
      const measurementsData = {
        entry_date: testDate,
        weight: 75,
        neck: 38,
        waist: 85,
        hips: 95,
        steps: 10000,
      };
      mockFetchMeasurements.mockResolvedValue(measurementsData);

      const { result } = renderHook(() => useMeasurements({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.measurements).toEqual(measurementsData);
    });

  });

  describe('options', () => {
    test('respects enabled option', async () => {
      mockFetchMeasurements.mockResolvedValue({
        entry_date: testDate,
        weight: 75,
      });

      renderHook(() => useMeasurements({ date: testDate, enabled: false }), {
        wrapper: createWrapper(),
      });

      // Wait a bit to ensure no fetch occurs
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFetchMeasurements).not.toHaveBeenCalled();
    });

    test('enabled defaults to true', async () => {
      mockFetchMeasurements.mockResolvedValue({
        entry_date: testDate,
        weight: 75,
      });

      renderHook(() => useMeasurements({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(mockFetchMeasurements).toHaveBeenCalled();
      });
    });
  });

  describe('refetch', () => {
    test('provides refetch function', async () => {
      mockFetchMeasurements.mockResolvedValue({
        entry_date: testDate,
        weight: 75,
      });

      const { result } = renderHook(() => useMeasurements({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.refetch).toBe('function');
    });

    test('refetch updates data', async () => {
      mockFetchMeasurements.mockResolvedValue({
        entry_date: testDate,
        weight: 75,
      });

      const { result } = renderHook(() => useMeasurements({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.measurements?.weight).toBe(75);
      });

      mockFetchMeasurements.mockResolvedValue({
        entry_date: testDate,
        weight: 74,
      });

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.measurements?.weight).toBe(74);
      });
    });
  });

  describe('query key', () => {
    test('exports correct query key function', () => {
      expect(measurementsQueryKey('2024-06-15')).toEqual(['measurements', '2024-06-15']);
    });

    test('query key changes with date', () => {
      expect(measurementsQueryKey('2024-06-15')).not.toEqual(measurementsQueryKey('2024-06-16'));
    });
  });
});
