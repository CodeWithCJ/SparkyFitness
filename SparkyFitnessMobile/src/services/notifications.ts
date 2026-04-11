import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { addLog } from './LogService';

const CHANNEL_ID = 'workout-timer';

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
        sound: 'default',
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
        sound: 'default',
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

export async function cancelScheduledNotification(id: string | null): Promise<void> {
  if (id == null) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (err) {
    addLog(`cancelScheduledNotification failed: ${(err as Error).message}`, 'ERROR');
  }
}

export function fireRestCompleteHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Test-only helper — resets module-level state. */
export function __resetNotificationStateForTests(): void {
  initialized = false;
  hasShownDeniedToast = false;
}
