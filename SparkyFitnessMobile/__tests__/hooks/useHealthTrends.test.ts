import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useHealthTrends } from '../../src/hooks/useHealthTrends';
import { fetchMeasurementsRange } from '../../src/services/api/measurementsApi';
import { fetchSleepAnalytics } from '../../src/services/api/sleepApi';
import { ApiError } from '../../src/services/api/errors';
import { getTodayDate } from '../../src/utils/dateUtils';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchMeasurementsRange: jest.fn(),
}));

jest.mock('../../src/services/api/sleepApi', () => ({
  fetchSleepAnalytics: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

const mockFetchMeasurementsRange = fetchMeasurementsRange as jest.MockedFunction<
  typeof fetchMeasurementsRange
>;
const mockFetchSleepAnalytics = fetchSleepAnalytics as jest.MockedFunction<
  typeof fetchSleepAnalytics
>;

const today = getTodayDate();

const measurementRow = {
  id: 'row-1',
  user_id: 'user-1',
  entry_date: today,
  steps: 5000,
  weight: 80,
  updated_at: `${today}T10:00:00.000Z`,
};

const sleepRow = {
  date: today,
  totalSleepDuration: 28800,
  timeAsleep: 27000,
  sleepScore: 80,
  earliestBedtime: null,
  latestWakeTime: null,
  sleepEfficiency: 93.75,
  sleepDebt: 0.5,
  stagePercentages: {},
  awakePeriods: 1,
  totalAwakeDuration: 1800,
};

let queryClient: QueryClient;

const renderTrends = (range: '7d' | '30d' | '90d' = '7d', enabled = true) =>
  renderHook(() => useHealthTrends({ range, enabled }), {
    wrapper: createQueryWrapper(queryClient),
  });

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = createTestQueryClient();
  mockFetchMeasurementsRange.mockResolvedValue([]);
  mockFetchSleepAnalytics.mockResolvedValue([]);
});

afterEach(() => {
  queryClient.clear();
});

describe('useHealthTrends', () => {
  test('returns all three series from one call', async () => {
    // @ts-expect-error partial row is enough for the fields the hook reads
    mockFetchMeasurementsRange.mockResolvedValue([measurementRow]);
    mockFetchSleepAnalytics.mockResolvedValue([sleepRow]);

    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.sleep.data.length).toBeGreaterThan(0);
    });

    expect(result.current.steps.data.at(-1)).toEqual({ day: today, steps: 5000 });
    expect(result.current.weight.data.at(-1)).toEqual({ day: today, weight: 80 });
    expect(result.current.sleep.data.at(-1)).toEqual({ day: today, hours: 7.5 });
  });

  test('requests both endpoints for the same window', async () => {
    renderTrends('30d');

    await waitFor(() => {
      expect(mockFetchMeasurementsRange).toHaveBeenCalled();
      expect(mockFetchSleepAnalytics).toHaveBeenCalled();
    });

    expect(mockFetchMeasurementsRange.mock.calls[0]).toEqual(
      mockFetchSleepAnalytics.mock.calls[0],
    );
  });

  test('leaves steps and weight intact when sleep fails', async () => {
    // @ts-expect-error partial row is enough for the fields the hook reads
    mockFetchMeasurementsRange.mockResolvedValue([measurementRow]);
    mockFetchSleepAnalytics.mockRejectedValue(new Error('sleep exploded'));

    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.sleep.isError).toBe(true);
    });

    expect(result.current.steps.isError).toBe(false);
    expect(result.current.steps.data.at(-1)).toEqual({ day: today, steps: 5000 });
    expect(result.current.sleep.data).toEqual([]);
  });

  test('treats a sleep 403 as no data rather than an error', async () => {
    mockFetchSleepAnalytics.mockRejectedValue(new ApiError('Forbidden', 403));

    const { result } = renderTrends();

    await waitFor(() => {
      expect(mockFetchSleepAnalytics).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(result.current.sleep.isError).toBe(false);
    });
    expect(result.current.sleep.data).toEqual([]);
  });

  test('shares one fetch state between steps and weight', async () => {
    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.steps.isLoading).toBe(false);
    });

    expect(result.current.weight.isLoading).toBe(result.current.steps.isLoading);
    expect(result.current.weight.isError).toBe(result.current.steps.isError);
  });

  test('refetch refreshes both endpoints', async () => {
    const { result } = renderTrends();

    await waitFor(() => {
      expect(mockFetchMeasurementsRange).toHaveBeenCalledTimes(1);
      expect(mockFetchSleepAnalytics).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFetchMeasurementsRange).toHaveBeenCalledTimes(2);
    expect(mockFetchSleepAnalytics).toHaveBeenCalledTimes(2);
  });

  test('makes no request when disabled', async () => {
    renderTrends('7d', false);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetchMeasurementsRange).not.toHaveBeenCalled();
    expect(mockFetchSleepAnalytics).not.toHaveBeenCalled();
  });
});
