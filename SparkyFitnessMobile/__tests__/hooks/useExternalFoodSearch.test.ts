import { renderHook, waitFor } from '@testing-library/react-native';
import { useExternalFoodSearch } from '../../src/hooks/useExternalFoodSearch';
import { externalFoodSearchQueryKey } from '../../src/hooks/queryKeys';
import { searchOpenFoodFacts, searchUsda, searchFatSecret, searchMealie } from '../../src/services/api/externalFoodSearchApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';
import type { PaginatedExternalFoodSearchResult } from '../../src/types/externalFoods';

jest.mock('../../src/services/api/externalFoodSearchApi', () => ({
  searchOpenFoodFacts: jest.fn(),
  searchUsda: jest.fn(),
  searchFatSecret: jest.fn(),
  searchMealie: jest.fn(),
}));

const mockSearchOpenFoodFacts = searchOpenFoodFacts as jest.MockedFunction<typeof searchOpenFoodFacts>;
const mockSearchUsda = searchUsda as jest.MockedFunction<typeof searchUsda>;
const mockSearchFatSecret = searchFatSecret as jest.MockedFunction<typeof searchFatSecret>;
const mockSearchMealie = searchMealie as jest.MockedFunction<typeof searchMealie>;

function makePaginatedResult(
  items: PaginatedExternalFoodSearchResult['items'],
  pagination?: Partial<PaginatedExternalFoodSearchResult['pagination']>,
): PaginatedExternalFoodSearchResult {
  return {
    items,
    pagination: {
      page: 1,
      pageSize: 20,
      totalCount: items.length,
      hasMore: false,
      ...pagination,
    },
  };
}

