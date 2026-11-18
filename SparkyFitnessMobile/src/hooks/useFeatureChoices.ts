import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type {
  ChoiceFeatureKey,
  FeatureChoicesResponse,
} from '@workspace/shared';
import {
  fetchFeatureChoices,
  updateFeatureChoices,
} from '../services/api/featureChoicesApi';
import { ApiError } from '../services/api/errors';
import { addLog } from '../services/LogService';
import { featureChoicesQueryKey } from './queryKeys';
import { startedOn } from './queryOwner';

/**
 * The person's explicit feature choices (#3487), both platforms; the app
 * reads `mobile`. `data` is undefined while they load or after a failed load,
 * and null when the server is older than Features (it answers 404, and stores
 * nothing): every feature is then at its default, so nothing disappears
 * because of a network error or an old server.
 */
export function useFeatureChoicesQuery() {
  return useQuery({
    queryKey: featureChoicesQueryKey,
    queryFn: async (): Promise<FeatureChoicesResponse | null> => {
      try {
        return await fetchFeatureChoices();
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 404) return null;
        throw error;
      }
    },
  });
}

/** Whether a choice switch can be used: only once the choices have loaded
 * (a guess could undo one made on another phone), and not on a server older
 * than Features, which cannot store one. */
export type FeatureChoiceState =
  'ready' | 'loading' | 'loadFailed' | 'serverTooOld';

/**
 * Turns one feature on or off in this app. Saves run one at a time, so a
 * quick off and on lands in order; each cancels a read already on its way (it
 * answers with the choices from before), and an answer that arrives after
 * another account or server took over is dropped.
 */
export function useSetMobileFeatureChoice() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useFeatureChoicesQuery();
  const { mutate, isPending } = useMutation({
    scope: { id: 'feature-choices' },
    mutationFn: ({ feature, on }: { feature: ChoiceFeatureKey; on: boolean }) =>
      updateFeatureChoices({ mobile: { [feature]: on } }),
    onMutate: async () => {
      const started = startedOn(queryClient, featureChoicesQueryKey);
      await queryClient.cancelQueries({ queryKey: featureChoicesQueryKey });
      return started;
    },
    onSuccess: (data, _change, started) => {
      if (started.isCurrent()) {
        queryClient.setQueryData(featureChoicesQueryKey, data);
      }
    },
    onError: (error) => {
      addLog(`Failed to save a feature choice: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('featureSettings.saveFailed', {
          defaultValue: 'Could not save this setting. Please try again.',
        }),
      });
    },
  });

  const state: FeatureChoiceState =
    query.data === null
      ? 'serverTooOld'
      : query.data !== undefined
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
