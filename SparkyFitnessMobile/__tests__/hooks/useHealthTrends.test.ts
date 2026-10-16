import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useHealthTrends } from '../../src/hooks/useHealthTrends';
import {
  HEALTH_TREND_KEYS,
  type HealthTrendKey,
} from '../../src/constants/healthTrends';
import {
  fetchMeasurementsRange,
  fetchWaterIntakeRange,
} from '../../src/services/api/measurementsApi';
import { fetchSleepEntries } from '../../src/services/api/sleepApi';
import { fetchNutritionTrends } from '../../src/services/api/reportsApi';
import { fetchGoalsRange } from '../../src/services/api/goalsApi';
import { ApiError } from '../../src/services/api/errors';
import { getTodayDate } from '../../src/utils/dateUtils';
import { buildSleepEntry } from '../helpers/sleepFixtures';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchMeasurementsRange: jest.fn(),
  fetchWaterIntakeRange: jest.fn(),
  fetchCustomCategories: jest.fn(() => Promise.resolve([])),
  fetchCustomMeasurementsRange: jest.fn(() => Promise.resolve([])),
  fetchDailyVo2Max: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../src/services/api/sleepApi', () => ({
  fetchSleepEntries: jest.fn(),
}));

jest.mock('../../src/services/api/reportsApi', () => ({
  fetchNutritionTrends: jest.fn(),
}));

jest.mock('../../src/services/api/goalsApi', () => ({
  fetchGoalsRange: jest.fn(),
}));

// `useSleepRange` reads the profile timezone to decide which day the window ends on. With
// none configured it falls back to device-local, which is what the sibling measurements
// request uses, so both endpoints ask for the same window.
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({ preferences: undefined })),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));

const mockFetchMeasurementsRange =
  fetchMeasurementsRange as jest.MockedFunction<typeof fetchMeasurementsRange>;
const mockFetchSleepEntries = fetchSleepEntries as jest.MockedFunction<
  typeof fetchSleepEntries
>;
const mockFetchWaterIntakeRange = fetchWaterIntakeRange as jest.MockedFunction<
  typeof fetchWaterIntakeRange
>;
const mockFetchNutritionTrends = fetchNutritionTrends as jest.MockedFunction<
  typeof fetchNutritionTrends
>;
const mockFetchGoalsRange = fetchGoalsRange as jest.MockedFunction<
  typeof fetchGoalsRange
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

const sleepEntry = buildSleepEntry({
  entry_date: today,
  bedtime: `${today}T00:00:00.000Z`,
  wake_time: `${today}T08:00:00.000Z`,
  duration_in_seconds: 28800,
  time_asleep_in_seconds: 27000,
});

let queryClient: QueryClient;

// Every trend active unless a case is specifically about per-trend gating.
const ALL_TRENDS: readonly HealthTrendKey[] = [...HEALTH_TREND_KEYS];

const renderTrends = (
  range: '7d' | '30d' | '90d' = '7d',
  enabled = true,
  activeTrends: readonly HealthTrendKey[] = ALL_TRENDS
) =>
  renderHook(() => useHealthTrends({ range, enabled, activeTrends }), {
    wrapper: createQueryWrapper(queryClient),
  });

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = createTestQueryClient();
  mockFetchMeasurementsRange.mockResolvedValue([]);
  mockFetchSleepEntries.mockResolvedValue([]);
  mockFetchWaterIntakeRange.mockResolvedValue([]);
  mockFetchNutritionTrends.mockResolvedValue([]);
  mockFetchGoalsRange.mockResolvedValue({});
});

afterEach(() => {
  queryClient.clear();
});

