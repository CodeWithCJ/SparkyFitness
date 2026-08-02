import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, SectionList, RefreshControl, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useMedications } from '../hooks/useMedications';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import Icon from '../components/Icon';
import MedicalDisclaimer from '../components/MedicalDisclaimer';
import MedicationRow from '../components/medications/MedicationRow';
import type { RootStackScreenProps } from '../types/navigation';
import type { Medication } from '@workspace/shared';

type MedicationsListScreenProps = RootStackScreenProps<'MedicationsList'>;

const MedicationsListScreen: React.FC<MedicationsListScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, iconDecorative] = useCSSVariable(['--color-accent-primary', '--color-icon-decorative']) as [string, string];
  const [refreshing, setRefreshing] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const { data: medications, isLoading, isError, refetch } = useMedications();

  const { active, inactive } = useMemo(() => {
    const meds = medications ?? [];
    return {
      active: meds.filter((m) => m.is_active),
      inactive: meds.filter((m) => !m.is_active),
    };
  }, [medications]);

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

  const renderMedItem = ({ item }: { item: Medication }) => (
    <MedicationRow
      medication={item}
      onPress={() => navigation.navigate('MedicationDetail', { medicationId: item.id })}
    />
  );

  // The inactive section always renders its disclosure header; its rows
  // only appear once expanded.
  const sections: { key: 'active' | 'inactive'; data: Medication[] }[] = [
    { key: 'active', data: active },
  ];
  if (inactive.length > 0) {
    sections.push({ key: 'inactive', data: showInactive ? inactive : [] });
  }

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
      ) : active.length === 0 && inactive.length === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <Icon name="medication" size={48} color={iconDecorative} />
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
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderMedItem}
          renderSectionHeader={({ section }) =>
            section.key === 'inactive' ? (
              <TouchableOpacity
                className="flex-row items-center px-4 pt-4 pb-1"
                onPress={() => setShowInactive((value) => !value)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ expanded: showInactive }}
                accessibilityLabel={`Inactive medications (${inactive.length})`}
              >
                <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  Inactive ({inactive.length})
                </Text>
                <Icon
                  name={showInactive ? 'chevron-down' : 'chevron-forward'}
                  size={12}
                  color={iconDecorative}
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>
            ) : null
          }
          ListFooterComponent={
            <View className="px-4 pt-6">
              <MedicalDisclaimer />
            </View>
          }
          contentContainerStyle={{
            paddingTop: 8,
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
