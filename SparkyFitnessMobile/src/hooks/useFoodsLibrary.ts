import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchFoodsPage } from '../services/api/foodsApi';
import { foodsLibraryQueryKey } from './queryKeys';
import { useDebounce } from './useDebounce';

interface UseFoodsLibraryOptions {
  enabled?: boolean;
}

export function useFoodsLibrary(
  searchText: string,
  options?: UseFoodsLibraryOptions,
) {
  const { enabled = true } = options ?? {};
  const debouncedSearch = useDebounce(searchText.trim(), 300);

  const query = useInfiniteQuery({
    queryKey: foodsLibraryQueryKey(debouncedSearch),
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

  return {
    foods,
    isLoading: query.isLoading,
    isSearching: query.isFetching && !query.isFetchingNextPage,
    isError: query.isError && foods.length === 0,
    isFetchNextPageError: query.isError && foods.length > 0,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetching) {
        void query.fetchNextPage();
      }
    },
    refetch: query.refetch,
  };
}
