import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFoodsPage } from '../services/api/foodsApi';
import { foodsLibraryQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';
import { useRefetchOnFocus } from './useRefetchOnFocus';

interface UseFoodsLibraryOptions {
  enabled?: boolean;
}

export function useFoodsLibrary(
  searchText: string,
  options?: UseFoodsLibraryOptions,
) {
  const { enabled = true } = options ?? {};
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(searchText.trim(), 300);
  const queryKey = foodsLibraryQueryKey(debouncedSearch);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchFoodsPage({
        searchTerm: debouncedSearch,
        page: pageParam,
        itemsPerPage: 20,
        sortBy: 'name:asc',
      }),
    enabled,
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    staleTime: 1000 * 60 * 5,
  });

  const foods = useMemo(
    () => query.data?.pages.flatMap((page) => page.foods) ?? [],
    [query.data?.pages],
  );

  // Reset rather than refetch: query.refetch() on an infinite query re-fetches
  // every cached page, so a user deep in the list would re-download pages 1..N
  // on every focus/pull-to-refresh. resetQueries drops the cache and re-fetches
  // page 1 only — same pattern as useExerciseHistory.
  const refetch = useCallback(async () => {
    try {
      await queryClient.resetQueries({ queryKey, exact: true });
    } catch {
      // Errors surface through the query's own isError state; swallowing here
      // prevents unhandled rejections from pull-to-refresh and focus callers.
    }
  }, [queryClient, queryKey]);

  const loadMore = useCallback(() => {
    // Gate on isFetching (not just isFetchingNextPage) so pagination cannot
    // overlap with a focus/pull-to-refresh reset — infinite queries share one
    // cache entry, and overlapping fetches can cancel each other and leave
    // gaps or duplicates in the list.
    if (query.hasNextPage && !query.isFetching) {
      void query.fetchNextPage();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- spreading `query` causes infinite re-renders; stable sub-properties are sufficient
  }, [query.fetchNextPage, query.hasNextPage, query.isFetching]);

  useRefetchOnFocus(refetch, enabled);

  return {
    foods,
    isLoading: query.isLoading,
    isSearching: query.isFetching && !query.isFetchingNextPage,
    isError: query.isError && foods.length === 0,
    isFetchNextPageError: query.isError && foods.length > 0,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore,
    refetch,
  };
}