describe('useExternalFoodSearch', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('does not fetch when search text is less than 3 characters', () => {
    renderHook(() => useExternalFoodSearch('ab', 'openfoodfacts'), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockSearchOpenFoodFacts).not.toHaveBeenCalled();
  });

  test('does not fetch when enabled is false', () => {
    renderHook(
      () => useExternalFoodSearch('chicken', 'openfoodfacts', { enabled: false }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    expect(mockSearchOpenFoodFacts).not.toHaveBeenCalled();
  });

  test('fetches for openfoodfacts provider type', async () => {
    mockSearchOpenFoodFacts.mockResolvedValue(
      makePaginatedResult([
        {
          id: '1',
          name: 'Chicken',
          brand: null,
          calories: 165,
          protein: 31,
          carbs: 0,
          fat: 4,
          serving_size: 100,
          serving_unit: 'g',
          source: 'openfoodfacts',
        },
      ]),
    );

    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'openfoodfacts'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(mockSearchOpenFoodFacts).toHaveBeenCalledWith('chicken', 1);
      expect(result.current.searchResults).toHaveLength(1);
    });
  });

  test('returns empty array for unsupported provider type', async () => {
    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'unknown_provider'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.searchResults).toEqual([]);
    });

    expect(mockSearchOpenFoodFacts).not.toHaveBeenCalled();
  });

  test('isSearchActive is false when under 3 characters', () => {
    const { result } = renderHook(
      () => useExternalFoodSearch('ab', 'openfoodfacts'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    expect(result.current.isSearchActive).toBe(false);
  });

  test('handles search errors', async () => {
    mockSearchOpenFoodFacts.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(
      () => useExternalFoodSearch('test', 'openfoodfacts'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.isSearchError).toBe(true);
    });
  });

  test('reports usda as a supported provider', () => {
    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'usda'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    expect(result.current.isProviderSupported).toBe(true);
  });

  test('fetches for usda provider type with providerId', async () => {
    mockSearchUsda.mockResolvedValue(
      makePaginatedResult([
        {
          id: '100',
          name: 'Chicken Breast',
          brand: null,
          calories: 165,
          protein: 31,
          carbs: 0,
          fat: 4,
          serving_size: 100,
          serving_unit: 'g',
          source: 'usda',
        },
      ]),
    );

    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'usda', { providerId: 'provider-1' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(mockSearchUsda).toHaveBeenCalledWith('chicken', 'provider-1', 1);
      expect(result.current.searchResults).toHaveLength(1);
      expect(result.current.searchResults[0].source).toBe('usda');
    });
  });

  test('exposes hasNextPage and fetchNextPage', async () => {
    mockSearchOpenFoodFacts.mockResolvedValue(
      makePaginatedResult(
        [
          {
            id: '1',
            name: 'Food A',
            brand: null,
            calories: 100,
            protein: 10,
            carbs: 10,
            fat: 5,
            serving_size: 100,
            serving_unit: 'g',
            source: 'openfoodfacts',
          },
        ],
        { page: 1, hasMore: true, totalCount: 2 },
      ),
    );

    const { result } = renderHook(
      () => useExternalFoodSearch('food', 'openfoodfacts'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.searchResults).toHaveLength(1);
      expect(result.current.hasNextPage).toBe(true);
    });
  });

  test('flattens results from multiple pages', async () => {
    mockSearchOpenFoodFacts
      .mockResolvedValueOnce(
        makePaginatedResult(
          [
            {
              id: '1',
              name: 'Food A',
              brand: null,
              calories: 100,
              protein: 10,
              carbs: 10,
              fat: 5,
              serving_size: 100,
              serving_unit: 'g',
              source: 'openfoodfacts',
            },
          ],
          { page: 1, hasMore: true, totalCount: 2 },
        ),
      )
      .mockResolvedValueOnce(
        makePaginatedResult(
          [
            {
              id: '2',
              name: 'Food B',
              brand: null,
              calories: 200,
              protein: 20,
              carbs: 20,
              fat: 10,
              serving_size: 100,
              serving_unit: 'g',
              source: 'openfoodfacts',
            },
          ],
          { page: 2, hasMore: false, totalCount: 2 },
        ),
      );

    const { result } = renderHook(
      () => useExternalFoodSearch('food', 'openfoodfacts'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.searchResults).toHaveLength(1);
      expect(result.current.hasNextPage).toBe(true);
    });

    result.current.fetchNextPage();

    await waitFor(() => {
      expect(result.current.searchResults).toHaveLength(2);
      expect(result.current.searchResults[0].name).toBe('Food A');
      expect(result.current.searchResults[1].name).toBe('Food B');
      expect(result.current.hasNextPage).toBe(false);
    });
  });

  test('fetches for fatsecret provider type with providerId', async () => {
    mockSearchFatSecret.mockResolvedValue(
      makePaginatedResult([
        {
          id: 'fs-1',
          name: 'Chicken',
          brand: null,
          calories: 165,
          protein: 31,
          carbs: 0,
          fat: 4,
          serving_size: 100,
          serving_unit: 'g',
          source: 'fatsecret',
        },
      ]),
    );

    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'fatsecret', { providerId: 'provider-fs' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(mockSearchFatSecret).toHaveBeenCalledWith('chicken', 'provider-fs', 1);
      expect(result.current.searchResults).toHaveLength(1);
      expect(result.current.searchResults[0].source).toBe('fatsecret');
    });
  });

  test('fetches for mealie provider type with providerId', async () => {
    mockSearchMealie.mockResolvedValue(
      makePaginatedResult([
        {
          id: 'mealie-1',
          name: 'Chicken Soup',
          brand: null,
          calories: 180,
          protein: 15,
          carbs: 12,
          fat: 7,
          serving_size: 250,
          serving_unit: 'ml',
          source: 'mealie',
        },
      ]),
    );

    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'mealie', { providerId: 'provider-mealie' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(mockSearchMealie).toHaveBeenCalledWith('chicken', 'provider-mealie', 1);
      expect(result.current.searchResults).toHaveLength(1);
      expect(result.current.searchResults[0].source).toBe('mealie');
    });
  });

  test('fatsecret returns empty when no providerId', async () => {
    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'fatsecret'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.searchResults).toEqual([]);
    });

    expect(mockSearchFatSecret).not.toHaveBeenCalled();
  });

  test('mealie returns empty when no providerId', async () => {
    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'mealie'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.searchResults).toEqual([]);
    });

    expect(mockSearchMealie).not.toHaveBeenCalled();
  });

  test('reports fatsecret as a supported provider', () => {
    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'fatsecret'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    expect(result.current.isProviderSupported).toBe(true);
  });

  test('reports mealie as a supported provider', () => {
    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'mealie'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    expect(result.current.isProviderSupported).toBe(true);
  });

  describe('query key', () => {
    test('includes provider type and search term', () => {
      expect(externalFoodSearchQueryKey('openfoodfacts', 'banana')).toEqual([
        'externalFoodSearch',
        'openfoodfacts',
        'banana',
        undefined,
      ]);
    });

    test('includes providerId when supplied', () => {
      expect(externalFoodSearchQueryKey('usda', 'chicken', 'provider-1')).toEqual([
        'externalFoodSearch',
        'usda',
        'chicken',
        'provider-1',
      ]);
    });
  });
});
