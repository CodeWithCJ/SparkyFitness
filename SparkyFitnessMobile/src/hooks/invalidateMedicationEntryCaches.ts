import type { QueryClient } from '@tanstack/react-query';
import {
  medicationsRootQueryKey,
  medicationEntriesQueryKey,
  dailySummaryRootQueryKey,
} from './queryKeys';

/**
 * Everything that goes stale when a dose is logged, edited or undone.
 *
 * A supplement dose contributes its nutrient payload to the day's totals, so the daily
 * summary moves along with the entry lists. Mobile queries have an infinite stale time,
 * so a missed invalidation is not a brief flicker: the calorie ring and macro pills keep
 * showing pre-dose numbers until something else forces a refetch.
 *
 * Shared rather than inlined per mutation because the mutations are not the only caller.
 * A dose logged from an OS reminder never touches a React hook, so the rule has to live
 * somewhere a plain service can reach it. Prefix keys throughout, since a caller does not
 * necessarily know which date it moved.
 */
export function invalidateMedicationEntryCaches(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: medicationEntriesQueryKey() });
  void queryClient.invalidateQueries({ queryKey: medicationsRootQueryKey });
  void queryClient.invalidateQueries({ queryKey: dailySummaryRootQueryKey });
}
