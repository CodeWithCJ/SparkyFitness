import * as Notifications from 'expo-notifications';

import { addNotificationResponseListener } from './notifications';
import { navigationRef } from '../components/ActiveWorkoutBar';
import { CHALLENGE_WEEK_LEADER_KIND } from '../utils/challenges';
import { whenNavigationReady } from '../hooks/useQuickActions';

// On Android the launch tap can arrive through both the listener and
// getLastNotificationResponse(); remember the last one so it opens once.
let lastHandledKey: string | null = null;

function openChallengeIfTapped(
  response: Notifications.NotificationResponse
): boolean {
  const data = response.notification.request.content.data;
  if (
    response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER ||
    data?.kind !== CHALLENGE_WEEK_LEADER_KIND ||
    typeof data.challengeId !== 'string'
  ) {
    return false;
  }
  const challengeId = data.challengeId;
  const key = `${response.notification.request.identifier}:${response.notification.date}`;
  if (key !== lastHandledKey) {
    lastHandledKey = key;
    whenNavigationReady(() =>
      navigationRef.navigate('ChallengeDetail', { id: challengeId })
    );
  }
  return true;
}

/**
 * Opens the challenge when its week notification is tapped, including the
 * tap that launched the app from a closed state. Returns an unsubscribe function.
 */
export function initChallengeNotificationResponses(): () => void {
  const subscription = addNotificationResponseListener(openChallengeIfTapped);

  const last = Notifications.getLastNotificationResponse();
  if (last && openChallengeIfTapped(last)) {
    Notifications.clearLastNotificationResponse();
  }

  return () => subscription.remove();
}
