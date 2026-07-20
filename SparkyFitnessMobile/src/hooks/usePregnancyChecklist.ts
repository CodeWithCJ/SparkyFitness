import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getChecklist, upsertChecklistItem } from '../services/api/pregnancyApi';
import { pregnancyChecklistQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type { PregnancyChecklistItem } from '../types/womensHealth';

export function usePregnancyChecklist(pregnancyId: string | undefined) {
  const query = useQuery<PregnancyChecklistItem[]>({
    queryKey: [...pregnancyChecklistQueryKey, pregnancyId],
    queryFn: () => getChecklist(pregnancyId!) as Promise<PregnancyChecklistItem[]>,
    enabled: !!pregnancyId,
  });

  useRefetchOnFocus(query.refetch, !!pregnancyId);

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function usePregnancyChecklistMutations() {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: (vars: {
      id?: string;
      pregnancyId: string;
      templateKey: string;
      week: number;
      completed: boolean;
    }) =>
      upsertChecklistItem({
        id: vars.id,
        pregnancy_id: vars.pregnancyId,
        template_key: vars.templateKey,
        week: vars.week,
        completed: vars.completed,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pregnancyChecklistQueryKey });
    },
  });

  return {
    toggleAsync: toggleMutation.mutateAsync,
    isToggling: toggleMutation.isPending,
  };
}
