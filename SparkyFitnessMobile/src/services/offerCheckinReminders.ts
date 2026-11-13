import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import type { TFunction } from 'i18next';
import {
  hasShownCheckinReminderOffer,
  markCheckinReminderOfferShown,
} from './checkinReminderOffer';
import { addLog } from './LogService';
import { requestNotificationPermission } from './notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { DEFAULT_CHECKIN_REMINDER_TIME } from '../utils/checkinReminderTimes';

/**
 * Offered once per device after a new check-in, only when the master toggle is
 * on and reminders are off. Call it after goBack and do not await it before
 * leaving: it must never hold up navigation. Both mood log modes share it.
 */
export async function offerCheckinReminders(t: TFunction): Promise<void> {
  const prefs = useAppPreferencesStore.getState();
  if (!prefs.notificationsEnabled || prefs.checkinRemindersEnabled) return;
  if (await hasShownCheckinReminderOffer()) return;
  await markCheckinReminderOfferShown();
  Alert.alert(
    t('mood.reminderOfferTitle', { defaultValue: 'Remind me daily?' }),
    t('mood.reminderOfferBody', {
      defaultValue:
        'Get a reminder each evening to check in. You can change the time or add more in Settings → App Settings → Notifications.',
    }),
    [
      {
        text: t('common.notNow', { defaultValue: 'Not now' }),
        style: 'cancel',
      },
      {
        text: t('mood.reminderOfferAccept', { defaultValue: 'Remind me' }),
        onPress: async () => {
          try {
            if ((await requestNotificationPermission()) === 'granted') {
              const store = useAppPreferencesStore.getState();
              store.setCheckinReminderTimes([DEFAULT_CHECKIN_REMINDER_TIME]);
              store.setCheckinRemindersEnabled(true);
            } else {
              // Same copy ensureNotificationPermission uses.
              Toast.show({
                type: 'info',
                text1: t('notifications.permission.notificationsOff', {
                  defaultValue: 'Notifications off',
                }),
              });
            }
          } catch (error) {
            addLog(
              `[Mood] Check-in reminder opt-in failed: ${error}`,
              'WARNING'
            );
          }
        },
      },
    ]
  );
}

/** Fire-and-forget wrapper: logs a failure instead of throwing. */
export function offerCheckinRemindersAfterLeaving(t: TFunction): void {
  offerCheckinReminders(t).catch((error) =>
    addLog(`[Mood] Check-in reminder offer failed: ${error}`, 'WARNING')
  );
}
