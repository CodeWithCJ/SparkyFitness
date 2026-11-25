import { useEffect, useReducer, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useCalendars } from 'expo-localization';

import { useMedications, useMedicationEntries } from '../hooks/useMedications';
import { useFeatureOnState } from '../hooks/useFeatureOnState';
import { useServerConfigs } from '../hooks/useServerConfigs';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getDeviceTimezone, getTodayDate } from '../utils/dateUtils';
import {
  cancelMedicationRemindersOfOtherServers,
  reconcileMedicationReminders,
} from '../services/medicationReminderService';
import {
  maybePromptForExactAlarmPermission,
  registerLocalizedNotificationPresentation,
} from '../services/notifications';
import { syncMedicationActiveUser } from '../services/backgroundWater';
import { retryPendingMedicationActions } from '../services/medicationNotificationHandler';
import { syncNativeMedicationSnoozeMinutes } from '../services/medicationNativeSync';
import { addLog } from '../services/LogService';
import { accountGeneration } from '../offline/accountGeneration';
import { subscribeAccountChanged } from '../offline/events';
import i18n from '../localization/i18n';

const FOREGROUND_CLOCK_POLL_MS = 30_000;

const MedicationReminderReconciler: React.FC = () => {
  const medicationRemindersEnabled = useAppPreferencesStore(
    (s) => s.medicationRemindersEnabled
  );
  const notificationsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled
  );
  const medicationReminderRepeats = useAppPreferencesStore(
    (s) => s.medicationReminderRepeats
  );
  const medicationReminderHideNames = useAppPreferencesStore(
    (s) => s.medicationReminderHideNames
  );
  const medicationReminderConsolidate = useAppPreferencesStore(
    (s) => s.medicationReminderConsolidate
  );
  const medicationReminderSnoozeMinutes = useAppPreferencesStore(
    (s) => s.medicationReminderSnoozeMinutes
  );
  // Medications turned off in Settings → Features (#3487) stops its
  // reminders; turning it back on brings them back. The reminder preferences
  // are never written.
  const { state: featureState, refetch: refetchFeatureState } =
    useFeatureOnState('medications');
  // With no server at all (its configuration deleted, or none set up yet) the
  // reminders are cancelled as before Features: nothing else removes the
  // reminders of an account that is gone. That is read from the stored active
  // id: a configuration whose keychain read failed, or a failed read, is not
  // "no server", and is handled like any other state that is not known.
  const { activeConfigId, isLoading: isLoadingServer } = useServerConfigs();
  const noActiveServer = !isLoadingServer && activeConfigId === null;
  // A switch to another server runs the reconcile below again, so the
  // reminders of the one switched away from stop even while the new one's
  // choices are not known.
  const activeServerId = activeConfigId ?? null;
  const remindersActive =
    featureState === 'on' && medicationRemindersEnabled && notificationsEnabled;
  const [languageRevision, setLanguageRevision] = useState(0);
  const [, bumpResumeRevision] = useReducer((n: number) => n + 1, 0);
  // The account this render's data were read for. An effect runs after its
  // render, so one that runs only once an account change has started would
  // reconcile the previous account's medications; the queue drops it.
  // Read through a hook, never by calling accountGeneration() in the body:
  // React Compiler memoizes such a call once per mounted component, so the
  // first account's number would stay and every reconcile after an account
  // change would be dropped.
  // An account change cancels every medication reminder and clears the query
  // cache, which does not tell the queries below. The account-changed event
  // renders this again, so they read the new account and the reconcile below
  // runs again: its reminders come back without waiting for the app to return
  // to the foreground.
  const readUnderAccount = useSyncExternalStore(
    subscribeAccountChanged,
    accountGeneration
  );

  // `useCalendars()` re-renders on iOS `significantTimeChangeNotification`,
  // while the foreground poll below covers Android (`expo-localization` 57.0.2
  // only observes configuration changes, not `ACTION_TIMEZONE_CHANGED`) and
  // open-app midnight rollovers.
  useCalendars();
  const timezone = getDeviceTimezone();
  const today = getTodayDate();

  const {
    data: medications,
    isLoading: isLoadingMeds,
    refetch: refetchMeds,
  } = useMedications({ activeOnly: true, enabled: remindersActive });

  const {
    data: todayEntries,
    isLoading: isLoadingEntries,
    refetch: refetchEntries,
  } = useMedicationEntries({
    fromDate: today,
    toDate: today,
    enabled: remindersActive,
  });

  useEffect(() => {
    syncNativeMedicationSnoozeMinutes();
  }, [medicationReminderSnoozeMinutes]);

  // The iOS native handler logs a reminder's Taken / Skip only for the account
  // the device is signed in to; the medications' owner is the only identity
  // available here.
  const activeUserId = medications?.find((m) => m.user_id)?.user_id ?? null;
  useEffect(() => {
    if (activeUserId) void syncMedicationActiveUser(activeUserId);
  }, [activeUserId, medications]);

  useEffect(() => {
    void registerLocalizedNotificationPresentation().catch((error) => {
      addLog(
        `Failed to update notification categories: ${(error as Error).message}`,
        'WARNING'
      );
    });
  }, [medicationReminderSnoozeMinutes, languageRevision]);

  useEffect(() => {
    // Not known yet whether Medications is on (the choices are loading, the
    // read failed, or the app opened offline) while the reminder settings
    // want reminders: the active server's reminders stay exactly as they are,
    // neither cancelled nor rescheduled. Those of a server switched away from
    // still stop, and Taken / Skip presses still waiting are replayed (the
    // reconcile that would flush them is not run). With a reminder setting
    // off, the reconcile below cancels them as before Features.
    if (
      featureState === 'unknown' &&
      !noActiveServer &&
      medicationRemindersEnabled &&
      notificationsEnabled
    ) {
      cancelMedicationRemindersOfOtherServers().catch((error) => {
        addLog(
          `Cancelling another server's medication reminders failed: ${(error as Error).message}`,
          'ERROR'
        );
      });
      void retryPendingMedicationActions();
      return;
    }
    if (remindersActive && (isLoadingMeds || isLoadingEntries)) return;

    // With reminders off, Medications off or no server, the queries stay
    // disabled; the reconcile still runs (with empty data) so any pending
    // reminders get cancelled.
    reconcileMedicationReminders(
      remindersActive ? (medications ?? []) : [],
      remindersActive ? (todayEntries ?? []) : [],
      { active: remindersActive, accountGeneration: readUnderAccount }
    ).catch((error) => {
      addLog(
        `Medication reminder reconciliation failed: ${(error as Error).message}`,
        'ERROR'
      );
    });
  }, [
    medications,
    todayEntries,
    isLoadingMeds,
    isLoadingEntries,
    featureState,
    noActiveServer,
    activeServerId,
    remindersActive,
    medicationRemindersEnabled,
    notificationsEnabled,
    medicationReminderRepeats,
    medicationReminderHideNames,
    medicationReminderConsolidate,
    today,
    timezone,
    languageRevision,
    readUnderAccount,
  ]);

  useEffect(() => {
    const onLanguageChanged = () =>
      setLanguageRevision((revision) => revision + 1);
    i18n.on('languageChanged', onLanguageChanged);
    return () => i18n.off('languageChanged', onLanguageChanged);
  }, []);

  // Reminders default on and schedules can be created on the web, so a user
  // may never hit the AppSettings toggle or a workout start — the two other
  // exact-alarm nudge sites. The helper is one-shot and Android-only.
  useEffect(() => {
    if (!remindersActive || isLoadingMeds) return;
    const hasTimedSchedule = (medications ?? []).some(
      (m) => m.schedules?.some((s) => s.time_of_day) ?? false
    );
    if (!hasTimedSchedule) return;
    void maybePromptForExactAlarmPermission();
  }, [remindersActive, isLoadingMeds, medications]);

  useEffect(() => {
    if (!remindersActive) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const checkClock = () => {
      if (getDeviceTimezone() !== timezone || getTodayDate() !== today) {
        bumpResumeRevision();
      }
    };

    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(checkClock, FOREGROUND_CLOCK_POLL_MS);
    };

    const stopPolling = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    if (AppState.currentState !== 'background') {
      startPolling();
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stopPolling();
        return;
      }
      checkClock();
      startPolling();
      void refetchMeds();
      void refetchEntries();
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [refetchMeds, refetchEntries, remindersActive, timezone, today]);

  // A switch made on another phone applies when the app comes back, whether
  // Medications was on, off or not known yet.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetchFeatureState();
    });
    return () => subscription.remove();
  }, [refetchFeatureState]);

  return null;
};

export default MedicationReminderReconciler;
