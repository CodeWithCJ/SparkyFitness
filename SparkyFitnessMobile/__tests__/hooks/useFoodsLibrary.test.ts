import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useFoodsLibrary } from '../../src/hooks/useFoodsLibrary';
import { fetchFoodsPage } from '../../src/services/api/foodsApi';
import { createTestQueryClient, createQueryWrapper, type QueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/foodsApi', () => ({
  fetchFoodsPage: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => {
    callback();
  }),
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

  it('does not fetch when enabled is false', async () => {
    const { result } = renderHook(() => useFoodsLibrary('', { enabled: false }), {
      wrapper: createQueryWrapper(queryClient),
    });

    // Give react-query a tick to flush any would-be fetch.
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetchFoodsPage).not.toHaveBeenCalled();
    expect(result.current.foods).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('surfaces isError on initial fetch failure and exposes refetch', async () => {
    mockFetchFoodsPage.mockRejectedValueOnce(new Error('Network down'));

    const { result } = renderHook(() => useFoodsLibrary(''), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // First-page failure → no foods accumulated, isFetchNextPageError stays false.
    expect(result.current.foods).toEqual([]);
    expect(result.current.isFetchNextPageError).toBe(false);

    mockFetchFoodsPage.mockResolvedValueOnce({
      foods: [createFood('1', 'Apple')],
      pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
    });

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.foods).toHaveLength(1);
      expect(result.current.isError).toBe(false);
    });
  });

  it('flags next-page failures via isFetchNextPageError while keeping loaded foods', async () => {
    mockFetchFoodsPage.mockResolvedValueOnce({
      foods: [createFood('1', 'Apple')],
      pagination: { page: 1, pageSize: 20, totalCount: 40, hasMore: true },
    });

    const { result } = renderHook(() => useFoodsLibrary(''), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.foods).toHaveLength(1);
      expect(result.current.hasNextPage).toBe(true);
    });

    mockFetchFoodsPage.mockRejectedValueOnce(new Error('Timeout'));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.isFetchNextPageError).toBe(true);
    });

    // Initial-page data survives a next-page failure, and the "initial load failed"
    // flag stays off so the UI shows the footer retry rather than a full-screen error.
    expect(result.current.foods).toHaveLength(1);
    expect(result.current.isError).toBe(false);
  });

  it('refetch resets the infinite query to page 1 instead of re-fetching every cached page', async () => {
    mockFetchFoodsPage
      .mockResolvedValueOnce({
        foods: [createFood('1', 'Apple')],
        pagination: { page: 1, pageSize: 20, totalCount: 40, hasMore: true },
      })
      .mockResolvedValueOnce({
        foods: [createFood('2', 'Banana')],
        pagination: { page: 2, pageSize: 20, totalCount: 40, hasMore: false },
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
      expect(result.current.foods).toHaveLength(2);
    });

    // After reset, only the freshly fetched page 1 should remain (pages 1..N
    // must NOT all re-download — that's the point of using resetQueries rather
    // than query.refetch() on an infinite query).
    mockFetchFoodsPage.mockResolvedValue({
      foods: [createFood('3', 'Cherry')],
      pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
    });

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.foods).toHaveLength(1);
      expect(result.current.foods[0].id).toBe('3');
    });
  });

  it('does not fire loadMore again while a next-page fetch is already in flight', async () => {
    mockFetchFoodsPage.mockResolvedValueOnce({
      foods: [createFood('1', 'Apple')],
      pagination: { page: 1, pageSize: 20, totalCount: 40, hasMore: true },
    });

    const { result } = renderHook(() => useFoodsLibrary(''), {
      wrapper: createQueryWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.foods).toHaveLength(1);
    });

    // Stall page-2 so we can observe loadMore being called again mid-fetch.
    let resolvePage2: (() => void) | undefined;
    mockFetchFoodsPage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage2 = () => resolve({
            foods: [createFood('2', 'Banana')],
            pagination: { page: 2, pageSize: 20, totalCount: 40, hasMore: false },
          });
        }),
    );

    act(() => {
      result.current.loadMore();
    });

    // Wait for the hook to re-render with isFetchingNextPage=true so the next
    // loadMore call sees the gated closure (synchronous back-to-back calls in
    // a single act block would share the stale closure and bypass the gate).
    await waitFor(() => {
      expect(result.current.isFetchingNextPage).toBe(true);
    });

    expect(mockFetchFoodsPage).toHaveBeenCalledTimes(2);

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });

    // The in-flight page 2 call stays the only page-2 request — the extra
    // loadMore calls are swallowed by the isFetching gate.
    expect(mockFetchFoodsPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvePage2?.();
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
