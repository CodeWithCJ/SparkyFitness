import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useFoodsLibrary } from '../../src/hooks/useFoodsLibrary';
import { fetchFoodsPage } from '../../src/services/api/foodsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/foodsApi', () => ({
  fetchFoodsPage: jest.fn(),
}));

const mockFetchFoodsPage = fetchFoodsPage as jest.MockedFunction<typeof fetchFoodsPage>;

function createFood(id: string, name: string) {
  return {
    id,
    name,
    brand: null,
    is_custom: false,
    default_variant: {
      id: `variant-${id}`,
      serving_size: 1,
      serving_unit: 'cup',
      calories: 100,
      protein: 1,
      carbs: 2,
      fat: 3,
    },
  };
}

describe('useFoodsLibrary', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetches the first page when the search text is empty', async () => {
    mockFetchFoodsPage.mockResolvedValue({
      foods: [createFood('1', 'Apple')],
      pagination: {
        page: 1,
        pageSize: 20,
        totalCount: 1,
        hasMore: false,
      },
    });

    const { result } = renderHook(() => useFoodsLibrary(''), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mockFetchFoodsPage).toHaveBeenCalledWith({
        searchTerm: '',
        page: 1,
        itemsPerPage: 20,
        sortBy: 'name:asc',
      });
    });

    await waitFor(() => {
      expect(result.current.foods).toHaveLength(1);
      expect(result.current.foods[0].name).toBe('Apple');
    });
  });

  it('loads more foods and appends the next page', async () => {
    mockFetchFoodsPage
      .mockResolvedValueOnce({
        foods: [createFood('1', 'Apple')],
        pagination: {
          page: 1,
          pageSize: 20,
          totalCount: 2,
          hasMore: true,
        },
      })
      .mockResolvedValueOnce({
        foods: [createFood('2', 'Banana')],
        pagination: {
          page: 2,
          pageSize: 20,
          totalCount: 2,
          hasMore: false,
        },
      });

    const { result } = renderHook(() => useFoodsLibrary(''), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.foods).toHaveLength(1);
    });

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(mockFetchFoodsPage).toHaveBeenNthCalledWith(2, {
        searchTerm: '',
        page: 2,
        itemsPerPage: 20,
        sortBy: 'name:asc',
      });
    });

    await waitFor(() => {
      expect(result.current.foods).toHaveLength(2);
    });
  });

  it('resets back to page 1 when the search text changes', async () => {
    mockFetchFoodsPage
      .mockResolvedValueOnce({
        foods: [createFood('1', 'Apple')],
        pagination: {
          page: 1,
          pageSize: 20,
          totalCount: 1,
          hasMore: false,
        },
      })
      .mockResolvedValueOnce({
        foods: [createFood('2', 'Banana')],
        pagination: {
          page: 1,
          pageSize: 20,
          totalCount: 1,
          hasMore: false,
        },
      });

    const { rerender } = renderHook(
      ({ searchText }) => useFoodsLibrary(searchText),
      {
        initialProps: { searchText: '' },
        wrapper: createQueryWrapper(queryClient),
      },
    );

    await waitFor(() => {
      expect(mockFetchFoodsPage).toHaveBeenCalledWith({
        searchTerm: '',
        page: 1,
        itemsPerPage: 20,
        sortBy: 'name:asc',
      });
    });

    rerender({ searchText: 'banana' });

    await waitFor(() => {
      expect(mockFetchFoodsPage).toHaveBeenLastCalledWith({
        searchTerm: 'banana',
        page: 1,
        itemsPerPage: 20,
        sortBy: 'name:asc',
      });
    });
  });
});
