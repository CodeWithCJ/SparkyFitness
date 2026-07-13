import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import { createFoodVariant, fetchFoodVariants, saveFood } from '../../src/services/api/foodsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));

jest.mock('../../src/services/api/foodsApi', () => ({
  createFoodVariant: jest.fn(),
  fetchFoodVariants: jest.fn(),
  saveFood: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockCreateFoodEntry = createFoodEntry as jest.MockedFunction<typeof createFoodEntry>;
const mockCreateFoodVariant =
  createFoodVariant as jest.MockedFunction<typeof createFoodVariant>;
const mockFetchFoodVariants =
  fetchFoodVariants as jest.MockedFunction<typeof fetchFoodVariants>;
const mockSaveFood = saveFood as jest.MockedFunction<typeof saveFood>;

describe('useAddFoodEntry', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    mockSaveFood.mockReset();
    mockCreateFoodVariant.mockReset();
    mockFetchFoodVariants.mockReset();
    mockFetchFoodVariants.mockResolvedValue([]);
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

  test('persists additional external provider variants before logging a saved external food', async () => {
    mockSaveFood.mockResolvedValue({
      id: 'food-1',
      name: 'Orange Juice',
      brand: 'Yazio',
      is_custom: false,
      default_variant: {
        id: 'default-variant',
        serving_size: 100,
        serving_unit: 'ml',
        calories: 45,
        protein: 1,
        carbs: 10,
        fat: 0,
      },
    } as any);
    mockFetchFoodVariants.mockResolvedValue([
      {
        id: 'default-variant',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'ml',
        calories: 45,
        protein: 1,
        carbs: 10,
        fat: 0,
      },
      {
        id: 'small-glass',
        food_id: 'food-1',
        serving_size: 200,
        serving_unit: 'glass.small',
        calories: 90,
        protein: 2,
        carbs: 20,
        fat: 0,
      },
    ] as any);
    mockCreateFoodVariant.mockResolvedValue({
      id: 'large-glass',
      food_id: 'food-1',
      serving_size: 250,
      serving_unit: 'glass.large',
      calories: 113,
      protein: 2,
      carbs: 25,
      fat: 0,
    } as any);
    mockCreateFoodEntry.mockResolvedValue({
      id: 'entry-1',
      food_id: 'food-1',
      variant_id: 'default-variant',
      meal_type: 'breakfast',
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'ml',
      entry_date: '2026-04-25',
      food_name: 'Orange Juice',
      brand_name: 'Yazio',
      serving_size: 100,
      serving_unit: 'ml',
      calories: 45,
      protein: 1,
      carbs: 10,
      fat: 0,
    });

    const { result } = renderHook(() => useAddFoodEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.addEntryAsync({
        saveFoodPayload: {
          name: 'Orange Juice',
          brand: 'Yazio',
          serving_size: 100,
          serving_unit: 'ml',
          calories: 45,
          protein: 1,
          carbs: 10,
          fat: 0,
        },
        externalVariants: [
          {
            serving_size: 100,
            serving_unit: 'ml',
            serving_description: '100 ml',
            calories: 45,
            protein: 1,
            carbs: 10,
            fat: 0,
          },
          {
            serving_size: 200,
            serving_unit: 'glass.small',
            serving_description: 'Small glass',
            calories: 90,
            protein: 2,
            carbs: 20,
            fat: 0,
          },
          {
            serving_size: 250,
            serving_unit: 'glass.large',
            serving_description: 'Large glass',
            calories: 113,
            protein: 2,
            carbs: 25,
            fat: 0,
          },
        ],
        createEntryPayload: {
          meal_type_id: 'meal-type-1',
          quantity: 1,
          unit: 'ml',
          entry_date: '2026-04-25',
        },
      });
    });

    expect(mockFetchFoodVariants).toHaveBeenCalledWith('food-1');
    expect(mockCreateFoodVariant).toHaveBeenCalledTimes(1);
    expect(mockCreateFoodVariant).toHaveBeenCalledWith(expect.objectContaining({
      food_id: 'food-1',
      serving_size: 250,
      serving_unit: 'glass.large',
      calories: 113,
      protein: 2,
      carbs: 25,
      fat: 0,
    }));
    expect(mockCreateFoodEntry).toHaveBeenCalledWith({
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'ml',
      entry_date: '2026-04-25',
      food_id: 'food-1',
      variant_id: 'default-variant',
    });
  });

  test('resolves the correct variant_id when user selects a non-default external serving', async () => {
    mockSaveFood.mockResolvedValue({
      id: 'food-1',
      name: 'Brezeln',
      brand: 'Yazio',
      is_custom: false,
      default_variant: {
        id: 'default-variant',
        serving_size: 100,
        serving_unit: 'g',
        calories: 249,
        protein: 6,
        carbs: 46,
        fat: 1,
      },
    } as any);
    // Simulate: persistExternalVariants fetches existing, finds only '100 g',
    // then creates the '1 Portion' variant.
    mockFetchFoodVariants
      .mockResolvedValueOnce([
        {
          id: 'default-variant',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 249,
          protein: 6,
          carbs: 46,
          fat: 1,
        },
      ] as any) // first call: persistExternalVariants fetches existing
      .mockResolvedValueOnce([
        {
          id: 'default-variant',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 249,
          protein: 6,
          carbs: 46,
          fat: 1,
        },
        {
          id: 'one-portion-variant',
          food_id: 'food-1',
          serving_size: 1,
          serving_unit: 'Portion',
          calories: 249,
          protein: 6,
          carbs: 46,
          fat: 1,
        },
      ] as any); // second call: resolveSelectedVariantId after persist
    mockCreateFoodEntry.mockResolvedValue({
      id: 'entry-1',
      food_id: 'food-1',
      variant_id: 'one-portion-variant',
      meal_type: 'breakfast',
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'Portion',
      entry_date: '2026-04-25',
      food_name: 'Brezeln',
      brand_name: 'Yazio',
      serving_size: 1,
      serving_unit: 'Portion',
      calories: 249,
      protein: 6,
      carbs: 46,
      fat: 1,
    });

    const { result } = renderHook(() => useAddFoodEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.addEntryAsync({
        saveFoodPayload: {
          name: 'Brezeln',
          brand: 'Yazio',
          serving_size: 1,
          serving_unit: 'Portion',
          calories: 249,
          protein: 6,
          carbs: 46,
          fat: 1,
        },
        externalVariants: [
          {
            serving_size: 100,
            serving_unit: 'g',
            serving_description: '100 g',
            calories: 249,
            protein: 6,
            carbs: 46,
            fat: 1,
          },
          {
            serving_size: 1,
            serving_unit: 'Portion',
            serving_description: '1 Portion',
            calories: 249,
            protein: 6,
            carbs: 46,
            fat: 1,
          },
        ],
        createEntryPayload: {
          meal_type_id: 'meal-type-1',
          quantity: 1,
          unit: 'Portion',
          entry_date: '2026-04-25',
        },
      });
    });

    // The hook should NOT use default-variant; it should resolve to 'one-portion-variant'
    expect(mockCreateFoodEntry).toHaveBeenCalledWith({
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'Portion',
      entry_date: '2026-04-25',
      food_id: 'food-1',
      variant_id: 'one-portion-variant',
    });
  });
});
