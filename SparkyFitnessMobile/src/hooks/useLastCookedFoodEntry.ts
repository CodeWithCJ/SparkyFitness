import { useQuery } from '@tanstack/react-query';
import { fetchLastCookedFoodEntry } from '../services/api/foodEntriesApi';
import { lastCookedFoodEntryQueryKey } from './queryKeys';

/**
 * The person's last cooked entry of a food, for pre-filling "Weighed it
 * cooked" (#3534). Refetched each time the form opens, so a batch logged a
 * moment ago is the one offered.
 */
export function useLastCookedFoodEntry(
  foodId: string | undefined,
  enabled: boolean
) {
  return useQuery({
    queryKey: lastCookedFoodEntryQueryKey(foodId ?? ''),
    queryFn: () => fetchLastCookedFoodEntry(foodId!),
    enabled: enabled && !!foodId,
    staleTime: 0,
    // Only a convenience: a failure leaves the form without a pre-filled yield.
    retry: false,
  });
}
