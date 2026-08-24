import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useMedications, useMedicationEntries } from '../hooks/useMedications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';
import { reconcileMedicationReminders } from '../services/medicationReminderService';
import { maybePromptForExactAlarmPermission } from '../services/notifications';
import { addLog } from '../services/LogService';
import i18n from '../localization/i18n';

const MedicationReminderReconciler: React.FC = () => {
  const medicationRemindersEnabled = useAppPreferencesStore((s) => s.medicationRemindersEnabled);
  const notificationsEnabled = useAppPreferencesStore((s) => s.notificationsEnabled);
  const medicationReminderRepeats = useAppPreferencesStore((s) => s.medicationReminderRepeats);
  const medicationReminderHideNames = useAppPreferencesStore((s) => s.medicationReminderHideNames);
  const remindersActive = medicationRemindersEnabled && notificationsEnabled;
  const [languageRevision, setLanguageRevision] = useState(0);

  const { data: medications, isLoading: isLoadingMeds, refetch: refetchMeds } = useMedications({ activeOnly: true, enabled: remindersActive });

  const today = getTodayDate();
  const { data: todayEntries, isLoading: isLoadingEntries, refetch: refetchEntries } = useMedicationEntries({ fromDate: today, toDate: today, enabled: remindersActive });

  useEffect(() => {
    if (remindersActive && (isLoadingMeds || isLoadingEntries)) return;

    // With reminders off the queries stay disabled; the reconcile still runs
    // (with empty data) so any pending reminders get cancelled.
    reconcileMedicationReminders(
      remindersActive ? medications ?? [] : [],
      remindersActive ? todayEntries ?? [] : [],
    ).catch((error) => {
      addLog(`Medication reminder reconciliation failed: ${(error as Error).message}`, 'ERROR');
    });
  }, [medications, todayEntries, isLoadingMeds, isLoadingEntries, remindersActive, medicationReminderRepeats, medicationReminderHideNames, today, languageRevision]);

  useEffect(() => {
    const onLanguageChanged = () => setLanguageRevision((revision) => revision + 1);
    i18n.on('languageChanged', onLanguageChanged);
    return () => i18n.off('languageChanged', onLanguageChanged);
  }, []);

  // Reminders default on and schedules can be created on the web, so a user
  // may never hit the AppSettings toggle or a workout start — the two other
  // exact-alarm nudge sites. The helper is one-shot and Android-only.
  useEffect(() => {
    if (!remindersActive || isLoadingMeds) return;
    const hasTimedSchedule = (medications ?? []).some(
      (m) => m.schedules?.some((s) => s.time_of_day) ?? false,
    );
    if (!hasTimedSchedule) return;
    void maybePromptForExactAlarmPermission();
  }, [remindersActive, isLoadingMeds, medications]);

  useEffect(() => {
    if (!remindersActive) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refetchMeds();
      void refetchEntries();
    });
    return () => subscription.remove();
  }, [refetchMeds, refetchEntries, remindersActive]);

  return null;
};

export default MedicationReminderReconciler;
