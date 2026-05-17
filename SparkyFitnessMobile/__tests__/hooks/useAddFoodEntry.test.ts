import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import { createFoodVariant, saveFood } from '../../src/services/api/foodsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));

jest.mock('../../src/services/api/foodsApi', () => ({
  createFoodVariant: jest.fn(),
  saveFood: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockCreateFoodEntry = createFoodEntry as jest.MockedFunction<typeof createFoodEntry>;
const mockCreateFoodVariant =
  createFoodVariant as jest.MockedFunction<typeof createFoodVariant>;
const mockSaveFood = saveFood as jest.MockedFunction<typeof saveFood>;

describe('useAddFoodEntry', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    mockSaveFood.mockReset();
    mockCreateFoodVariant.mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('invalidates recent meals when a meal entry is logged', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    mockCreateFoodEntry.mockResolvedValue({
      id: 'entry-1',
      meal_id: 'meal-1',
      meal_type: 'breakfast',
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'serving',
      entry_date: '2026-04-25',
      food_name: 'Overnight Oats',
      brand_name: null,
      serving_size: 1,
      serving_unit: 'serving',
      calories: 350,
      protein: 20,
      carbs: 40,
      fat: 10,
    });

    const { result } = renderHook(() => useAddFoodEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.addEntry({
        createEntryPayload: {
          meal_type_id: 'meal-type-1',
          meal_id: 'meal-1',
          quantity: 1,
          unit: 'serving',
          entry_date: '2026-04-25',
        },
      });
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['recentMeals'],
        refetchType: 'all',
      });
    });

    invalidateSpy.mockRestore();
  });

  test('does not invalidate recent meals for a standalone food entry', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    mockCreateFoodEntry.mockResolvedValue({
      id: 'entry-1',
      food_id: 'food-1',
      meal_type: 'breakfast',
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'serving',
      entry_date: '2026-04-25',
      food_name: 'Apple',
      brand_name: null,
      serving_size: 1,
      serving_unit: 'medium',
      calories: 95,
      protein: 1,
      carbs: 25,
      fat: 0,
    });

    const { result } = renderHook(() => useAddFoodEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });

    act(() => {
      result.current.addEntry({
        createEntryPayload: {
          meal_type_id: 'meal-type-1',
          food_id: 'food-1',
          variant_id: 'variant-1',
          quantity: 1,
          unit: 'medium',
          entry_date: '2026-04-25',
        },
      });
    });

    await waitFor(() => {
      expect(mockCreateFoodEntry).toHaveBeenCalled();
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['recentMeals'],
      refetchType: 'all',
    });

    invalidateSpy.mockRestore();
  });

  test('saves the food, creates the selected converted variant, and logs the entry with it', async () => {
    mockSaveFood.mockResolvedValue({
      id: 'food-1',
      name: 'Protein Bar',
      brand: 'Remote Brand',
      is_custom: false,
      default_variant: {
        id: 'default-variant',
        serving_size: 1,
        serving_unit: 'bar',
        calories: 200,
        protein: 20,
        carbs: 22,
        fat: 7,
      },
    } as any);
    mockCreateFoodVariant.mockResolvedValue({
      id: 'variant-oz',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'oz',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
    } as any);
    mockCreateFoodEntry.mockResolvedValue({
      id: 'entry-1',
      food_id: 'food-1',
      variant_id: 'variant-oz',
      meal_type: 'breakfast',
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'oz',
      entry_date: '2026-04-25',
      food_name: 'Protein Bar',
      brand_name: 'Remote Brand',
      serving_size: 1,
      serving_unit: 'oz',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
    });

    const { result } = renderHook(() => useAddFoodEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.addEntryAsync({
        saveFoodPayload: {
          name: 'Protein Bar',
          brand: 'Remote Brand',
          serving_size: 1,
          serving_unit: 'bar',
          calories: 200,
          protein: 20,
          carbs: 22,
          fat: 7,
        },
        saveThenCreateVariantPayload: {
          serving_size: 1,
          serving_unit: 'oz',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
        createEntryPayload: {
          meal_type_id: 'meal-type-1',
          quantity: 1,
          unit: 'oz',
          entry_date: '2026-04-25',
        },
      });
    });

    expect(mockSaveFood).toHaveBeenCalledWith({
      name: 'Protein Bar',
      brand: 'Remote Brand',
      serving_size: 1,
      serving_unit: 'bar',
      calories: 200,
      protein: 20,
      carbs: 22,
      fat: 7,
    });
    expect(mockCreateFoodVariant).toHaveBeenCalledWith({
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'oz',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
    });
    expect(mockCreateFoodEntry).toHaveBeenCalledWith({
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'oz',
      entry_date: '2026-04-25',
      food_id: 'food-1',
      variant_id: 'variant-oz',
    });
  });
});
