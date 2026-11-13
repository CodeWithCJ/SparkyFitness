import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { isFeatureEnabled, type FeatureKey } from '@workspace/shared';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useCycleSettings, useSetCycleEnabledMutation } from '@/hooks/useCycle';

/**
 * Which optional features (#3487) show on this website, from the shared
 * registry. Every entry point to one (tab, + menu item, link) asks this
 * instead of reading where the switch is stored. Cycle, the only feature so
 * far, keeps its own account-wide switch in `cycle_settings.enabled`; the
 * website's `feature_choices` join here with the first feature stored there.
 *
 * Off while its value is loading or could not be read, as before Features.
 */
export function useWebFeatures() {
  const { data: cycleSettings } = useCycleSettings();
  const cycleEnabled = cycleSettings?.enabled;
  const isEnabled = useCallback(
    (key: FeatureKey) =>
      isFeatureEnabled(key, 'web', { choices: undefined, cycleEnabled }),
    [cycleEnabled]
  );
  return { isEnabled };
}

/**
 * Whether the cycle switch can be used: only once the settings have loaded
 * (a guess would overwrite them), and never while acting for someone else
 * (cycle is the owner's own and the server keeps it from anyone else). A
 * later refetch that fails keeps what loaded, so it stays usable.
 */
export type CycleSwitchState =
  'ready' | 'loading' | 'loadFailed' | 'actingOnBehalf';

/**
 * The cycle tracking switch, shared by Settings → Features and Settings →
 * Cycle & Pregnancy so both behave the same. Turning it on the first time
 * opens the setup wizard on /cycle; after that, cycle comes back as it was.
 */
export function useCycleSwitch() {
  const { isActingOnBehalf } = useActiveUser();
  const navigate = useNavigate();
  const query = useCycleSettings();
  const { mutate, isPending } = useSetCycleEnabledMutation();
  const settings = query.data;

  // `null` is a loaded answer: cycle was never set up.
  const state: CycleSwitchState = isActingOnBehalf
    ? 'actingOnBehalf'
    : settings !== undefined
      ? 'ready'
      : query.isError
        ? 'loadFailed'
        : 'loading';
  const on = isFeatureEnabled('cycle', 'web', {
    choices: undefined,
    cycleEnabled: settings?.enabled,
  });
  // On, but the setup wizard was never finished (or was reset).
  const needsSetup = state === 'ready' && on && !settings?.onboarded_at;

  const openSetup = useCallback(() => navigate('/cycle'), [navigate]);
  const setOn = useCallback(
    (next: boolean) => {
      if (state !== 'ready') return;
      mutate(next, {
        onSuccess: (saved, _next, started) => {
          if (next && !saved.onboarded_at && started?.isCurrent()) openSetup();
        },
      });
    },
    [state, mutate, openSetup]
  );
  const { refetch } = query;
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    on,
    state,
    isPending,
    needsSetup,
    settings,
    setOn,
    openSetup,
    reload,
  };
}
