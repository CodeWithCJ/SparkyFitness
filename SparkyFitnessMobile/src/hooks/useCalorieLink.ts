import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SetCalorieLinkRequest } from '@workspace/shared';
import {
  clearCalorieLink,
  fetchCalorieLinkSuggestions,
  setCalorieLink,
} from '../services/api/exerciseApi';
import { invalidateExerciseCache } from './invalidateExerciseCache';
import { calorieLinkQueryKey } from './queryKeys';

/**
 * Synced workouts that may be the same session as a logged workout, plus its
 * current link (issue #2353). Read fresh each time the sheet opens, since the
 * day's synced workouts change as the watch syncs.
 */
export function useCalorieLinkSuggestions(entryId: string, enabled: boolean) {
  return useQuery({
    queryKey: calorieLinkQueryKey(entryId),
    queryFn: () => fetchCalorieLinkSuggestions(entryId),
    enabled,
    staleTime: 0,
  });
}

/** Linking and unlinking change what the day counts, so the exercise caches go too. */
function useCalorieLinkMutation<TVariables, TResult>(
  entryId: string,
  entryDate: string,
  mutationFn: (variables: TVariables) => Promise<TResult>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      invalidateExerciseCache(queryClient, entryDate);
      void queryClient.invalidateQueries({
        queryKey: calorieLinkQueryKey(entryId),
      });
    },
  });
}

export function useSetCalorieLink(entryId: string, entryDate: string) {
  return useCalorieLinkMutation(
    entryId,
    entryDate,
    (body: SetCalorieLinkRequest) => setCalorieLink(entryId, body)
  );
}

export function useClearCalorieLink(entryId: string, entryDate: string) {
  return useCalorieLinkMutation(entryId, entryDate, () =>
    clearCalorieLink(entryId)
  );
}
