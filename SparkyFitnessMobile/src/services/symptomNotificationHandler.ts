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
import {
  belongsToOtherServer,
  currentServerConfig,
} from './notificationServerScope';
import type { ServerConfig } from './storage';
import { queryClient } from '../hooks/queryClient';
import { invalidateSymptomEntryCaches } from '../hooks/useSymptoms';

// On Android the launch tap can arrive through both the listener and
// getLastNotificationResponse(), possibly with other presses in between, so
// remember the recent ones (oldest dropped first) and run each once.
const MAX_HANDLED_KEYS = 20;
const handledKeys = new Set<string>();

function markHandled(key: string): boolean {
  if (handledKeys.has(key)) return false;
  handledKeys.add(key);
  if (handledKeys.size > MAX_HANDLED_KEYS) {
    const oldest = handledKeys.values().next().value;
    if (oldest !== undefined) handledKeys.delete(oldest);
  }
  return true;
}

function readNudgeData(
  content: Notifications.NotificationContent
): { episodeId: string; symptomName: string; serverId: string | null } | null {
  const data = content.data as Record<string, unknown> | null | undefined;
  const episodeId = data?.episodeId;
  if (typeof episodeId !== 'string' || episodeId.length === 0) return null;
  const symptomName =
    typeof data?.symptomName === 'string' ? data.symptomName : '';
  const serverId = typeof data?.serverId === 'string' ? data.serverId : null;
  return { episodeId, symptomName, serverId };
}

async function endEpisodeFromNudge(
  episodeId: string,
  serverConfig: ServerConfig
): Promise<void> {
  try {
    await endSymptomEpisode(
      episodeId,
      { ended_at: new Date().toISOString() },
      serverConfig
    );
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
  if (!markHandled(key)) return true;

  void dismissDeliveredNotification(identifier);
  const nudge = readNudgeData(content);
  if (!nudge) {
    addLog('[Symptoms] Nudge action without an episode id', 'WARNING');
    return true;
  }

  void runNudgeAction(actionIdentifier, nudge);
  return true;
}

async function runNudgeAction(
  actionIdentifier: string,
  nudge: { episodeId: string; symptomName: string; serverId: string | null }
): Promise<void> {
  // The episode lives on the server the nudge was scheduled for; after a
  // server switch, acting on it would hit the wrong server. The checked
  // config is used for the action too, so a switch while it runs can't
  // redirect it.
  const serverConfig = await currentServerConfig();
  if (!serverConfig) {
    // Nothing to check an unstamped (older) nudge against, and nothing to
    // send the action to.
    addLog('[Symptoms] Nudge action with no active server; ignored', 'WARNING');
    if (actionIdentifier === SYMPTOM_END_EPISODE_ACTION) {
      Toast.show({
        type: 'error',
        text1: notificationCopy(
          'symptoms.endFailed',
          'Could not end the episode'
        ),
      });
    }
    return;
  }
  if (belongsToOtherServer(nudge.serverId, serverConfig.id)) {
    addLog(
      '[Symptoms] Nudge action belongs to another server; ignored',
      'WARNING'
    );
    Toast.show({
      type: 'info',
      text1: notificationCopy(
        'symptoms.notification.otherServer',
        'This reminder is from another server'
      ),
    });
    return;
  }

  if (actionIdentifier === SYMPTOM_END_EPISODE_ACTION) {
    await endEpisodeFromNudge(nudge.episodeId, serverConfig);
  } else {
    // Ask again in another 24 hours, counted from now.
    await scheduleOngoingEpisodeNudge(
      nudge.episodeId,
      nudge.symptomName,
      new Date().toISOString(),
      { serverId: serverConfig.id }
    );
  }
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
