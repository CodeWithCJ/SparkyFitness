import { useEffect, useRef } from 'react';
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

  const { data: medications, isLoading: isLoadingMeds } = useMedications({ activeOnly: true });

  const today = getTodayDate();
  const { data: todayEntries, isLoading: isLoadingEntries } = useMedicationEntries({ fromDate: today, toDate: today });

  const reconcilingRef = useRef(false);

  useEffect(() => {
    if (isLoadingMeds || isLoadingEntries) return;
    if (!medications || medications.length === 0) return;
    if (reconcilingRef.current) return;

    reconcilingRef.current = true;
    reconcileMedicationReminders(medications, todayEntries ?? [])
      .catch((error) => {
        addLog(`Medication reminder reconciliation failed: ${(error as Error).message}`, 'ERROR');
      })
      .finally(() => {
        reconcilingRef.current = false;
      });
  }, [medications, todayEntries, isLoadingMeds, isLoadingEntries, medicationRemindersEnabled, notificationsEnabled, medicationReminderRepeats, today]);

  // Re-reconcile on app resume
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      reconcilingRef.current = false;
    });
    return () => subscription.remove();
  }, []);

  return null;
};

export default MedicationReminderReconciler;
