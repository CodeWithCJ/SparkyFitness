import { useQuery } from '@tanstack/react-query';
import { loadGlucoseContext } from '@workspace/shared';
import { apiCall } from '@/api/api';
import { useActiveUser } from '@/contexts/ActiveUserContext';

const readContext = <T>(path: string) =>
  apiCall<T>(path, { suppressErrorToast: true });
/** Caches account/day context separately from diary queries; mutations invalidate the full key family. */
export function useGlucoseContext(
  day: string,
  timezone: string,
  enabled = true
) {
  const { activeUserId } = useActiveUser();
  return useQuery({
    queryKey: ['glucoseContext', activeUserId, day, timezone],
    queryFn: () => loadGlucoseContext(readContext, day, timezone),
    staleTime: 30_000,
    enabled,
    refetchOnMount: 'always',
  });
}
