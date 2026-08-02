import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createContraction,
  updateContraction,
  getContractions,
} from '../services/api/pregnancyApi';
import {
  pregnancyContractionsQueryKey,
  pregnancyOverviewQueryKey,
} from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type { SharedContraction } from '@workspace/shared';

// --- Contractions ---

export function useContractionAnalysis() {
  const query = useQuery({
    queryKey: pregnancyContractionsQueryKey,
    queryFn: getContractions,
  });

  useRefetchOnFocus(query.refetch);

  return {
    analysis: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useContractionMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: pregnancyContractionsQueryKey });
    queryClient.invalidateQueries({ queryKey: pregnancyOverviewQueryKey });
  };

  const createMutation = useMutation<SharedContraction, Error, { pregnancyId: string; startedAt?: string }>({
    mutationFn: ({ pregnancyId, startedAt }) => createContraction(pregnancyId, startedAt),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { ended_at?: string | null; intensity?: number | null };
    }) => updateContraction(id, body),
    onSuccess: invalidate,
  });

  return {
    createContractionAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateContractionAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
