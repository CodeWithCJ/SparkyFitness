import * as Notifications from 'expo-notifications';
import {
  ensureMoodCheckinChannel,
  MOOD_CHECKIN_CHANNEL_ID,
  notificationCopy,
} from './notifications';
import {
  MAX_CHECKIN_REMINDERS,
  MOOD_CHECKIN_KIND,
  normalizeCheckinReminderTimes,
} from '../utils/checkinReminderTimes';
import { addLog } from './LogService';

export { MAX_CHECKIN_REMINDERS, normalizeCheckinReminderTimes };

function reminderIdentifier(index: number): string {
  return `mood_checkin_${index}`;
}

async function cancelById(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // already cancelled or never scheduled
  }
}

/** Cancels every scheduled mood check-in reminder, however it was identified. */
export async function cancelMoodCheckinReminders(): Promise<void> {
  const ids = new Set<string>();
  for (let i = 0; i < MAX_CHECKIN_REMINDERS; i++)
    ids.add(reminderIdentifier(i));
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.content.data?.kind === MOOD_CHECKIN_KIND) ids.add(n.identifier);
    }
  } catch (err) {
    addLog(
      `cancelMoodCheckinReminders failed to list: ${(err as Error).message}`,
      'ERROR'
    );
  }
  await Promise.all([...ids].map(cancelById));
}

/**
 * Schedules one repeating daily reminder per time (normalized) and returns the
 * scheduled ids. All or nothing: on any failure what was scheduled is cancelled
 * and `[]` is returned. Never prompts for permission; callers gate on it.
 */
export async function scheduleMoodCheckinReminders(
  times: readonly string[]
): Promise<string[]> {
  const ids: string[] = [];
  try {
    await ensureMoodCheckinChannel();
    const normalized = normalizeCheckinReminderTimes(times);
    for (const [index, time] of normalized.entries()) {
      const [hour, minute] = time.split(':').map(Number);
      const id = await Notifications.scheduleNotificationAsync({
        identifier: reminderIdentifier(index),
        content: {
          title: notificationCopy(
            'notifications.moodCheckin.title',
            'How are you feeling?'
          ),
          body: notificationCopy(
            'notifications.moodCheckin.body',
            'Take a quick check-in: mood, energy and focus.'
          ),
          sound: true,
          data: { kind: MOOD_CHECKIN_KIND },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: MOOD_CHECKIN_CHANNEL_ID,
        },
      });
      ids.push(id);
    }
    return ids;
  } catch (err) {
    addLog(
      `scheduleMoodCheckinReminders failed: ${(err as Error).message}`,
      'ERROR'
    );
    await Promise.all(ids.map(cancelById));
    return [];
  }
}
