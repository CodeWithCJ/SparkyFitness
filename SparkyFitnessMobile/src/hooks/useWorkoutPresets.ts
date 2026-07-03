import { useQuery } from '@tanstack/react-query';
import { fetchWorkoutPresets } from '../services/api/workoutPresetsApi';
import { workoutPresetsQueryKey } from './queryKeys';

export function useWorkoutPresets(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const query = useQuery({
    queryKey: workoutPresetsQueryKey,
    queryFn: fetchWorkoutPresets,
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled,
  });

  return {
    presets: query.data?.presets ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
