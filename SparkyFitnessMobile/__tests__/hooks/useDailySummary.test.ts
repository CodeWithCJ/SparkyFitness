import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useDailySummary } from '../../src/hooks/useDailySummary';
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';
import { fetchDailyGoals } from '../../src/services/api/goalsApi';
import { fetchFoodEntries } from '../../src/services/api/foodEntriesApi';
import { fetchExerciseEntries } from '../../src/services/api/exerciseApi';
import { fetchWaterIntake } from '../../src/services/api/measurementsApi';

jest.mock('../../src/services/api/goalsApi', () => ({
  fetchDailyGoals: jest.fn(),
}));

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  fetchFoodEntries: jest.fn(),
  calculateCaloriesConsumed: jest.fn((entries) => entries.reduce((sum: number, e: { calories: number }) => sum + e.calories, 0)),
  calculateProtein: jest.fn((entries) => entries.reduce((sum: number, e: { protein: number }) => sum + e.protein, 0)),
  calculateCarbs: jest.fn((entries) => entries.reduce((sum: number, e: { carbs: number }) => sum + e.carbs, 0)),
  calculateFat: jest.fn((entries) => entries.reduce((sum: number, e: { fat: number }) => sum + e.fat, 0)),
  calculateFiber: jest.fn((entries) => entries.reduce((sum: number, e: { dietary_fiber: number }) => sum + e.dietary_fiber, 0)),
}));

jest.mock('../../src/services/api/exerciseApi', () => ({
  fetchExerciseEntries: jest.fn(),
  calculateCaloriesBurned: jest.fn((entries) => entries.reduce((sum: number, e: { calories_burned: number }) => sum + e.calories_burned, 0)),
  calculateActiveCalories: jest.fn((entries) => entries
    .filter((e: { exercise_snapshot?: { name: string } }) => e.exercise_snapshot?.name === 'Active Calories')
    .reduce((sum: number, e: { calories_burned: number }) => sum + e.calories_burned, 0)),
  calculateOtherExerciseCalories: jest.fn((entries) => entries
    .filter((e: { exercise_snapshot?: { name: string } }) => e.exercise_snapshot?.name !== 'Active Calories')
    .reduce((sum: number, e: { calories_burned: number }) => sum + e.calories_burned, 0)),
  calculateExerciseDuration: jest.fn((entries) => entries
    .filter((e: { exercise_snapshot?: { name: string } }) => e.exercise_snapshot?.name !== 'Active Calories')
    .reduce((sum: number, e: { duration_minutes?: number }) => sum + (e.duration_minutes ?? 0), 0)),
}));

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

describe('useDailySummary', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    Wrapper.displayName = 'QueryClientProviderWrapper';
    return Wrapper;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWaterIntake.mockResolvedValue({ water_ml: 0 });
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
    test('fetches goals, food entries, and exercise entries', async () => {
      mockFetchDailyGoals.mockResolvedValue({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 65,
        dietary_fiber: 30,
      });
      mockFetchFoodEntries.mockResolvedValue([]);
      mockFetchExerciseEntries.mockResolvedValue([]);

      renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createWrapper(),
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
      mockFetchFoodEntries.mockResolvedValue([
        { id: '1', calories: 500, protein: 30, carbs: 50, fat: 15, dietary_fiber: 5, quantity: 1, serving_size: 1, meal_type: 'lunch', unit: 'g', entry_date: testDate },
      ]);
      mockFetchExerciseEntries.mockResolvedValue([
        { id: '1', calories_burned: 200 },
      ]);

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.summary).toBeDefined();
      expect(result.current.summary?.date).toBe(testDate);
      expect(result.current.summary?.calorieGoal).toBe(2000);
      expect(result.current.summary?.foodEntries).toHaveLength(1);
      expect(result.current.summary?.foodEntries[0].id).toBe('1');
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
      mockFetchExerciseEntries.mockResolvedValue([]);
      mockFetchWaterIntake.mockResolvedValue({ water_ml: 1500 });

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createWrapper(),
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
      mockFetchExerciseEntries.mockResolvedValue([]);
      mockFetchWaterIntake.mockResolvedValue({ water_ml: 750 });

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createWrapper(),
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
      mockFetchExerciseEntries.mockResolvedValue([]);
      mockFetchWaterIntake.mockRejectedValue(new Error('Not Found'));

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.summary?.waterConsumed).toBe(0);
      expect(result.current.summary?.waterGoal).toBe(2500);
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
      mockFetchExerciseEntries.mockResolvedValue([
        { id: '1', calories_burned: 300 },
      ]);

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createWrapper(),
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

  describe('options', () => {
    test('respects enabled option', async () => {
      mockFetchDailyGoals.mockResolvedValue({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 65,
        dietary_fiber: 30,
      });
      mockFetchFoodEntries.mockResolvedValue([]);
      mockFetchExerciseEntries.mockResolvedValue([]);

      renderHook(() => useDailySummary({ date: testDate, enabled: false }), {
        wrapper: createWrapper(),
      });

      // Wait a bit to ensure no fetch occurs
      await new Promise((resolve) => setTimeout(resolve, 50));

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
      mockFetchExerciseEntries.mockResolvedValue([]);

      const { result } = renderHook(() => useDailySummary({ date: testDate }), {
        wrapper: createWrapper(),
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
