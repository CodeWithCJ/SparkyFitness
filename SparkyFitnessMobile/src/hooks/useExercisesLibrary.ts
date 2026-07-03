import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { fetchExercisesPage } from '../services/api/exerciseApi';
import { exercisesLibraryQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';
import { useRefetchOnFocus } from './useRefetchOnFocus';

interface UseExercisesLibraryOptions {
  enabled?: boolean;
}

export function useExercisesLibrary(
  searchText: string,
  options?: UseExercisesLibraryOptions,
) {
  const { enabled = true } = options ?? {};
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(searchText.trim(), 300);
  const queryKey = exercisesLibraryQueryKey(debouncedSearch);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchExercisesPage({
        searchTerm: debouncedSearch,
        page: pageParam,
        pageSize: 20,
      }),
    enabled,
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    staleTime: 1000 * 60 * 5,
  });

  const exercises = useMemo(
    () => query.data?.pages.flatMap((page) => page.exercises) ?? [],
    [query.data?.pages],
  );

  // Reset rather than refetch: query.refetch() on an infinite query re-fetches
  // every cached page, so a user deep in the list would re-download pages 1..N
  // on every focus/pull-to-refresh. resetQueries drops the cache and re-fetches
  // page 1 only — same pattern as useFoodsLibrary / useExerciseHistory.
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
    // overlap with a focus/pull-to-refresh reset and leave gaps or duplicates.
    if (query.hasNextPage && !query.isFetching) {
      void query.fetchNextPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spreading `query` causes infinite re-renders; stable sub-properties are sufficient
  }, [query.fetchNextPage, query.hasNextPage, query.isFetching]);

  useRefetchOnFocus(refetch, enabled);

  return {
    exercises,
    isLoading: query.isLoading,
    isSearching: query.isFetching && !query.isFetchingNextPage,
    isError: query.isError && exercises.length === 0,
    isFetchNextPageError: query.isError && exercises.length > 0,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore,
    refetch,
  };
}
