import { Alert, AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';
import { addLog } from './LogService';
import {
  BRUSHING_TIMER_KIND,
  MOOD_CHECKIN_KIND,
  ORAL_CARE_REMINDER_KIND,
} from '../utils/checkinReminderTimes';
import i18n from '../localization/i18n';
import { fireSuccessHaptic } from './haptics';
import {
  willBackgroundRestChimeSound,
  playRestCompleteSound,
  willPlayRestCompleteSound,
} from './sounds';
import { ExactAlarmBridge } from './ExactAlarmBridge';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../stores/appPreferencesStore';

const CHANNEL_ID = 'workout-timer';
const FASTING_CHANNEL_ID = 'fasting';
const HYDRATION_CHANNEL_ID = 'hydration';
export const MOOD_CHECKIN_CHANNEL_ID = 'mood-checkin';
export const ORAL_CARE_CHANNEL_ID = 'oral-care';
export const MEDICATION_REMINDER_CHANNEL_ID = 'medication-reminders';
const EXACT_ALARM_PROMPT_KEY = '@SparkyFitness/exactAlarmPromptShown';

export function notificationCopy(
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>
): string {
  // i18n-audit-ignore-next-line dynamic-i18n-key -- all call sites use literal notification catalog keys.
  const translated = i18n.t(key, { defaultValue, ...options });
  if (typeof translated === 'string' && translated.length > 0) {
    return translated;
  }
  if (!options) return defaultValue;
  return defaultValue.replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
    options[token] !== undefined ? String(options[token]) : `{{${token}}}`
  );
}

const REST_COMPLETE_CATEGORY = 'rest-complete';
/**
 * actionIdentifier of the "Complete Set" button on the rest-complete ping.
 * Responses are dispatched to the store by `initWorkoutNotificationActions`
 * in activeWorkoutStore.ts.
 */
export const COMPLETE_SET_ACTION = 'complete-set';

export const MEDICATION_REMINDER_CATEGORY = 'medication-reminder';
export const MEDICATION_REMINDER_GROUP_CATEGORY = 'medication-reminder-group';
export const MEDICATION_TAKEN_ACTION = 'medication-taken';
export const MEDICATION_SKIP_ACTION = 'medication-skip';
export const MEDICATION_SNOOZE_ACTION = 'medication-snooze';

export type AppNotificationPermission = 'granted' | 'denied' | 'undetermined';

let initialized = false;
let hasShownDeniedToast = false;

/**
 * Idempotent Android channel setup. Exposed separately because reminder
 * scheduling can run from a background task, where `initNotifications`
 * (invoked from App startup) may not have run in the current JS context.
 */
