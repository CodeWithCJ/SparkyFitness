import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Icon from './Icon';
import DoseRow from './medications/DoseRow';
import {
  useMedications,
  useMedicationEntries,
  useLogDose,
} from '../hooks/useMedications';
import { usePreferences } from '../hooks/usePreferences';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import { getDueDosesForDate } from '@workspace/shared';
import { getDeviceTimezone } from '../utils/dateUtils';
import type { RootStackParamList, TabParamList } from '../types/navigation';
import { formatLocalizedTimeOfDay } from '../utils/medicationScheduleLocalization';

import { medicationDoseSubtitle } from '../utils/medicationLocalization';
import { doseSlotStatus, type DueDose } from '../utils/medications';
import { selectPrnMedications } from '../utils/medicationAdherence';

type MedicationsCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface MedicationsCardProps {
  navigation: MedicationsCardNavigation;
}

interface TimeGroup {
  /** Schedule time of day (HH:MM:SS), or null for time-less schedules. */
  time: string | null;
  dues: DueDose[];
  pending: DueDose[];
}

const MedicationsCard: React.FC<MedicationsCardProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const selectedDate = useDiaryDateStore((s) => s.selectedDate);

  const { data: medications, isLoading: isLoadingMeds } = useMedications({
    activeOnly: true,
  });
  const { data: entries, isLoading: isLoadingEntries } = useMedicationEntries({
    fromDate: selectedDate,
    toDate: selectedDate,
  });
  const { entryForDue, logDose, toggleTaken, logDosesBatch, logPrn } =
    useLogDose(selectedDate, entries);

  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  const [busyTime, setBusyTime] = useState<string | null>(null);

  const groups = useMemo<TimeGroup[]>(() => {
    if (!medications) return [];
    const dues = getDueDosesForDate(
      medications,
      selectedDate,
      getDeviceTimezone()
    );
    const byTime = new Map<string | null, DueDose[]>();
    for (const due of dues) {
      const time = due.schedule.time_of_day ?? '';
      const key = time === '' ? null : time;
      const list = byTime.get(key) ?? [];
      list.push(due);
      byTime.set(key, list);
    }
    return [...byTime.entries()]
      .map(([time, dues]) => ({
        time,
        dues,
        pending: dues.filter(
          (d) => doseSlotStatus(entryForDue(d)) === 'pending'
        ),
      }))
      .sort((a, b) => {
        if (a.time == null) return 1;
        if (b.time == null) return -1;
        return a.time.localeCompare(b.time);
      });
  }, [medications, selectedDate, entryForDue]);

  const prnMeds = useMemo(
    () => selectPrnMedications(medications ?? []),
    [medications]
  );

  const markAll = useCallback(
    async (group: TimeGroup) => {
      setBusyTime(group.time ?? 'no-time');
      try {
        await logDosesBatch(group.pending, 'taken');
      } finally {
        setBusyTime(null);
      }
    },
    [logDosesBatch]
  );

  if (isLoadingMeds || isLoadingEntries) {
    return (
      <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-text-secondary">
            {t('medications.card.title', { defaultValue: 'Medications' })}
          </Text>
          <ActivityIndicator size="small" color={accentPrimary} />
        </View>
      </View>
    );
  }

  if (groups.length === 0 && prnMeds.length === 0) return null;

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <TouchableOpacity
        onPress={() => navigation.navigate('MedicationsList')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('medications.card.viewAllA11y', {
          defaultValue: 'View all medications',
        })}
        className="flex-row items-center justify-between mb-2"
      >
        <Text className="font-bold text-text-secondary">
          {t('medications.card.title', { defaultValue: 'Medications' })}
        </Text>
        <View className="flex-row items-center">
          <Text className="text-accent-primary font-medium">
            {t('medications.card.viewAll', { defaultValue: 'View all' })}
          </Text>
          <Icon
            name="chevron-forward"
            size={14}
            color={accentPrimary}
            style={{ marginLeft: 2 }}
          />
        </View>
      </TouchableOpacity>

      {groups.map((group) => {
        const pendingCount = group.pending.length;
        const timeLabel =
          group.time != null
            ? formatLocalizedTimeOfDay(
                group.time,
                undefined,
                preferences?.time_format
              )
            : undefined;
        return (
          <View key={group.time ?? 'no-time'}>
            {group.time != null && (
              <View className="flex-row items-center justify-between pt-2 pb-1">
                <View className="flex-1 mr-2">
                  <Text
                    className="text-base font-medium text-text-primary"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {timeLabel}
                  </Text>
                  {pendingCount > 0 && (
                    <Text className="text-xs text-text-muted mt-0.5">
                      {t('medications.timeGroups.pendingCount', {
                        defaultValue: '{{count}} doses pending',
                        count: pendingCount,
                      })}
                    </Text>
                  )}
                </View>
                {pendingCount > 0 && (
                  <TouchableOpacity
                    onPress={() => void markAll(group)}
                    disabled={busyTime !== null}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={t(
                      'medications.timeGroups.markAllA11y',
                      {
                        defaultValue:
                          'Mark all {{count}} doses at {{time}} as taken',
                        count: pendingCount,
                        time: timeLabel,
                      }
                    )}
                    className="rounded-full px-3 py-1 bg-raised"
                    testID={`dashboard-time-group-mark-all-${group.time}`}
                  >
                    {busyTime === group.time ? (
                      <ActivityIndicator size="small" color={accentPrimary} />
                    ) : (
                      <Text
                        className="text-sm font-semibold"
                        style={{ color: accentPrimary }}
                      >
                        {t('medications.timeGroups.markAll', {
                          defaultValue: 'Mark all as taken',
                        })}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
            {group.dues.map((due) => {
              const med = due.medication;
              const subtitle = medicationDoseSubtitle(med, due.schedule, t);
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
                  onPress={() =>
                    navigation.navigate('MedicationDetail', {
                      medicationId: med.id,
                    })
                  }
                />
              );
            })}
          </View>
        );
      })}

      {prnMeds.map((med) => {
        const prnCount =
          entries?.filter(
            (e) =>
              e.medication_id === med.id &&
              e.status === 'prn_taken' &&
              e.entry_date === selectedDate
          ).length ?? 0;
        const subtitle = medicationDoseSubtitle(med, undefined, t);
        return (
          <DoseRow
            key={med.id}
            kind="prn"
            count={prnCount}
            onLog={() => logPrn(med)}
            title={med.name}
            subtitle={subtitle}
            onPress={() =>
              navigation.navigate('MedicationDetail', { medicationId: med.id })
            }
          />
        );
      })}
    </View>
  );
};

export default MedicationsCard;
