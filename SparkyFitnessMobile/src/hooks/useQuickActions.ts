import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import Constants from 'expo-constants';
import * as QuickActions from 'expo-quick-actions';
import Toast from 'react-native-toast-message';
import i18n from '../localization/i18n';
import { navigationRef } from '../components/ActiveWorkoutBar';
import {
  changeWaterIntake,
  fetchWaterContainers,
} from '../services/api/measurementsApi';
import { DEFAULT_WATER_CONTAINER_ID } from './useWaterIntakeMutation';
import {
  caffeineActiveQueryKey,
  dailySummaryQueryKey,
  waterIntakeLogQueryKey,
} from './queryKeys';
import { queryClient } from './queryClient';
import { getTodayDate } from '../utils/dateUtils';
import { addLog } from '../services/LogService';
import { refreshBackgroundWaterShortcut } from '../services/backgroundWater';

type QuickActionId = 'scan-food' | 'search-food' | 'log-water' | 'fasting';

/**
 * The shortcuts for this platform. Icons are SF Symbols on iOS and drawables on
 * Android (targets/android-background-water/res, copied in by
 * plugins/withBackgroundWater.ts).
 */
export function quickActionItems(): QuickActions.Action[] {
  const ios = Platform.OS === 'ios';
  const items: QuickActions.Action[] = [
    {
      id: 'scan-food',
      title: i18n.t('quickActions.scanFood', { defaultValue: 'Scan food' }),
      icon: ios ? 'symbol:barcode.viewfinder' : 'ic_shortcut_scan_food',
    },
    {
      id: 'search-food',
      title: i18n.t('quickActions.searchFood', { defaultValue: 'Log food' }),
      icon: ios ? 'symbol:magnifyingglass' : 'ic_shortcut_search_food',
    },
    {
      id: 'log-water',
      title: i18n.t('quickActions.logWater', { defaultValue: 'Log water' }),
      icon: 'symbol:drop.fill',
    },
    {
      id: 'fasting',
      title: i18n.t('quickActions.fasting', { defaultValue: 'Fasting' }),
      icon: ios ? 'symbol:timer' : 'ic_shortcut_fasting',
    },
  ];
  // Android's "Log water" is a native shortcut that logs without opening the
  // app (targets/android-background-water), so it is not one of these.
  return Platform.OS === 'android'
    ? items.filter((item) => item.id !== 'log-water')
    : items;
}

// Registering the shortcuts replaces every dynamic shortcut on Android, the
// native "Log water" one included, so it is put back afterwards.
function restoreLogWaterShortcut(): Promise<void> {
  return refreshBackgroundWaterShortcut(
    i18n.t('quickActions.logWater', { defaultValue: 'Log water' }),
    i18n.t('quickActions.logWaterInBackground', {
      defaultValue: 'Log water without opening the app',
    })
  );
}

/** Logs one drink of the primary (or only) container, without opening a screen. */
async function logWaterDrink(): Promise<void> {
  const date = getTodayDate();
  try {
    const containers = await fetchWaterContainers();
    // The water control on the dashboard picks the same way, so the drink
    // matches what the app would log.
    const standardContainers = containers.filter((c) => !c.is_quick_add);
    const container =
      standardContainers.find((c) => c.is_primary) ?? standardContainers[0];
    await changeWaterIntake({
      entryDate: date,
      changeDrinks: 1,
      containerId: container?.id ?? DEFAULT_WATER_CONTAINER_ID,
    });
    void queryClient.invalidateQueries({
      queryKey: dailySummaryQueryKey(date),
    });
    void queryClient.invalidateQueries({
      queryKey: waterIntakeLogQueryKey(date),
    });
    void queryClient.invalidateQueries({
      queryKey: caffeineActiveQueryKey(date),
    });
    Toast.show({
      type: 'success',
      text1: i18n.t('quickActions.waterLogged', {
        defaultValue: 'Water logged',
      }),
    });
  } catch (error) {
    void addLog(`Quick action water log failed: ${String(error)}`, 'WARNING');
    Toast.show({
      type: 'error',
      text1: i18n.t('quickActions.waterFailed', {
        defaultValue: 'Could not log water',
      }),
    });
  }
}