describe('useHealthTrends', () => {
  test('returns all three series from one call', async () => {
    // @ts-expect-error partial row is enough for the fields the hook reads
    mockFetchMeasurementsRange.mockResolvedValue([measurementRow]);
    mockFetchSleepEntries.mockResolvedValue([sleepEntry]);

    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.sleep.nightsWithData).toBe(1);
    });

    expect(result.current.steps.data.at(-1)).toEqual({
      day: today,
      steps: 5000,
    });
    expect(result.current.weight.data.at(-1)).toEqual({
      day: today,
      weight: 80,
    });
    expect(result.current.sleep.data.at(-1)).toMatchObject({
      day: today,
      timeInBedSeconds: 28800,
      timeAsleepSeconds: 27000,
    });
  });

  test('carries the window averages the sleep card headlines', async () => {
    mockFetchSleepEntries.mockResolvedValue([sleepEntry]);

    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.sleep.nightsWithData).toBe(1);
    });

    expect(result.current.sleep.averageTimeInBedSeconds).toBe(28800);
    expect(result.current.sleep.averageTimeAsleepSeconds).toBe(27000);
  });

  test('pads the sleep series to one entry per day regardless of coverage', async () => {
    // The pager gates the sleep page on `nightsWithData`, not on `data.length`, precisely
    // because an all-empty window still fills every column.
    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.sleep.isLoading).toBe(false);
    });

    expect(result.current.sleep.data).toHaveLength(7);
    expect(result.current.sleep.nightsWithData).toBe(0);
  });

  test('requests both endpoints for the same window', async () => {
    renderTrends('30d');

    await waitFor(() => {
      expect(mockFetchMeasurementsRange).toHaveBeenCalled();
      expect(mockFetchSleepEntries).toHaveBeenCalled();
    });

    expect(mockFetchMeasurementsRange.mock.calls[0]).toEqual(
      mockFetchSleepEntries.mock.calls[0]
    );
  });

  test('leaves steps and weight intact when sleep fails', async () => {
    // @ts-expect-error partial row is enough for the fields the hook reads
    mockFetchMeasurementsRange.mockResolvedValue([measurementRow]);
    mockFetchSleepEntries.mockRejectedValue(new Error('sleep exploded'));

    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.sleep.isError).toBe(true);
    });

    expect(result.current.steps.isError).toBe(false);
    expect(result.current.steps.data.at(-1)).toEqual({
      day: today,
      steps: 5000,
    });
    expect(result.current.sleep.data).toEqual([]);
    expect(result.current.sleep.nightsWithData).toBe(0);
  });

  test('treats a sleep 403 as no data rather than an error', async () => {
    mockFetchSleepEntries.mockRejectedValue(new ApiError('Forbidden', 403));

    const { result } = renderTrends();

    await waitFor(() => {
      expect(mockFetchSleepEntries).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(result.current.sleep.isError).toBe(false);
    });
    expect(result.current.sleep.data).toEqual([]);
    expect(result.current.sleep.nightsWithData).toBe(0);
  });

  test('shares one fetch state between steps and weight', async () => {
    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.steps.isLoading).toBe(false);
    });

    expect(result.current.weight.isLoading).toBe(
      result.current.steps.isLoading
    );
    expect(result.current.weight.isError).toBe(result.current.steps.isError);
  });

  test('refetch refreshes both endpoints', async () => {
    const { result } = renderTrends();

    await waitFor(() => {
      expect(mockFetchMeasurementsRange).toHaveBeenCalledTimes(1);
      expect(mockFetchSleepEntries).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFetchMeasurementsRange).toHaveBeenCalledTimes(2);
    expect(mockFetchSleepEntries).toHaveBeenCalledTimes(2);
  });

  test('keeps refetch stable across renders so callers can depend on it', async () => {
    // The dashboard's pull-to-refresh callback lists this in its `useCallback` deps. The
    // series objects around it are rebuilt every render, which is why the screen
    // destructures `refetch` out rather than depending on the whole return value.
    const { result, rerender } = renderTrends();

    await waitFor(() => expect(result.current.steps.isLoading).toBe(false));

    const firstRefetch = result.current.refetch;
    rerender({});

    expect(result.current.refetch).toBe(firstRefetch);
  });

  test('makes no request when disabled', async () => {
    renderTrends('7d', false);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockFetchMeasurementsRange).not.toHaveBeenCalled();
    expect(mockFetchSleepEntries).not.toHaveBeenCalled();
    expect(mockFetchWaterIntakeRange).not.toHaveBeenCalled();
    expect(mockFetchNutritionTrends).not.toHaveBeenCalled();
  });

  test('returns a hydration series for the window', async () => {
    mockFetchWaterIntakeRange.mockResolvedValue([
      { entry_date: today, water_ml: 1500 },
    ]);

    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.hydration.isLoading).toBe(false);
    });

    expect(result.current.hydration.data).toHaveLength(7);
    expect(result.current.hydration.data.at(-1)).toEqual({
      day: today,
      milliliters: 1500,
    });
  });

  test('issues no hydration request when hydration is not active', async () => {
    renderTrends('7d', true, ['steps', 'weight', 'sleep']);

    await waitFor(() => {
      expect(mockFetchMeasurementsRange).toHaveBeenCalled();
    });

    expect(mockFetchWaterIntakeRange).not.toHaveBeenCalled();
  });

  test('issues no measurements request when neither steps nor weight is active', async () => {
    const { result } = renderTrends('7d', true, ['hydration']);

    await waitFor(() => {
      expect(mockFetchWaterIntakeRange).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(result.current.hydration.isLoading).toBe(false);
    });

    expect(mockFetchMeasurementsRange).not.toHaveBeenCalled();
    expect(result.current.hydration.data).toHaveLength(7);
  });

  test('still issues one measurements request when only weight is active', async () => {
    // Steps and weight share one request, so weight alone still has to make it.
    renderTrends('7d', true, ['weight']);

    await waitFor(() => {
      expect(mockFetchMeasurementsRange).toHaveBeenCalledTimes(1);
    });
  });

  test('refetch refreshes every active source', async () => {
    const { result } = renderTrends('7d', true, ['steps', 'hydration']);

    await waitFor(() => {
      expect(mockFetchMeasurementsRange).toHaveBeenCalledTimes(1);
      expect(mockFetchWaterIntakeRange).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFetchMeasurementsRange).toHaveBeenCalledTimes(2);
    expect(mockFetchWaterIntakeRange).toHaveBeenCalledTimes(2);
  });

  test('refetch leaves a hidden trend alone', async () => {
    const { result } = renderTrends('7d', true, ['steps', 'hydration']);

    await waitFor(() => {
      expect(mockFetchMeasurementsRange).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.refetch();
    });

    // `refetch()` ignores `enabled`, so this only holds because `useHealthTrends` skips
    // the call itself. Without that, pull-to-refresh would fetch every hidden trend.
    expect(mockFetchSleepEntries).not.toHaveBeenCalled();
  });

  test('returns a calories series for the window', async () => {
    mockFetchNutritionTrends.mockResolvedValue([
      {
        date: today,
        calories: 1850,
        protein: 100,
        carbs: 200,
        fat: 60,
        saturated_fat: 0,
        polyunsaturated_fat: 0,
        monounsaturated_fat: 0,
        trans_fat: 0,
        cholesterol: 0,
        sodium: 0,
        potassium: 0,
        dietary_fiber: 25,
        sugars: 0,
        vitamin_a: 0,
        vitamin_c: 0,
        calcium: 0,
        iron: 0,
        caffeine_mg: 0,
        water_ml: 0,
        alcohol_g: 0,
      },
    ]);

    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.calories.isLoading).toBe(false);
    });

    expect(result.current.calories.data).toHaveLength(7);
    expect(result.current.calories.data.at(-1)).toEqual({
      day: today,
      calories: 1850,
      protein: 100,
      carbs: 200,
      fat: 60,
    });
    // 1850 logged plus six zero-fill days, averaged over the full 7-day window.
    expect(result.current.calories.averageCalories).toBeCloseTo(1850 / 7);
  });

  test('issues no calories request when calories is not active', async () => {
    renderTrends('7d', true, ['steps', 'weight', 'sleep', 'hydration']);

    await waitFor(() => {
      expect(mockFetchMeasurementsRange).toHaveBeenCalled();
    });

    expect(mockFetchNutritionTrends).not.toHaveBeenCalled();
  });

  test('refetch refreshes calories only when calories is active', async () => {
    const { result } = renderTrends('7d', true, ['calories']);

    await waitFor(() => {
      expect(mockFetchNutritionTrends).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockFetchNutritionTrends).toHaveBeenCalledTimes(2);
    expect(mockFetchMeasurementsRange).not.toHaveBeenCalled();
  });

  test('carries the resolved per-day calorie goal from useCaloriesRange', async () => {
    mockFetchGoalsRange.mockImplementation((_start, _end, adjust) =>
      Promise.resolve(adjust ? { [today]: { calories: 1900 } as never } : {})
    );

    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.calories.isLoading).toBe(false);
    });

    expect(result.current.calories.calorieGoals.at(-1)).toBe(1900);
  });

  test('carries the resolved per-day hydration goal from useHydrationRange', async () => {
    mockFetchGoalsRange.mockImplementation((_start, _end, adjust) =>
      Promise.resolve(
        adjust ? {} : { [today]: { water_goal_ml: 2200 } as never }
      )
    );

    const { result } = renderTrends();

    await waitFor(() => {
      expect(result.current.hydration.isLoading).toBe(false);
    });

    expect(result.current.hydration.hydrationGoals.at(-1)).toBe(2200);
  });
});
