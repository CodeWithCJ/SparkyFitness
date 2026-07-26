import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useMedications, useDeleteMedication } from '../hooks/useMedications';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import Icon from '../components/Icon';
import type { RootStackScreenProps } from '../types/navigation';
import type { Medication } from '../types/medications';
import { MEDICATION_TYPES } from '../types/medications';

type MedicationsListScreenProps = RootStackScreenProps<'MedicationsList'>;

const MedicationsListScreen: React.FC<MedicationsListScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, iconDecorative] = useCSSVariable(['--color-accent-primary', '--color-icon-decorative']) as [string, string];
  const [refreshing, setRefreshing] = useState(false);

  const { data: medications, isLoading, isError, refetch } = useMedications();
  const deleteMedicationMutation = useDeleteMedication();

  const { active, inactive } = useMemo(() => {
    const meds = medications ?? [];
    return {
      active: meds.filter((m) => m.is_active),
      inactive: meds.filter((m) => !m.is_active),
    };
  }, [medications]);

  const handleDelete = useCallback(
    (med: Medication) => {
      Alert.alert(
        'Delete Medication',
        `Are you sure you want to delete '${med.name}'? This will also remove all schedules and logged entries.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => deleteMedicationMutation.mutate(med.id),
          },
        ],
      );
    },
    [deleteMedicationMutation],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const header = useScreenHeader({
    title: 'Medications',
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'plus',
      ionicon: 'add-outline',
      role: 'primary',
      onPress: () => navigation.navigate('MedicationForm', {}),
      accessibilityLabel: 'Add medication',
      identifier: 'medications-list-add',
    },
  });

  const renderMedItem = ({ item }: { item: Medication }) => {
    const typeLabel = MEDICATION_TYPES.find((t) => t.id === item.type_id)?.label ?? item.type_id;
    const doseLabel = item.dose_amount != null ? `${item.dose_amount} ${item.dose_unit ?? ''}`.trim() : '';

    return (
      <TouchableOpacity
        className="py-3 px-4 bg-surface flex-row items-center"
        onPress={() => navigation.navigate('MedicationDetail', { medicationId: item.id })}
        onLongPress={() => handleDelete(item)}
        activeOpacity={0.7}
      >
        <View className="flex-1">
          <Text className={`text-base ${item.is_active ? 'text-text-primary' : 'text-text-muted'}`} numberOfLines={1}>
            {item.name}
          </Text>
          <View className="flex-row items-center mt-1">
            <Text className="text-xs text-text-secondary">{typeLabel}</Text>
            {doseLabel ? (
              <Text className="text-xs text-text-muted ml-2">· {doseLabel}</Text>
            ) : null}
            {item.reason ? (
              <Text className="text-xs text-text-muted ml-2" numberOfLines={1}>· {item.reason}</Text>
            ) : null}
          </View>
        </View>
        <Icon name="chevron-forward" size={16} color={iconDecorative} />
      </TouchableOpacity>
    );
  };

  const sections: { title: string; data: Medication[] }[] = [];
  if (active.length > 0) sections.push({ title: 'Active', data: active });
  if (inactive.length > 0) sections.push({ title: 'Inactive', data: inactive });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-text-muted text-base">Loading medications...</Text>
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-text-muted text-base text-center">Failed to load medications.</Text>
          <TouchableOpacity onPress={() => void refetch()} className="mt-4">
            <Text className="text-accent-primary text-base font-medium">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : sections.length === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <Icon name="wellness" size={48} color={iconDecorative} />
          <Text className="text-text-muted text-lg mt-4 text-center">No medications yet</Text>
          <Text className="text-text-muted text-sm mt-2 text-center">
            Add your first medication to start tracking.
          </Text>
          <TouchableOpacity
            className="mt-4 bg-accent-primary px-6 py-3 rounded-xl"
            onPress={() => navigation.navigate('MedicationForm', {})}
          >
            <Text className="text-white font-semibold">Add Medication</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(section) => section.title}
          renderItem={({ item: section }) => (
            <View>
              <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide px-4 pt-4 pb-1">
                {section.title}
              </Text>
              {section.data.map((med) => (
                <View key={med.id}>
                  {renderMedItem({ item: med })}
                  <View className="h-px bg-chrome-border ml-4" />
                </View>
              ))}
            </View>
          )}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
          }}
          contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />}
        />
      )}
    </View>
  );
};

export default MedicationsListScreen;
