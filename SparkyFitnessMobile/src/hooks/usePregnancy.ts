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

  const createMutation = useMutation({
    mutationFn: (body: Omit<SharedPregnancy, 'id' | 'user_id'>) => createPregnancy(body),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<SharedPregnancy> }) =>
      updatePregnancy(id, body),
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
