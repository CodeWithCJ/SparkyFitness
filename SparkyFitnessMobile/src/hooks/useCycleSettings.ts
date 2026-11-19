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
import { startedOn } from './queryOwner';
import { addLog } from '../services/LogService';
import type { SharedCycleSettings } from '../types/womensHealth';

type CycleSettingsBody = Partial<SharedCycleSettings> & {
  mark_onboarded?: boolean;
  reset_onboarding?: boolean;
};

// Settings writes run one at a time, so a quick off and on lands in order.
const CYCLE_SETTINGS_SCOPE = { id: 'cycle-settings' };

/** Drops an answer whose cached settings were cleared meanwhile (another
 * account or server took over). Returned from `onMutate`. */
const startCycleSettingsWrite = (queryClient: QueryClient) =>
  startedOn(queryClient, cycleSettingsQueryKey);

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
  return (error: unknown) => {
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
  };
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
    mutationFn: (body: CycleSettingsBody) => putSettings(body),
    onMutate: async (newVars) => {
      const started = startCycleSettingsWrite(queryClient);

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
    onError: (error, variables, context) => {
      // Undo what this write changed, unless another account took over
      // meanwhile: its cache is not ours to touch.
      const previous = context?.previousSettings;
      if (previous && context?.started.isCurrent()) {
        queryClient.setQueryData<SharedCycleSettings | null>(
          cycleSettingsQueryKey,
          (current) =>
            current
              ? { ...current, ...previousValuesOf(variables, previous) }
              : current
        );
      }
      showSaveFailed(error);
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    updateSettings: mutation.mutate,
    updateSettingsAsync: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  };
}

/**
 * Turns cycle tracking on or off: only `enabled`, never `mark_onboarded`, so
 * the first time cycle is on its setup runs. Cycle is one switch for the
 * whole account, so this also shows or hides it on the website. An answer for
 * an account no longer on screen is not shown, and what `onMutate` returns
 * carries that check (`isCurrent`) for callers that act on the answer.
 */
export function useSetCycleEnabled() {
  const queryClient = useQueryClient();
  const showSaveFailed = useSaveFailedToast();
  return useMutation({
    scope: CYCLE_SETTINGS_SCOPE,
    mutationFn: (enabled: boolean) => putSettings({ enabled }),
    onMutate: async () => {
      const started = startCycleSettingsWrite(queryClient);
      // A read already on its way answers with the value from before this
      // change; landing after it, it would undo the switch on screen.
      await queryClient.cancelQueries({ queryKey: cycleSettingsQueryKey });
      return started;
    },
    onSuccess: (data, _enabled, started) => {
      if (started.isCurrent()) showSavedCycleSettings(queryClient, data);
    },
    onError: (error) => showSaveFailed(error),
  });
}
