import { renderHook, waitFor } from '@testing-library/react-native';
import { useFoodSearch } from '../../src/hooks/useFoodSearch';
import { foodSearchQueryKey } from '../../src/hooks/queryKeys';
import { searchFoods } from '../../src/services/api/foodsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/foodsApi', () => ({
  searchFoods: jest.fn(),
}));

const mockSearchFoods = searchFoods as jest.MockedFunction<typeof searchFoods>;

describe('useFoodSearch', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('does not fetch when search text is empty', () => {
    renderHook(() => useFoodSearch(''), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockSearchFoods).not.toHaveBeenCalled();
  });

  test('does not fetch when search text is less than 2 characters', () => {
    renderHook(() => useFoodSearch('a'), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(mockSearchFoods).not.toHaveBeenCalled();
  });

  test('fetches when search text is 2+ characters', async () => {
    mockSearchFoods.mockResolvedValue({ foods: [], totalCount: 0 });

    renderHook(() => useFoodSearch('ch'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockSearchFoods).toHaveBeenCalledWith('ch');
    });
  });

  test('returns search results', async () => {
    const searchData = {
      foods: [
        {
          id: '1',
          name: 'Chicken Breast',
          brand: 'Generic',
          is_custom: false,
          default_variant: {
            serving_size: 100,
            serving_unit: 'g',
            calories: 165,
            protein: 31,
            carbs: 0,
            fat: 3.6,
          },
        },
      ],
      totalCount: 1,
    };
    mockSearchFoods.mockResolvedValue(searchData);

    const { result } = renderHook(() => useFoodSearch('chicken'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.searchResults).toEqual(searchData.foods);
    });
  });

  test('isSearchActive is false when under 2 characters', () => {
    const { result } = renderHook(() => useFoodSearch('a'), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(result.current.isSearchActive).toBe(false);
  });

  test('isSearchActive is true with 2+ characters', () => {
    mockSearchFoods.mockResolvedValue({ foods: [], totalCount: 0 });

    const { result } = renderHook(() => useFoodSearch('ab'), {
      wrapper: createQueryWrapper(queryClient),
    });

    expect(result.current.isSearchActive).toBe(true);
  });

  test('handles search errors', async () => {
    mockSearchFoods.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useFoodSearch('test'), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSearchError).toBe(true);
    });
  });

  test('trims whitespace from search text', async () => {
    mockSearchFoods.mockResolvedValue({ foods: [], totalCount: 0 });

    renderHook(() => useFoodSearch('  ch  '), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockSearchFoods).toHaveBeenCalledWith('ch');
    });
  });

  describe('query key', () => {
    test('exports correct query key function', () => {
      expect(foodSearchQueryKey('test')).toEqual(['foodSearch', 'test']);
    });
  });
});
