import { useQuery } from '@tanstack/react-query';
import {
  fetchActiveAiServiceSetting,
  type ActiveAiServiceSetting,
} from '../services/api/aiSettingsApi';
import { activeAiServiceSettingQueryKey } from './queryKeys';

export function useActiveAiServiceSetting(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};
  return useQuery<ActiveAiServiceSetting | null>({
    queryKey: activeAiServiceSettingQueryKey,
    queryFn: fetchActiveAiServiceSetting,
    // Override the global Infinity staleTime — the active setting can change
    // server-side (admin updates global config, user adds a provider in the
    // web app) without the app reloading. 5min trades freshness for the cost
    // of an extra request whenever the Photo segment is opened.
    staleTime: 1000 * 60 * 5,
    enabled,
  });
}
