import type {
  InvalidateQueryFilters,
  QueryClient,
} from '@tanstack/react-query';
import { addDays } from '@workspace/shared';
import {
  bloodAlcoholQueryKey,
  bloodAlcoholRootQueryKey,
  caffeineActiveQueryKey,
  caffeineActiveRootQueryKey,
} from './queryKeys';

/**
 * Refreshes the modeled intake curves (active caffeine, estimated blood
 * alcohol) for one day, or for every day without a date. Both are built from
 * the same food and drink entries, so every write that moves one moves the
 * other. A day's blood alcohol estimate also carries drinks over from the day
 * before, so a write on one day refreshes the next day's estimate too.
 */
export async function invalidateIntakeKinetics(
  queryClient: QueryClient,
  date?: string,
  filters: Pick<InvalidateQueryFilters, 'refetchType'> = {}
): Promise<void> {
  const keys = date
    ? [
        caffeineActiveQueryKey(date),
        bloodAlcoholQueryKey(date),
        bloodAlcoholQueryKey(addDays(date, 1)),
      ]
    : [caffeineActiveRootQueryKey, bloodAlcoholRootQueryKey];
  await Promise.all(
    keys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, ...filters })
    )
  );
}
