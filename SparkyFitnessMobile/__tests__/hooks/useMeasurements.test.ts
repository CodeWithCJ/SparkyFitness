import { renderHook, waitFor, act } from '@testing-library/react-native';
import {
  useLatestMeasurementsOnOrBefore,
  useMeasurements,
} from '../../src/hooks/useMeasurements';
import {
  latestMeasurementsOnOrBeforeQueryKey,
  measurementsQueryKey,
} from '../../src/hooks/queryKeys';
import {
  fetchLatestCheckInMeasurementsOnOrBefore,
  fetchMeasurements,
} from '../../src/services/api/measurementsApi';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchMeasurements: jest.fn(),
  fetchLatestCheckInMeasurementsOnOrBefore: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => {
    callback();
  }),
}));

const mockFetchMeasurements = fetchMeasurements as jest.MockedFunction<
  typeof fetchMeasurements
>;
const mockFetchLatestCheckInMeasurementsOnOrBefore =
  fetchLatestCheckInMeasurementsOnOrBefore as jest.MockedFunction<
    typeof fetchLatestCheckInMeasurementsOnOrBefore
  >;

describe('useMeasurements', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
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
        wrapper: createQueryWrapper(queryClient),
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
        wrapper: createQueryWrapper(queryClient),
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
        wrapper: createQueryWrapper(queryClient),
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
        wrapper: createQueryWrapper(queryClient),
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
        wrapper: createQueryWrapper(queryClient),
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
        wrapper: createQueryWrapper(queryClient),
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
      expect(measurementsQueryKey('2024-06-15')).toEqual([
        'measurements',
        '2024-06-15',
      ]);
    });

    test('query key changes with date', () => {
      expect(measurementsQueryKey('2024-06-15')).not.toEqual(
        measurementsQueryKey('2024-06-16')
      );
    });
  });

  describe('useLatestMeasurementsOnOrBefore', () => {
    test('fetches the carry-forward row for the day', async () => {
      mockFetchLatestCheckInMeasurementsOnOrBefore.mockResolvedValue({
        entry_date: '2024-06-01',
        weight: 80,
      });

      const { result } = renderHook(
        () => useLatestMeasurementsOnOrBefore({ date: testDate }),
        { wrapper: createQueryWrapper(queryClient) }
      );

      await waitFor(() => {
        expect(result.current.latestMeasurements?.weight).toBe(80);
      });
      expect(mockFetchLatestCheckInMeasurementsOnOrBefore).toHaveBeenCalledWith(
        testDate
      );
    });

    test('exposes null when there is no history', async () => {
      mockFetchLatestCheckInMeasurementsOnOrBefore.mockResolvedValue(null);

      const { result } = renderHook(
        () => useLatestMeasurementsOnOrBefore({ date: testDate }),
        { wrapper: createQueryWrapper(queryClient) }
      );

      await waitFor(() => {
        expect(result.current.latestMeasurements).toBeNull();
      });
      expect(mockFetchLatestCheckInMeasurementsOnOrBefore).toHaveBeenCalledWith(
        testDate
      );
    });

    test('does not fetch when disabled', async () => {
      renderHook(
        () =>
          useLatestMeasurementsOnOrBefore({ date: testDate, enabled: false }),
        { wrapper: createQueryWrapper(queryClient) }
      );

      await act(async () => {});
      expect(
        mockFetchLatestCheckInMeasurementsOnOrBefore
      ).not.toHaveBeenCalled();
    });

    test("is a separate cache entry from the day's own measurements", () => {
      expect(latestMeasurementsOnOrBeforeQueryKey(testDate)).not.toEqual(
        measurementsQueryKey(testDate)
      );
    });
  });
});
