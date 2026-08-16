import { renderHook, waitFor, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import { createFoodVariant, fetchFoodVariants, saveFood } from '../../src/services/api/foodsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';
import type { FoodVariantDetail } from '../../src/types/foods';

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

function makeStoredVariant(
  id: string,
  servingUnit: string,
  calories: number,
): FoodVariantDetail {
  return {
    id,
    food_id: 'food-1',
    serving_size: 1,
    serving_unit: servingUnit,
    calories,
    protein: 1,
    carbs: 10,
    fat: 1,
  } as FoodVariantDetail;
}

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

    // Second argument is the optional image payload — undefined when the
    // caller attached no photos, which keeps the request plain JSON.
    expect(mockSaveFood).toHaveBeenCalledWith(
      {
        name: 'Protein Bar',
        brand: 'Remote Brand',
        serving_size: 1,
        serving_unit: 'bar',
        calories: 200,
        protein: 20,
        carbs: 22,
        fat: 7,
      },
      undefined,
    );
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

  test('uses one unambiguous legacy variant for a described provider serving', async () => {
    mockSaveFood.mockResolvedValue({
      id: 'food-1',
      name: 'Legacy Food',
      default_variant: {
        id: 'default-variant',
        serving_size: 100,
        serving_unit: 'g',
      },
    } as unknown as Awaited<ReturnType<typeof saveFood>>);

    const storedVariants = [
      {
        id: 'default-variant',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 100,
        protein: 1,
        carbs: 10,
        fat: 1,
      },
      {
        id: 'legacy-serving',
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'serving',
        calories: 80,
        protein: 1,
        carbs: 8,
        fat: 1,
      },
    ] as Awaited<ReturnType<typeof fetchFoodVariants>>;
    mockFetchFoodVariants
      .mockResolvedValueOnce(storedVariants)
      .mockResolvedValueOnce(storedVariants);
    mockCreateFoodEntry.mockResolvedValue({
      id: 'entry-1',
      food_id: 'food-1',
      variant_id: 'legacy-serving',
      meal_type: 'breakfast',
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'serving',
      entry_date: '2026-04-25',
      food_name: 'Legacy Food',
      brand_name: null,
      serving_size: 1,
      serving_unit: 'serving',
      calories: 80,
      protein: 1,
      carbs: 8,
      fat: 1,
    });

    const { result } = renderHook(() => useAddFoodEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.addEntryAsync({
        saveFoodPayload: {
          name: 'Legacy Food',
          serving_size: 1,
          serving_unit: 'serving (80 g)',
          calories: 80,
          protein: 1,
          carbs: 8,
          fat: 1,
        },
        externalVariants: [
          {
            serving_size: 1,
            serving_unit: 'serving',
            serving_description: '1 serving (80 g)',
            calories: 80,
            protein: 1,
            carbs: 8,
            fat: 1,
          },
        ],
        createEntryPayload: {
          meal_type_id: 'meal-type-1',
          quantity: 1,
          unit: 'serving',
          entry_date: '2026-04-25',
        },
      });
    });

    expect(mockCreateFoodVariant).not.toHaveBeenCalled();
    expect(mockCreateFoodEntry).toHaveBeenCalledWith({
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'serving',
      entry_date: '2026-04-25',
      food_id: 'food-1',
      variant_id: 'legacy-serving',
    });
  });

  test.each([
    {
      failureKind: 'ambiguous legacy matches',
      variants: [
        makeStoredVariant('legacy-200', 'package', 100),
        makeStoredVariant('legacy-400', 'package', 200),
      ],
    },
    {
      failureKind: 'ambiguous exact matches',
      variants: [
        makeStoredVariant('package-400-a', 'package (400 g)', 200),
        makeStoredVariant('package-400-b', 'package (400 g)', 210),
      ],
    },
    {
      failureKind: 'a failed variant refresh',
      variants: null,
    },
  ])(
    'does not log after $failureKind with a mismatched default',
    async ({ variants }: { variants: FoodVariantDetail[] | null }) => {
      mockSaveFood.mockResolvedValue({
        id: 'food-1',
        name: 'Ambiguous Packages',
        default_variant: {
          id: 'default-variant',
          serving_size: 100,
          serving_unit: 'g',
        },
      } as unknown as Awaited<ReturnType<typeof saveFood>>);
      if (variants) {
        mockFetchFoodVariants.mockResolvedValue(variants);
      } else {
        mockFetchFoodVariants.mockRejectedValue(new Error('refresh failed'));
      }

      const { result } = renderHook(() => useAddFoodEntry(), {
        wrapper: createQueryWrapper(queryClient),
      });

      await act(async () => {
        await expect(
          result.current.addEntryAsync({
            saveFoodPayload: {
              name: 'Ambiguous Packages',
              brand: null,
              serving_size: 1,
              serving_unit: 'package (400 g)',
              calories: 200,
              protein: 2,
              carbs: 20,
              fat: 2,
            },
            createEntryPayload: {
              meal_type_id: 'meal-type-1',
              quantity: 1,
              unit: 'package (400 g)',
              entry_date: '2026-04-25',
            },
          }),
        ).rejects.toThrow(
          'Could not uniquely resolve the selected serving variant',
        );
      });

      expect(mockCreateFoodEntry).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(Toast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Failed to add food',
          text2: 'Choose a different serving.',
        });
      });
    },
  );

  test('uses an exact saved default to resolve multiple exact stored variants', async () => {
    mockSaveFood.mockResolvedValue({
      id: 'food-1',
      name: 'Duplicate Packages',
      default_variant: {
        id: 'package-400-default',
        serving_size: 1,
        serving_unit: 'package (400 g)',
      },
    } as unknown as Awaited<ReturnType<typeof saveFood>>);
    mockFetchFoodVariants.mockResolvedValue([
      makeStoredVariant('package-400-a', 'package (400 g)', 200),
      makeStoredVariant('package-400-b', 'package (400 g)', 210),
    ]);

    const { result } = renderHook(() => useAddFoodEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.addEntryAsync({
        saveFoodPayload: {
          name: 'Duplicate Packages',
          brand: null,
          serving_size: 1,
          serving_unit: 'package (400 g)',
          calories: 200,
          protein: 2,
          carbs: 20,
          fat: 2,
        },
        createEntryPayload: {
          meal_type_id: 'meal-type-1',
          quantity: 1,
          unit: 'package (400 g)',
          entry_date: '2026-04-25',
        },
      });
    });

    expect(mockCreateFoodEntry).toHaveBeenCalledWith({
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'package (400 g)',
      entry_date: '2026-04-25',
      food_id: 'food-1',
      variant_id: 'package-400-default',
    });
  });

  test('uses an exact saved default when the variant refresh fails', async () => {
    mockSaveFood.mockResolvedValue({
      id: 'food-1',
      name: 'Exact Package',
      default_variant: {
        id: 'package-400',
        serving_size: 1,
        serving_unit: 'package (400 g)',
      },
    } as unknown as Awaited<ReturnType<typeof saveFood>>);
    mockFetchFoodVariants.mockRejectedValue(new Error('refresh failed'));

    const { result } = renderHook(() => useAddFoodEntry(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.addEntryAsync({
        saveFoodPayload: {
          name: 'Exact Package',
          brand: null,
          serving_size: 1,
          serving_unit: 'package (400 g)',
          calories: 200,
          protein: 2,
          carbs: 20,
          fat: 2,
        },
        createEntryPayload: {
          meal_type_id: 'meal-type-1',
          quantity: 1,
          unit: 'package (400 g)',
          entry_date: '2026-04-25',
        },
      });
    });

    expect(mockCreateFoodEntry).toHaveBeenCalledWith({
      meal_type_id: 'meal-type-1',
      quantity: 1,
      unit: 'package (400 g)',
      entry_date: '2026-04-25',
      food_id: 'food-1',
      variant_id: 'package-400',
    });
  });
});
