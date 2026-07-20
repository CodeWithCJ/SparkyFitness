import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  startKickSession,
  updateKickSession,
  listKickSessions,
  createContraction,
  updateContraction,
  getContractions,
} from '../services/api/pregnancyApi';
import {
  pregnancyKicksQueryKey,
  pregnancyContractionsQueryKey,
  pregnancyOverviewQueryKey,
} from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type { SharedKickSession, SharedContraction } from '@workspace/shared';

// --- Kick sessions ---

export function useKickSessions() {
  const query = useQuery<SharedKickSession[]>({
    queryKey: pregnancyKicksQueryKey(),
    queryFn: listKickSessions,
  });

  useRefetchOnFocus(query.refetch);

  return {
    sessions: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useKickMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: pregnancyKicksQueryKey() });
    queryClient.invalidateQueries({ queryKey: pregnancyOverviewQueryKey });
  };

  const startMutation = useMutation({
    mutationFn: (pregnancyId: string) => startKickSession(pregnancyId),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { kick_count?: number; kick_times?: string[]; ended?: boolean };
    }) => updateKickSession(id, body),
    onSuccess: invalidate,
  });

  return {
    startKickAsync: startMutation.mutateAsync,
    isStarting: startMutation.isPending,
    updateKickAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}

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
