import * as Notifications from 'expo-notifications';

import { addDays, getDeviceTimezone, getTodayDate } from '../utils/dateUtils';
import { getDueDosesForDate } from '@workspace/shared';
import {
  ensureMedicationReminderChannel,
  hasNotificationPermission,
  MEDICATION_REMINDER_CATEGORY,
  MEDICATION_REMINDER_CHANNEL_ID,
} from './notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { MedicationDetail, MedicationEntry } from '@workspace/shared';
import { isDoseLogged } from '../utils/medications';
import { addLog } from './LogService';

const REPEAT_MINUTES = [10, 20, 30];
// iOS keeps only the 64 soonest pending notifications, so base reminders get a
// bounded lookahead and the repeat pings stay today-only.
const REMINDER_LOOKAHEAD_DAYS = 7;
const schedulingLock = new Set<string>();

function medReminderKey(medicationId: string, scheduleId: string, date: string, timeOfDay: string) {
  return `med_${date}_${medicationId}_${scheduleId}_${timeOfDay}`;
}

function repeatMedReminderKey(baseKey: string, offset: number) {
  return `${baseKey}_${offset}`;
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
        channelId: MEDICATION_REMINDER_CHANNEL_ID,
      },
    });
  } catch (err) {
    addLog(`scheduleReminder failed: ${(err as Error).message}`, 'ERROR');
    return null;
  }
}

/**
 * Reconcile medication reminder notifications.
 * Can be called from the foreground or background.
 *
 * Base reminders cover the next REMINDER_LOOKAHEAD_DAYS days so doses still
 * fire on days the app never wakes; repeat pings are today-only.
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

    const granted = await hasNotificationPermission();
    if (!granted) {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      const medIds = all
        .filter((n) => n.content.data?.medicationId)
        .map((n) => n.identifier);
      if (medIds.length > 0) await cancelReminders(medIds);
      return;
    }

    await ensureMedicationReminderChannel();

    const today = getTodayDate();
    const tz = getDeviceTimezone();
    const hideNames = prefs.medicationReminderHideNames;

    const desiredKeys = new Set<string>();
    const dosesToSchedule: {
      due: ReturnType<typeof getDueDosesForDate<MedicationDetail>>[number];
      timeOfDay: string;
      date: string;
      withRepeats: boolean;
    }[] = [];

    for (let dayOffset = 0; dayOffset < REMINDER_LOOKAHEAD_DAYS; dayOffset++) {
      const date = addDays(today, dayOffset);
      const isToday = dayOffset === 0;

      for (const due of getDueDosesForDate(medications, date, tz)) {
        const timeOfDay = due.schedule.time_of_day;
        if (!timeOfDay) continue;

        // Entries only cover today; future doses can't have been logged yet.
        if (isToday && isDoseLogged(entries, due.medication.id, due.schedule.id)) {
          continue;
        }

        const baseKey = medReminderKey(due.medication.id, due.schedule.id, date, timeOfDay);
        desiredKeys.add(baseKey);

        const withRepeats = isToday && prefs.medicationReminderRepeats;
        if (withRepeats) {
          for (const offset of REPEAT_MINUTES) {
            desiredKeys.add(repeatMedReminderKey(baseKey, offset));
          }
        }

        dosesToSchedule.push({ due, timeOfDay, date, withRepeats });
      }
    }

    const allPending = await Notifications.getAllScheduledNotificationsAsync();
    const toCancel = allPending
      .filter((n) => {
        if (!n.content.data?.medicationId) return false;
        const key = n.content.data.key as string | undefined;
        if (!key || !desiredKeys.has(key)) return true;
        // Pending content baked in the name (or lack of one) at schedule time;
        // a hide-names preference flip must cancel so the loop below
        // reschedules with matching content. Unstamped requests predate the
        // preference and carry the name.
        return (n.content.data.hideNames === 'true') !== hideNames;
      })
      .map((n) => n.identifier);
    if (toCancel.length > 0) await cancelReminders(toCancel);

    const pendingKeys = new Set(
      allPending
        .filter((n) => n.content.data?.medicationId && toCancel.indexOf(n.identifier) === -1)
        .map((n) => n.content.data?.key as string),
    );

    for (const { due, timeOfDay, date, withRepeats } of dosesToSchedule) {
      const baseKey = medReminderKey(due.medication.id, due.schedule.id, date, timeOfDay);

      const [hours, minutes] = timeOfDay.split(':').map(Number);
      const body = hideNames
        ? 'You have a scheduled dose'
        : `Scheduled dose: ${due.medication.name}${due.medication.dose_amount != null ? ` (${due.medication.dose_amount} ${due.medication.dose_unit ?? ''})` : ''}`;
      const data = {
        medicationId: due.medication.id,
        scheduleId: due.schedule.id,
        entryDate: date,
        key: baseKey,
        baseKey,
        hideNames: String(hideNames),
      };

      const [year, month, day] = date.split('-').map(Number);
      const triggerDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
      if (!pendingKeys.has(baseKey) && triggerDate.getTime() > Date.now()) {
        await scheduleReminder(body, triggerDate, data);
      }

      // Checked per key, not per dose: enabling repeats mid-day must still add
      // the repeat pings behind an already-pending base reminder.
      if (withRepeats) {
        for (const offset of REPEAT_MINUTES) {
          const repeatKey = repeatMedReminderKey(baseKey, offset);
          if (pendingKeys.has(repeatKey)) continue;
          const repeatDate = new Date(triggerDate.getTime() + offset * 60000);
          if (repeatDate.getTime() > Date.now()) {
            await scheduleReminder(body, repeatDate, { ...data, key: repeatKey });
          }
        }
      }
    }
  } finally {
    schedulingLock.delete('medication-reminders');
  }
}
