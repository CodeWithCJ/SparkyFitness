import { renderHook, waitFor } from '@testing-library/react-native';
import { useExternalFoodSearch } from '../../src/hooks/useExternalFoodSearch';
import { externalFoodSearchQueryKey } from '../../src/hooks/queryKeys';
import { searchOpenFoodFacts, searchUsda } from '../../src/services/api/externalFoodSearchApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/externalFoodSearchApi', () => ({
  searchOpenFoodFacts: jest.fn(),
  searchUsda: jest.fn(),
}));

const mockSearchOpenFoodFacts = searchOpenFoodFacts as jest.MockedFunction<typeof searchOpenFoodFacts>;
const mockSearchUsda = searchUsda as jest.MockedFunction<typeof searchUsda>;

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
    mockSearchOpenFoodFacts.mockResolvedValue([
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
    ]);

    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'openfoodfacts'),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(mockSearchOpenFoodFacts).toHaveBeenCalledWith('chicken');
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
    mockSearchUsda.mockResolvedValue([
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
    ]);

    const { result } = renderHook(
      () => useExternalFoodSearch('chicken', 'usda', { providerId: 'provider-1' }),
      { wrapper: createQueryWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(mockSearchUsda).toHaveBeenCalledWith('chicken', 'provider-1');
      expect(result.current.searchResults).toHaveLength(1);
      expect(result.current.searchResults[0].source).toBe('usda');
    });
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
