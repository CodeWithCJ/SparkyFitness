import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  hiddenFeatureCustomCategories,
  isFeatureEnabled,
  isFeatureExplicitlyOff,
  type FeatureKey,
} from '@workspace/shared';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useCycleSettings, useSetCycleEnabledMutation } from '@/hooks/useCycle';
import { useFeatureChoicesQuery } from '@/hooks/Settings/useFeatureChoices';

/**
 * Which optional features (#3487) show on this website, from the shared
 * registry. Every entry point to one (tab, + menu item, link) asks this
 * instead of reading where the switch is stored: the website's own
 * `feature_choices` (lab results), or for cycle its account-wide switch in
 * `cycle_settings.enabled`.
 *
 * While a value is loading or could not be read, or the server is older than
 * Features, `isEnabled` gives the feature's default (cycle off, as before
 * Features; lab results on), so a network error or an old server never hides
 * something that was showing. `isExplicitlyOff` is
 * only for a feature the person turned off: data shown outside the feature's
 * own pages (the reproductive Health categories, cycle hub symptoms) hides
 * only then, so nothing disappears for someone who never chose, or while the
 * answer loads.
 */
export function useWebFeatures() {
  const { data: cycleSettings } = useCycleSettings();
  const cycleEnabled = cycleSettings?.enabled;
  const { data: choicesResponse } = useFeatureChoicesQuery();
  const choices = choicesResponse?.feature_choices;
  const sources = useMemo(
    () => ({ choices, cycleEnabled }),
    [choices, cycleEnabled]
  );
  const isEnabled = useCallback(
    (key: FeatureKey) => isFeatureEnabled(key, 'web', sources),
    [sources]
  );
  const isExplicitlyOff = useCallback(
    (key: FeatureKey) => isFeatureExplicitlyOff(key, 'web', sources),
    [sources]
  );
  // Custom categories that belong to a feature turned off on purpose. Lists
  // of measurements leave them out (`withoutHiddenCategories` from shared);
  // Settings > Custom Categories keeps them.
  const hiddenCustomCategories = useMemo(
    () => hiddenFeatureCustomCategories('web', sources),
    [sources]
  );
  return { isEnabled, isExplicitlyOff, hiddenCustomCategories };
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
 * The cycle tracking switch of Settings → Features, the only place cycle is
 * turned on or off (Settings → Cycle & Pregnancy reads its state and points
 * there). Turning it on the first time opens the setup wizard on /cycle;
 * after that, cycle comes back as it was.
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
