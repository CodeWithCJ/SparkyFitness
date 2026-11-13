import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  SectionList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useMedications } from '../hooks/useMedications';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import Icon from '../components/Icon';
import ActionSheet, {
  type ActionSheetItem,
  type ActionSheetRef,
} from '../components/ActionSheet';
import MedicalDisclaimer from '../components/MedicalDisclaimer';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import MedicationRow from '../components/medications/MedicationRow';
import type { RootStackScreenProps } from '../types/navigation';
import {
  filterMedsBySubtype,
  type Medication,
  type MedSubtype,
} from '@workspace/shared';

type MedicationsListScreenProps = RootStackScreenProps<'MedicationsList'>;

const MedicationsListScreen: React.FC<MedicationsListScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, iconDecorative] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-decorative',
  ]) as [string, string];
  const [refreshing, setRefreshing] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [subtype, setSubtype] = useState<MedSubtype>('all');
  const addSheetRef = useRef<ActionSheetRef>(null);

  const { data: medications, isLoading, isError, refetch } = useMedications();

  const hasSupplements = useMemo(
    () => (medications ?? []).some((m) => m.is_supplement),
    [medications]
  );

  // The filter only shows while a supplement exists, so without one the list
  // is unfiltered rather than stuck on a view with no control to leave it.
  const activeSubtype: MedSubtype = hasSupplements ? subtype : 'all';

  const { active, inactive } = useMemo(() => {
    const meds = filterMedsBySubtype(medications ?? [], activeSubtype);
    return {
      active: meds.filter((m) => m.is_active),
      inactive: meds.filter((m) => !m.is_active),
    };
  }, [medications, activeSubtype]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const header = useScreenHeader({
    title: t('medications.title', { defaultValue: 'Medications' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'plus',
      ionicon: 'add-outline',
      role: 'primary',
      onPress: () => addSheetRef.current?.present(),
      accessibilityLabel: t('medications.addMedication', {
        defaultValue: 'Add medication',
      }),
      identifier: 'medications-list-add',
    },
  });

  const addItems = useMemo<ActionSheetItem[]>(
    () => [
      {
        key: 'medication',
        label: t('medications.addMedicationTitle', {
          defaultValue: 'Add Medication',
        }),
        onPress: () => navigation.navigate('MedicationForm', {}),
      },
      {
        key: 'supplement',
        label: t('medications.supplement.add', {
          defaultValue: 'Add Supplement',
        }),
        onPress: () =>
          navigation.navigate('MedicationForm', { isSupplement: true }),
      },
    ],
    [navigation, t]
  );

  const subtypeSegments = useMemo<Segment<MedSubtype>[]>(
    () => [
      {
        key: 'all',
        label: t('medications.filter.all', { defaultValue: 'All' }),
      },
      {
        key: 'meds',
        label: t('medications.filter.meds', { defaultValue: 'Meds' }),
      },
      {
        key: 'supplements',
        label: t('medications.filter.supplements', {
          defaultValue: 'Supplements',
        }),
      },
    ],
    [t]
  );

  const renderMedItem = ({ item }: { item: Medication }) => (
    <MedicationRow
      medication={item}
      onPress={() =>
        navigation.navigate('MedicationDetail', { medicationId: item.id })
      }
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
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-text-muted text-base">
            {t('medications.loading', {
              defaultValue: 'Loading medications...',
            })}
          </Text>
        </View>
      ) : isError ? (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-text-muted text-base text-center">
            {t('medications.loadFailed', {
              defaultValue: 'Failed to load medications.',
            })}
          </Text>
          <TouchableOpacity onPress={() => void refetch()} className="mt-4">
            <Text className="text-accent-primary text-base font-medium">
              {t('medications.retry', { defaultValue: 'Retry' })}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (medications?.length ?? 0) === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <Icon name="medication" size={48} color={iconDecorative} />
          <Text className="text-text-muted text-lg mt-4 text-center">
            {t('medications.noMedications', {
              defaultValue: 'No medications yet',
            })}
          </Text>
          <Text className="text-text-muted text-sm mt-2 text-center">
            {t('medications.emptyDescription', {
              defaultValue: 'Add your first medication to start tracking.',
            })}
          </Text>
          <TouchableOpacity
            className="mt-4 bg-accent-primary px-6 py-3 rounded-xl"
            onPress={() => navigation.navigate('MedicationForm', {})}
          >
            <Text className="text-white font-semibold">
              {t('medications.addMedicationTitle', {
                defaultValue: 'Add Medication',
              })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="mt-3 px-6 py-3"
            onPress={() =>
              navigation.navigate('MedicationForm', { isSupplement: true })
            }
          >
            <Text className="text-accent-primary font-semibold">
              {t('medications.supplement.add', {
                defaultValue: 'Add Supplement',
              })}
            </Text>
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
                accessibilityLabel={t('medications.inactiveA11y', {
                  defaultValue: 'Inactive medications ({{count}})',
                  count: inactive.length,
                })}
              >
                <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                  {t('medications.inactiveCount', {
                    defaultValue: 'Inactive ({{count}})',
                    count: inactive.length,
                  })}
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
          ListHeaderComponent={
            <View>
              <TouchableOpacity
                className="mx-4 mb-3 flex-row items-center rounded-xl bg-surface px-4 py-3 shadow-sm"
                onPress={() => navigation.navigate('MedicationAdherence')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('medications.adherence.openA11y', {
                  defaultValue: 'Open adherence overview and dose log',
                })}
              >
                <Icon name="checkmark-circle" size={20} color={accentColor} />
                <View className="ml-3 flex-1">
                  <Text className="text-base font-semibold text-text-primary">
                    {t('medications.adherence.openTitle', {
                      defaultValue: 'Adherence & log',
                    })}
                  </Text>
                  <Text className="mt-0.5 text-xs text-text-secondary">
                    {t('medications.adherence.openSubtitle', {
                      defaultValue:
                        'Checklist, streaks, month calendar and dose history',
                    })}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={14} color={iconDecorative} />
              </TouchableOpacity>
              {hasSupplements && (
                <View className="px-4 pb-2">
                  <SegmentedControl
                    segments={subtypeSegments}
                    activeKey={activeSubtype}
                    onSelect={setSubtype}
                  />
                </View>
              )}
              {active.length === 0 && inactive.length === 0 && (
                <Text className="text-text-muted text-base text-center px-8 py-8">
                  {activeSubtype === 'supplements'
                    ? t('medications.supplement.none', {
                        defaultValue: 'No supplements yet',
                      })
                    : t('medications.noMedications', {
                        defaultValue: 'No medications yet',
                      })}
                </Text>
              )}
            </View>
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
          contentInsetAdjustmentBehavior={
            usesNativeHeader ? 'automatic' : 'never'
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={accentColor}
            />
          }
        />
      )}
      <ActionSheet
        ref={addSheetRef}
        title={t('medications.addMedication', {
          defaultValue: 'Add medication',
        })}
        items={addItems}
      />
    </View>
  );
};

export default MedicationsListScreen;
