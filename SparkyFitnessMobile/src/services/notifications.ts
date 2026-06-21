import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';
import { addLog } from './LogService';
import { fireSuccessHaptic } from './haptics';

const CHANNEL_ID = 'workout-timer';
const FASTING_CHANNEL_ID = 'fasting';

let initialized = false;
let hasShownDeniedToast = false;

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
}
