import * as Notifications from 'expo-notifications';

import { addNotificationResponseListener } from './notifications';
import { navigationRef } from '../components/ActiveWorkoutBar';
import { MOOD_CHECKIN_KIND } from '../utils/checkinReminderTimes';
import { whenNavigationReady } from '../hooks/useQuickActions';

// On Android the launch tap can arrive through both the listener and
// getLastNotificationResponse(); remember the last one so it opens once.
let lastHandledKey: string | null = null;

function openCheckinIfTapped(
  response: Notifications.NotificationResponse
): boolean {
  if (
    response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER ||
    response.notification.request.content.data?.kind !== MOOD_CHECKIN_KIND
  ) {
    return false;
  }
  const key = `${response.notification.request.identifier}:${response.notification.date}`;
  if (key !== lastHandledKey) {
    lastHandledKey = key;
    whenNavigationReady(() => navigationRef.navigate('MoodLog'));
  }
  return true;
}

/**
 * Opens the mood check-in when a reminder is tapped, including the tap that
 * launched the app from a closed state. Returns an unsubscribe function.
 */
export function initMoodCheckinNotificationResponses(): () => void {
  const subscription = addNotificationResponseListener(openCheckinIfTapped);

  const last = Notifications.getLastNotificationResponse();
  if (last && openCheckinIfTapped(last)) {
    Notifications.clearLastNotificationResponse();
  }

  return () => subscription.remove();
}
