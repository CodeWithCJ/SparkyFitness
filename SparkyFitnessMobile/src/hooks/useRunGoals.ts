import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GetRunGoalsResponse,
  UpsertRunGoalsBody,
} from '@workspace/shared';
import { fetchRunGoals, saveRunGoals } from '../services/api/runGoalsApi';
import { runGoalsQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { usePreferences } from './usePreferences';

/**
 * The running goals and where the week stands. Progress depends on runs logged
 * elsewhere (a recording, the watch, a sync), so it is re-read on every focus.
 */
export function useRunGoals() {
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const query = useQuery({
    queryKey: runGoalsQueryKey,
    queryFn: fetchRunGoals,
    staleTime: 0,
  });
  useRefetchOnFocus(query.refetch, true);

  const mutation = useMutation({
    mutationFn: (body: UpsertRunGoalsBody) => saveRunGoals(body),
    onSuccess: (data: GetRunGoalsResponse) => {
      queryClient.setQueryData(runGoalsQueryKey, data);
    },
  });
  const { mutateAsync } = mutation;
  const save = useCallback(
    (body: UpsertRunGoalsBody) => mutateAsync(body).then(() => undefined),
    [mutateAsync]
  );

  return {
    data: query.data ?? null,
    loaded: query.isSuccess,
    isSaving: mutation.isPending,
    save,
    distanceUnit:
      preferences?.default_distance_unit === 'miles'
        ? ('miles' as const)
        : ('km' as const),
  };
}
