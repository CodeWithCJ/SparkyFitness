import { useCallback } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { getSettings, putSettings } from '../services/api/cycleApi';
import {
  cycleFertilityQueryKey,
  cycleInsightsQueryKey,
  cycleOverviewQueryKey,
  cycleSettingsQueryKey,
} from './queryKeys';
import { serverOnScreen } from './serverOnScreen';
import { addLog } from '../services/LogService';
import type { ServerConfig } from '../services/storage';
import type { SharedCycleSettings } from '../types/womensHealth';

type CycleSettingsBody = Partial<SharedCycleSettings> & {
  mark_onboarded?: boolean;
  reset_onboarding?: boolean;
};

/** A settings change, bound when it is made to the account on screen
 * (`serverOnScreen`), so a write queued behind another one, or sent during a
 * server switch, never reaches the account switched to. */
interface BoundWrite<T> {
  change: T;
  serverConfig: ServerConfig;
}

const NO_SERVER_ON_SCREEN = new Error('No server on screen');

// Settings writes run one at a time, so a quick off and on lands in order.
const CYCLE_SETTINGS_SCOPE = { id: 'cycle-settings' };

/** The cached settings query itself, which goes away when the cache is cleared. */
const findCycleSettingsQuery = (queryClient: QueryClient) =>
  queryClient
    .getQueryCache()
    .find({ queryKey: cycleSettingsQueryKey, exact: true });

/**
 * useAuth clears the cache when the account or server changes, so a write
 * whose cached settings are gone by the time it answers was made for an
 * account that is no longer on screen: its answer must not be shown, and
 * callers must not act on it. Returned from `onMutate`.
 */
const startedOn = (queryClient: QueryClient) => {
  const startedFrom = findCycleSettingsQuery(queryClient);
  return {
    isCurrent: () => findCycleSettingsQuery(queryClient) === startedFrom,
  };
};

const showSavedCycleSettings = (
  queryClient: QueryClient,
  data: SharedCycleSettings
) => {
  queryClient.setQueryData<SharedCycleSettings | null>(
    cycleSettingsQueryKey,
    data
  );
  // The server works these out from the settings (mode, lengths, overrides).
  queryClient.invalidateQueries({ queryKey: cycleOverviewQueryKey });
  queryClient.invalidateQueries({ queryKey: cycleInsightsQueryKey });
  queryClient.invalidateQueries({ queryKey: cycleFertilityQueryKey });
};

/**
 * What a failed write puts back: only the fields it changed, as they were
 * before it. A write saved meanwhile (the on/off switch shares the queue)
 * keeps its answer.
 */
function previousValuesOf(
  body: CycleSettingsBody,
  previous: SharedCycleSettings
): Partial<SharedCycleSettings> {
  const { mark_onboarded, reset_onboarding, ...patch } = body;
  const keys = Object.keys(patch) as (keyof SharedCycleSettings)[];
  return {
    ...(Object.fromEntries(
      keys.map((key) => [key, previous[key]])
    ) as Partial<SharedCycleSettings>),
    ...(mark_onboarded || reset_onboarding
      ? { onboarded_at: previous.onboarded_at }
      : {}),
  };
}

