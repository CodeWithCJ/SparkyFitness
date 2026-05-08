import { useQuery } from '@tanstack/react-query';
import { getActiveServerConfig, getAllServerConfigs, type ServerConfig } from '../services/storage';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { serverConfigsQueryKey } from './queryKeys';

interface ServerConfigsData {
  allConfigs: ServerConfig[];
  activeConfig: ServerConfig | null;
}

const EMPTY: ServerConfigsData = { allConfigs: [], activeConfig: null };

export function useServerConfigs() {
  const query = useQuery({
    queryKey: serverConfigsQueryKey,
    queryFn: async (): Promise<ServerConfigsData> => {
      const allConfigs = await getAllServerConfigs();
      const activeConfig = await getActiveServerConfig();
      return { allConfigs, activeConfig };
    },
  });

  useRefetchOnFocus(query.refetch);

  const data = query.data ?? EMPTY;
  return {
    allConfigs: data.allConfigs,
    activeConfig: data.activeConfig,
    refetch: query.refetch,
    isLoading: query.isLoading,
  };
}
