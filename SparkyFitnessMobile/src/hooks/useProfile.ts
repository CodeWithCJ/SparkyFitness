import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProfile, saveTargetWeight } from '../services/api/profileApi';
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

/** Saves or clears the goal weight (kg) and refreshes the profile and its charts. */
export function useSetTargetWeight() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (targetWeightKg: number | null) =>
      saveTargetWeight(targetWeightKg),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: profileQueryKey }),
  });

  return {
    saveTargetWeight: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
