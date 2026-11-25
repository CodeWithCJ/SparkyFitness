import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useFeatureOnState } from '../hooks/useFeatureOnState';
import { useServerConfigs } from '../hooks/useServerConfigs';
import { reconcileOralCareReminders } from '../services/oralCareReminderService';
import { accountGeneration } from '../offline/accountGeneration';
import { subscribeAccountChanged } from '../offline/events';
import i18n from '../localization/i18n';

/**
 * Keeps scheduled brushing reminders matching the preferences (#1862) and the
 * Oral care switch in Settings → Features (#3487): turned off, the reminders
 * stop (and those already shown are cleared); turned back on, they come back
 * with the same times. The reminder preferences are never written.
 */
const OralCareReminderReconciler: React.FC = () => {
  const enabled = useAppPreferencesStore((s) => s.oralCareRemindersEnabled);
  const times = useAppPreferencesStore((s) => s.oralCareReminderTimes);
  const notificationsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled
  );
  const { state: featureState, refetch: refetchFeatureState } =
    useFeatureOnState('oralCare');
  // With no server at all (none set up yet, or its configuration deleted)
  // there is no switch to read: the reminders follow the preferences, as
  // before Features. They hold no account data, so nothing else has to stop
  // them. A configuration that is still loading is not "no server".
  const { activeConfigId, isLoading: isLoadingServer } = useServerConfigs();
  const noActiveServer = !isLoadingServer && activeConfigId === null;
  // An account change clears the query cache, which does not tell the
  // choices query above; the account-changed event renders this again, so it
  // reads the new account's switch.
  useSyncExternalStore(subscribeAccountChanged, accountGeneration);
  const [languageRevision, setLanguageRevision] = useState(0);
  const timesKey = times.join(',');

  useEffect(() => {
    const wanted = notificationsEnabled && enabled;
    const list = timesKey ? timesKey.split(',') : [];
    // Not known yet whether oral care is on (the choices are loading, the
    // read failed, or the app opened offline) while the preferences want
    // reminders: they stay on if they are on and off if they are off, and a
    // change of time or language applies to the ones scheduled. With a
    // preference off they are cancelled as before.
    if (wanted && featureState === 'unknown' && !noActiveServer) {
      void reconcileOralCareReminders({ mode: 'keep', times: list });
      return;
    }
    const featureOn = noActiveServer || featureState !== 'off';
    void reconcileOralCareReminders({
      mode: wanted && featureOn ? 'on' : 'off',
      times: list,
      dismissDelivered: !featureOn,
    });
  }, [
    enabled,
    timesKey,
    notificationsEnabled,
    featureState,
    noActiveServer,
    languageRevision,
  ]);

  useEffect(() => {
    const onLanguageChanged = () =>
      setLanguageRevision((revision) => revision + 1);
    i18n.on('languageChanged', onLanguageChanged);
    return () => i18n.off('languageChanged', onLanguageChanged);
  }, []);

  // A switch made on another phone applies when the app comes back, whether
  // oral care was on, off or not known yet.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetchFeatureState();
    });
    return () => subscription.remove();
  }, [refetchFeatureState]);

  return null;
};

export default OralCareReminderReconciler;
