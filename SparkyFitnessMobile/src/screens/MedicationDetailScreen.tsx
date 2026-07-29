import React, { useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  useMedicationDetail,
  useDeleteMedication,
  useMedicationEntries,
  useDeleteMedicationEntry,
  useLogDose,
} from '../hooks/useMedications';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import Icon from '../components/Icon';
import DoseRow from '../components/medications/DoseRow';
import {
  getDueDosesForDate,
  formatDose,
  formatStrengthPerUnit,
  formatTimeOfDay,
  describeSchedule,
} from '@workspace/shared';
import { getDeviceTimezone, formatDateLabel } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';
import { MEDICATION_TYPES } from '../types/medications';
import type { MedicationEntry } from '@workspace/shared';
import { doseSlotStatus } from '../utils/medications';
import { addLog } from '../services/LogService';

type MedicationDetailScreenProps = RootStackScreenProps<'MedicationDetail'>;

const MedicationDetailScreen: React.FC<MedicationDetailScreenProps> = ({ route, navigation }) => {
  const { medicationId } = route.params;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const selectedDate = useDiaryDateStore((s) => s.selectedDate);

  const { data: med, isLoading } = useMedicationDetail(medicationId);
  const { data: entries } = useMedicationEntries({ fromDate: selectedDate, toDate: selectedDate, medicationId });
  const deleteMedicationMutation = useDeleteMedication();
  const deleteEntryMutation = useDeleteMedicationEntry();
  const { entryForDue, logDose, toggleTaken, logPrn, undoLastPrn } = useLogDose(selectedDate, entries);

  const [iconDanger] = useCSSVariable(['--color-icon-danger']) as [string];

  const isPrn = !med?.schedules || med.schedules.length === 0 || med.schedules.some((s) => s.schedule_type_id === 'prn');

  const todayPrnDoses = useMemo(
    () => (entries ?? []).filter(
      (e) => e.medication_id === medicationId && e.status === 'prn_taken' && e.entry_date === selectedDate,
    ),
    [entries, medicationId, selectedDate],
  );

  const dueDoses = useMemo(() => {
    if (!med) return [];
    return getDueDosesForDate([med], selectedDate, getDeviceTimezone());
  }, [med, selectedDate]);

  const handleDelete = useCallback(() => {
    if (!med) return;
    Alert.alert(
      'Delete Medication',
      `Are you sure you want to delete '${med.name}'? This will also remove all schedules and logged entries.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMedicationMutation.mutate(med.id, {
              onSuccess: () => navigation.goBack(),
              onError: (error) => {
                addLog(`Failed to delete medication: ${error.message}`, 'ERROR');
                Toast.show({ type: 'error', text1: 'Failed to delete medication' });
              },
            });
          },
        },
      ],
    );
  }, [med, deleteMedicationMutation, navigation]);

  const handleRemoveDose = useCallback(
    (entry: MedicationEntry) => {
      Alert.alert(
        'Remove Dose',
        `Remove this logged dose from ${entry.taken_at ? new Date(entry.taken_at).toLocaleTimeString() : 'today'}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () =>
              deleteEntryMutation.mutate(entry.id, {
                onError: (error) => {
                  addLog(`Failed to remove dose: ${error.message}`, 'ERROR');
                  Toast.show({ type: 'error', text1: 'Failed to remove dose' });
                },
              }),
          },
        ],
      );
    },
    [deleteEntryMutation],
  );

  const header = useScreenHeader({
    title: med?.name ?? 'Medication',
    nativeTitle: med?.name ?? 'Medication',
    left: { kind: 'back' },
    right: {
      kind: 'text',
      label: 'Edit',
      onPress: () => navigation.navigate('MedicationForm', { medicationId }),
    },
  });

  const typeLabel = med ? (MEDICATION_TYPES.find((t) => t.id === med.type_id)?.label ?? med.type_id ?? '') : '';
  const doseLabel = med ? formatDose(med) : null;
  const strengthLabel = med ? formatStrengthPerUnit(med) : null;
  const contextLine = [typeLabel, med?.reason_text].filter(Boolean).join(' · ');

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isLoading || !med ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-text-muted text-base">Loading...</Text>
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        {(contextLine !== '' || doseLabel != null || !med.is_active) && (
          <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
            {contextLine !== '' && <Text className="text-sm text-text-secondary">{contextLine}</Text>}
            {doseLabel != null && (
              <Text className="text-2xl font-bold text-text-primary mt-1">{doseLabel}</Text>
            )}
            {strengthLabel != null && (
              <Text className="text-sm text-text-secondary mt-0.5">{strengthLabel}</Text>
            )}
            {!med.is_active && (
              <View className="self-start rounded-full px-2.5 py-0.5 mt-2 border border-chrome-border">
                <Text className="text-xs text-text-muted">Inactive</Text>
              </View>
            )}
          </View>
        )}

        {med.is_active && (
          <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
            <Text className="text-sm font-semibold text-text-secondary mb-1">
              {formatDateLabel(selectedDate)}
            </Text>
            {dueDoses.map((due) => (
              <DoseRow
                key={due.schedule.id}
                kind="scheduled"
                status={doseSlotStatus(entryForDue(due))}
                onToggle={() => toggleTaken(due)}
                onTake={() => logDose(due, 'taken')}
                onSkip={() => logDose(due, 'skipped')}
                title={due.schedule.time_of_day ? formatTimeOfDay(due.schedule.time_of_day) : describeSchedule(due.schedule)}
                subtitle={formatDose(due.medication, due.schedule) ?? undefined}
                actionsStyle="inline"
              />
            ))}
            {dueDoses.length === 0 && !isPrn && (
              <Text className="text-sm text-text-muted py-2">No doses scheduled for this day.</Text>
            )}
            {isPrn && (
              <>
                <DoseRow
                  kind="prn"
                  count={todayPrnDoses.length}
                  onLog={() => logPrn(med)}
                  onUndoLast={() => undoLastPrn(med)}
                  title="As needed"
                  subtitle={formatDose(med) ?? undefined}
                  actionsStyle="inline"
                />
                {todayPrnDoses.map((dose) => (
                  <View key={dose.id} className="flex-row items-center justify-between py-2 ml-9">
                    <View className="flex-1">
                      <Text className="text-base text-text-primary">
                        {dose.taken_at
                          ? new Date(dose.taken_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                          : 'Logged'}
                      </Text>
                      {dose.notes && (
                        <Text className="text-xs text-text-muted mt-0.5">{dose.notes}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveDose(dose)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel="Remove dose"
                      className="ml-3"
                    >
                      <Icon name="trash" size={18} color={iconDanger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {med.schedules && med.schedules.length > 0 && (
          <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Schedules</Text>
            {med.schedules.map((sched, index) => {
              const parts: string[] = [];
              if (sched.dose_amount != null) {
                const scheduleDose = formatDose(med, sched);
                if (scheduleDose != null) parts.push(scheduleDose);
              }
              if (sched.with_meal) parts.push(`With ${sched.with_meal}`);
              if (sched.active === false) parts.push('Inactive');
              const subtitle = parts.join(' · ');
              return (
                <View key={sched.id}>
                  {index > 0 && <View className="h-px bg-chrome-border my-2" />}
                  <Text className="text-base text-text-primary">{describeSchedule(sched)}</Text>
                  {subtitle !== '' && (
                    <Text className="text-xs text-text-muted mt-0.5">{subtitle}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {(med.prescriber || med.pharmacy || med.rx_number || med.notes) && (
          <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
            <Text className="text-sm font-semibold text-text-secondary mb-1">Details</Text>
            {med.prescriber && <InfoRow label="Prescriber" value={med.prescriber} />}
            {med.pharmacy && <InfoRow label="Pharmacy" value={med.pharmacy} />}
            {med.rx_number && <InfoRow label="Rx number" value={med.rx_number} />}
            {med.notes && <InfoRow label="Notes" value={med.notes} />}
          </View>
        )}

        <TouchableOpacity
          className="bg-surface rounded-xl p-4 shadow-sm mb-3"
          onPress={handleDelete}
        >
          <Text className="text-base font-medium text-center text-text-danger-subtle">
            Delete Medication
          </Text>
        </TouchableOpacity>
      </ScrollView>
      )}
    </View>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View className="flex-row py-1.5">
    <Text className="text-sm text-text-muted w-28">{label}</Text>
    <Text className="text-sm text-text-primary flex-1">{value}</Text>
  </View>
);

export default MedicationDetailScreen;
