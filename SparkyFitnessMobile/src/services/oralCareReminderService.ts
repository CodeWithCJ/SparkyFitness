import * as Notifications from 'expo-notifications';
import {
  ensureOralCareChannel,
  notificationCopy,
  ORAL_CARE_CHANNEL_ID,
} from './notifications';
import {
  MAX_ORAL_CARE_REMINDERS,
  normalizeOralCareReminderTimes,
  ORAL_CARE_REMINDER_KIND,
} from '../utils/checkinReminderTimes';
import { addLog } from './LogService';

function reminderIdentifier(index: number): string {
  return `oral_care_${index}`;
}

async function cancelById(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // already cancelled or never scheduled
  }
}

/** Cancels every scheduled brushing reminder, however it was identified. */
export async function cancelOralCareReminders(): Promise<void> {
  const ids = new Set<string>();
  for (let i = 0; i < MAX_ORAL_CARE_REMINDERS; i++)
    ids.add(reminderIdentifier(i));
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.content.data?.kind === ORAL_CARE_REMINDER_KIND)
        ids.add(n.identifier);
    }
  } catch (err) {
    addLog(
      `cancelOralCareReminders failed to list: ${(err as Error).message}`,
      'ERROR'
    );
  }
  await Promise.all([...ids].map(cancelById));
}

/**
 * Schedules one repeating daily brushing reminder per time and returns the ids.
 * All or nothing: on any failure what was scheduled is cancelled and `[]` is
 * returned. Never prompts for permission; callers gate on it.
 */
export async function scheduleOralCareReminders(
  times: readonly string[]
): Promise<string[]> {
  const ids: string[] = [];
  try {
    await ensureOralCareChannel();
    for (const [index, time] of normalizeOralCareReminderTimes(
      times
    ).entries()) {
      const [hour, minute] = time.split(':').map(Number);
      const id = await Notifications.scheduleNotificationAsync({
        identifier: reminderIdentifier(index),
        content: {
          title: notificationCopy(
            'notifications.oralCare.title',
            'Time to brush'
          ),
          body: notificationCopy(
            'notifications.oralCare.body',
            'Two minutes for your teeth, then log it.'
          ),
          sound: true,
          data: { kind: ORAL_CARE_REMINDER_KIND },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: ORAL_CARE_CHANNEL_ID,
        },
      });
      ids.push(id);
    }
    return ids;
  } catch (err) {
    addLog(
      `scheduleOralCareReminders failed: ${(err as Error).message}`,
      'ERROR'
    );
    await Promise.all(ids.map(cancelById));
    return [];
  }
}
