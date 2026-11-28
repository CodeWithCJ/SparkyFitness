import * as Notifications from 'expo-notifications';
import {
  ensureOralCareChannel,
  hasNotificationPermission,
  notificationCopy,
  ORAL_CARE_CHANNEL_ID,
} from './notifications';
import {
  MAX_ORAL_CARE_REMINDERS,
  normalizeOralCareReminderTimes,
  ORAL_CARE_REMINDER_KIND,
} from '../utils/checkinReminderTimes';
import { addLog } from './LogService';
import i18n from '../localization/i18n';

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
async function cancelOralCareReminders(): Promise<void> {
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

/** The language reminders are written in now, stamped on each one. */
function reminderLanguage(): string {
  return i18n.resolvedLanguage ?? '';
}

/** What each scheduled brushing reminder was made with. One scheduled before
 * the stamps were added has neither, so it never counts as current. */
async function scheduledOralCareReminders(): Promise<
  { time: unknown; language: unknown }[]
> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled
    .filter((n) => n.content.data?.kind === ORAL_CARE_REMINDER_KIND)
    .map((n) => ({
      time: n.content.data?.time,
      language: n.content.data?.language,
    }));
}

/** Whether the scheduled reminders are exactly `times`, in today's language. */
function isCurrent(
  scheduled: { time: unknown; language: unknown }[],
  times: readonly string[]
): boolean {
  const wanted = normalizeOralCareReminderTimes(times);
  const language = reminderLanguage();
  const have = scheduled
    .map(({ time }) => (typeof time === 'string' ? time : ''))
    .sort();
  return (
    have.length === wanted.length &&
    [...wanted].sort().every((time, index) => have[index] === time) &&
    scheduled.every((reminder) => reminder.language === language)
  );
}

/** Clears the brushing reminders already shown in the notification tray. */
async function dismissDeliveredOralCareReminders(): Promise<void> {
  if (
    typeof Notifications.getPresentedNotificationsAsync !== 'function' ||
    typeof Notifications.dismissNotificationAsync !== 'function'
  ) {
    return;
  }
  const presented = await Notifications.getPresentedNotificationsAsync().catch(
    () => []
  );
  await Promise.all(
    presented
      .filter((n) => n.request.content.data?.kind === ORAL_CARE_REMINDER_KIND)
      .map(async (n) => {
        try {
          await Notifications.dismissNotificationAsync(n.request.identifier);
        } catch {
          // already dismissed
        }
      })
  );
}

/** What the caller decided about the brushing reminders. */
export interface OralCareReminderPlan {
  /**
   * `on` schedules one reminder a day per time (with notification
   * permission, never asked for here); `off` only cancels them; `keep` does
   * what `on` does only when some are scheduled, so a change of time or
   * language applies without deciding whether they should be on (oral care's
   * switch could not be read).
   */
  mode: 'on' | 'off' | 'keep';
  times: readonly string[];
  /** Also clears the ones already in the notification tray: oral care was
   * turned off in Settings → Features (#3487). */
  dismissDelivered?: boolean;
  /** Leaves them untouched when the scheduled ones are already these times
   * in today's language, as the background task asks: the app reschedules
   * them on every change, so it alone keeps them up to date. */
  skipWhenCurrent?: boolean;
}

let queue: Promise<void> = Promise.resolve();

/**
 * Brings the scheduled brushing reminders in line with `plan`: cancels them
 * all, then schedules the times unless the plan is `off`. Runs are
 * serialized, for the app (`OralCareReminderReconciler`) and the background
 * task alike, so a quick edit cannot interleave its cancel and schedule with
 * the previous run's and leave a stale reminder behind; the last call wins.
 * Each reminder carries the time and language it was made with
 * (`data.time`, `data.language`), which `keep` and `skipWhenCurrent` read.
 */
export function reconcileOralCareReminders(
  plan: OralCareReminderPlan
): Promise<void> {
  queue = queue
    .then(async () => {
      if (
        plan.mode !== 'off' &&
        (plan.mode === 'keep' || plan.skipWhenCurrent)
      ) {
        const scheduled = await scheduledOralCareReminders();
        if (plan.mode === 'keep' && scheduled.length === 0) return;
        if (plan.skipWhenCurrent && isCurrent(scheduled, plan.times)) return;
      }
      await cancelOralCareReminders();
      if (plan.dismissDelivered) await dismissDeliveredOralCareReminders();
      if (plan.mode !== 'off' && (await hasNotificationPermission())) {
        await scheduleOralCareReminders(plan.times);
      }
    })
    .catch((error: unknown) => {
      addLog(`Brushing reminder sync failed: ${String(error)}`, 'ERROR');
    });
  return queue;
}

/**
 * Schedules one repeating daily brushing reminder per time and returns the ids.
 * All or nothing: on any failure what was scheduled is cancelled and `[]` is
 * returned. Never prompts for permission; callers gate on it.
 */
async function scheduleOralCareReminders(
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
          data: {
            kind: ORAL_CARE_REMINDER_KIND,
            time,
            language: reminderLanguage(),
          },
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
