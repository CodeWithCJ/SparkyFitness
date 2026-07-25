import React, { useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useMedicationDetail, useDeleteMedication, useMedicationEntries, useDeleteMedicationEntry } from '../hooks/useMedications';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import Icon from '../components/Icon';
import type { RootStackScreenProps } from '../types/navigation';
import { MEDICATION_TYPES, DAY_LABELS } from '../types/medications';
import type { MedicationEntry } from '../types/medications';

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

  const isPrn = !med?.schedules || med.schedules.length === 0 || med.schedules.some((s) => s.schedule_type_id === 'prn');

  const todayPrnDoses = (entries ?? []).filter(
    (e) => e.medication_id === medicationId && e.status === 'prn_taken' && e.entry_date === selectedDate,
  );

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
            onPress: () => deleteEntryMutation.mutate(entry.id),
          },
        ],
      );
    },
    [deleteEntryMutation],
  );

  const header = useScreenHeader({
    title: med?.name ?? 'Medication',
    left: { kind: 'back' },
    right: {
      kind: 'text',
      label: 'Edit',
      onPress: () => navigation.navigate('MedicationForm', { medicationId }),
    },
  });

  if (isLoading || !med) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
        {header}
        <Text className="text-text-muted text-base mt-4">Loading...</Text>
      </View>
    );
  }

  const typeLabel = MEDICATION_TYPES.find((t) => t.id === med.type_id)?.label ?? med.type_id;

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
          <InfoRow label="Type" value={typeLabel} />
          {med.strength_value != null && (
            <InfoRow label="Strength" value={`${med.strength_value} ${med.strength_unit ?? ''}`} />
          )}
          {med.dose_amount != null && (
            <InfoRow label="Dose" value={`${med.dose_amount} ${med.dose_unit ?? ''}`} />
          )}
          {med.reason && <InfoRow label="Reason" value={med.reason} />}
          {med.prescriber && <InfoRow label="Prescriber" value={med.prescriber} />}
          {med.pharmacy && <InfoRow label="Pharmacy" value={med.pharmacy} />}
          {med.notes && <InfoRow label="Notes" value={med.notes} />}
          <InfoRow label="Status" value={med.is_active ? 'Active' : 'Inactive'} />
        </View>

        {med.schedules && med.schedules.length > 0 && (
          <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
            <Text className="text-sm font-semibold text-text-secondary mb-2">Schedules</Text>
            {med.schedules.map((sched, index) => (
              <View key={sched.id} className="mb-2 last:mb-0">
                <Text className="text-base text-text-primary capitalize">{sched.schedule_type_id.replace('_', ' ')}</Text>
                {sched.time_of_day && (
                  <Text className="text-sm text-text-secondary mt-0.5">
                      {(() => {
                        const [h, m] = sched.time_of_day.split(':').map(Number);
                        return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                      })()}
                  </Text>
                )}
                {sched.schedule_type_id === 'specific_days' && sched.days_of_week && (
                  <Text className="text-xs text-text-muted mt-0.5">
                    {sched.days_of_week.map((d) => DAY_LABELS[d]).join(', ')}
                  </Text>
                )}
                {sched.schedule_type_id === 'every_n_days' && sched.interval_days && (
                  <Text className="text-xs text-text-muted mt-0.5">Every {sched.interval_days} days</Text>
                )}
                {sched.dose_amount && (
                  <Text className="text-xs text-text-muted mt-0.5">Dose: {sched.dose_amount}</Text>
                )}
                {sched.with_meal && (
                  <Text className="text-xs text-text-muted mt-0.5">With: {sched.with_meal}</Text>
                )}
                {index < (med.schedules?.length ?? 0) - 1 && (
                  <View className="h-px bg-chrome-border mt-2" />
                )}
              </View>
            ))}
          </View>
        )}

        {isPrn && (
          <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
            <Text className="text-sm font-semibold text-text-secondary mb-2">
              {`Today's Doses${todayPrnDoses.length > 0 ? ` (${todayPrnDoses.length})` : ''}`}
            </Text>
            {todayPrnDoses.length === 0 ? (
              <Text className="text-sm text-text-muted py-2">No doses logged today.</Text>
            ) : (
              todayPrnDoses.map((dose) => (
                <View key={dose.id} className="flex-row items-center justify-between py-2 border-b border-chrome-border last:border-b-0">
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
                    className="ml-3"
                  >
                    <Icon name="trash" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        <TouchableOpacity
          className="bg-surface rounded-xl p-4 shadow-sm mb-3"
          onPress={handleDelete}
        >
          <Text className="text-base font-medium text-center" style={{ color: '#EF4444' }}>
            Delete Medication
          </Text>
        </TouchableOpacity>

        <Text className="text-xs text-text-muted text-center px-4">
          Full medication history and schedule can be managed in the web app.
        </Text>
      </ScrollView>
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
