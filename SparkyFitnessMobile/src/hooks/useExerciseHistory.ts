import { useMemo, useCallback, useEffect, useRef } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExerciseSessionResponse } from '@workspace/shared';
import { fetchExerciseHistory } from '../services/api/exerciseApi';
import { exerciseHistoryQueryKey, exerciseHistoryResetQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

interface UseExerciseHistoryOptions {
  enabled?: boolean;
}

interface UseExerciseHistoryReturn {
  sessions: ExerciseSessionResponse[];
  isLoading: boolean;
  isLoadingMore: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  loadMore: () => void;
  hasMore: boolean;
}

export function useExerciseHistory(
  options: UseExerciseHistoryOptions = {},
): UseExerciseHistoryReturn {
  const { enabled = true } = options;
  const queryClient = useQueryClient();
  const lastResetTokenRef = useRef(0);

  const query = useInfiniteQuery({
    queryKey: exerciseHistoryQueryKey,
    queryFn: ({ pageParam }) => fetchExerciseHistory(pageParam),
    enabled,
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
  });

  const resetTokenQuery = useQuery({
    queryKey: exerciseHistoryResetQueryKey,
    queryFn: () => 0,
    initialData: 0,
    staleTime: Infinity,
  });

  const sessions = useMemo<ExerciseSessionResponse[]>(
    () => query.data?.pages.flatMap(page => page.sessions) ?? [],
    [query.data?.pages],
  );

  useEffect(() => {
    const resetToken = resetTokenQuery.data ?? 0;
    if (resetToken === lastResetTokenRef.current) return;

    lastResetTokenRef.current = resetToken;
    void queryClient.resetQueries({ queryKey: exerciseHistoryQueryKey, exact: true });
  }, [queryClient, resetTokenQuery.data]);

  const refetch = useCallback(async () => {
    try {
      await queryClient.resetQueries({ queryKey: exerciseHistoryQueryKey, exact: true });
    } catch {
      // Error state is captured by the useQuery hook — no need to rethrow.
      // Swallowing here prevents unhandled rejections from pull-to-refresh
      // and useRefetchOnFocus callers.
    }
  }, [queryClient]);

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetching) {
      void query.fetchNextPage();
    }
  }, [query]);

  useRefetchOnFocus(refetch, enabled);

  return {
    sessions,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error as Error | null,
    refetch,
    loadMore,
    hasMore: query.hasNextPage ?? false,
  };
}
