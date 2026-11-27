import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type { ChoiceFeatureKey } from '@workspace/shared';
import {
  fetchFeatureChoices,
  updateFeatureChoices,
} from '../services/api/featureChoicesApi';
import { addLog } from '../services/LogService';
import type { ServerConfig } from '../services/storage';
import { featureChoicesQueryKey } from './queryKeys';
import { startedOn } from './queryOwner';
import { serverOnScreen } from './serverOnScreen';

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
    queryFn: fetchFeatureChoices,
  });
}

/** Whether a choice switch can be used: only once the choices have loaded
 * (a guess could undo one made on another phone), and not on a server older
 * than Features, which cannot store one. */
export type FeatureChoiceState =
  'ready' | 'loading' | 'loadFailed' | 'serverTooOld';

/** One change, bound when the switch is tapped to the account on screen. */
interface ChoiceChange {
  feature: ChoiceFeatureKey;
  on: boolean;
  serverConfig: ServerConfig;
  started: ReturnType<typeof startedOn>;
}

/**
 * Turns one feature on or off in this app. Saves run one at a time, so a
 * quick off and on lands in order; each cancels a read already on its way (it
 * answers with the choices from before). A change goes to the account it was
 * made for, never one switched to meanwhile, and an answer that arrives after
 * another account or server took over is dropped. `useAuth` clears the cache
 * on a switch, mutations included, so a save still queued then is not sent.
 */
export function useSetMobileFeatureChoice() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useFeatureChoicesQuery();
  const showSaveFailed = useCallback(
    (error: unknown) => {
      addLog(`Failed to save a feature choice: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('featureSettings.saveFailed', {
          defaultValue: 'Could not save this setting. Please try again.',
        }),
      });
    },
    [t]
  );
  const { mutate, isPending } = useMutation({
    scope: { id: 'feature-choices' },
    mutationFn: ({ feature, on, serverConfig }: ChoiceChange) =>
      updateFeatureChoices({ mobile: { [feature]: on } }, serverConfig),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: featureChoicesQueryKey });
    },
    onSuccess: (data, change) => {
      if (change.started.isCurrent()) {
        queryClient.setQueryData(featureChoicesQueryKey, data);
      }
    },
    onError: showSaveFailed,
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
      const serverConfig = serverOnScreen(queryClient);
      if (!serverConfig) {
        showSaveFailed('no active server');
        return;
      }
      mutate({
        feature,
        on,
        serverConfig,
        started: startedOn(queryClient, featureChoicesQueryKey),
      });
    },
    [state, mutate, queryClient, showSaveFailed]
  );
  const { refetch } = query;
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { state, isPending, setFeatureOn, reload };
}