export async function registerLocalizedNotificationPresentation(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: notificationCopy(
        'notifications.channels.workoutTimer',
        'Workout timer'
      ),
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync(FASTING_CHANNEL_ID, {
      name: notificationCopy('notifications.channels.fasting', 'Fasting'),
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync(HYDRATION_CHANNEL_ID, {
      name: notificationCopy(
        'notifications.channels.hydration',
        'Hydration reminders'
      ),
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
    });
    await ensureMoodCheckinChannel();
    await Notifications.setNotificationChannelAsync(
      MEDICATION_REMINDER_CHANNEL_ID,
      {
        name: notificationCopy(
          'notifications.channels.medicationReminders',
          'Medication reminders'
        ),
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: true,
      }
    );
  }

  const snoozeMinutes =
    useAppPreferencesStore.getState()?.medicationReminderSnoozeMinutes ?? 30;
  const remindInTitle = notificationCopy(
    'notifications.actions.remindInMinutes',
    'Remind in {{minutes}}m',
    { minutes: snoozeMinutes }
  );

  await Notifications.setNotificationCategoryAsync(REST_COMPLETE_CATEGORY, [
    {
      identifier: COMPLETE_SET_ACTION,
      buttonTitle: notificationCopy(
        'notifications.actions.completeSet',
        'Complete Set'
      ),
      options: { opensAppToForeground: false },
    },
  ]);
  await Notifications.setNotificationCategoryAsync(
    MEDICATION_REMINDER_GROUP_CATEGORY,
    [
      {
        identifier: MEDICATION_TAKEN_ACTION,
        buttonTitle: notificationCopy(
          'notifications.actions.logAllAsTaken',
          'Log all as taken'
        ),
        options: { opensAppToForeground: false },
      },
      {
        identifier: MEDICATION_SKIP_ACTION,
        buttonTitle: notificationCopy(
          'notifications.actions.skipAll',
          'Skip all'
        ),
        options: { opensAppToForeground: false },
      },
      {
        identifier: MEDICATION_SNOOZE_ACTION,
        buttonTitle: remindInTitle,
        options: { opensAppToForeground: false },
      },
    ]
  );
  await Notifications.setNotificationCategoryAsync(
    MEDICATION_REMINDER_CATEGORY,
    [
      {
        identifier: MEDICATION_TAKEN_ACTION,
        buttonTitle: notificationCopy(
          'notifications.actions.logAsTaken',
          'Log as taken'
        ),
        options: { opensAppToForeground: false },
      },
      {
        identifier: MEDICATION_SKIP_ACTION,
        buttonTitle: notificationCopy('notifications.actions.skip', 'Skip'),
        options: { opensAppToForeground: false },
      },
      {
        identifier: MEDICATION_SNOOZE_ACTION,
        buttonTitle: remindInTitle,
        options: { opensAppToForeground: false },
      },
    ]
  );
}

export async function ensureMoodCheckinChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(MOOD_CHECKIN_CHANNEL_ID, {
    name: notificationCopy(
      'notifications.channels.moodCheckin',
      'Mood check-ins'
    ),
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
  });
}

export async function ensureOralCareChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ORAL_CARE_CHANNEL_ID, {
    name: notificationCopy(
      'notifications.channels.oralCare',
      'Brushing reminders'
    ),
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
  });
}

export async function ensureMedicationReminderChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(
    MEDICATION_REMINDER_CHANNEL_ID,
    {
      name: notificationCopy(
        'notifications.channels.medicationReminders',
        'Medication reminders'
      ),
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
    }
  );
}

export async function ensureSymptomReminderChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('symptom-reminders', {
    name: notificationCopy(
      'notifications.channels.symptomReminders',
      'Symptom reminders'
    ),
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: true,
  });
}

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

/**
 * Updates the rest-timer notification toggle. Turning it off also cancels any
 * pending rest-complete ping so one scheduled mid-rest doesn't still fire.
 */
export async function setRestTimerNotificationsEnabled(
  enabled: boolean
): Promise<void> {
  useAppPreferencesStore.getState().setRestTimerNotificationsEnabled(enabled);
  if (!enabled) {
    await cancelScheduledRestNotifications();
  }
}

async function cancelScheduledRestNotifications(): Promise<void> {
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      pending
        .filter((n) => n.content.categoryIdentifier === REST_COMPLETE_CATEGORY)
        .map((n) =>
          Notifications.cancelScheduledNotificationAsync(n.identifier)
        )
    );
  } catch (err) {
    addLog(
      `cancelScheduledRestNotifications failed: ${(err as Error).message}`,
      'ERROR'
    );
  }
}

export async function initNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const category = notification.request.content.categoryIdentifier;
        const isMedReminder =
          category === MEDICATION_REMINDER_CATEGORY ||
          category === MEDICATION_REMINDER_GROUP_CATEGORY;
        const isRestPing = category === REST_COMPLETE_CATEGORY;
        const kind = notification.request.content.data?.kind;
        const isMoodCheckin =
          kind === MOOD_CHECKIN_KIND || kind === ORAL_CARE_REMINDER_KIND;
        // iOS also runs this while the app is frontmost-but-inactive (screen
        // locking, app switcher), where the chime never plays — so there the
        // ping carries the cue itself instead of being hidden as a duplicate.
        const restPingOwnsCue =
          isRestPing && AppState.currentState !== 'active';
        // The brushing timer chimes in the app; its ping is for when it is not.
        const brushingPingOwnsCue =
          kind === BRUSHING_TIMER_KIND && AppState.currentState !== 'active';
        return {
          shouldShowBanner:
            isMedReminder ||
            isMoodCheckin ||
            restPingOwnsCue ||
            brushingPingOwnsCue,
          shouldShowList:
            isMedReminder ||
            isMoodCheckin ||
            restPingOwnsCue ||
            brushingPingOwnsCue,
          // Muted only while the chime owns the cue, so the two never double up.
          shouldPlaySound: !(isRestPing && willPlayRestCompleteSound()),
          shouldSetBadge: false,
        };
      },
    });

    await registerLocalizedNotificationPresentation();
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
        text1: notificationCopy(
          'notifications.permission.notificationsOff',
          'Notifications off'
        ),
        text2: notificationCopy(
          'notifications.permission.timerInApp',
          'Timer will still alert in the app.'
        ),
      });
    }
    return false;
  } catch (err) {
    addLog(
      `ensureNotificationPermission failed: ${(err as Error).message}`,
      'ERROR'
    );
    return false;
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  return (await getNotificationPermissionStatus()) === 'granted';
}

