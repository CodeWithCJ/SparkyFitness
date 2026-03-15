import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useDebounce } from './useDebounce';

export function useDebouncedSearch<T>({
  searchText,
  queryKey,
  queryFn,
  enabled = true,
}: {
  searchText: string;
  queryKey: (term: string) => readonly unknown[];
  queryFn: (term: string) => Promise<T[]>;
  enabled?: boolean;
}) {
  const debouncedSearch = useDebounce(searchText.trim(), 300);
  const isSearchActive = debouncedSearch.length >= 2;

  const query = useQuery({
    queryKey: queryKey(debouncedSearch),
    queryFn: () => queryFn(debouncedSearch),
    enabled: isSearchActive && enabled,
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });

  return {
    searchResults: query.data ?? [],
    isSearching: query.isFetching,
    isSearchActive,
    isSearchError: query.isError,
  };
}
