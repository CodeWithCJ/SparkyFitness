import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChoiceFeatureKey } from '@workspace/shared';
import { featureChoicesKeys } from '@/api/keys/settings';
import {
  getFeatureChoices,
  updateFeatureChoices,
} from '@/api/Settings/featureChoices';
import { startedOn } from '@/utils/queryOwner';

/**
 * The person's explicit feature choices (#3487), both platforms; this
 * website reads `web`. While they load or after a failed load, `data` is
 * undefined and every feature is at its default, so nothing disappears
 * because of a network error. Someone acting for the person reads the
 * person's own (the server answers 403 when their grant does not cover
 * settings, and the defaults apply).
 */
export function useFeatureChoicesQuery() {
  return useQuery({
    queryKey: featureChoicesKeys.all,
    queryFn: getFeatureChoices,
  });
}

/** Whether a choice switch can be used: only once the choices have loaded,
 * since a guess could undo one made elsewhere. */
export type FeatureChoiceState = 'ready' | 'loading' | 'loadFailed';

/**
 * Turns one feature on or off on this website. Saves run one at a time, so a
 * quick off and on lands in order; each cancels a read already on its way
 * (it answers with the choices from before), and an answer that arrives after
 * another account took over is dropped.
 */
export function useSetWebFeatureChoice() {
  const queryClient = useQueryClient();
  const query = useFeatureChoicesQuery();
  const { mutate, isPending } = useMutation({
    scope: { id: 'feature-choices' },
    mutationFn: ({ feature, on }: { feature: ChoiceFeatureKey; on: boolean }) =>
      updateFeatureChoices({ web: { [feature]: on } }),
    onMutate: async () => {
      const started = startedOn(queryClient, featureChoicesKeys.all);
      await queryClient.cancelQueries({ queryKey: featureChoicesKeys.all });
      return started;
    },
    onSuccess: (data, _change, started) => {
      if (started.isCurrent()) {
        queryClient.setQueryData(featureChoicesKeys.all, data);
      }
    },
  });

  const state: FeatureChoiceState =
    query.data !== undefined
      ? 'ready'
      : query.isError
        ? 'loadFailed'
        : 'loading';
  const setFeatureOn = useCallback(
    (feature: ChoiceFeatureKey, on: boolean) => {
      if (state !== 'ready') return;
      mutate({ feature, on });
    },
    [state, mutate]
  );
  const { refetch } = query;
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { state, isPending, setFeatureOn, reload };
}