export async function getNotificationPermissionStatus(): Promise<AppNotificationPermission> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return 'granted';
    if (current.status === 'denied') return 'denied';
    return 'undetermined';
  } catch (err) {
    addLog(
      `getNotificationPermissionStatus failed: ${(err as Error).message}`,
      'ERROR'
    );
    return 'undetermined';
  }
}

export async function openSystemNotificationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (err) {
    addLog(
      `openSystemNotificationSettings failed: ${(err as Error).message}`,
      'ERROR'
    );
  }
}

/**
 * Request notification permission without any interstitial UI. The OS shows
 * its prompt only while the status is undetermined; once denied or granted
 * this resolves with the current status silently — after a denial only system
 * settings can change it.
 */
export async function requestNotificationPermission(): Promise<AppNotificationPermission> {
  try {
    const requested = await Notifications.requestPermissionsAsync();
    if (requested.status === 'granted') return 'granted';
    return requested.status === 'denied' ? 'denied' : 'undetermined';
  } catch (err) {
    addLog(
      `requestNotificationPermission failed: ${(err as Error).message}`,
      'ERROR'
    );
    return 'undetermined';
  }
}

/**
 * One-time Android prompt for the "Alarms & reminders" special access.
 * Without it, expo-notifications schedules inexact alarms that the OS batches
 * ~15s late, so rest-complete pings and medication reminders lag their
 * deadline. Denied by default on Android 13+; only the user can grant it,
 * via system settings.
 */
export async function maybePromptForExactAlarmPermission(): Promise<void> {
  if (!ExactAlarmBridge.isAvailable) return;
  if (!useAppPreferencesStore.getState().notificationsEnabled) return;
  try {
    if (!(await hasNotificationPermission())) return;
    if (await ExactAlarmBridge.canScheduleExactAlarms()) return;
    if ((await AsyncStorage.getItem(EXACT_ALARM_PROMPT_KEY)) === 'true') return;
    await AsyncStorage.setItem(EXACT_ALARM_PROMPT_KEY, 'true');
    Alert.alert(
      notificationCopy('notifications.exactAlarm.title', 'On-time alerts'),
      notificationCopy(
        'notifications.exactAlarm.message',
        'Android delays scheduled alerts unless SparkyFitness is allowed to set exact alarms. Enable \"Alarms & reminders\" so rest timers and medication reminders ring on time.'
      ),
      [
        {
          text: notificationCopy('notifications.exactAlarm.notNow', 'Not Now'),
          style: 'cancel',
        },
        {
          text: notificationCopy(
            'notifications.exactAlarm.openSettings',
            'Open Settings'
          ),
          onPress: () => {
            void ExactAlarmBridge.openExactAlarmSettings().catch(
              (err: unknown) => {
                addLog(
                  `openExactAlarmSettings failed: ${(err as Error).message}`,
                  'ERROR'
                );
              }
            );
          },
        },
      ]
    );
  } catch (err) {
    addLog(
      `maybePromptForExactAlarmPermission failed: ${(err as Error).message}`,
      'ERROR'
    );
  }
}

