import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [page, setPage] = useState(1);
  const [sessions, setSessions] = useState<ExerciseSessionResponse[]>([]);
  const lastResetTokenRef = useRef(0);

  const query = useQuery({
    queryKey: [...exerciseHistoryQueryKey, page],
    queryFn: () => fetchExerciseHistory(page),
    enabled,
  });

  const resetTokenQuery = useQuery({
    queryKey: exerciseHistoryResetQueryKey,
    queryFn: () => 0,
    initialData: 0,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!query.data) return;
    if (page === 1) {
      setSessions(query.data.sessions);
    } else {
      setSessions(prev => [...prev, ...query.data.sessions]);
    }
  }, [query.data, page]);

  useEffect(() => {
    const resetToken = resetTokenQuery.data ?? 0;
    if (resetToken === lastResetTokenRef.current) return;

    lastResetTokenRef.current = resetToken;
    setPage(1);
    setSessions([]);
  }, [resetTokenQuery.data]);

  const refetch = useCallback(async () => {
    queryClient.removeQueries({ queryKey: exerciseHistoryQueryKey });
    setPage(1);
    try {
      const data = await queryClient.fetchQuery({
        queryKey: [...exerciseHistoryQueryKey, 1],
        queryFn: () => fetchExerciseHistory(1),
        staleTime: 0,
      });
      setSessions(data.sessions);
    } catch {
      // Error state is captured by the useQuery hook — no need to rethrow.
      // Swallowing here prevents unhandled rejections from pull-to-refresh
      // and useRefetchOnFocus callers.
    }
  }, [queryClient]);

  const loadMore = useCallback(() => {
    if (query.data?.pagination.hasMore && !query.isFetching) {
      setPage(prev => prev + 1);
    }
  }, [query.data?.pagination.hasMore, query.isFetching]);

  useRefetchOnFocus(refetch, enabled);

  return {
    sessions,
    isLoading: query.isLoading && page === 1,
    isLoadingMore: query.isFetching && page > 1,
    isError: query.isError,
    error: query.error,
    refetch,
    loadMore,
    hasMore: query.data?.pagination.hasMore ?? false,
  };
}
