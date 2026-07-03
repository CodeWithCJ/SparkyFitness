import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchWorkoutPresetsPage,
  searchWorkoutPresets,
} from '../services/api/workoutPresetsApi';
import { workoutPresetsLibraryQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type { WorkoutPreset } from '../types/workoutPresets';

interface UseWorkoutPresetsLibraryOptions {
  enabled?: boolean;
}

const SEARCH_LIMIT = 50;
const MIN_SEARCH_LENGTH = 2;

export function useWorkoutPresetsLibrary(
  searchText: string,
  options?: UseWorkoutPresetsLibraryOptions,
) {
  const { enabled = true } = options ?? {};
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(searchText.trim(), 300);
  const isSearchActive = debouncedSearch.length >= MIN_SEARCH_LENGTH;

  // List and search live on distinct cache keys. If both observers pointed at
  // the same key (which would happen when debouncedSearch === ''), react-query
  // would attach an InfiniteQueryObserver and a regular QueryObserver to the
  // same Query, and the conflicting expectations about `data` shape crash
  // react-query inside hasNextPage/getNextPageParam ("Cannot read property
  // 'length' of undefined").
  const listQueryKey = useMemo(() => ['workoutPresetsLibraryList'] as const, []);
  const searchQueryKey = workoutPresetsLibraryQueryKey(debouncedSearch);

  const listQuery = useInfiniteQuery({
    queryKey: listQueryKey,
    queryFn: ({ pageParam }) =>
      fetchWorkoutPresetsPage({ page: pageParam, pageSize: 20 }),
    enabled: enabled && !isSearchActive,
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    staleTime: 1000 * 60 * 5,
  });

  const searchQuery = useQuery({
    queryKey: searchQueryKey,
    queryFn: () => searchWorkoutPresets(debouncedSearch, { limit: SEARCH_LIMIT }),
    enabled: enabled && isSearchActive,
    staleTime: 1000 * 60 * 5,
  });

  const presets: WorkoutPreset[] = useMemo(() => {
    if (isSearchActive) {
      return searchQuery.data ?? [];
    }
    return listQuery.data?.pages.flatMap((page) => page.presets) ?? [];
  }, [isSearchActive, searchQuery.data, listQuery.data?.pages]);

  // Reset rather than refetch: refetch() on the active infinite query re-fetches
  // every cached page. resetQueries drops the cache and re-fetches page 1 only —
  // same pattern as useFoodsLibrary / useExercisesLibrary. exact:true so we don't
  // accidentally drop the other library caches that share the prefix.
  const refetch = useCallback(async () => {
    const activeKey = isSearchActive ? searchQueryKey : listQueryKey;
    try {
      await queryClient.resetQueries({ queryKey: activeKey, exact: true });
    } catch {
      // Errors surface through the query's own isError state.
    }
  }, [queryClient, isSearchActive, listQueryKey, searchQueryKey]);

  const loadMore = useCallback(() => {
    if (isSearchActive) return;
    // Gate on isFetching (not just isFetchingNextPage) so pagination cannot
    // overlap with a focus/pull-to-refresh reset and leave gaps or duplicates.
    if (listQuery.hasNextPage && !listQuery.isFetching) {
      void listQuery.fetchNextPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- spreading `listQuery` causes infinite re-renders; stable sub-properties are sufficient
  }, [
    isSearchActive,
    listQuery.fetchNextPage,
    listQuery.hasNextPage,
    listQuery.isFetching,
  ]);

  useRefetchOnFocus(refetch, enabled);

  const activeQuery = isSearchActive ? searchQuery : listQuery;
  const isLoading = activeQuery.isLoading;
  const isFetching = activeQuery.isFetching;

  return {
    presets,
    isLoading,
    isSearching: isFetching && (isSearchActive || !listQuery.isFetchingNextPage),
    isError: activeQuery.isError && presets.length === 0,
    isFetchNextPageError: !isSearchActive && listQuery.isError && presets.length > 0,
    hasNextPage: !isSearchActive && (listQuery.hasNextPage ?? false),
    isFetchingNextPage: !isSearchActive && listQuery.isFetchingNextPage,
    loadMore,
    refetch,
  };
}
