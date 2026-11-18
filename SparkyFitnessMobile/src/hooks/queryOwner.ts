import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * `useAuth` clears the cache when the account or server changes, so a write
 * whose cached query is gone by the time it answers was made for an account
 * that is no longer on screen: its answer must not be shown, and callers must
 * not act on it. Call it in `onMutate` and return it; `isCurrent` says whether
 * the query the write started on is still the cached one.
 */
export function startedOn(queryClient: QueryClient, queryKey: QueryKey) {
  const find = () =>
    queryClient.getQueryCache().find({ queryKey, exact: true });
  const startedFrom = find();
  return { isCurrent: () => find() === startedFrom };
}
