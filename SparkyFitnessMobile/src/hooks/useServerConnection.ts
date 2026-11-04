import { useQuery } from '@tanstack/react-query';
import { checkServerConnection } from '../services/api/healthDataApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { useServerConfigs } from './useServerConfigs';
import { serverConnectionQueryKey } from './queryKeys';

/**
 * - `loading`: the first check, or the server configs, are still loading.
 * - `notConfigured`: no active server is set up.
 * - `unreachable`: a server is set up but the check failed (offline,
 *   restarting, timeout, 401, 429, 5xx).
 * - `connected`: the server answered the identity check.
 */
export type ServerConnectionStatus =
  'loading' | 'notConfigured' | 'unreachable' | 'connected';

export function useServerConnection(options?: { enablePolling?: boolean }) {
  const { enablePolling = false } = options ?? {};

  const query = useQuery({
    queryKey: serverConnectionQueryKey,
    queryFn: checkServerConnection,
    refetchInterval: enablePolling ? 60 * 1000 : false,
    refetchIntervalInBackground: false,
  });
  // The check alone returns false both with no server set up and with one that
  // does not answer, so the stored config tells the two apart (#3385).
  const { activeConfig, isLoading: isConfigLoading } = useServerConfigs();

  useRefetchOnFocus(query.refetch);

  const isLoading = query.isLoading || isConfigLoading;
  const isConnected = query.data ?? false;
  const status: ServerConnectionStatus = isConnected
    ? 'connected'
    : isLoading
      ? 'loading'
      : activeConfig?.url
        ? 'unreachable'
        : 'notConfigured';

  return {
    status,
    isConnected,
    isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: query.refetch,
  };
}
