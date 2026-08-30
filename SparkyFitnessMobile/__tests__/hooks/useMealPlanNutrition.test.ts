import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMealPlanNutrition } from '../../src/hooks/useMealPlanNutrition';
import { fetchFoodVariants } from '../../src/services/api/foodsApi';
import type { MealPlanDraftAssignment } from '../../src/types/mealPlans';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/foodsApi', () => ({
  fetchFoodVariants: jest.fn(),
}));

const mockFetchFoodVariants = fetchFoodVariants as jest.MockedFunction<typeof fetchFoodVariants>;

const fractionalMeal = {
  id: 'meal-1',
  user_id: 'user-1',
  name: 'Fractional meal',
  description: null,
  is_public: false,
  serving_size: 300,
  serving_unit: 'g',
  total_servings: 3,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  foods: [{
    id: 'meal-food-1',
    food_id: 'food-1',
    variant_id: 'variant-1',
    quantity: 100,
    unit: 'g',
    food_name: 'Ingredient',
    brand: null,
    serving_size: 100,
    serving_unit: 'g',
    calories: 100,
    protein: 10,
    carbs: 20,
    fat: 5,
  }],
};

describe('useMealPlanNutrition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('hydrates an existing web food assignment with its selected variant', async () => {
    mockFetchFoodVariants.mockResolvedValue([
      {
        id: 'variant-default',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 100,
        protein: 1,
        carbs: 20,
        fat: 1,
        is_default: true,
      },
      {
        id: 'variant-planned',
        food_id: 'food-1',
        serving_size: 40,
        serving_unit: 'g',
        calories: 150,
        protein: 5,
        carbs: 27,
        fat: 3,
      },
    ]);
    const assignment: MealPlanDraftAssignment = {
      item_type: 'food',
      day_of_week: 1,
      meal_type_id: 'breakfast',
      food_id: 'food-1',
      variant_id: 'variant-planned',
      quantity: 80,
      unit: 'g',
    };
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => useMealPlanNutrition([assignment], []),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetchFoodVariants).toHaveBeenCalledWith('food-1');
    expect(result.current.resolveNutrition(assignment)).toEqual({
      servingSize: 40,
      calories: 150,
      protein: 5,
      carbs: 27,
      fat: 3,
    });
  });

  test('does not substitute a default variant when the requested variant is missing', async () => {
    mockFetchFoodVariants.mockResolvedValue([{
      id: 'variant-default',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 100,
      protein: 1,
      carbs: 20,
      fat: 1,
      is_default: true,
    }]);
    const assignment: MealPlanDraftAssignment = {
      item_type: 'food',
      day_of_week: 1,
      meal_type_id: 'breakfast',
      food_id: 'food-1',
      variant_id: 'variant-deleted',
      quantity: 80,
      unit: 'g',
    };
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => useMealPlanNutrition([assignment], []),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.resolveNutrition(assignment)).toBeUndefined();
  });

  test('does not enter a hydration state for food assignments that already have a nutrition snapshot', () => {
    mockFetchFoodVariants.mockReturnValue(
      new Promise<Awaited<ReturnType<typeof fetchFoodVariants>>>(() => undefined),
    );
    const assignment: MealPlanDraftAssignment = {
      item_type: 'food',
      day_of_week: 1,
      meal_type_id: 'breakfast',
      food_id: 'food-1',
      variant_id: 'variant-1',
      quantity: 80,
      unit: 'g',
      nutrition: {
        servingSize: 40,
        calories: 150,
        protein: 5,
        carbs: 27,
        fat: 3,
      },
    };
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => useMealPlanNutrition([assignment], []),
      { wrapper: createQueryWrapper(queryClient) },
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.resolveNutrition(assignment)).toEqual(assignment.nutrition);
  });

  test('preserves fractional per-serving nutrition when hydrating a saved meal assignment', () => {
    const assignment: MealPlanDraftAssignment = {
      item_type: 'meal',
      day_of_week: 1,
      meal_type_id: 'breakfast',
      meal_id: 'meal-1',
      quantity: 300,
      unit: 'g',
    };
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => useMealPlanNutrition([assignment], [fractionalMeal]),
      { wrapper: createQueryWrapper(queryClient) },
    );

    const nutrition = result.current.resolveNutrition(assignment);
    expect(nutrition?.calories).toBeCloseTo(33.333333);
    expect(nutrition?.protein).toBeCloseTo(3.333333);
    expect(nutrition?.carbs).toBeCloseTo(6.666667);
    expect(nutrition?.fat).toBeCloseTo(1.666667);
  });

  test('surfaces variant-query failures and allows retry', async () => {
    mockFetchFoodVariants
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([]);
    const assignment: MealPlanDraftAssignment = {
      item_type: 'food',
      day_of_week: 1,
      meal_type_id: 'breakfast',
      food_id: 'food-1',
      variant_id: 'variant-1',
      quantity: 80,
      unit: 'g',
    };
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => useMealPlanNutrition([assignment], []),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(mockFetchFoodVariants).toHaveBeenCalledTimes(2);
  });
});
