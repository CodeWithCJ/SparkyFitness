import type { QueryClient } from '@tanstack/react-query';
import {
  glucoseContextQueryKeyRoot,
  dailySummaryQueryKey,
  dailySummaryRootQueryKey,
  familyCopySourceQueryKey,
  familyCopySourceRootQueryKey,
  fastingRootQueryKey,
  foodEntriesRangeRootQueryKey,
  foodsQueryKey,
  waterIntakeLogQueryKey,
} from './queryKeys';
import { invalidateIntakeKinetics } from './invalidateIntakeKinetics';

export function invalidateFoodCache(
  queryClient: QueryClient,
  entryDate?: string
) {
  void queryClient.invalidateQueries({ queryKey: glucoseContextQueryKeyRoot });
  if (entryDate) {
    void queryClient.invalidateQueries({
      queryKey: familyCopySourceQueryKey(entryDate),
      refetchType: 'all',
    });
    void queryClient.invalidateQueries({
      queryKey: dailySummaryQueryKey(entryDate),
      refetchType: 'all',
    });
    void invalidateIntakeKinetics(queryClient, entryDate, {
      refetchType: 'all',
    });
    void queryClient.invalidateQueries({
      queryKey: waterIntakeLogQueryKey(entryDate),
      refetchType: 'all',
    });
  } else {
    void queryClient.invalidateQueries({
      queryKey: familyCopySourceRootQueryKey,
      refetchType: 'all',
    });
    void queryClient.invalidateQueries({
      queryKey: dailySummaryRootQueryKey,
      refetchType: 'all',
    });
    void invalidateIntakeKinetics(queryClient, undefined, {
      refetchType: 'all',
    });
  }
  void queryClient.invalidateQueries({
    queryKey: [...foodsQueryKey],
  });
  void queryClient.invalidateQueries({
    queryKey: fastingRootQueryKey,
    refetchType: 'all',
  });
  // Nutrient trends read food entries over a range, so they must not show an
  // entry that was just edited or deleted.
  void queryClient.invalidateQueries({
    queryKey: foodEntriesRangeRootQueryKey,
    refetchType: 'all',
  });
}