const pendingNavigation: (() => void)[] = [];

// The launch action is read once per JS runtime, which on Android outlives the
// activity, so an app that mounts again must not run it a second time.
let handledLaunchAction: QuickActions.Action | undefined;

/** Runs shortcuts queued before the navigator finished starting. */
export function drainQuickActionNavigation(): void {
  if (!navigationRef.isReady()) return;
  const pending = pendingNavigation.splice(0);
  for (const run of pending) run();
}

export function whenNavigationReady(run: () => void): void {
  if (navigationRef.isReady()) {
    run();
    return;
  }
  // A cold start can get here before linking finishes. Dropping the callback
  // loses the shortcut the app was opened with, and the launch action is not
  // tried again.
  pendingNavigation.push(run);
}

export function runQuickAction(id: string): void {
  switch (id as QuickActionId) {
    case 'scan-food':
      whenNavigationReady(() => navigationRef.navigate('FoodScan'));
      return;
    case 'search-food':
      whenNavigationReady(() => navigationRef.navigate('FoodSearch'));
      return;
    case 'fasting':
      whenNavigationReady(() => navigationRef.navigate('FastingDetail'));
      return;
    case 'log-water':
      void logWaterDrink();
      return;
    default:
      return;
  }
}

/**
 * App icon long-press menu (iOS Home Screen, Android launcher). Registers the
 * shortcuts once the user is signed in and runs the one the app was launched
 * with, or tapped while running.
 */
export function useQuickActions(enabled: boolean): void {
  // The titles are read when the items are registered, so a language change
  // has to register them again.
  const language = useTranslation().i18n.language;
  useEffect(() => {
    if (!enabled || (Platform.OS !== 'ios' && Platform.OS !== 'android')) {
      return;
    }
    const items = quickActionItems();
    const registered = QuickActions.setItems(items).catch(() => undefined);
    if (Platform.OS === 'android') {
      void registered.then(restoreLogWaterShortcut);
    }
    // On Android the action comes from an intent to MainActivity, which is
    // exported, so any installed app can send one with any id. Only the ids
    // registered here are run: Android's Log water is the native shortcut,
    // whose activity is not exported, so another app cannot log water
    // through this path.
    const registeredIds = new Set(items.map((item) => item.id));
    const run = (action: QuickActions.Action): void => {
      if (registeredIds.has(action.id)) runQuickAction(action.id);
    };
    const initial = QuickActions.initial;
    if (initial && initial !== handledLaunchAction) {
      handledLaunchAction = initial;
      run(initial);
    }
    const subscription = QuickActions.addListener(run);
    return () => subscription.remove();
  }, [enabled, language]);
}

const CONTROL_ROUTE_KEY = 'pendingControlRoute';

const iosAppGroup = (
  Constants.expoConfig?.extra as { iosAppGroup?: string } | undefined
)?.iosAppGroup;

/**
 * The Scan food, Log food and Calories left controls (Control Center, Lock Screen) open the
 * app and leave the screen they want in the shared app group. Picks it up when
 * the app launches or comes to the front and goes there, the same way the
 * Home Screen shortcuts do.
 */
export function useControlRouteHandoff(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || Platform.OS !== 'ios' || !iosAppGroup) return;
    const storage = new ExtensionStorage(iosAppGroup);
    const pickUp = (): void => {
      const route = storage.get(CONTROL_ROUTE_KEY);
      if (route == null || route === '') return;
      storage.remove(CONTROL_ROUTE_KEY);
      if (route === 'scan') runQuickAction('scan-food');
      else if (route === 'search') runQuickAction('search-food');
      else if (route === 'diary') {
        whenNavigationReady(() =>
          navigationRef.navigate('Tabs', { screen: 'Diary' })
        );
      }
    };
    pickUp();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') pickUp();
    });
    return () => subscription.remove();
  }, [enabled]);
}
