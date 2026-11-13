import { useEffect, useState } from 'react';

import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  cancelMoodCheckinReminders,
  scheduleMoodCheckinReminders,
} from '../services/moodCheckinReminderService';
import { hasNotificationPermission } from '../services/notifications';
import { addLog } from '../services/LogService';
import i18n from '../localization/i18n';

let queue: Promise<void> = Promise.resolve();

// Runs are serialized so a quick edit can't interleave its cancel/schedule
// with the previous run's and leave a stale reminder behind.
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    addLog(`Mood check-in reminder sync failed: ${String(error)}`, 'ERROR');
  });
  return queue;
}

/** Keeps scheduled mood check-in reminders matching the preferences. */
const MoodCheckinReminderReconciler: React.FC = () => {
  const checkinRemindersEnabled = useAppPreferencesStore(
    (s) => s.checkinRemindersEnabled
  );
  const checkinReminderTimes = useAppPreferencesStore(
    (s) => s.checkinReminderTimes
  );
  const notificationsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled
  );
  const [languageRevision, setLanguageRevision] = useState(0);
  const timesKey = checkinReminderTimes.join(',');

  useEffect(() => {
    const times = timesKey ? timesKey.split(',') : [];
    void enqueue(async () => {
      await cancelMoodCheckinReminders();
      if (
        notificationsEnabled &&
        checkinRemindersEnabled &&
        (await hasNotificationPermission())
      ) {
        await scheduleMoodCheckinReminders(times);
      }
    });
  }, [
    checkinRemindersEnabled,
    timesKey,
    notificationsEnabled,
    languageRevision,
  ]);

  useEffect(() => {
    const onLanguageChanged = () =>
      setLanguageRevision((revision) => revision + 1);
    i18n.on('languageChanged', onLanguageChanged);
    return () => i18n.off('languageChanged', onLanguageChanged);
  }, []);

  return null;
};

export default MoodCheckinReminderReconciler;
