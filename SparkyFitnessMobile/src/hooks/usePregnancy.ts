import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCurrent,
  getOverview,
  createPregnancy,
  updatePregnancy,
  deletePregnancy,
} from '../services/api/pregnancyApi';
import {
  pregnancyCurrentQueryKey,
  pregnancyOverviewQueryKey,
} from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type { ServerConfig } from '../services/storage';
import type { SharedPregnancy } from '@workspace/shared';

/** Current active pregnancy record (or null when none). */
export function useCurrentPregnancy() {
  const query = useQuery<SharedPregnancy | null>({
    queryKey: pregnancyCurrentQueryKey,
    queryFn: getCurrent,
    staleTime: Infinity,
  });

  useRefetchOnFocus(query.refetch);

  return {
    pregnancy: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Gestational overview (week/trimester/baby size, checklist, vitals) for the
 * active pregnancy. Returns `{ pregnancy: null }` with every other field
 * absent when there's no active pregnancy — callers must guard on
 * `overview?.gestation` rather than assuming a truthy `overview`.
 */
export function usePregnancyOverview(date?: string, enabled = true) {
  const query = useQuery({
    queryKey: [...pregnancyOverviewQueryKey, date ?? 'today'],
    queryFn: () => getOverview(date),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  return {
    overview: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function usePregnancyMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: pregnancyCurrentQueryKey });
    queryClient.invalidateQueries({ queryKey: pregnancyOverviewQueryKey });
  };

  // `serverConfig` binds a write to an account (the cycle setup's); without
  // it, the active server when the request goes out.
  const createMutation = useMutation({
    mutationFn: ({
      body,
      serverConfig,
    }: {
      body: Omit<SharedPregnancy, 'id' | 'user_id'>;
      serverConfig?: ServerConfig;
    }) => createPregnancy(body, serverConfig),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
      serverConfig,
    }: {
      id: string;
      body: Partial<SharedPregnancy>;
      serverConfig?: ServerConfig;
    }) => updatePregnancy(id, body, serverConfig),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePregnancy(id),
    onSuccess: invalidate,
  });

  return {
    createPregnancyAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updatePregnancyAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deletePregnancyAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
