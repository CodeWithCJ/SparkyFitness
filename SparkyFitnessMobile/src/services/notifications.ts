import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';
import { fireSuccessHaptic } from './haptics';

const CHANNEL_ID = 'workout-timer';
const FASTING_CHANNEL_ID = 'fasting';
const NOTIFICATIONS_ENABLED_KEY = '@HealthConnect:notificationsEnabled';

let initialized = false;
let hasShownDeniedToast = false;

// App-local toggle (persisted in AsyncStorage, never synced to the server) that
// gates whether the app schedules its local notifications — rest-timer alerts and
// fasting-goal alerts. Independent of the OS notification permission.
let notificationsEnabled = true;
let enabledInitialized = false;
const enabledListeners = new Set<(enabled: boolean) => void>();

export async function initializeNotificationsEnabled(): Promise<void> {
  if (enabledInitialized) return;
  try {
    const saved = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    // A user toggle that landed during the await above already set
    // `enabledInitialized = true`; don't clobber their choice with stored state.
    if (!enabledInitialized && saved !== null) {
      notificationsEnabled = saved === 'true';
    }
  } catch {
    // fall back to default (enabled)
  } finally {
    if (!enabledInitialized) {
      enabledInitialized = true;
      enabledListeners.forEach((l) => l(notificationsEnabled));
    }
  }
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  // An explicit user toggle wins over any still-pending initializeNotificationsEnabled().
  enabledInitialized = true;
  notificationsEnabled = enabled;
  enabledListeners.forEach((l) => l(enabled));
  try {
    await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
  } catch {
    // ignore — in-memory value still updates so the toggle responds immediately
  }
}

export function useNotificationsEnabled(): boolean {
  return useSyncExternalStore(
    (callback) => {
      enabledListeners.add(callback);
      return () => {
        enabledListeners.delete(callback);
      };
    },
    () => notificationsEnabled,
  );
}

export function getNotificationsEnabled(): boolean {
  return notificationsEnabled;
}

export async function initNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Workout timer',
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: true,
      });
      await Notifications.setNotificationChannelAsync(FASTING_CHANNEL_ID, {
        name: 'Fasting',
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: true,
      });
    }
  } catch (err) {
    addLog(`initNotifications failed: ${(err as Error).message}`, 'ERROR');
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    if (current.status === 'denied') return false;

    const requested = await Notifications.requestPermissionsAsync();
    if (requested.status === 'granted') return true;

    if (!hasShownDeniedToast) {
      hasShownDeniedToast = true;
      Toast.show({
        type: 'info',
        text1: 'Notifications off',
        text2: 'Timer will still alert in the app.',
      });
    }
    return false;
  } catch (err) {
    addLog(`ensureNotificationPermission failed: ${(err as Error).message}`, 'ERROR');
    return false;
  }
}

export async function scheduleRestNotification(
  exerciseName: string,
  seconds: number,
): Promise<string | null> {
  if (!notificationsEnabled) return null;

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest complete',
        body: exerciseName,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: CHANNEL_ID,
      },
    });
    return id;
  } catch (err) {
    addLog(`scheduleRestNotification failed: ${(err as Error).message}`, 'ERROR');
    return null;
  }
}

/**
 * Schedules a local notification to fire at a fast's goal (target end) time.
 * Returns the scheduled notification id, or `null` when the target is already
 * past / invalid, or notification permission was denied.
 */
export async function scheduleFastGoalNotification(
  targetEndTime: string,
): Promise<string | null> {
  if (!notificationsEnabled) return null;

  const target = new Date(targetEndTime);
  if (Number.isNaN(target.getTime()) || target.getTime() <= Date.now()) {
    return null;
  }

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Fasting goal reached',
        body: "You've hit your fasting goal. Great work!",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: target,
        channelId: FASTING_CHANNEL_ID,
      },
    });
    return id;
  } catch (err) {
    addLog(`scheduleFastGoalNotification failed: ${(err as Error).message}`, 'ERROR');
    return null;
  }
}

export async function cancelScheduledNotification(id: string | null): Promise<void> {
  if (id == null) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (err) {
    addLog(`cancelScheduledNotification failed: ${(err as Error).message}`, 'ERROR');
  }
}

export function fireRestCompleteHaptic(): void {
  fireSuccessHaptic();
}

/** Test-only helper — resets module-level state. */
export function __resetNotificationStateForTests(): void {
  initialized = false;
  hasShownDeniedToast = false;
  notificationsEnabled = true;
  enabledInitialized = false;
  enabledListeners.clear();
}
