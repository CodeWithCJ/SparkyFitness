import { useQuery } from '@tanstack/react-query';
import { fetchUserAiConfigAllowed } from '../services/api/aiSettingsApi';
import { userAiConfigAllowedQueryKey } from './queryKeys';

export function useUserAiConfigAllowed(options?: {
  enabled?: boolean;
  staleTime?: number;
}) {
  const { enabled = true, staleTime = 1000 * 60 * 5 } = options ?? {};
  return useQuery<boolean>({
    queryKey: userAiConfigAllowedQueryKey,
    queryFn: fetchUserAiConfigAllowed,
    staleTime,
    enabled,
  });
}
