import { useCallback, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  hiddenFeatureCustomCategories,
  isFeatureEnabled,
  isFeatureExplicitlyOff,
  type FeatureKey,
} from '@workspace/shared';
import { useCycleSettingsQuery, useSetCycleEnabled } from './useCycleSettings';
import { useFeatureChoicesQuery } from './useFeatureChoices';
import type { RootStackParamList } from '../types/navigation';

/**
 * Which optional features (#3487) show in the mobile app, from the shared
 * registry. Every entry point to one (dashboard card, + menu row, screen)
 * asks this instead of reading where the switch is stored: the app's own
 * `feature_choices` (lab results), or for cycle its account-wide switch in
 * `cycle_settings.enabled`.
 *
 * While a value is loading or could not be read, or the server is older than
 * Features, `isEnabled` gives the feature's default (cycle off, as before
 * Features; lab results on), so nothing that was showing disappears.
 * `isExplicitlyOff` is only for a feature the person turned off: data shown
 * outside the feature's own screens (the reproductive Health categories,
 * cycle hub symptoms) hides only then, so nothing disappears for someone who
 * never chose, or while the answer loads.
 */
export function useMobileFeatures() {
  const { data: cycleSettings } = useCycleSettingsQuery();
  const cycleEnabled = cycleSettings?.enabled;
  const { data: choicesResponse } = useFeatureChoicesQuery();
  const choices = choicesResponse?.feature_choices;
  const sources = useMemo(
    () => ({ choices, cycleEnabled }),
    [choices, cycleEnabled]
  );
  const isEnabled = useCallback(
    (key: FeatureKey) => isFeatureEnabled(key, 'mobile', sources),
    [sources]
  );
  const isExplicitlyOff = useCallback(
    (key: FeatureKey) => isFeatureExplicitlyOff(key, 'mobile', sources),
    [sources]
  );
  // Custom categories of features turned off on purpose. Measurement lists
  // leave them out (`withoutHiddenCategories` from shared); Settings > Custom
  // Measurements keeps them. Memoized: forms depend on the lists built from it.
  const hiddenCustomCategories = useMemo(
    () => hiddenFeatureCustomCategories('mobile', sources),
    [sources]
  );
  return { isEnabled, isExplicitlyOff, hiddenCustomCategories };
}

/**
 * Whether the cycle switch can be used: only once the settings have loaded
 * (a guess would overwrite them). A later refetch that fails keeps what
 * loaded, so it stays usable. The app has no acting-for-someone mode, so the
 * settings are always the signed-in person's own.
 */
export type CycleSwitchState = 'ready' | 'loading' | 'loadFailed';

/**
 * The cycle tracking switch of Settings → Features, the only place cycle is
 * turned on or off (Settings → Cycle & Pregnancy shows its state and links
 * there; the hub offers Turn on once it was set up). Turning it on the first
 * time opens the setup; after that, cycle comes back as it was.
 */
export function useCycleSwitch() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const query = useCycleSettingsQuery();
  const { mutate, isPending } = useSetCycleEnabled();
  const settings = query.data;

  // `null` is a loaded answer: cycle was never set up.
  const state: CycleSwitchState =
    settings !== undefined ? 'ready' : query.isError ? 'loadFailed' : 'loading';
  const on = isFeatureEnabled('cycle', 'mobile', {
    choices: undefined,
    cycleEnabled: settings?.enabled,
  });
  // On, but the setup was never finished (or was reset).
  const needsSetup = state === 'ready' && on && !settings?.onboarded_at;

  const openSetup = useCallback(
    () => navigation.navigate('CycleOnboarding'),
    [navigation]
  );
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
