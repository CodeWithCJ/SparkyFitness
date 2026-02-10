import { useQuery } from '@tanstack/react-query';
import { checkServerConnection } from '../services/api/healthDataApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { serverConnectionQueryKey } from './queryKeys';

export function useServerConnection(options?: { enablePolling?: boolean }) {
  const { enablePolling = false } = options ?? {};

  const query = useQuery({
    queryKey: serverConnectionQueryKey,
    queryFn: checkServerConnection,
    refetchInterval: enablePolling ? 60 * 1000 : false,
    refetchIntervalInBackground: false,
  });

  useRefetchOnFocus(query.refetch);

  return {
    isConnected: query.data ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
