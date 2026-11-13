import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { MedicationDetail, MedicationEntry } from '@workspace/shared';
import DoseRow from './DoseRow';
import type { useLogDose } from '../../hooks/useMedications';
import { usePreferences } from '../../hooks/usePreferences';
import { formatLocalizedTimeOfDay } from '../../utils/medicationScheduleLocalization';
import { medicationDoseSubtitle } from '../../utils/medicationLocalization';
import { doseSlotStatus, type DueDose } from '../../utils/medications';

interface MedicationDoseListCardProps {
  title: string;
  emptyDueText: string;
  emptyPrnText: string;
  dueDoses: DueDose[];
  prnMedications: MedicationDetail[];
  /** The selected day's entries, for the as-needed counts. */
  dayEntries: MedicationEntry[];
  dose: ReturnType<typeof useLogDose>;
  /** Whether the selected day is today, so the "Due" label stays date-neutral otherwise. */
  isToday: boolean;
  onOpenMedication: (medicationId: string) => void;
}

/**
 * Due and as-needed doses for the selected day. Rows reuse the diary card's `DoseRow`
 * and the shared `useLogDose` actions, so logging here behaves exactly as it does there.
 */
const MedicationDoseListCard: React.FC<MedicationDoseListCardProps> = ({
  title,
  emptyDueText,
  emptyPrnText,
  dueDoses,
  prnMedications,
  dayEntries,
  dose,
  isToday,
  onOpenMedication,
}) => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-base font-semibold text-text-primary mb-2">
        {title}
      </Text>

      <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
        {isToday
          ? t('medications.today.dueToday', { defaultValue: 'Due today' })
          : t('medications.today.dueDay', { defaultValue: 'Due' })}
      </Text>
      {dueDoses.length === 0 ? (
        <Text className="text-sm text-text-muted py-2">{emptyDueText}</Text>
      ) : (
        dueDoses.map((due) => (
          <DoseRow
            key={`${due.medication.id}-${due.schedule.id}`}
            kind="scheduled"
            status={doseSlotStatus(dose.entryForDue(due))}
            onToggle={() => dose.toggleTaken(due)}
            onTake={() => dose.logDose(due, 'taken')}
            onSkip={() => dose.logDose(due, 'skipped')}
            title={due.medication.name}
            time={
              due.schedule.time_of_day
                ? formatLocalizedTimeOfDay(
                    due.schedule.time_of_day,
                    undefined,
                    preferences?.time_format
                  )
                : undefined
            }
            subtitle={medicationDoseSubtitle(due.medication, due.schedule, t)}
            onPress={() => onOpenMedication(due.medication.id)}
          />
        ))
      )}

      <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide mt-3 mb-1">
        {t('medications.today.asNeeded', { defaultValue: 'As needed' })}
      </Text>
      {prnMedications.length === 0 ? (
        <Text className="text-sm text-text-muted py-2">{emptyPrnText}</Text>
      ) : (
        prnMedications.map((med) => (
          <DoseRow
            key={med.id}
            kind="prn"
            count={
              dayEntries.filter(
                (e) => e.medication_id === med.id && e.status === 'prn_taken'
              ).length
            }
            onLog={() => dose.logPrn(med)}
            title={med.name}
            subtitle={medicationDoseSubtitle(med, undefined, t)}
            onPress={() => onOpenMedication(med.id)}
          />
        ))
      )}
    </View>
  );
};

export default MedicationDoseListCard;