export async function scheduleRestNotification(
  exerciseName: string,
  seconds: number,
  content?: { title?: string; body?: string }
): Promise<string | null> {
  const prefs = useAppPreferencesStore.getState();
  if (!prefs.notificationsEnabled || !prefs.restTimerNotificationsEnabled)
    return null;

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  // Any still-displayed rest ping is stale once the next rest starts.
  // Fire-and-forget: awaiting would delay the TIME_INTERVAL trigger, which
  // anchors its fire time at native construction.
  void dismissDeliveredRestNotifications();

  const chimeSounds = await willBackgroundRestChimeSound();

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title:
          content?.title ??
          notificationCopy('notifications.rest.title', 'Rest complete'),
        body: content?.body ?? exerciseName,
        // With the background chime on, the chime is the sound and the ping
        // only shows the banner, so the two never ding together.
        sound: !chimeSounds,
        categoryIdentifier: REST_COMPLETE_CATEGORY,
        // At the default `active` level a Focus mode delivers the alert
        // silently, which defeats the point of a rest timer. Needs the
        // entitlement in app.config.ts; iOS falls back to `active` without it.
        interruptionLevel: 'timeSensitive',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        channelId: CHANNEL_ID,
      },
    });
    return id;
  } catch (err) {
    addLog(
      `scheduleRestNotification failed: ${(err as Error).message}`,
      'ERROR'
    );
    return null;
  }
}

let brushingTimerNotificationId: string | null = null;

/**
 * Pings when the brushing timer reaches its target while the app is in the
 * background or the phone is locked; in the app the chime is the cue. Replaces
 * any earlier ping, and schedules nothing without notifications or permission.
 */
export async function scheduleBrushingTimerNotification(
  seconds: number
): Promise<void> {
  await cancelBrushingTimerNotification();
  if (seconds <= 0) return;
  if (!useAppPreferencesStore.getState().notificationsEnabled) return;
  if (!(await hasNotificationPermission())) return;
  try {
    await ensureOralCareChannel();
    brushingTimerNotificationId = await Notifications.scheduleNotificationAsync(
      {
        content: {
          title: notificationCopy(
            'notifications.brushingTimer.title',
            'Brushing done'
          ),
          body: notificationCopy(
            'notifications.brushingTimer.body',
            'Open SparkyFitness to save the brush.'
          ),
          sound: true,
          data: { kind: BRUSHING_TIMER_KIND },
          interruptionLevel: 'timeSensitive',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, Math.round(seconds)),
          channelId: ORAL_CARE_CHANNEL_ID,
        },
      }
    );
  } catch (err) {
    addLog(
      `scheduleBrushingTimerNotification failed: ${(err as Error).message}`,
      'ERROR'
    );
  }
}

export async function cancelBrushingTimerNotification(): Promise<void> {
  const id = brushingTimerNotificationId;
  brushingTimerNotificationId = null;
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // already fired or cancelled
  }
}

/** Dismiss every already-delivered rest ping from the tray. */
async function dismissDeliveredRestNotifications(): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter(
          (n) => n.request.content.categoryIdentifier === REST_COMPLETE_CATEGORY
        )
        .map((n) =>
          Notifications.dismissNotificationAsync(n.request.identifier)
        )
    );
  } catch (err) {
    addLog(
      `dismissDeliveredRestNotifications failed: ${(err as Error).message}`,
      'ERROR'
    );
  }
}

/**
 * Dismiss one delivered notification. Needed after an Android action press —
 * unlike iOS, Android leaves the notification in the tray.
 */
export async function dismissDeliveredNotification(
  identifier: string
): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(identifier);
  } catch (err) {
    addLog(
      `dismissDeliveredNotification failed: ${(err as Error).message}`,
      'ERROR'
    );
  }
}

/**
 * Subscribe to notification action/tap responses. A thin wrapper so the
 * active-workout store can listen without importing expo-notifications and
 * without a store ↔ service import cycle.
 */
export function addNotificationResponseListener(
  listener: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(listener);
}

/**
 * Schedules a local notification to fire at a fast's goal (target end) time.
 * Returns the scheduled notification id, or `null` when the target is already
 * past / invalid, or notification permission was denied.
 */
