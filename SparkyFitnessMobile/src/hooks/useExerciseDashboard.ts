import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchExerciseDashboard } from '../services/api/reportsApi';
import { exerciseDashboardQueryKey } from './queryKeys';
import { useTrendRangeBounds } from './useTrendRangeBounds';
import type { CustomRange, ReportRange } from '../utils/trendRange';

const exerciseDashboardFamily = ['exerciseDashboard'] as const;

export function useExerciseDashboard(
  range: ReportRange,
  custom?: CustomRange | null
) {
  const queryClient = useQueryClient();
  // Refetches whichever range is on screen.
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: exerciseDashboardFamily,
      refetchType: 'active',
    });
  }, [queryClient]);
  const { startDate, endDate } = useTrendRangeBounds(range, refresh, custom);

  const query = useQuery({
    queryKey: exerciseDashboardQueryKey(startDate, endDate),
    queryFn: () => fetchExerciseDashboard(startDate, endDate),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
