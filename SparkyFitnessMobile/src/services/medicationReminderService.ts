import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { getTodayDate } from '../utils/dateUtils';
import { getDueDosesForDate } from '@workspace/shared';
import { ensureNotificationPermission, MEDICATION_REMINDER_CATEGORY } from './notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { Medication, MedicationEntry } from '../types/medications';

const CHANNEL_ID = 'medication-reminders';
const REPEAT_MINUTES = [10, 20, 30];
const schedulingLock = new Set<string>();

function medReminderKey(medicationId: string, scheduleId: string, date: string) {
  return `med_${date}_${medicationId}_${scheduleId}`;
}

async function cancelReminders(ids: string[]): Promise<void> {
  await Promise.all(ids.map(async (id) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // already cancelled or invalid
    }
  }));
}

async function scheduleReminder(
  body: string,
  triggerDate: Date,
  data: Record<string, string>,
): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Medication reminder',
        body,
        sound: true,
        categoryIdentifier: MEDICATION_REMINDER_CATEGORY,
        data,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Reconcile medication reminder notifications for today.
 * Can be called from the foreground or background.
 *
 * Uses Notifications.getAllScheduledNotificationsAsync() instead of an
 * AsyncStorage ledger — every pending request already carries its content.data.
 *
 * @param medications - Active medications from the API
 * @param entries - Today's medication entries from the API
 */
export async function reconcileMedicationReminders(
  medications: Medication[],
  entries: MedicationEntry[],
): Promise<void> {
  if (schedulingLock.has('medication-reminders')) return;
  schedulingLock.add('medication-reminders');

  try {
    const prefs = useAppPreferencesStore.getState();
    if (!prefs.medicationRemindersEnabled || !prefs.notificationsEnabled) {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      const medIds = all
        .filter((n) => n.content.data?.medicationId)
        .map((n) => n.identifier);
      if (medIds.length > 0) await cancelReminders(medIds);
      return;
    }

    const granted = await ensureNotificationPermission();
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Medication reminders',
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: true,
      });
    }

    const today = getTodayDate();
    const dueDoses = getDueDosesForDate(medications as any, today);
    const allPending = await Notifications.getAllScheduledNotificationsAsync();

    // Only consider notifications that are medication reminders (have medicationId in data)
    const medReminders = allPending.filter((n) => n.content.data?.medicationId);
    const todayPrefix = `med_${today}`;

    // Cancel reminders for past dates
    const staleReminders = medReminders.filter((n) => {
      const key = n.content.data?.key as string | undefined;
      return key && !key.startsWith(todayPrefix);
    });
    await cancelReminders(staleReminders.map((n) => n.identifier));

    // Find which due doses don't have a logged entry
    const unloggedDoses = dueDoses.filter((due) => {
      return !entries.some(
        (e) =>
          e.medication_id === due.medication.id &&
          e.schedule_id === due.schedule.id &&
          (e.status === 'taken' || e.status === 'skipped'),
      );
    });

    // Cancel reminders for doses that have been logged
    const loggedKeys = new Set(
      dueDoses
        .filter((due) => !unloggedDoses.includes(due))
        .map((due) => medReminderKey(due.medication.id, due.schedule.id, today)),
    );
    const toCancel = medReminders.filter((n) => {
      const key = n.content.data?.key as string | undefined;
      return key && loggedKeys.has(key);
    });
    await cancelReminders(toCancel.map((n) => n.identifier));

    // Schedule reminders for unlogged doses that don't already have one
    const remainingKeys = new Set(
      medReminders
        .filter((n) => !toCancel.includes(n) && !staleReminders.includes(n))
        .map((n) => n.content.data?.key as string),
    );

    for (const due of unloggedDoses) {
      const key = medReminderKey(due.medication.id, due.schedule.id, today);
      if (remainingKeys.has(key)) continue;

      const timeOfDay = due.schedule.time_of_day;
      if (!timeOfDay) continue;

      const [hours, minutes] = timeOfDay.split(':').map(Number);
      const body = `Time to take ${due.medication.name}${due.medication.dose_amount != null ? ` (${due.medication.dose_amount} ${due.medication.dose_unit ?? ''})` : ''}`;
      const data = {
        medicationId: due.medication.id,
        scheduleId: due.schedule.id,
        entryDate: today,
        key,
      };

      // Initial reminder
      const triggerDate = new Date();
      triggerDate.setHours(hours, minutes, 0, 0);
      if (triggerDate.getTime() > Date.now()) {
        await scheduleReminder(body, triggerDate, data);
      }

      // Repeat reminders (+10, +20, +30 min)
      if (prefs.medicationReminderRepeats) {
        for (const offset of REPEAT_MINUTES) {
          const repeatDate = new Date(triggerDate.getTime() + offset * 60000);
          if (repeatDate.getTime() > Date.now()) {
            await scheduleReminder(body, repeatDate, data);
          }
        }
      }
    }
  } finally {
    schedulingLock.delete('medication-reminders');
  }
}