function useSaveFailedToast() {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown) => {
      addLog(`Failed to update cycle settings: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('cycleSettings.updateFailed', {
          defaultValue: 'Update failed',
        }),
        text2: t('cycleSettings.saveFailed', {
          defaultValue: 'Could not save cycle settings. Please try again.',
        }),
      });
    },
    [t]
  );
}

/**
 * The cycle settings alone, for code that only reads them. `null` is a loaded
 * answer: cycle was never set up (no row); `undefined` means not loaded yet.
 */
export function useCycleSettingsQuery() {
  return useQuery({
    queryKey: cycleSettingsQueryKey,
    queryFn: getSettings,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
  });
}

export function useCycleSettings() {
  const queryClient = useQueryClient();
  const showSaveFailed = useSaveFailedToast();
  const query = useCycleSettingsQuery();

  const mutation = useMutation({
    scope: CYCLE_SETTINGS_SCOPE,
    mutationFn: ({ change, serverConfig }: BoundWrite<CycleSettingsBody>) =>
      putSettings(change, serverConfig),
    onMutate: async ({ change: newVars }) => {
      const started = startedOn(queryClient);

      // Cancel outgoing refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: cycleSettingsQueryKey });

      // Snapshot previous value
      const previousSettings =
        queryClient.getQueryData<SharedCycleSettings | null>(
          cycleSettingsQueryKey
        );

      // Optimistically update to new value immediately. mark_onboarded and
      // reset_onboarding are request-only flags, so keep them out of the
      // cached settings object.
      if (previousSettings) {
        const { mark_onboarded, reset_onboarding, ...settingsPatch } = newVars;
        const optimistic: SharedCycleSettings = {
          ...previousSettings,
          ...settingsPatch,
          onboarded_at: mark_onboarded
            ? new Date().toISOString()
            : reset_onboarding
              ? null
              : previousSettings.onboarded_at,
        };
        queryClient.setQueryData<SharedCycleSettings | null>(
          cycleSettingsQueryKey,
          optimistic
        );
      }

      return { previousSettings, started };
    },
    onSuccess: (data, _variables, context) => {
      if (context.started.isCurrent()) {
        showSavedCycleSettings(queryClient, data);
      }
    },
    onError: (error, { change }, context) => {
      // Undo what this write changed, unless another account took over
      // meanwhile: its cache is not ours to touch.
      const previous = context?.previousSettings;
      if (previous && context?.started.isCurrent()) {
        queryClient.setQueryData<SharedCycleSettings | null>(
          cycleSettingsQueryKey,
          (current) =>
            current
              ? { ...current, ...previousValuesOf(change, previous) }
              : current
        );
      }
      showSaveFailed(error);
    },
  });

  const { mutate, mutateAsync } = mutation;
  type WriteOptions = Parameters<typeof mutate>[1];
  const updateSettings = useCallback(
    (change: CycleSettingsBody, options?: WriteOptions) => {
      const serverConfig = serverOnScreen(queryClient);
      if (!serverConfig) {
        showSaveFailed(NO_SERVER_ON_SCREEN);
        return;
      }
      mutate({ change, serverConfig }, options);
    },
    [queryClient, mutate, showSaveFailed]
  );
  const updateSettingsAsync = useCallback(
    (change: CycleSettingsBody) => {
      const serverConfig = serverOnScreen(queryClient);
      if (!serverConfig) return Promise.reject(NO_SERVER_ON_SCREEN);
      return mutateAsync({ change, serverConfig });
    },
    [queryClient, mutateAsync]
  );

  return {
    settings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    updateSettings,
    updateSettingsAsync,
    isUpdating: mutation.isPending,
  };
}

/**
 * Turns cycle tracking on or off: only `enabled`, never `mark_onboarded`, so
 * the first time cycle is on its setup runs. Cycle is one switch for the
 * whole account, so this also shows or hides it on the website. The change
 * goes to the account on screen when it is made, never one switched to
 * meanwhile. An answer for an account no longer on screen is not shown, and
 * what `onMutate` returns carries that check (`isCurrent`) for callers that act
 * on the answer.
 */
export function useSetCycleEnabled() {
  const queryClient = useQueryClient();
  const showSaveFailed = useSaveFailedToast();
  const { mutate, isPending } = useMutation({
    scope: CYCLE_SETTINGS_SCOPE,
    mutationFn: ({ change: enabled, serverConfig }: BoundWrite<boolean>) =>
      putSettings({ enabled }, serverConfig),
    onMutate: async () => {
      const started = startedOn(queryClient);
      // A read already on its way answers with the value from before this
      // change; landing after it, it would undo the switch on screen.
      await queryClient.cancelQueries({ queryKey: cycleSettingsQueryKey });
      return started;
    },
    onSuccess: (data, _write, started) => {
      if (started.isCurrent()) showSavedCycleSettings(queryClient, data);
    },
    onError: (error) => showSaveFailed(error),
  });

  type WriteOptions = Parameters<typeof mutate>[1];
  const setEnabled = useCallback(
    (enabled: boolean, options?: WriteOptions) => {
      const serverConfig = serverOnScreen(queryClient);
      if (!serverConfig) {
        showSaveFailed(NO_SERVER_ON_SCREEN);
        return;
      }
      mutate({ change: enabled, serverConfig }, options);
    },
    [queryClient, mutate, showSaveFailed]
  );
  return { mutate: setEnabled, isPending };
}
