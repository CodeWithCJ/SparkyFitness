import type { QueryClient } from '@tanstack/react-query';
import {
  exerciseHistoryResetQueryKey,
  sleepDayQueryKeyRoot,
  sleepRangeQueryKeyRoot,
  vo2MaxRangeQueryKeyRoot,
} from './queryKeys';

const dailySummaryQueryFamily = ['dailySummary'] as const;
const measurementsQueryFamily = ['measurements'] as const;
const measurementsRangeQueryFamily = ['measurementsRange'] as const;
const exerciseHistoryQueryFamily = ['exerciseHistory'] as const;

export function refreshHealthSyncCache(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: dailySummaryQueryFamily });
  void queryClient.invalidateQueries({ queryKey: measurementsQueryFamily });
  void queryClient.invalidateQueries({
    queryKey: measurementsRangeQueryFamily,
  });
  // Sleep is uploaded by the same health-sync run. Default staleTime is Infinity,
  // so without this the diary keeps a partial observer payload until a process
  // restart (reload) refetches /api/sleep.
  void queryClient.invalidateQueries({ queryKey: sleepDayQueryKeyRoot });
  void queryClient.invalidateQueries({ queryKey: sleepRangeQueryKeyRoot });
  // VO2 max arrives in the same sync as a custom measurement.
  void queryClient.invalidateQueries({ queryKey: vo2MaxRangeQueryKeyRoot });
  void queryClient.invalidateQueries({
    queryKey: exerciseHistoryQueryFamily,
    refetchType: 'none',
  });

  queryClient.removeQueries({
    queryKey: exerciseHistoryQueryFamily,
    type: 'inactive',
  });
  queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
}
