import { renderHook, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWaterIntakeMutation } from '../../src/hooks/useWaterIntakeMutation';
import { fetchWaterContainers, changeWaterIntake } from '../../src/services/api/measurementsApi';
import type { DailySummary } from '../../src/types/dailySummary';
import { dailySummaryQueryKey } from '../../src/hooks/queryKeys';

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchWaterContainers: jest.fn(),
  changeWaterIntake: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const mockFetchWaterContainers = fetchWaterContainers as jest.MockedFunction<typeof fetchWaterContainers>;
const mockChangeWaterIntake = changeWaterIntake as jest.MockedFunction<typeof changeWaterIntake>;

const primaryContainer = {
  id: 1,
  name: 'Glass',
  volume: 250,
  unit: 'ml',
  is_primary: true,
  servings_per_container: 1,
};

const makeSummary = (waterConsumed = 500): DailySummary => ({
  date: '2024-06-15',
  calorieGoal: 2000,
  caloriesConsumed: 1200,
  caloriesBurned: 300,
  activeCalories: 200,
  otherExerciseCalories: 100,
  exerciseMinutes: 30,
  exerciseMinutesGoal: 60,
  exerciseCaloriesGoal: 300,
  netCalories: 900,
  remainingCalories: 1100,
  protein: { consumed: 80, goal: 150 },
  carbs: { consumed: 200, goal: 250 },
  fat: { consumed: 50, goal: 70 },
  fiber: { consumed: 20, goal: 30 },
  waterConsumed,
  waterGoal: 2500,
  foodEntries: [],
  exerciseEntries: [],
});

