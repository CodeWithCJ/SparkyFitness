import { useEffect, useState } from 'react';

import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  cancelOralCareReminders,
  scheduleOralCareReminders,
} from '../services/oralCareReminderService';
import { hasNotificationPermission } from '../services/notifications';
import { addLog } from '../services/LogService';
import i18n from '../localization/i18n';

let queue: Promise<void> = Promise.resolve();

// Runs are serialized so a quick edit can't interleave its cancel/schedule
// with the previous run's and leave a stale reminder behind.
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    addLog(`Brushing reminder sync failed: ${String(error)}`, 'ERROR');
  });
  return queue;
}

/** Keeps scheduled brushing reminders matching the preferences (#1862). */
const OralCareReminderReconciler: React.FC = () => {
  const enabled = useAppPreferencesStore((s) => s.oralCareRemindersEnabled);
  const times = useAppPreferencesStore((s) => s.oralCareReminderTimes);
  const notificationsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled
  );
  const [languageRevision, setLanguageRevision] = useState(0);
  const timesKey = times.join(',');

  useEffect(() => {
    const list = timesKey ? timesKey.split(',') : [];
    void enqueue(async () => {
      await cancelOralCareReminders();
      if (
        notificationsEnabled &&
        enabled &&
        (await hasNotificationPermission())
      ) {
        await scheduleOralCareReminders(list);
      }
    });
  }, [enabled, timesKey, notificationsEnabled, languageRevision]);

  useEffect(() => {
    const onLanguageChanged = () =>
      setLanguageRevision((revision) => revision + 1);
    i18n.on('languageChanged', onLanguageChanged);
    return () => i18n.off('languageChanged', onLanguageChanged);
  }, []);

  return null;
};

export default OralCareReminderReconciler;
