import { useQuery } from '@tanstack/react-query';
import {
  getActiveServerConfig,
  getAllServerConfigs,
  getSavedActiveServerConfigId,
  type ServerConfig,
} from '../services/storage';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { serverConfigsQueryKey } from './queryKeys';

interface ServerConfigsData {
  allConfigs: ServerConfig[];
  activeConfig: ServerConfig | null;
  /**
   * The stored id of the active server, read without the keychain: null only
   * when no saved server is active (none, or a stored id that names a server
   * no longer saved). `activeConfig` can be null while one is (its keychain or
   * keystore read failed), so code that acts on "no server" asks this.
   * Undefined while loading or after a failed read.
   */
  activeConfigId?: string | null;
}

const EMPTY: ServerConfigsData = {
  allConfigs: [],
  activeConfig: null,
  activeConfigId: undefined,
};

export function useServerConfigs() {
  const query = useQuery({
    queryKey: serverConfigsQueryKey,
    queryFn: async (): Promise<ServerConfigsData> => {
      const allConfigs = await getAllServerConfigs();
      const activeConfig = await getActiveServerConfig();
      const activeConfigId = await getSavedActiveServerConfigId();
      return { allConfigs, activeConfig, activeConfigId };
    },
  });

  useRefetchOnFocus(query.refetch);

  const data = query.data ?? EMPTY;
  return {
    allConfigs: data.allConfigs,
    activeConfig: data.activeConfig,
    activeConfigId: data.activeConfigId,
    refetch: query.refetch,
    isLoading: query.isLoading,
  };
}