export async function scheduleFastGoalNotification(
  targetEndTime: string
): Promise<string | null> {
  const prefs = useAppPreferencesStore.getState();
  if (!prefs.notificationsEnabled || !prefs.fastingGoalNotificationsEnabled)
    return null;

  const target = new Date(targetEndTime);
  if (Number.isNaN(target.getTime()) || target.getTime() <= Date.now()) {
    return null;
  }

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: notificationCopy(
          'notifications.fasting.title',
          'Fasting goal reached'
        ),
        body: notificationCopy(
          'notifications.fasting.body',
          "You've hit your fasting goal. Great work!"
        ),
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
    addLog(
      `scheduleFastGoalNotification failed: ${(err as Error).message}`,
      'ERROR'
    );
    return null;
  }
}

/**
 * Schedules a notification 30 minutes (or custom minutes) prior to fasting goal completion.
 */
export async function scheduleFastPreEndNotification(
  targetEndTime: string,
  preEndMinutes: number = 30
): Promise<string | null> {
  const prefs = useAppPreferencesStore.getState();
  if (!prefs.notificationsEnabled || !prefs.fastingGoalNotificationsEnabled)
    return null;

  const target = new Date(targetEndTime);
  const preEnd = new Date(target.getTime() - preEndMinutes * 60 * 1000);
  if (Number.isNaN(preEnd.getTime()) || preEnd.getTime() <= Date.now()) {
    return null;
  }

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: notificationCopy(
          'notifications.fastingPreEnd.title',
          'Fasting goal ending soon'
        ),
        body: notificationCopy(
          'notifications.fastingPreEnd.body',
          `Your fast will reach its goal in ${preEndMinutes} minutes.`,
          { minutes: preEndMinutes }
        ),
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: preEnd,
        channelId: FASTING_CHANNEL_ID,
      },
    });
    return id;
  } catch (err) {
    addLog(
      `scheduleFastPreEndNotification failed: ${(err as Error).message}`,
      'ERROR'
    );
    return null;
  }
}

/**
 * Schedules one hydration reminder per future time and returns the ids that
 * were scheduled. Never prompts for permission: this runs from a background
 * reconcile, and the settings toggle only turns on once permission is granted.
 */
export async function scheduleWaterReminderNotifications(
  times: Date[]
): Promise<string[]> {
  const prefs = useAppPreferencesStore.getState();
  if (!prefs.notificationsEnabled || !prefs.waterReminderEnabled) return [];
  if (!(await hasNotificationPermission())) return [];

  const nowMs = Date.now();
  const ids: string[] = [];
  for (const time of times) {
    const timeMs = time.getTime();
    if (Number.isNaN(timeMs) || timeMs <= nowMs) continue;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: notificationCopy(
            'notifications.hydration.title',
            'Time to hydrate 💧'
          ),
          body: notificationCopy(
            'notifications.hydration.body',
            "You haven't logged any water in a while."
          ),
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: time,
          channelId: HYDRATION_CHANNEL_ID,
        },
      });
      ids.push(id);
    } catch (err) {
      addLog(
        `scheduleWaterReminderNotifications failed: ${(err as Error).message}`,
        'ERROR'
      );
      // All or nothing. A half-scheduled chain gets persisted as reconciled,
      // and the signature guard then blocks a retry for the reminders that
      // never made it. Returning nothing keeps the caller on its "an empty
      // result is not persisted" path, so the next reconcile tries again.
      await Promise.all(ids.map((id) => cancelScheduledNotification(id)));
      return [];
    }
  }
  return ids;
}

export async function cancelScheduledNotification(
  id: string | null
): Promise<void> {
  if (id == null) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (err) {
    addLog(
      `cancelScheduledNotification failed: ${(err as Error).message}`,
      'ERROR'
    );
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
    addLog(
      `cancelAllScheduledNotifications failed: ${(err as Error).message}`,
      'ERROR'
    );
  }
}

/** Haptic + optional foreground chime for the resting → ready flip. */
export function fireRestCompleteCue(): void {
  fireSuccessHaptic();
  playRestCompleteSound();
}

/** Test-only helper — resets module-level state and the preferences store. */
export function __resetNotificationStateForTests(): void {
  initialized = false;
  hasShownDeniedToast = false;
  __resetAppPreferencesStoreForTests();
}
