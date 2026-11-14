import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';

import {
  addNotificationResponseListener,
  dismissDeliveredNotification,
  notificationCopy,
  SYMPTOM_END_EPISODE_ACTION,
  SYMPTOM_EPISODE_NUDGE_CATEGORY,
  SYMPTOM_STILL_ONGOING_ACTION,
} from './notifications';
import {
  cancelOngoingEpisodeNudge,
  scheduleOngoingEpisodeNudge,
} from './symptomReminderService';
import { endSymptomEpisode } from './api/symptomsApi';
import { addLog } from './LogService';
import { queryClient } from '../hooks/queryClient';
import { invalidateSymptomEntryCaches } from '../hooks/useSymptoms';

// On Android the launch tap can arrive through both the listener and
// getLastNotificationResponse(); remember the last one so it runs once.
let lastHandledKey: string | null = null;

function readNudgeData(
  content: Notifications.NotificationContent
): { episodeId: string; symptomName: string } | null {
  const data = content.data as Record<string, unknown> | null | undefined;
  const episodeId = data?.episodeId;
  if (typeof episodeId !== 'string' || episodeId.length === 0) return null;
  const symptomName =
    typeof data?.symptomName === 'string' ? data.symptomName : '';
  return { episodeId, symptomName };
}

async function endEpisodeFromNudge(episodeId: string): Promise<void> {
  try {
    await endSymptomEpisode(episodeId, { ended_at: new Date().toISOString() });
    await cancelOngoingEpisodeNudge(episodeId);
    invalidateSymptomEntryCaches(queryClient);
    Toast.show({
      type: 'success',
      text1: notificationCopy(
        'symptoms.notification.episodeEnded',
        'Episode ended'
      ),
    });
  } catch (err) {
    addLog(
      `[Symptoms] Ending episode from notification failed: ${(err as Error).message}`,
      'ERROR'
    );
    Toast.show({
      type: 'error',
      text1: notificationCopy(
        'symptoms.endFailed',
        'Could not end the episode'
      ),
    });
  }
}

/** Returns true when the response was a symptom nudge button press. */
function handleNudgeAction(
  response: Notifications.NotificationResponse
): boolean {
  const { actionIdentifier, notification } = response;
  const { content, identifier } = notification.request;
  if (
    content.categoryIdentifier !== SYMPTOM_EPISODE_NUDGE_CATEGORY ||
    (actionIdentifier !== SYMPTOM_END_EPISODE_ACTION &&
      actionIdentifier !== SYMPTOM_STILL_ONGOING_ACTION)
  ) {
    return false;
  }

  const key = `${identifier}:${notification.date}:${actionIdentifier}`;
  if (key === lastHandledKey) return true;
  lastHandledKey = key;

  void dismissDeliveredNotification(identifier);
  const nudge = readNudgeData(content);
  if (!nudge) {
    addLog('[Symptoms] Nudge action without an episode id', 'WARNING');
    return true;
  }

  if (actionIdentifier === SYMPTOM_END_EPISODE_ACTION) {
    void endEpisodeFromNudge(nudge.episodeId);
  } else {
    // Ask again in another 24 hours, counted from now.
    void scheduleOngoingEpisodeNudge(
      nudge.episodeId,
      nudge.symptomName,
      new Date().toISOString()
    );
  }
  return true;
}

/**
 * Handles the "End now" and "Still ongoing" buttons on the ongoing-episode
 * nudge, including a press that launched the app from a closed state.
 * Returns an unsubscribe function.
 */
export function initSymptomNotificationActions(): () => void {
  const subscription = addNotificationResponseListener(handleNudgeAction);

  const last = Notifications.getLastNotificationResponse();
  if (last && handleNudgeAction(last)) {
    Notifications.clearLastNotificationResponse();
  }

  return () => subscription.remove();
}