describe('useWaterIntakeMutation', () => {
  let queryClient: QueryClient;
  const testDate = '2024-06-15';

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('isReady is false when containers have not loaded', () => {
    mockFetchWaterContainers.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
      wrapper: createWrapper(),
    });

    expect(result.current.isReady).toBe(false);
  });

  test('isReady is true when primary container is loaded', async () => {
    mockFetchWaterContainers.mockResolvedValue([primaryContainer]);

    const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
  });

  test('isReady is false when no container is primary', async () => {
    mockFetchWaterContainers.mockResolvedValue([
      { ...primaryContainer, is_primary: false },
    ]);

    const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchWaterContainers).toHaveBeenCalled();
    });

    expect(result.current.isReady).toBe(false);
  });

  test('increment shows alert when no primary container', async () => {
    mockFetchWaterContainers.mockResolvedValue([]);

    const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchWaterContainers).toHaveBeenCalled();
    });

    act(() => {
      result.current.increment();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'No primary water container configured on the server.'
    );
    expect(mockChangeWaterIntake).not.toHaveBeenCalled();
  });

  test('decrement shows alert when no primary container', async () => {
    mockFetchWaterContainers.mockResolvedValue([]);

    const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockFetchWaterContainers).toHaveBeenCalled();
    });

    act(() => {
      result.current.decrement();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'No primary water container configured on the server.'
    );
    expect(mockChangeWaterIntake).not.toHaveBeenCalled();
  });

  describe('with primary container loaded', () => {
    beforeEach(() => {
      mockFetchWaterContainers.mockResolvedValue([primaryContainer]);
    });

    test('increment calls changeWaterIntake with +1', async () => {
      mockChangeWaterIntake.mockResolvedValue({ id: '1', water_ml: 750, entry_date: testDate });

      const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async () => {
        result.current.increment();
      });

      await waitFor(() => {
        expect(mockChangeWaterIntake).toHaveBeenCalledWith({
          entryDate: testDate,
          changeDrinks: 1,
          containerId: 1,
        });
      });
    });

    test('decrement calls changeWaterIntake with -1', async () => {
      mockChangeWaterIntake.mockResolvedValue({ id: '1', water_ml: 250, entry_date: testDate });

      const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async () => {
        result.current.decrement();
      });

      await waitFor(() => {
        expect(mockChangeWaterIntake).toHaveBeenCalledWith({
          entryDate: testDate,
          changeDrinks: -1,
          containerId: 1,
        });
      });
    });

    test('optimistic update adjusts waterConsumed in cache', async () => {
      const summary = makeSummary(500);
      queryClient.setQueryData(dailySummaryQueryKey(testDate), summary);

      // Hold the mutation so we can check the optimistic state
      let resolveMutation: (value: { id: string; water_ml: number; entry_date: string }) => void;
      mockChangeWaterIntake.mockImplementation(
        () => new Promise((resolve) => { resolveMutation = resolve; })
      );

      const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      act(() => {
        result.current.increment();
      });

      // Check optimistic update applied
      await waitFor(() => {
        const cached = queryClient.getQueryData<DailySummary>(dailySummaryQueryKey(testDate));
        expect(cached?.waterConsumed).toBe(750); // 500 + 250 (container volume)
      });

      // Resolve with server truth
      await act(async () => {
        resolveMutation!({ id: '1', water_ml: 760, entry_date: testDate });
      });

      // Server truth overwrites optimistic value
      await waitFor(() => {
        const cached = queryClient.getQueryData<DailySummary>(dailySummaryQueryKey(testDate));
        expect(cached?.waterConsumed).toBe(760);
      });
    });

    test('server truth overwrites optimistic value on success', async () => {
      const summary = makeSummary(1000);
      queryClient.setQueryData(dailySummaryQueryKey(testDate), summary);

      mockChangeWaterIntake.mockResolvedValue({ id: '1', water_ml: 1300, entry_date: testDate });

      const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async () => {
        result.current.increment();
      });

      await waitFor(() => {
        const cached = queryClient.getQueryData<DailySummary>(dailySummaryQueryKey(testDate));
        expect(cached?.waterConsumed).toBe(1300);
      });
    });

    test('invalidates query on error', async () => {
      const summary = makeSummary(500);
      queryClient.setQueryData(dailySummaryQueryKey(testDate), summary);

      mockChangeWaterIntake.mockRejectedValue(new Error('Network error'));

      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      await act(async () => {
        result.current.increment();
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: dailySummaryQueryKey(testDate),
        });
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Failed to update water intake. Please try again.'
      );

      invalidateSpy.mockRestore();
    });

    test('optimistic decrement clamps to zero', async () => {
      const summary = makeSummary(100); // Less than container volume (250)
      queryClient.setQueryData(dailySummaryQueryKey(testDate), summary);

      let resolveMutation: (value: { id: string; water_ml: number; entry_date: string }) => void;
      mockChangeWaterIntake.mockImplementation(
        () => new Promise((resolve) => { resolveMutation = resolve; })
      );

      const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      act(() => {
        result.current.decrement();
      });

      // Optimistic should clamp to 0, not go negative
      await waitFor(() => {
        const cached = queryClient.getQueryData<DailySummary>(dailySummaryQueryKey(testDate));
        expect(cached?.waterConsumed).toBe(0);
      });

      await act(async () => {
        resolveMutation!({ id: '1', water_ml: 0, entry_date: testDate });
      });
    });

    test('rapid taps: each mutation sends to server', async () => {
      const summary = makeSummary(500);
      queryClient.setQueryData(dailySummaryQueryKey(testDate), summary);

      let callCount = 0;
      mockChangeWaterIntake.mockImplementation(async () => {
        callCount++;
        return { id: String(callCount), water_ml: 500 + callCount * 250, entry_date: testDate };
      });

      const { result } = renderHook(() => useWaterIntakeMutation({ date: testDate }), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isReady).toBe(true);
      });

      // Rapid taps
      await act(async () => {
        result.current.increment();
        result.current.increment();
        result.current.increment();
      });

      await waitFor(() => {
        expect(mockChangeWaterIntake).toHaveBeenCalledTimes(3);
      });
    });
  });
});
