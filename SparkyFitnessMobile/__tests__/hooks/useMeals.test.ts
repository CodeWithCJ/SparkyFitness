import { renderHook, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import {
  useCreateMeal,
  useDeleteMeal,
  useMeal,
  useMeals,
  useRecentMeals,
  useUpdateMeal,
} from '../../src/hooks/useMeals';
import {
  mealDetailQueryKey,
  mealSearchQueryKeyRoot,
  mealsQueryKey,
  recentMealsQueryKey,
  recentMealsQueryKeyRoot,
} from '../../src/hooks/queryKeys';
import {
  createMeal,
  deleteMeal,
  fetchMeal,
  fetchMealDeletionImpact,
  fetchMeals,
  fetchRecentMeals,
  updateMeal,
} from '../../src/services/api/mealsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/mealsApi', () => ({
  createMeal: jest.fn(),
  deleteMeal: jest.fn(),
  fetchMeal: jest.fn(),
  fetchMealDeletionImpact: jest.fn(),
  fetchMeals: jest.fn(),
  fetchRecentMeals: jest.fn(),
  updateMeal: jest.fn(),
}));

const mockCreateMeal = createMeal as jest.MockedFunction<typeof createMeal>;
const mockDeleteMeal = deleteMeal as jest.MockedFunction<typeof deleteMeal>;
const mockFetchMeal = fetchMeal as jest.MockedFunction<typeof fetchMeal>;
const mockFetchMealDeletionImpact = fetchMealDeletionImpact as jest.MockedFunction<typeof fetchMealDeletionImpact>;
const mockFetchMeals = fetchMeals as jest.MockedFunction<typeof fetchMeals>;
const mockFetchRecentMeals = fetchRecentMeals as jest.MockedFunction<typeof fetchRecentMeals>;
const mockUpdateMeal = updateMeal as jest.MockedFunction<typeof updateMeal>;

const mealData = {
  id: 'meal-1',
  user_id: 'user-1',
  name: 'Overnight Oats',
  description: null,
  is_public: false,
  serving_size: 1,
  serving_unit: 'serving',
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
  foods: [],
};

describe('useMeals', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fetches meals on mount', async () => {
    mockFetchMeals.mockResolvedValue([]);

    renderHook(() => useMeals(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockFetchMeals).toHaveBeenCalled();
    });
  });

  test('returns meals array from response', async () => {
    const mealsData = [
      { id: 'meal-1', name: 'Overnight Oats', foods: [] },
      { id: 'meal-2', name: 'Protein Shake', foods: [] },
    ];
    mockFetchMeals.mockResolvedValue(mealsData);

    const { result } = renderHook(() => useMeals(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.meals).toEqual(mealsData);
    });
  });

  test('returns empty array when no data', () => {
    // No mock resolution — query is disabled or not yet resolved
    const { result } = renderHook(() => useMeals({ enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(result.current.meals).toEqual([]);
  });

  test('does not fetch when enabled is false', () => {
    renderHook(() => useMeals({ enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchMeals).not.toHaveBeenCalled();
  });

  test('returns isError on failure', async () => {
    mockFetchMeals.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useMeals(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  test('refetch triggers a new fetch', async () => {
    mockFetchMeals.mockResolvedValue([]);

    const { result } = renderHook(() => useMeals(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.meals).toEqual([]);
    });

    const updatedMeals = [{ id: 'meal-1', name: 'Updated Meal', foods: [] }];
    mockFetchMeals.mockResolvedValue(updatedMeals);

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.meals).toEqual(updatedMeals);
    });
  });

  describe('query key', () => {
    test('exports correct query key', () => {
      expect(mealsQueryKey).toEqual(['meals']);
    });
  });
});

describe('useMeal', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fetches a meal by id', async () => {
    mockFetchMeal.mockResolvedValue(mealData);

    const { result } = renderHook(() => useMeal('meal-1'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.meal).toEqual(mealData);
    });
    expect(mockFetchMeal).toHaveBeenCalledWith('meal-1');
  });

  test('does not fetch when enabled is false', () => {
    renderHook(() => useMeal('meal-1', { enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchMeal).not.toHaveBeenCalled();
  });
});

describe('meal mutations', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
    jest.restoreAllMocks();
  });

  test('create invalidates meal caches', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    mockCreateMeal.mockResolvedValue(mealData);

    const { result } = renderHook(() => useCreateMeal(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.createMeal({
        name: 'Overnight Oats',
        foods: [],
      });
    });

    await waitFor(() => {
      expect(mockCreateMeal).toHaveBeenCalled();
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mealsQueryKey });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: recentMealsQueryKeyRoot, refetchType: 'all' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mealSearchQueryKeyRoot });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mealDetailQueryKey('meal-1') });
  });

  test('update invalidates meal caches and calls onSuccess', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const onSuccess = jest.fn();
    mockUpdateMeal.mockResolvedValue(mealData);

    const { result } = renderHook(() => useUpdateMeal({ mealId: 'meal-1', onSuccess }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.updateMealAsync({ name: 'Overnight Oats' });
    });

    expect(mockUpdateMeal).toHaveBeenCalledWith('meal-1', { name: 'Overnight Oats' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mealDetailQueryKey('meal-1') });
    expect(onSuccess).toHaveBeenCalledWith(mealData);
  });

  test('delete checks impact, confirms, and invalidates meal caches', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFetchMealDeletionImpact.mockResolvedValue({
      usedByOtherUsers: false,
      usedByCurrentUser: true,
    });
    mockDeleteMeal.mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteMeal({ mealId: 'meal-1' }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.confirmAndDelete();
    });

    expect(mockFetchMealDeletionImpact).toHaveBeenCalledWith('meal-1');
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete Meal',
      expect.any(String),
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0][2]!;
    await act(async () => {
      buttons[1].onPress?.();
    });

    await waitFor(() => {
      expect(mockDeleteMeal).toHaveBeenCalledWith('meal-1');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: mealDetailQueryKey('meal-1') });
  });
});

describe('useRecentMeals', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fetches recent meals with the requested limit', async () => {
    mockFetchRecentMeals.mockResolvedValue([]);

    renderHook(() => useRecentMeals({ limit: 3 }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockFetchRecentMeals).toHaveBeenCalledWith(3);
    });
  });

  test('returns recent meals from the response', async () => {
    const mealsData = [{ id: 'meal-1', name: 'Overnight Oats', foods: [] }];
    mockFetchRecentMeals.mockResolvedValue(mealsData);

    const { result } = renderHook(() => useRecentMeals({ limit: 3 }), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.recentMeals).toEqual(mealsData);
    });
  });

  test('does not fetch when enabled is false', () => {
    renderHook(() => useRecentMeals({ enabled: false, limit: 3 }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchRecentMeals).not.toHaveBeenCalled();
  });

  describe('query key', () => {
    test('exports correct recent meals query key', () => {
      expect(recentMealsQueryKey(3)).toEqual(['recentMeals', 3]);
    });
  });
});
