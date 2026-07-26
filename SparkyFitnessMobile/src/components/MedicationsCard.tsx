import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, Pressable, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Icon from './Icon';
import { useMedications, useMedicationEntries, useCreateMedicationEntry, useDeleteMedicationEntry } from '../hooks/useMedications';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import { getDueDosesForDate, type SharedScheduleRule } from '@workspace/shared';
import type { RootStackParamList, TabParamList } from '../types/navigation';
import type { Medication, MedicationDetail, MedicationEntry, MedicationEntryStatus } from '../types/medications';
import { MEDICATION_TYPES } from '../types/medications';
import { addLog } from '../services/LogService';

type MedicationsCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface MedicationsCardProps {
  navigation: MedicationsCardNavigation;
}

interface DueDose {
  medication: MedicationDetail;
  schedule: SharedScheduleRule & { id: string };
}

const ACTION_WIDTH = 80;

function entryMatchesDue(entry: MedicationEntry, due: DueDose): boolean {
  if (entry.schedule_id && entry.schedule_id === due.schedule.id) return true;
  if (entry.medication_id === due.medication.id && !entry.schedule_id && entry.status !== 'prn_taken') return true;
  return false;
}

const SwipeableMedRow: React.FC<{
  due: DueDose;
  entry: MedicationEntry | undefined;
  onTake: (due: DueDose) => void;
  onSkip: (due: DueDose) => void;
  onToggleTaken: (due: DueDose) => void;
  onNavigate: (medicationId: string) => void;
}> = ({ due, entry, onTake, onSkip, onToggleTaken, onNavigate }) => {
  const swipeableRef = useRef<SwipeableMethods | null>(null);
  const taken = entry?.status === 'taken' || entry?.status === 'prn_taken';
  const skipped = entry?.status === 'skipped';
  const completed = taken || skipped;

  const [successBg, iconSuccess, iconDecorative, iconWarning, bgWarning] = useCSSVariable([
    '--color-bg-success',
    '--color-icon-success',
    '--color-icon-decorative',
    '--color-icon-warning',
    '--color-bg-warning',
  ]) as [string, string, string, string, string];

  const handleTake = () => {
    swipeableRef.current?.close();
    onTake(due);
  };

  const handleSkip = () => {
    swipeableRef.current?.close();
    onSkip(due);
  };

  const renderRightActions = () => (
    <View style={{ flexDirection: 'row' }}>
      <TouchableOpacity
        className="justify-center items-center"
        style={{ width: ACTION_WIDTH, backgroundColor: successBg }}
        onPress={handleTake}
        activeOpacity={0.7}
      >
        <Icon name="checkmark" size={20} color="#FFFFFF" />
        <Text className="text-white font-semibold text-xs mt-0.5">Take</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="justify-center items-center"
        style={{ width: ACTION_WIDTH, backgroundColor: bgWarning }}
        onPress={handleSkip}
        activeOpacity={0.7}
      >
        <Icon name="close" size={20} color="#FFFFFF" />
        <Text className="text-white font-semibold text-xs mt-0.5">Skip</Text>
      </TouchableOpacity>
    </View>
  );

  const timeLabel = due.schedule.time_of_day
    ? (() => {
        const [h, m] = due.schedule.time_of_day.split(':').map(Number);
        return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      })()
    : '';
  const med = due.medication;
  const typeLabel = MEDICATION_TYPES.find((t) => t.id === med.type_id)?.label ?? '';
  const doseLabel = med.dose_amount != null ? `${med.dose_amount} ${med.dose_unit ?? ''}`.trim() : '';

  return (
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        rightThreshold={40}
      >
        <Pressable
          className="py-2.5 px-1 flex-row items-center bg-surface"
          onPress={() => onNavigate(med.id)}
        >
          <Pressable
            onPress={() => onToggleTaken(due)}
            className="w-6 h-6 rounded-full items-center justify-center mr-3"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              borderColor: taken ? iconSuccess : skipped ? iconWarning : iconDecorative,
            }}
          >
            {taken && <Icon name="checkmark" size={14} color={iconSuccess} />}
            {skipped && <Icon name="close" size={14} color={iconWarning} />}
          </Pressable>
          <View className="flex-1">
            <Text className={`text-base ${completed ? 'text-text-muted' : 'text-text-primary'}`} numberOfLines={1}>
              {med.name}
            </Text>
            <View className="flex-row items-center mt-0.5">
              {typeLabel ? (
                <Text className="text-xs text-text-secondary" numberOfLines={1}>{typeLabel}</Text>
              ) : null}
              {doseLabel ? (
                <Text className="text-xs text-text-secondary ml-2" numberOfLines={1}>{doseLabel}</Text>
              ) : null}
              {timeLabel ? (
                <Text className="text-xs text-text-muted ml-2">{timeLabel}</Text>
              ) : null}
            </View>
          </View>
          <Icon name="chevron-forward" size={16} color={iconDecorative} />
        </Pressable>
      </ReanimatedSwipeable>
  );
};

