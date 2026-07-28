import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useMedications, useMedicationEntries } from '../hooks/useMedications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';
import { reconcileMedicationReminders } from '../services/medicationReminderService';
import { addLog } from '../services/LogService';

const MedicationReminderReconciler: React.FC = () => {
  const medicationRemindersEnabled = useAppPreferencesStore((s) => s.medicationRemindersEnabled);
  const notificationsEnabled = useAppPreferencesStore((s) => s.notificationsEnabled);
  const medicationReminderRepeats = useAppPreferencesStore((s) => s.medicationReminderRepeats);
  const remindersActive = medicationRemindersEnabled && notificationsEnabled;

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
  }, [medications, todayEntries, isLoadingMeds, isLoadingEntries, remindersActive, medicationReminderRepeats, today]);

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
