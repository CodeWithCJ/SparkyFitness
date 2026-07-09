import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';
import { addLog } from './LogService';
import { fireSuccessHaptic } from './haptics';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../stores/appPreferencesStore';

const CHANNEL_ID = 'workout-timer';
const FASTING_CHANNEL_ID = 'fasting';

let initialized = false;
let hasShownDeniedToast = false;

/**
 * Updates the app-local notifications toggle (backed by appPreferencesStore,
 * independent of the OS notification permission). Turning notifications off also
 * cancels any alerts already scheduled (rest-timer + fasting-goal) so they don't
 * still fire after the user opts out.
 */
export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  useAppPreferencesStore.getState().setNotificationsEnabled(enabled);
  if (!enabled) {
    await cancelAllScheduledNotifications();
  }
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
  content?: { title?: string; body?: string },
): Promise<string | null> {
  if (!useAppPreferencesStore.getState().notificationsEnabled) return null;

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: content?.title ?? 'Rest complete',
        body: content?.body ?? exerciseName,
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
  if (!useAppPreferencesStore.getState().notificationsEnabled) return null;

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

/**
 * Cancels every pending local notification this app scheduled (rest-timer +
 * fasting-goal alerts). Callers' stored notification ids (the rest-timer id in
 * activeWorkoutStore, the persisted fasting goal record) are intentionally left
 * as-is: a cancel-by-stale-id is a harmless no-op, and the fasting record
 * self-heals on the next reconcile (which only re-runs when the fast actually
 * changes, at which point a stale record is dropped and rescheduled).
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    addLog(`cancelAllScheduledNotifications failed: ${(err as Error).message}`, 'ERROR');
  }
}

export function fireRestCompleteHaptic(): void {
  fireSuccessHaptic();
}

/** Test-only helper — resets module-level state and the preferences store. */
export function __resetNotificationStateForTests(): void {
  initialized = false;
  hasShownDeniedToast = false;
  __resetAppPreferencesStoreForTests();
}
