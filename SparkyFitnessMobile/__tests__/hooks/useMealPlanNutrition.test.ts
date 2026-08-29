import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMealPlanNutrition } from '../../src/hooks/useMealPlanNutrition';
import { fetchFoodVariants } from '../../src/services/api/foodsApi';
import type { MealPlanDraftAssignment } from '../../src/types/mealPlans';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/foodsApi', () => ({
  fetchFoodVariants: jest.fn(),
}));

const mockFetchFoodVariants = fetchFoodVariants as jest.MockedFunction<typeof fetchFoodVariants>;

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
