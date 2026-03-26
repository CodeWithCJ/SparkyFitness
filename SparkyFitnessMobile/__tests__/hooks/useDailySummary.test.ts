import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useDailySummary } from '../../src/hooks/useDailySummary';
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';
import { fetchDailySummary } from '../../src/services/api/dailySummaryApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/dailySummaryApi', () => ({
  fetchDailySummary: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => {
    callback();
  }),
}));

const mockFetchDailySummary = fetchDailySummary as jest.MockedFunction<typeof fetchDailySummary>;

const makeGoals = (overrides = {}) => ({
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  water_goal_ml: 2500,
  saturated_fat: 20,
  polyunsaturated_fat: 10,
  monounsaturated_fat: 15,
  trans_fat: 0,
  cholesterol: 300,
  sodium: 2300,
  potassium: 3500,
  dietary_fiber: 30,
  sugars: 50,
  vitamin_a: 900,
  vitamin_c: 90,
  calcium: 1000,
  iron: 18,
  target_exercise_calories_burned: 300,
  target_exercise_duration_minutes: 30,
  protein_percentage: null,
  carbs_percentage: null,
  fat_percentage: null,
  breakfast_percentage: 25,
  lunch_percentage: 35,
  dinner_percentage: 30,
  snacks_percentage: 10,
  ...overrides,
});

const makeSummaryResponse = (overrides: Record<string, unknown> = {}) => ({
  goals: makeGoals(overrides.goals as Record<string, unknown>),
  foodEntries: (overrides.foodEntries ?? []) as any[],
  exerciseSessions: (overrides.exerciseSessions ?? []) as any[],
  waterIntake: (overrides.waterIntake ?? 0) as number,
});

describe('useDailySummary', () => {
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
    test('calls fetchDailySummary with the date', async () => {
      mockFetchDailySummary.mockResolvedValue(makeSummaryResponse());

      renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockFetchDailySummary).toHaveBeenCalledWith(testDate);
      });
    });

    test('returns summary with calculated values', async () => {
      mockFetchDailySummary.mockResolvedValue(makeSummaryResponse({
        foodEntries: [
          { id: '1', calories: 500, protein: 30, carbs: 50, fat: 15, dietary_fiber: 5, quantity: 2, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: testDate },
        ],
        exerciseSessions: [
          { type: 'individual', id: '1', calories_burned: 200, exercise_snapshot: { name: 'Running' }, duration_minutes: 30 },
        ],
      }));

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.summary).toBeDefined();
      expect(result.current.summary?.date).toBe(testDate);
      expect(result.current.summary?.calorieGoal).toBe(2000);
      expect(result.current.summary?.caloriesConsumed).toBe(1000);
      expect(result.current.summary?.protein.consumed).toBe(60);
      expect(result.current.summary?.carbs.consumed).toBe(100);
      expect(result.current.summary?.fat.consumed).toBe(30);
      expect(result.current.summary?.fiber.consumed).toBe(10);
      expect(result.current.summary?.caloriesBurned).toBe(200);
      expect(result.current.summary?.exerciseMinutes).toBe(30);
      expect(result.current.summary?.foodEntries).toHaveLength(1);
    });

    test('includes water intake from API', async () => {
      mockFetchDailySummary.mockResolvedValue(makeSummaryResponse({
        goals: { water_goal_ml: 3000 },
        waterIntake: 1500,
      }));

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.summary?.waterConsumed).toBe(1500);
      expect(result.current.summary?.waterGoal).toBe(3000);
    });

    test('defaults water goal to 2500 when not set in goals', async () => {
      mockFetchDailySummary.mockResolvedValue(makeSummaryResponse({
        goals: { water_goal_ml: null },
        waterIntake: 750,
      }));

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.summary?.waterConsumed).toBe(750);
      expect(result.current.summary?.waterGoal).toBe(2500);
    });

    test('calculates net and remaining calories correctly', async () => {
      mockFetchDailySummary.mockResolvedValue(makeSummaryResponse({
        foodEntries: [
          { id: '1', calories: 800, protein: 40, carbs: 80, fat: 20, dietary_fiber: 10, quantity: 1, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: testDate },
        ],
        exerciseSessions: [
          { type: 'individual', id: '1', calories_burned: 300, exercise_snapshot: { name: 'Running' }, duration_minutes: 45 },
        ],
      }));

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // netCalories = consumed - burned = 800 - 300 = 500
      expect(result.current.summary?.netCalories).toBe(500);
      // remainingCalories = goal - net = 2000 - 500 = 1500
      expect(result.current.summary?.remainingCalories).toBe(1500);
    });

  });

  describe('goal fallback defaults', () => {
    test('defaults falsy goal values to 0 and water_goal_ml to 2500', async () => {
      mockFetchDailySummary.mockResolvedValue(makeSummaryResponse({
        goals: {
          calories: 0,
          protein: undefined,
          carbs: null,
          fat: 0,
          dietary_fiber: undefined,
          target_exercise_duration_minutes: 0,
          target_exercise_calories_burned: undefined,
          water_goal_ml: null,
        },
        waterIntake: 0,
      }));

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.summary?.calorieGoal).toBe(0);
      expect(result.current.summary?.protein.goal).toBe(0);
      expect(result.current.summary?.carbs.goal).toBe(0);
      expect(result.current.summary?.fat.goal).toBe(0);
      expect(result.current.summary?.fiber.goal).toBe(0);
      expect(result.current.summary?.exerciseMinutesGoal).toBe(0);
      expect(result.current.summary?.exerciseCaloriesGoal).toBe(0);
      expect(result.current.summary?.waterConsumed).toBe(0);
      expect(result.current.summary?.waterGoal).toBe(2500);
    });
  });

  describe('options', () => {
    test('respects enabled option', () => {
      renderHook(() => useDailySummary({ date: testDate, enabled: false }), {
        wrapper: createQueryWrapper(queryClient),
      });

      expect(mockFetchDailySummary).not.toHaveBeenCalled();
    });
  });

  describe('refetch', () => {
    test('refetch updates data', async () => {
      mockFetchDailySummary.mockResolvedValue(makeSummaryResponse({
        foodEntries: [
          { id: '1', calories: 500, protein: 30, carbs: 50, fat: 15, dietary_fiber: 5, quantity: 1, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: testDate },
        ],
      }));

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.summary?.calorieGoal).toBe(2000);
      });

      // Update mock to return different data
      mockFetchDailySummary.mockResolvedValue(makeSummaryResponse({
        goals: { calories: 2500 },
        foodEntries: [
          { id: '1', calories: 500, protein: 30, carbs: 50, fat: 15, dietary_fiber: 5, quantity: 1, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: testDate },
        ],
      }));

      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.summary?.calorieGoal).toBe(2500);
      });
    });
  });

  describe('query key', () => {
    test('exports correct query key function', () => {
      expect(dailySummaryQueryKey('2024-06-15')).toEqual(['dailySummary', '2024-06-15']);
    });

    test('query key changes with date', () => {
      expect(dailySummaryQueryKey('2024-06-15')).not.toEqual(dailySummaryQueryKey('2024-06-16'));
    });
  });
});
