import { useQuery } from '@tanstack/react-query';
import { loadGlucoseContext } from '@workspace/shared';
import { apiFetch } from '../services/api/apiClient';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { glucoseContextQueryKeyRoot } from './queryKeys';

const readContext = <T>(path: string) =>
  apiFetch<T>({
    endpoint: `/api${path}`,
    serviceName: 'Glucose Context API',
    operation: 'fetch recorded context',
    logResponseBody: false,
  });
/** Refreshes independent context sources on focus without hiding successful layers on partial failure. */
export function useGlucoseContext(
  day: string,
  timezone: string,
  enabled = true
) {
  const query = useQuery({
    queryKey: [...glucoseContextQueryKeyRoot, day, timezone],
    queryFn: () => loadGlucoseContext(readContext, day, timezone),
    staleTime: 30_000,
    enabled,
  });
  useRefetchOnFocus(query.refetch, enabled);
  return query;
}
