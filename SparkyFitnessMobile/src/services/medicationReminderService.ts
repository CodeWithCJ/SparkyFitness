import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { getTodayDate, addDays } from '../utils/dateUtils';
import { getDueDosesForDate } from '@workspace/shared';
import { ensureNotificationPermission, MEDICATION_REMINDER_CATEGORY } from './notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { MedicationDetail, MedicationEntry } from '../types/medications';
import { addLog } from './LogService';

export const CHANNEL_ID = 'medication-reminders';
const REPEAT_MINUTES = [10, 20, 30];
const LOOKAHEAD_DAYS = 7;
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
  } catch (err) {
    addLog(`scheduleReminder failed: ${(err as Error).message}`, 'ERROR');
    return null;
  }
}

/**
 * Reconcile medication reminder notifications for today and the next 7 days.
 * Can be called from the foreground or background.
 *
 * Uses Notifications.getAllScheduledNotificationsAsync() instead of an
 * AsyncStorage ledger — every pending request already carries its content.data.
 *
 * @param medications - Active medications from the API
 * @param entries - Today's medication entries from the API
 */
export async function reconcileMedicationReminders(
  medications: MedicationDetail[],
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

    const unloggedKeys = new Set<string>();
    const allDueByDay: { date: string; due: ReturnType<typeof getDueDosesForDate>[number] }[] = [];

    for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
      const date = addDays(today, i);
      const dueDoses = getDueDosesForDate(medications, date);

      for (const due of dueDoses) {
        allDueByDay.push({ date, due });

        const isLogged = i === 0 && entries.some(
          (e) =>
            e.medication_id === due.medication.id &&
            e.schedule_id === due.schedule.id &&
            (e.status === 'taken' || e.status === 'skipped'),
        );

        if (!isLogged) {
          unloggedKeys.add(medReminderKey(due.medication.id, due.schedule.id, date));
        }
      }
    }

    const allPending = await Notifications.getAllScheduledNotificationsAsync();
    const toCancel = allPending
      .filter((n) => {
        if (!n.content.data?.medicationId) return false;
        const key = n.content.data.key as string | undefined;
        return !key || !unloggedKeys.has(key);
      })
      .map((n) => n.identifier);
    if (toCancel.length > 0) await cancelReminders(toCancel);

    const pendingKeys = new Set(
      allPending
        .filter((n) => n.content.data?.medicationId && toCancel.indexOf(n.identifier) === -1)
        .map((n) => n.content.data?.key as string),
    );

    for (const { date, due } of allDueByDay) {
      const key = medReminderKey(due.medication.id, due.schedule.id, date);
      if (!unloggedKeys.has(key) || pendingKeys.has(key)) continue;

      const timeOfDay = due.schedule.time_of_day;
      if (!timeOfDay) continue;

      const [hours, minutes] = timeOfDay.split(':').map(Number);
      const body = `Time to take ${due.medication.name}${due.medication.dose_amount != null ? ` (${due.medication.dose_amount} ${due.medication.dose_unit ?? ''})` : ''}`;
      const data = {
        medicationId: due.medication.id,
        scheduleId: due.schedule.id,
        entryDate: date,
        key,
      };

      // Build trigger date for this specific day
      const [year, month, day] = date.split('-').map(Number);
      const triggerDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
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
