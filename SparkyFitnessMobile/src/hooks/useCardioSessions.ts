import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCardioSessionsPage } from '../services/api/exerciseStatsApi';
import { cardioSessionsQueryKey } from './queryKeys';
import { usePreferences } from './usePreferences';
import { useTrendRangeBounds } from './useTrendRangeBounds';
import type { CustomRange, ReportRange } from '../utils/trendRange';

const PAGE_SIZE = 50;
const cardioSessionsFamily = ['cardioSessions'] as const;

export function useCardioSessions(
  range: ReportRange,
  enabled = true,
  custom?: CustomRange | null
) {
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const unitSystem =
    preferences?.default_distance_unit === 'miles' ? 'imperial' : 'metric';

  // Reset rather than refetch: refetching an infinite query re-requests every
  // loaded page, while a reset goes back to the first one.
  const refresh = useCallback(() => {
    if (!enabled) return;
    void queryClient.resetQueries({
      queryKey: cardioSessionsFamily,
      type: 'active',
    });
  }, [queryClient, enabled]);
  const { startDate, endDate } = useTrendRangeBounds(range, refresh, custom);

  const query = useInfiniteQuery({
    queryKey: cardioSessionsQueryKey(startDate, endDate, unitSystem),
    queryFn: ({ pageParam }) =>
      fetchCardioSessionsPage({
        startDate,
        endDate,
        page: pageParam,
        pageSize: PAGE_SIZE,
        unitSystem,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    enabled,
  });

  const sessions = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );

  return {
    sessions,
    distanceUnit:
      unitSystem === 'imperial' ? ('miles' as const) : ('km' as const),
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
