import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { getTodayDate } from '../utils/dateUtils';
import { getDueDosesForDate } from '@workspace/shared';
import { ensureNotificationPermission, MEDICATION_REMINDER_CATEGORY } from './notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { Medication, MedicationEntry } from '../types/medications';

const STORAGE_KEY = '@Medications:reminderNotifications';
const CHANNEL_ID = 'medication-reminders';
const REPEAT_MINUTES = [10, 20, 30];

interface StoredReminder {
  key: string;
  notificationIds: string[];
}

async function readStoredReminders(): Promise<StoredReminder[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStoredReminders(reminders: StoredReminder[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  } catch {
    // best-effort
  }
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
 * Can be called from the foreground or background
 *
 * @param medications - Active medications from the API
 * @param entries - Today's medication entries from the API
 */
export async function reconcileMedicationReminders(
  medications: Medication[],
  entries: MedicationEntry[],
): Promise<void> {
  const prefs = useAppPreferencesStore.getState();
  if (!prefs.medicationRemindersEnabled || !prefs.notificationsEnabled) {
    const stored = await readStoredReminders();
    if (stored.length > 0) {
      await Promise.all(stored.map((r) => cancelReminders(r.notificationIds)));
      await writeStoredReminders([]);
    }
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
  const stored = await readStoredReminders();
  const todayPrefix = `med_${today}`;

  // Cancel reminders for past dates
  const staleReminders = stored.filter((r) => !r.key.startsWith(todayPrefix));
  await Promise.all(staleReminders.map((r) => cancelReminders(r.notificationIds)));
  const freshStored = stored.filter((r) => r.key.startsWith(todayPrefix));

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
      .map((due) => `med_${today}_${due.medication.id}_${due.schedule.id}`),
  );
  const toCancel = freshStored.filter((r) => loggedKeys.has(r.key));
  await Promise.all(toCancel.map((r) => cancelReminders(r.notificationIds)));
  const afterCancel = freshStored.filter((r) => !loggedKeys.has(r.key));

  // Schedule reminders for unlogged doses that don't already have one
  const existingKeys = new Set(afterCancel.map((r) => r.key));
  const newReminders: StoredReminder[] = [];

  for (const due of unloggedDoses) {
    const key = `med_${today}_${due.medication.id}_${due.schedule.id}`;
    if (existingKeys.has(key)) continue;

    const timeOfDay = due.schedule.time_of_day;
    if (!timeOfDay) continue;

    const [hours, minutes] = timeOfDay.split(':').map(Number);
    const body = `Time to take ${due.medication.name}${due.medication.dose_amount != null ? ` (${due.medication.dose_amount} ${due.medication.dose_unit ?? ''})` : ''}`;
    const data = {
      medicationId: due.medication.id,
      scheduleId: due.schedule.id,
      entryDate: today,
    };

    const notificationIds: string[] = [];

    // Initial reminder
    const triggerDate = new Date();
    triggerDate.setHours(hours, minutes, 0, 0);
    if (triggerDate.getTime() > Date.now()) {
      const id = await scheduleReminder(body, triggerDate, data);
      if (id) notificationIds.push(id);
    }

    // Repeat reminders (+10, +20, +30 min)
    if (prefs.medicationReminderRepeats) {
      for (const offset of REPEAT_MINUTES) {
        const repeatDate = new Date(triggerDate.getTime() + offset * 60000);
        if (repeatDate.getTime() > Date.now()) {
          const id = await scheduleReminder(body, repeatDate, data);
          if (id) notificationIds.push(id);
        }
      }
    }

    if (notificationIds.length > 0) {
      newReminders.push({ key, notificationIds });
    }
  }

  if (newReminders.length > 0 || toCancel.length > 0) {
    const updated = [...afterCancel, ...newReminders];
    await writeStoredReminders(updated);
  }
}
