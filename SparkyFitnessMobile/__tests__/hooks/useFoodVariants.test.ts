import { renderHook, waitFor } from '@testing-library/react-native';
import { useFoodVariants } from '../../src/hooks/useFoodVariants';
import { foodVariantsQueryKey } from '../../src/hooks/queryKeys';
import { fetchFoodVariants } from '../../src/services/api/foodsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/foodsApi', () => ({
  fetchFoodVariants: jest.fn(),
}));

const mockFetchFoodVariants = fetchFoodVariants as jest.MockedFunction<typeof fetchFoodVariants>;

describe('useFoodVariants', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fetches variants on mount', async () => {
    mockFetchFoodVariants.mockResolvedValue([]);

    renderHook(() => useFoodVariants('food-1'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockFetchFoodVariants).toHaveBeenCalledWith('food-1');
    });
  });

  test('returns variants data', async () => {
    const variantsData = [
      {
        id: 'variant-1',
        food_id: 'food-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 165,
        protein: 31,
        carbs: 0,
        fat: 3.6,
      },
      {
        id: 'variant-2',
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'piece',
        calories: 55,
        protein: 10,
        carbs: 0,
        fat: 1.2,
      },
    ];
    mockFetchFoodVariants.mockResolvedValue(variantsData);

    const { result } = renderHook(() => useFoodVariants('food-1'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.variants).toEqual(variantsData);
    });
  });

  test('does not fetch when enabled is false', () => {
    renderHook(() => useFoodVariants('food-1', { enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockFetchFoodVariants).not.toHaveBeenCalled();
  });

  test('returns isLoading while fetching', async () => {
    let resolveVariants: (value: unknown[]) => void;
    mockFetchFoodVariants.mockReturnValue(
      new Promise((resolve) => {
        resolveVariants = resolve;
      }),
    );

    const { result } = renderHook(() => useFoodVariants('food-1'), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);

    resolveVariants!([]);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  test('returns isError on failure', async () => {
    mockFetchFoodVariants.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useFoodVariants('food-1'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });

  describe('query key', () => {
    test('uses correct query key for a food id', () => {
      expect(foodVariantsQueryKey('food-1')).toEqual(['foodVariants', 'food-1']);
    });
  });
});
