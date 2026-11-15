import * as Notifications from 'expo-notifications';
import i18n from '../localization/i18n';
import { addLog } from './LogService';
import {
  hasNotificationPermission,
  SYMPTOM_EPISODE_NUDGE_CATEGORY,
} from './notifications';
import { currentServerId } from './notificationServerScope';

const SYMPTOM_REMINDER_CHANNEL_ID = 'symptom-reminders';

const ONGOING_NUDGE_PREFIX = 'symptom_nudge_';

export async function scheduleOngoingEpisodeNudge(
  episodeId: string,
  symptomName: string,
  startedAt: string,
  nudgeHours = 24
): Promise<void> {
  const notifId = `${ONGOING_NUDGE_PREFIX}${episodeId}`;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
    if (!(await hasNotificationPermission())) return;

    const startTime = new Date(startedAt).getTime();
    const triggerTime = startTime + nudgeHours * 60 * 60 * 1000;
    const now = Date.now();
    if (triggerTime <= now) return;
    const serverId = await currentServerId();

    await Notifications.scheduleNotificationAsync({
      identifier: notifId,
      content: {
        title: i18n.t('symptoms.notification.nudgeTitle', {
          defaultValue: 'Episode still active?',
        }),
        body: i18n.t('symptoms.notification.nudgeBody', {
          defaultValue:
            '{{name}} has been running for {{hours}} hours. Is it still ongoing or ended?',
          name: symptomName,
          hours: nudgeHours,
        }),
        sound: true,
        categoryIdentifier: SYMPTOM_EPISODE_NUDGE_CATEGORY,
        // The server the episode lives on, so a button pressed after a
        // server switch is not sent to another server.
        data: { episodeId, symptomName, serverId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(triggerTime),
        channelId: SYMPTOM_REMINDER_CHANNEL_ID,
      },
    });
  } catch (err) {
    addLog(
      `scheduleOngoingEpisodeNudge failed: ${(err as Error).message}`,
      'ERROR'
    );
  }
}

export async function cancelOngoingEpisodeNudge(
  episodeId: string
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(
      `${ONGOING_NUDGE_PREFIX}${episodeId}`
    );
  } catch {
    // ignore
  }
}
