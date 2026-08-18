import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Icon from './Icon';
import DoseRow from './medications/DoseRow';
import { useMedications, useMedicationEntries, useLogDose } from '../hooks/useMedications';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import { getDueDosesForDate, formatDose } from '@workspace/shared';
import { getDeviceTimezone } from '../utils/dateUtils';
import type { RootStackParamList, TabParamList } from '../types/navigation';
import { formatLocalizedTimeOfDay } from '../utils/medicationScheduleLocalization';
import { medicationTypeLabel } from '../utils/medicationLocalization';
import { doseSlotStatus } from '../utils/medications';

type MedicationsCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface MedicationsCardProps {
  navigation: MedicationsCardNavigation;
}

const typeLabelFor = (typeId: string | null, t: Parameters<typeof medicationTypeLabel>[1]): string => medicationTypeLabel(typeId, t);

const MedicationsCard: React.FC<MedicationsCardProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const selectedDate = useDiaryDateStore((s) => s.selectedDate);

  const { data: medications, isLoading: isLoadingMeds } = useMedications({ activeOnly: true });
  const { data: entries, isLoading: isLoadingEntries } = useMedicationEntries({ fromDate: selectedDate, toDate: selectedDate });
  const { entryForDue, logDose, toggleTaken, logPrn } = useLogDose(selectedDate, entries);

  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [string];

  const dueDoses = useMemo(() => {
    if (!medications) return [];
    return getDueDosesForDate(medications, selectedDate, getDeviceTimezone());
  }, [medications, selectedDate]);

  const prnMeds = useMemo(() => {
    if (!medications) return [];
    return medications.filter((med) => {
      if (!med.is_active) return false;
      if (!med.schedules || med.schedules.length === 0) return true;
      return med.schedules.some((s) => s.schedule_type_id === 'prn');
    });
  }, [medications]);

  if (isLoadingMeds || isLoadingEntries) {
    return (
      <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-text-secondary">{t('medications.card.title', { defaultValue: 'Medications' })}</Text>
          <ActivityIndicator size="small" color={accentPrimary} />
        </View>
      </View>
    );
  }

  if (dueDoses.length === 0 && prnMeds.length === 0) return null;

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <TouchableOpacity
        onPress={() => navigation.navigate('MedicationsList')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('medications.card.viewAllA11y', { defaultValue: 'View all medications' })}
        className="flex-row items-center justify-between mb-2"
      >
        <Text className="font-bold text-text-secondary">{t('medications.card.title', { defaultValue: 'Medications' })}</Text>
        <View className="flex-row items-center">
          <Text className="text-accent-primary font-medium">{t('medications.card.viewAll', { defaultValue: 'View all' })}</Text>
          <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
        </View>
      </TouchableOpacity>

      {dueDoses.map((due) => {
        const med = due.medication;
        const subtitle = [
          typeLabelFor(med.type_id, t),
          formatDose(med, due.schedule),
        ].filter(Boolean).join(' · ');
        return (
          <DoseRow
            key={`${med.id}-${due.schedule.id}`}
            kind="scheduled"
            status={doseSlotStatus(entryForDue(due))}
            onToggle={() => toggleTaken(due)}
            onTake={() => logDose(due, 'taken')}
            onSkip={() => logDose(due, 'skipped')}
            title={med.name}
            time={due.schedule.time_of_day ? formatLocalizedTimeOfDay(due.schedule.time_of_day) : undefined}
            subtitle={subtitle}
            onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
          />
        );
      })}

      {prnMeds.map((med) => {
        const prnCount = entries?.filter(
          (e) => e.medication_id === med.id && e.status === 'prn_taken' && e.entry_date === selectedDate,
        ).length ?? 0;
        const subtitle = [typeLabelFor(med.type_id, t), formatDose(med)].filter(Boolean).join(' · ');
        return (
          <DoseRow
            key={med.id}
            kind="prn"
            count={prnCount}
            onLog={() => logPrn(med)}
            title={med.name}
            subtitle={subtitle}
            onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
          />
        );
      })}
    </View>
  );
};

export default MedicationsCard;
