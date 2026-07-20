import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listTestEntries, createTestEntry, deleteTestEntry } from '../services/api/cycleApi';
import { cycleTestsQueryKey, cycleFertilityQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type { SharedCycleTestEntry } from '@workspace/shared';

export function useCycleTests(startDate: string, endDate: string) {
  const query = useQuery<SharedCycleTestEntry[]>({
    queryKey: [...cycleTestsQueryKey, startDate, endDate],
    queryFn: () => listTestEntries(startDate, endDate),
  });

  useRefetchOnFocus(query.refetch);

  return {
    tests: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useCycleTestMutations() {
  const queryClient = useQueryClient();

  const createMutation = useMutation<
    SharedCycleTestEntry,
    Error,
    Omit<SharedCycleTestEntry, 'id' | 'user_id' | 'tested_at'> & { tested_at?: string }
  >({
    mutationFn: (body) => createTestEntry(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cycleTestsQueryKey });
      queryClient.invalidateQueries({ queryKey: cycleFertilityQueryKey });
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: (id) => deleteTestEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cycleTestsQueryKey });
      queryClient.invalidateQueries({ queryKey: cycleFertilityQueryKey });
    },
  });

  return {
    createTestEntryAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteTestEntryAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
