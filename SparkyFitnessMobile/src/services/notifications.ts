import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';
import { addLog } from './LogService';
import { fireSuccessHaptic } from './haptics';
import { ExactAlarmBridge } from './ExactAlarmBridge';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../stores/appPreferencesStore';

const CHANNEL_ID = 'workout-timer';
const FASTING_CHANNEL_ID = 'fasting';
const EXACT_ALARM_PROMPT_KEY = '@SparkyFitness/exactAlarmPromptShown';

const REST_COMPLETE_CATEGORY = 'rest-complete';
/**
 * actionIdentifier of the "Complete Set" button on the rest-complete ping.
 * Responses are dispatched to the store by `initWorkoutNotificationActions`
 * in activeWorkoutStore.ts.
 */
export const COMPLETE_SET_ACTION = 'complete-set';

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

    // "Complete Set" button on the rest-complete ping. The press is handled
    // in the background — no app open; iOS reveals it on long-press/pull-down,
    // Android shows it directly on the notification.
    await Notifications.setNotificationCategoryAsync(REST_COMPLETE_CATEGORY, [
      {
        identifier: COMPLETE_SET_ACTION,
        buttonTitle: 'Complete Set',
        options: { opensAppToForeground: false },
      },
    ]);
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

/**
 * One-time Android prompt for the "Alarms & reminders" special access.
 * Without it, expo-notifications schedules inexact alarms that the OS batches
 * ~15s late, so the rest-complete ping lags the actual deadline. Denied by
 * default on Android 13+; only the user can grant it, via system settings.
 */
export async function maybePromptForExactAlarmPermission(): Promise<void> {
  if (!ExactAlarmBridge.isAvailable) return;
  if (!useAppPreferencesStore.getState().notificationsEnabled) return;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status !== 'granted') return;
    if (await ExactAlarmBridge.canScheduleExactAlarms()) return;
    if ((await AsyncStorage.getItem(EXACT_ALARM_PROMPT_KEY)) === 'true') return;
    await AsyncStorage.setItem(EXACT_ALARM_PROMPT_KEY, 'true');
    Alert.alert(
      'On-time rest alerts',
      'Android delays scheduled alerts unless SparkyFitness is allowed to set exact alarms. Enable "Alarms & reminders" so rest timers ring on time.',
      [
        { text: 'Not Now', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            void ExactAlarmBridge.openExactAlarmSettings().catch(
              (err: unknown) => {
                addLog(
                  `openExactAlarmSettings failed: ${(err as Error).message}`,
                  'ERROR',
                );
              },
            );
          },
        },
      ],
    );
  } catch (err) {
    addLog(
      `maybePromptForExactAlarmPermission failed: ${(err as Error).message}`,
      'ERROR',
    );
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

  // Any still-displayed rest ping is stale once the next rest starts.
  // Fire-and-forget: awaiting would delay the TIME_INTERVAL trigger, which
  // anchors its fire time at native construction.
  void dismissDeliveredRestNotifications();

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: content?.title ?? 'Rest complete',
        body: content?.body ?? exerciseName,
        sound: true,
        categoryIdentifier: REST_COMPLETE_CATEGORY,
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

/** Dismiss every already-delivered rest ping from the tray. */
async function dismissDeliveredRestNotifications(): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter((n) => n.request.content.categoryIdentifier === REST_COMPLETE_CATEGORY)
        .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
    );
  } catch (err) {
    addLog(`dismissDeliveredRestNotifications failed: ${(err as Error).message}`, 'ERROR');
  }
}

/**
 * Dismiss one delivered notification. Needed after an Android action press —
 * unlike iOS, Android leaves the notification in the tray.
 */
export async function dismissDeliveredNotification(identifier: string): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(identifier);
  } catch (err) {
    addLog(`dismissDeliveredNotification failed: ${(err as Error).message}`, 'ERROR');
  }
}

/**
 * Subscribe to notification action/tap responses. A thin wrapper so the
 * active-workout store can listen without importing expo-notifications and
 * without a store ↔ service import cycle.
 */
export function addNotificationResponseListener(
  listener: (response: Notifications.NotificationResponse) => void,
) {
  return Notifications.addNotificationResponseReceivedListener(listener);
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
