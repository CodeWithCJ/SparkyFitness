import type { QueryClient } from '@tanstack/react-query';
import { exerciseHistoryResetQueryKey } from './queryKeys';

const dailySummaryQueryFamily = ['dailySummary'] as const;
const measurementsQueryFamily = ['measurements'] as const;
const measurementsRangeQueryFamily = ['measurementsRange'] as const;
const exerciseHistoryQueryFamily = ['exerciseHistory'] as const;

export function refreshHealthSyncCache(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: dailySummaryQueryFamily });
  void queryClient.invalidateQueries({ queryKey: measurementsQueryFamily });
  void queryClient.invalidateQueries({ queryKey: measurementsRangeQueryFamily });
  void queryClient.invalidateQueries({
    queryKey: exerciseHistoryQueryFamily,
    refetchType: 'none',
  });

  queryClient.removeQueries({ queryKey: exerciseHistoryQueryFamily, type: 'inactive' });
  queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
}
