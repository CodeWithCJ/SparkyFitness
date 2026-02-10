import { useQuery } from '@tanstack/react-query';
import { fetchProfile } from '../services/api/profileApi';
import { profileQueryKey } from './queryKeys';

export function useProfile() {
  const query = useQuery({
    queryKey: profileQueryKey,
    queryFn: fetchProfile,
    staleTime: 1000 * 60 * 30, // 30 minutes - profile rarely changes
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
