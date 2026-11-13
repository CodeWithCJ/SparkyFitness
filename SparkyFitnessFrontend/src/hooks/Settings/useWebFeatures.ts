import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FEATURE_CUSTOM_CATEGORIES,
  FEATURE_KEYS,
  isFeatureEnabled,
  isFeatureExplicitlyOff,
  type FeatureKey,
} from '@workspace/shared';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useCycleSettings, useSetCycleEnabledMutation } from '@/hooks/useCycle';

/**
 * Which optional features (#3487) show on this website, from the shared
 * registry. Every entry point to one (tab, + menu item, link) asks this
 * instead of reading where the switch is stored. Cycle, the only feature so
 * far, keeps its own account-wide switch in `cycle_settings.enabled`; the
 * website's `feature_choices` join here with the first feature stored there.
 *
 * `isEnabled` is off while its value is loading or could not be read, as
 * before Features. `isExplicitlyOff` is only for a feature the person turned
 * off: data shown outside the feature's own pages (the reproductive Health
 * categories, cycle hub symptoms) hides only then, so nothing disappears for
 * someone who never chose, or while the answer loads.
 */
export function useWebFeatures() {
  const { data: cycleSettings } = useCycleSettings();
  const cycleEnabled = cycleSettings?.enabled;
  const isEnabled = useCallback(
    (key: FeatureKey) =>
      isFeatureEnabled(key, 'web', { choices: undefined, cycleEnabled }),
    [cycleEnabled]
  );
  const isExplicitlyOff = useCallback(
    (key: FeatureKey) =>
      isFeatureExplicitlyOff(key, 'web', { choices: undefined, cycleEnabled }),
    [cycleEnabled]
  );
  // Custom categories that belong to a feature turned off on purpose. Lists
  // of measurements leave them out; Settings > Custom Categories keeps them.
  const hiddenCustomCategories = useMemo<ReadonlySet<string>>(
    () =>
      new Set(
        FEATURE_KEYS.filter(isExplicitlyOff).flatMap(
          (key) => FEATURE_CUSTOM_CATEGORIES[key] ?? []
        )
      ),
    [isExplicitlyOff]
  );
  return { isEnabled, isExplicitlyOff, hiddenCustomCategories };
}

/** The categories to list, less those of features turned off on purpose. */
export function withoutHiddenCategories<T extends { name: string }>(
  categories: readonly T[],
  hidden: ReadonlySet<string>
): T[] {
  return hidden.size === 0
    ? [...categories]
    : categories.filter((category) => !hidden.has(category.name));
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
