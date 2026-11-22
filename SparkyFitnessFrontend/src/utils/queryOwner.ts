import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Notes the cached query a write starts from, so its answer can tell whether
 * that query is still the one on screen. useAuth clears the cache when another
 * account (or profile) takes over, and a write whose query is gone by the time
 * it answers was made for someone no longer on screen: neither its answer nor
 * anything a caller does with it may be shown. Return it from `onMutate`.
 */
export function startedOn(queryClient: QueryClient, queryKey: QueryKey) {
  const find = () =>
    queryClient.getQueryCache().find({ queryKey, exact: true });
  const startedFrom = find();
  return { isCurrent: () => find() === startedFrom };
}
