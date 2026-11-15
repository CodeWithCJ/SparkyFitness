import type {
  InvalidateQueryFilters,
  QueryClient,
} from '@tanstack/react-query';
import {
  caffeineActiveQueryKey,
  caffeineActiveRootQueryKey,
} from './queryKeys';

/**
 * Refreshes the modeled intake curves (active caffeine) for one day, or for
 * every day without a date. They are built from food and drink entries, so
 * every write that adds, edits or removes one moves them.
 */
export async function invalidateIntakeKinetics(
  queryClient: QueryClient,
  date?: string,
  filters: Pick<InvalidateQueryFilters, 'refetchType'> = {}
): Promise<void> {
  const keys = date
    ? [caffeineActiveQueryKey(date)]
    : [caffeineActiveRootQueryKey];
  await Promise.all(
    keys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, ...filters })
    )
  );
}