const MedicationsCard: React.FC<MedicationsCardProps> = ({ navigation }) => {
  const selectedDate = useDiaryDateStore((s) => s.selectedDate);

  const { data: medications, isLoading: isLoadingMeds } = useMedications({ activeOnly: true });
  const { data: entries, isLoading: isLoadingEntries } = useMedicationEntries({ fromDate: selectedDate, toDate: selectedDate });
  const createEntryMutation = useCreateMedicationEntry();
  const deleteEntryMutation = useDeleteMedicationEntry();

  const [accentPrimary, iconSuccess, iconDecorative] = useCSSVariable(['--color-accent-primary', '--color-icon-success', '--color-icon-decorative']) as [string, string, string];

  const dueDoses = useMemo(() => {
    if (!medications) return [];
    return getDueDosesForDate(medications, selectedDate) as DueDose[];
  }, [medications, selectedDate]);

  const prnMeds = useMemo(() => {
    if (!medications) return [];
    return medications.filter((med) => {
      if (!med.is_active) return false;
      if (!med.schedules || med.schedules.length === 0) return true;
      return med.schedules.some((s) => s.schedule_type_id === 'prn');
    });
  }, [medications]);

  const entryForDue = useCallback(
    (due: DueDose) => entries?.find((e) => entryMatchesDue(e, due)),
    [entries],
  );

  const handleTake = useCallback(
    (due: DueDose) => {
      const existing = entryForDue(due);
      if (existing && (existing.status === 'taken' || existing.status === 'prn_taken')) {
        deleteEntryMutation.mutate(existing.id);
        Toast.show({ type: 'info', text1: `${due.medication.name} unmarked` });
        return;
      }
      if (existing) {
        deleteEntryMutation.mutateAsync(existing.id).then(
          () => {
            createEntryMutation.mutate(
              {
                medication_id: due.medication.id,
                schedule_id: due.schedule.id,
                status: 'taken' as MedicationEntryStatus,
                entry_date: selectedDate,
                taken_at: new Date().toISOString(),
              },
              {
                onSuccess: () => Toast.show({ type: 'success', text1: `${due.medication.name} taken` }),
                onError: (error) => {
                  addLog(`Failed to log medication: ${error.message}`, 'ERROR');
                },
              },
            );
          },
          (error) => {
            addLog(`Failed to delete existing medication entry: ${error.message}`, 'ERROR');
          },
        );
      } else {
        createEntryMutation.mutate(
          {
            medication_id: due.medication.id,
            schedule_id: due.schedule.id,
            status: 'taken' as MedicationEntryStatus,
            entry_date: selectedDate,
            taken_at: new Date().toISOString(),
          },
          {
            onSuccess: () => Toast.show({ type: 'success', text1: `${due.medication.name} taken` }),
            onError: (error) => {
              addLog(`Failed to log medication: ${error.message}`, 'ERROR');
            },
          },
        );
      }
    },
    [entryForDue, createEntryMutation, deleteEntryMutation, selectedDate],
  );

  const handleSkip = useCallback(
    (due: DueDose) => {
      const existing = entryForDue(due);
      if (existing && existing.status === 'skipped') {
        deleteEntryMutation.mutate(existing.id);
        Toast.show({ type: 'info', text1: `${due.medication.name} unskipped` });
        return;
      }
      if (existing) {
        deleteEntryMutation.mutateAsync(existing.id).then(
          () => {
            createEntryMutation.mutate(
              {
                medication_id: due.medication.id,
                schedule_id: due.schedule.id,
                status: 'skipped' as MedicationEntryStatus,
                entry_date: selectedDate,
              },
              {
                onSuccess: () => Toast.show({ type: 'info', text1: `${due.medication.name} skipped` }),
                onError: (error) => {
                  addLog(`Failed to skip medication: ${error.message}`, 'ERROR');
                },
              },
            );
          },
          (error) => {
            addLog(`Failed to delete existing medication entry: ${error.message}`, 'ERROR');
          },
        );
      } else {
        createEntryMutation.mutate(
          {
            medication_id: due.medication.id,
            schedule_id: due.schedule.id,
            status: 'skipped' as MedicationEntryStatus,
            entry_date: selectedDate,
          },
          {
            onSuccess: () => Toast.show({ type: 'info', text1: `${due.medication.name} skipped` }),
            onError: (error) => {
              addLog(`Failed to skip medication: ${error.message}`, 'ERROR');
            },
          },
        );
      }
    },
    [entryForDue, createEntryMutation, deleteEntryMutation, selectedDate],
  );

  const handleToggleTaken = useCallback(
    (due: DueDose) => {
      const existing = entryForDue(due);
      if (existing) {
        deleteEntryMutation.mutate(existing.id);
        return;
      }
      handleTake(due);
    },
    [entryForDue, deleteEntryMutation, handleTake],
  );

  const handleLogPrn = useCallback(
    (med: Medication) => {
      createEntryMutation.mutate(
        {
          medication_id: med.id,
          status: 'prn_taken' as MedicationEntryStatus,
          entry_date: selectedDate,
          taken_at: new Date().toISOString(),
        },
        {
          onSuccess: () => Toast.show({ type: 'success', text1: `${med.name} logged` }),
          onError: (error) => {
            addLog(`Failed to log PRN medication: ${error.message}`, 'ERROR');
          },
        },
      );
    },
    [createEntryMutation, selectedDate],
  );

  if (isLoadingMeds || isLoadingEntries) {
    return (
      <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
        <View className="flex-row items-center justify-between">
          <Text className="text-md font-bold text-text-secondary">Medications</Text>
          <ActivityIndicator size="small" color={accentPrimary} />
        </View>
      </View>
    );
  }

  if (dueDoses.length === 0 && prnMeds.length === 0) return null;

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <View className="flex-row items-center justify-between mb-2">
        <TouchableOpacity
          onPress={() => navigation.navigate('MedicationsList')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go to medications list"
        >
          <Text className="text-md font-bold text-text-secondary">Medications</Text>
        </TouchableOpacity>
      </View>

      {dueDoses.length > 0 && (
        <View>
          {dueDoses.map((due, index) => (
            <SwipeableMedRow
              key={`${due.medication.id}-${due.schedule.id}-${index}`}
              due={due}
              entry={entryForDue(due)}
              onTake={handleTake}
              onSkip={handleSkip}
              onToggleTaken={handleToggleTaken}
              onNavigate={(medId) => navigation.navigate('MedicationDetail', { medicationId: medId })}
            />
          ))}
        </View>
      )}

      {prnMeds.length > 0 && (
        <View>
          {prnMeds.map((med) => {
            const prnCount = entries?.filter(
              (e) => e.medication_id === med.id && e.status === 'prn_taken' && e.entry_date === selectedDate,
            ).length ?? 0;
            const typeMeta = MEDICATION_TYPES.find((t) => t.id === med.type_id);
            return (
              <Pressable
                key={med.id}
                className="py-2.5 px-1 flex-row items-center"
                onPress={() => navigation.navigate('MedicationDetail', { medicationId: med.id })}
              >
                <View className="w-6 h-6 rounded-full items-center justify-center mr-3" style={{ backgroundColor: 'transparent', borderWidth: 1.5, borderColor: prnCount > 0 ? iconSuccess : iconDecorative }}>
                  {prnCount > 0 ? (
                    <Text className="text-xs font-bold" style={{ color: iconSuccess }}>{prnCount}</Text>
                  ) : null}
                </View>
                <View className="flex-1">
                  <Text className={`text-base ${prnCount > 0 ? 'text-text-muted' : 'text-text-primary'}`} numberOfLines={1}>
                    {med.name}
                  </Text>
                  <View className="flex-row items-center mt-0.5">
                    {typeMeta ? (
                      <Text className="text-xs text-text-secondary" numberOfLines={1}>{typeMeta.label}</Text>
                    ) : null}
                    {med.dose_amount != null && med.dose_unit ? (
                      <Text className="text-xs text-text-secondary ml-2">{med.dose_amount} {med.dose_unit}</Text>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleLogPrn(med)}
                  hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={`Log ${med.name}`}
                  className="rounded-full px-3 py-1"
                  style={{ backgroundColor: accentPrimary + '18' }}
                >
                  <Text className="text-sm font-semibold" style={{ color: accentPrimary }}>Log</Text>
                </TouchableOpacity>
                <Icon name="chevron-forward" size={16} color={iconDecorative} style={{ marginLeft: 6 }} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
};

export default MedicationsCard;
