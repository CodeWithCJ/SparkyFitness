import { useMemo } from 'react';
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { searchExternalExercises } from '../services/api/externalExerciseSearchApi';
import { externalExerciseSearchQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';

export function useExternalExerciseSearch(
  searchText: string,
  providerType: string,
  options?: { enabled?: boolean; providerId?: string },
) {
  const { enabled = true, providerId } = options ?? {};
  const debouncedSearch = useDebounce(searchText.trim(), 600);
  const isSearchActive = debouncedSearch.length >= 3;

  const query = useInfiniteQuery({
    queryKey: externalExerciseSearchQueryKey(providerType, debouncedSearch, providerId),
    queryFn: async ({ pageParam }) => {
      if (!providerId) {
        return { items: [], pagination: { page: 1, pageSize: 0, totalCount: 0, hasMore: false } };
      }
      return searchExternalExercises(debouncedSearch, providerType, providerId, pageParam);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    enabled: isSearchActive && enabled,
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });

  const searchResults = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data?.pages],
  );
  const hasCurrentData = !query.isPlaceholderData && (query.data?.pages.length ?? 0) > 0;

  return {
    searchResults,
    isSearching: query.isFetching && !query.isFetchingNextPage,
    isSearchActive,
    isSearchError: query.isError && !hasCurrentData,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isFetchNextPageError: query.isError && hasCurrentData,
  };
}
