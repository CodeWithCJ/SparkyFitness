import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Icon from './Icon';
import DoseRow from './medications/DoseRow';
import { useMedications, useMedicationEntries, useLogDose } from '../hooks/useMedications';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import { getDueDosesForDate, formatDose, formatTimeOfDay } from '@workspace/shared';
import { getDeviceTimezone } from '../utils/dateUtils';
import type { RootStackParamList, TabParamList } from '../types/navigation';
import { MEDICATION_TYPES } from '../types/medications';
import { doseSlotStatus } from '../utils/medications';

type MedicationsCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface MedicationsCardProps {
  navigation: MedicationsCardNavigation;
}

const typeLabelFor = (typeId: string | null): string =>
  MEDICATION_TYPES.find((t) => t.id === typeId)?.label ?? '';

const MedicationsCard: React.FC<MedicationsCardProps> = ({ navigation }) => {
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
          <Text className="font-bold text-text-secondary">Medications</Text>
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
        accessibilityLabel="View all medications"
        className="flex-row items-center justify-between mb-2"
      >
        <Text className="font-bold text-text-secondary">Medications</Text>
        <View className="flex-row items-center">
          <Text className="text-accent-primary font-medium">View all</Text>
          <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
        </View>
      </TouchableOpacity>

      {dueDoses.map((due) => {
        const med = due.medication;
        const subtitle = [
          typeLabelFor(med.type_id),
          formatDose(med, due.schedule),
          due.schedule.time_of_day ? formatTimeOfDay(due.schedule.time_of_day) : null,
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
            subtitle={subtitle}
            onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
          />
        );
      })}

      {prnMeds.map((med) => {
        const prnCount = entries?.filter(
          (e) => e.medication_id === med.id && e.status === 'prn_taken' && e.entry_date === selectedDate,
        ).length ?? 0;
        const subtitle = [typeLabelFor(med.type_id), formatDose(med)].filter(Boolean).join(' · ');
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
