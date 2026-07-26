import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useMedications, useMedicationEntries } from '../hooks/useMedications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';
import { reconcileMedicationReminders } from '../services/medicationReminderService';
import { addLog } from '../services/LogService';

const schedulingLock = new Set<string>();

const LOCK_KEY = 'medication-reminders';

const MedicationReminderReconciler: React.FC = () => {
  const medicationRemindersEnabled = useAppPreferencesStore((s) => s.medicationRemindersEnabled);
  const notificationsEnabled = useAppPreferencesStore((s) => s.notificationsEnabled);
  const medicationReminderRepeats = useAppPreferencesStore((s) => s.medicationReminderRepeats);

  const { data: medications, isLoading: isLoadingMeds, refetch: refetchMeds } = useMedications({ activeOnly: true });

  const today = getTodayDate();
  const { data: todayEntries, isLoading: isLoadingEntries, refetch: refetchEntries } = useMedicationEntries({ fromDate: today, toDate: today });

  useEffect(() => {
    if (isLoadingMeds || isLoadingEntries) return;
    if (!medications || medications.length === 0) return;
    if (schedulingLock.has(LOCK_KEY)) return;

    schedulingLock.add(LOCK_KEY);
    reconcileMedicationReminders(medications, todayEntries ?? [])
      .catch((error) => {
        addLog(`Medication reminder reconciliation failed: ${(error as Error).message}`, 'ERROR');
      })
      .finally(() => {
        schedulingLock.delete(LOCK_KEY);
      });
  }, [medications, todayEntries, isLoadingMeds, isLoadingEntries, medicationRemindersEnabled, notificationsEnabled, medicationReminderRepeats, today]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refetchMeds();
      void refetchEntries();
    });
    return () => subscription.remove();
  }, [refetchMeds, refetchEntries]);

  return null;
};

export default MedicationReminderReconciler;
