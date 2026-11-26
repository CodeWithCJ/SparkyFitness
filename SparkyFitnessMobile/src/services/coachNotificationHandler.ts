import * as Notifications from 'expo-notifications';

import { addNotificationResponseListener } from './notifications';
import { navigationRef } from '../components/ActiveWorkoutBar';
import { COACH_MESSAGE_KIND } from './coachNotificationService';
import {
  currentServerId,
  belongsToOtherServer,
} from './notificationServerScope';
import { whenNavigationReady } from '../hooks/useQuickActions';

// On Android the launch tap can arrive through both the listener and
// getLastNotificationResponse(); remember the last one so it opens once.
let lastHandledKey: string | null = null;

async function openCoachThreadIfTapped(
  response: Notifications.NotificationResponse
): Promise<boolean> {
  const data = response.notification.request.content.data;
  if (
    response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER ||
    data?.kind !== COACH_MESSAGE_KIND ||
    typeof data.coachId !== 'string'
  ) {
    return false;
  }
  const key = `${response.notification.request.identifier}:${response.notification.date}`;
  if (key === lastHandledKey) return true;
  lastHandledKey = key;
  // A message from another saved server must not open this server's chat.
  const serverId = typeof data.serverId === 'string' ? data.serverId : null;
  if (belongsToOtherServer(serverId, await currentServerId())) return true;
  const coachId = data.coachId;
  whenNavigationReady(() => navigationRef.navigate('Chat', { coachId }));
  return true;
}

/**
 * Opens the coach's thread when its message notification is tapped, including
 * the tap that launched the app. Returns an unsubscribe function.
 */
export function initCoachNotificationResponses(): () => void {
  const subscription = addNotificationResponseListener((response) => {
    void openCoachThreadIfTapped(response);
  });

  const last = Notifications.getLastNotificationResponse();
  if (last) {
    void openCoachThreadIfTapped(last).then((handled) => {
      if (handled) Notifications.clearLastNotificationResponse();
    });
  }
  return () => subscription.remove();
}
