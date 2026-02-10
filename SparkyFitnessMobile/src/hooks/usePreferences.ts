import { useQuery } from '@tanstack/react-query';
import { fetchPreferences } from '../services/api/preferencesApi';
import { preferencesQueryKey } from './queryKeys';

interface UsePreferencesOptions {
  enabled?: boolean;
}

export function usePreferences({ enabled = true }: UsePreferencesOptions = {}) {
  const query = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: fetchPreferences,
    staleTime: 1000 * 60 * 30, // 30 minutes - preferences rarely change
    enabled,
  });

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}