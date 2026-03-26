import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useDailySummary } from '../../src/hooks/useDailySummary';
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';
import { fetchDailyGoals } from '../../src/services/api/goalsApi';
import { fetchFoodEntries } from '../../src/services/api/foodEntriesApi';
import { fetchExerciseEntries } from '../../src/services/api/exerciseApi';
import { fetchWaterIntake } from '../../src/services/api/measurementsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/goalsApi', () => ({
  fetchDailyGoals: jest.fn(),
}));

jest.mock('../../src/services/api/foodEntriesApi', () => {
  const actual = jest.requireActual('../../src/services/api/foodEntriesApi');
  return {
    ...actual,
    fetchFoodEntries: jest.fn(),
  };
});

jest.mock('../../src/services/api/exerciseApi', () => {
  const actual = jest.requireActual('../../src/services/api/exerciseApi');
  return {
    ...actual,
    fetchExerciseEntries: jest.fn(),
  };
});

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchWaterIntake: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => {
    callback();
  }),
}));

const mockFetchDailyGoals = fetchDailyGoals as jest.MockedFunction<typeof fetchDailyGoals>;
const mockFetchFoodEntries = fetchFoodEntries as jest.MockedFunction<typeof fetchFoodEntries>;
const mockFetchExerciseEntries = fetchExerciseEntries as jest.MockedFunction<typeof fetchExerciseEntries>;
const mockFetchWaterIntake = fetchWaterIntake as jest.MockedFunction<typeof fetchWaterIntake>;

const emptyExerciseResponse = { sessions: [], stepCalories: 0 };

describe('useDailySummary', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWaterIntake.mockResolvedValue({ water_ml: 0 });
    mockFetchExerciseEntries.mockResolvedValue(emptyExerciseResponse);
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const testDate = '2024-06-15';

  describe('query behavior', () => {
    test('fetches goals, food entries, and exercise entries', async () => {
      mockFetchDailyGoals.mockResolvedValue({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 65,
        dietary_fiber: 30,
      });
      mockFetchFoodEntries.mockResolvedValue([]);

      renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(mockFetchDailyGoals).toHaveBeenCalledWith(testDate);
        expect(mockFetchFoodEntries).toHaveBeenCalledWith(testDate);
        expect(mockFetchExerciseEntries).toHaveBeenCalledWith(testDate);
      });
    });

    test('returns summary with calculated values', async () => {
      mockFetchDailyGoals.mockResolvedValue({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 65,
        dietary_fiber: 30,
      });
      // Real formula: (nutrient * quantity) / serving_size
      // e.g. calories: (500 * 2) / 1 = 1000
      mockFetchFoodEntries.mockResolvedValue([
        { id: '1', calories: 500, protein: 30, carbs: 50, fat: 15, dietary_fiber: 5, quantity: 2, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: testDate },
      ]);
      mockFetchExerciseEntries.mockResolvedValue({
        sessions: [
          { type: 'individual', id: '1', calories_burned: 200, exercise_snapshot: { name: 'Running' }, duration_minutes: 30 },
        ],
        stepCalories: 0,
      });

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
      mockFetchDailyGoals.mockResolvedValue({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 65,
        dietary_fiber: 30,
        water_goal_ml: 3000,
      });
      mockFetchFoodEntries.mockResolvedValue([]);
      mockFetchWaterIntake.mockResolvedValue({ water_ml: 1500 });

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
      mockFetchDailyGoals.mockResolvedValue({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 65,
        dietary_fiber: 30,
      });
      mockFetchFoodEntries.mockResolvedValue([]);
      mockFetchWaterIntake.mockResolvedValue({ water_ml: 750 });

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.summary?.waterConsumed).toBe(750);
      expect(result.current.summary?.waterGoal).toBe(2500);
    });

    test('gracefully handles water intake API failure', async () => {
      mockFetchDailyGoals.mockResolvedValue({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 65,
        dietary_fiber: 30,
      });
      mockFetchFoodEntries.mockResolvedValue([]);
      mockFetchWaterIntake.mockRejectedValue(new Error('Not Found'));

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.summary?.waterConsumed).toBe(0);
      expect(result.current.summary?.waterGoal).toBe(2500);
    });

    test('includes server-computed stepCalories from exercise entries response', async () => {
      mockFetchDailyGoals.mockResolvedValue({ calories: 2000, protein: 150, carbs: 200, fat: 65, dietary_fiber: 30 });
      mockFetchFoodEntries.mockResolvedValue([]);
      mockFetchExerciseEntries.mockResolvedValue({ sessions: [], stepCalories: 105 });

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.summary?.stepCalories).toBe(105);
    });

    test('calculates net and remaining calories correctly', async () => {
      mockFetchDailyGoals.mockResolvedValue({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 65,
        dietary_fiber: 30,
      });
      mockFetchFoodEntries.mockResolvedValue([
        { id: '1', calories: 800, protein: 40, carbs: 80, fat: 20, dietary_fiber: 10, quantity: 1, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: testDate },
      ]);
      mockFetchExerciseEntries.mockResolvedValue({
        sessions: [
          { type: 'individual', id: '1', calories_burned: 300, exercise_snapshot: { name: 'Running' }, duration_minutes: 45 },
        ],
        stepCalories: 0,
      });

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
      mockFetchDailyGoals.mockResolvedValue({
        calories: 0,
        protein: undefined,
        carbs: null,
        fat: 0,
        dietary_fiber: undefined,
        target_exercise_duration_minutes: 0,
        target_exercise_calories_burned: undefined,
        water_goal_ml: null,
      } as any);
      mockFetchFoodEntries.mockResolvedValue([]);
      mockFetchWaterIntake.mockResolvedValue({ water_ml: 0 });

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

      expect(mockFetchDailyGoals).not.toHaveBeenCalled();
    });
  });

  describe('refetch', () => {
    test('refetch updates data', async () => {
      mockFetchDailyGoals.mockResolvedValue({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 65,
        dietary_fiber: 30,
      });
      mockFetchFoodEntries.mockResolvedValue([
        { id: '1', calories: 500, protein: 30, carbs: 50, fat: 15, dietary_fiber: 5, quantity: 1, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: testDate },
      ]);

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createQueryWrapper(queryClient),
      });

      await waitFor(() => {
        expect(result.current.summary?.calorieGoal).toBe(2000);
      });

      // Update mocks to return different data
      mockFetchDailyGoals.mockResolvedValue({
        calories: 2500,
        protein: 180,
        carbs: 250,
        fat: 80,
        dietary_fiber: 35,
      });
      mockFetchFoodEntries.mockResolvedValue([
        { id: '1', calories: 500, protein: 30, carbs: 50, fat: 15, dietary_fiber: 5, quantity: 1, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: testDate },
      ]);

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
