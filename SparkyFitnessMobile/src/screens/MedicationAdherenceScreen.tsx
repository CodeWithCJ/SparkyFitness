import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import {
  visibleDoseCards,
  type MedSubtype,
  type MedicationEntry,
} from '@workspace/shared';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import MedicalDisclaimer from '../components/MedicalDisclaimer';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import Button from '../components/ui/Button';
import AdherenceOverviewCard from '../components/medications/AdherenceOverviewCard';
import MedicationChecklistCard from '../components/medications/MedicationChecklistCard';
import MedicationDayLog from '../components/medications/MedicationDayLog';
import MedicationDoseListCard from '../components/medications/MedicationDoseListCard';
import MedicationLogCalendar from '../components/medications/MedicationLogCalendar';
import MedicationTimeGroupsCard from '../components/medications/MedicationTimeGroupsCard';
import { useDeleteInjection } from '../hooks/useGlp1';
import { useMedicationAdherence } from '../hooks/useMedicationAdherence';
import { useDeleteMedicationEntry, useLogDose } from '../hooks/useMedications';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { addLog } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';
import { getAppLocale } from '../localization';
import { formatDateLabel, getTodayDate } from '../utils/dateUtils';

type MedicationAdherenceScreenProps =
  RootStackScreenProps<'MedicationAdherence'>;

const MedicationAdherenceScreen: React.FC<MedicationAdherenceScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const dateLocale = getAppLocale();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const [subtype, setSubtype] = useState<MedSubtype>('all');
  const [refreshing, setRefreshing] = useState(false);
  const today = getTodayDate();
  const isToday = selectedDate === today;

  const adherence = useMedicationAdherence(selectedDate, subtype);
  const {
    allMedications,
    medications,
    dueDoses,
    prnMedications,
    dayEntries,
    checklist,
    summary,
    refetch,
  } = adherence;
  const dose = useLogDose(selectedDate, dayEntries);

  const deleteEntry = useDeleteMedicationEntry();
  const deleteInjection = useDeleteInjection();
  const isDeleting = deleteEntry.isPending || deleteInjection.isPending;

  const header = useScreenHeader({
    title: t('medications.adherence.screenTitle', {
      defaultValue: 'Adherence',
    }),
    left: { kind: 'back' },
  });

  const hasSupplements = useMemo(
    () => allMedications.some((m) => m.is_supplement),
    [allMedications]
  );
  const activeSubtype: MedSubtype = hasSupplements ? subtype : 'all';

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

  const medicationDues = useMemo(
    () => dueDoses.filter((d) => !d.medication.is_supplement),
    [dueDoses]
  );
  const supplementDues = useMemo(
    () => dueDoses.filter((d) => Boolean(d.medication.is_supplement)),
    [dueDoses]
  );
  const medicationPrns = useMemo(
    () => prnMedications.filter((m) => !m.is_supplement),
    [prnMedications]
  );
  const supplementPrns = useMemo(
    () => prnMedications.filter((m) => Boolean(m.is_supplement)),
    [prnMedications]
  );
  const cards = visibleDoseCards(
    activeSubtype,
    supplementDues.length > 0 || supplementPrns.length > 0
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const openMedication = useCallback(
    (medicationId: string) =>
      navigation.navigate('MedicationDetail', { medicationId }),
    [navigation]
  );

  const handleEdit = useCallback(
    (entry: MedicationEntry) =>
      navigation.navigate('MedicationEntryEdit', { entry }),
    [navigation]
  );

  const handleDelete = useCallback(
    (entry: MedicationEntry) => {
      const name =
        entry.med_name_snapshot ??
        t('medications.dayLog.unknownMedication', {
          defaultValue: 'Medication',
        });
      const remove = () => {
        const options = {
          onSuccess: () =>
            Toast.show({
              type: 'info',
              text1: t('medications.dayLog.deleted', {
                defaultValue: '{{name}} entry deleted',
                name,
              }),
            }),
          onError: (error: Error) => {
            addLog(
              `Failed to delete medication entry: ${error.message}`,
              'ERROR'
            );
            Toast.show({
              type: 'error',
              text1: t('medications.dayLog.deleteFailed', {
                defaultValue: 'Failed to delete {{name}} entry',
                name,
              }),
            });
          },
        };
        // Injection rows carry injection ids; deleting through the injection endpoint
        // also credits the dose back to the pen it was deducted from.
        if (entry.entry_type === 'injection') {
          deleteInjection.mutate(entry.id, options);
        } else {
          deleteEntry.mutate(entry.id, options);
        }
      };
      Alert.alert(
        t('medications.dayLog.deleteTitle', { defaultValue: 'Delete entry' }),
        t('medications.dayLog.deleteMessage', {
          defaultValue: 'Delete this logged dose of {{name}}?',
          name,
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
          },
          {
            text: t('common.delete', { defaultValue: 'Delete' }),
            style: 'destructive',
            onPress: remove,
          },
        ]
      );
    },
    [deleteEntry, deleteInjection, t]
  );

  const body = adherence.isLoading ? (
    <View className="items-center justify-center py-16">
      <Text className="text-text-muted text-base">
        {t('medications.adherence.loading', {
          defaultValue: 'Loading adherence...',
        })}
      </Text>
    </View>
  ) : adherence.isError ? (
    <View className="items-center justify-center p-8">
      <Text className="text-text-muted text-base text-center">
        {t('medications.adherence.loadFailed', {
          defaultValue: 'Failed to load adherence.',
        })}
      </Text>
      <Button variant="link" onPress={() => void refetch()} className="mt-2">
        {t('medications.retry', { defaultValue: 'Retry' })}
      </Button>
    </View>
  ) : allMedications.length === 0 ? (
    <View className="items-center justify-center p-8">
      <Text className="text-text-muted text-base text-center">
        {t('medications.adherence.noMedications', {
          defaultValue: 'Add a medication to start tracking adherence.',
        })}
      </Text>
    </View>
  ) : (
    <>
      <AdherenceOverviewCard
        summary={summary}
        dosesCompleted={checklist.completed}
        dosesTotal={checklist.total}
        isToday={isToday}
      />
      <MedicationChecklistCard progress={checklist} isToday={isToday} />

      {/* While another day's entries stand in, logging would act on the wrong list. */}
      <View
        pointerEvents={adherence.isPlaceholderData ? 'none' : 'auto'}
        style={adherence.isPlaceholderData ? { opacity: 0.5 } : undefined}
      >
        <MedicationTimeGroupsCard dueDoses={dueDoses} dose={dose} />
        {cards.medications && (
          <MedicationDoseListCard
            title={
              isToday
                ? t('medications.today.medicationsTitle', {
                    defaultValue: "Today's medications",
                  })
                : t('medications.today.medicationsTitleDay', {
                    defaultValue: 'Medications',
                  })
            }
            emptyDueText={
              isToday
                ? t('medications.today.noMedicationDoses', {
                    defaultValue:
                      'No scheduled doses today, log any medication as-needed below.',
                  })
                : t('medications.today.noMedicationDosesDay', {
                    defaultValue:
                      'No scheduled doses on this day, log any medication as-needed below.',
                  })
            }
            emptyPrnText={t('medications.today.noPrnMedications', {
              defaultValue:
                'No as-needed or non-scheduled medications configured.',
            })}
            dueDoses={medicationDues}
            prnMedications={medicationPrns}
            dayEntries={dayEntries}
            dose={dose}
            isToday={isToday}
            onOpenMedication={openMedication}
          />
        )}
        {cards.supplements && (
          <MedicationDoseListCard
            title={
              isToday
                ? t('medications.today.supplementsTitle', {
                    defaultValue: "Today's supplements",
                  })
                : t('medications.today.supplementsTitleDay', {
                    defaultValue: 'Supplements',
                  })
            }
            emptyDueText={
              isToday
                ? t('medications.today.noSupplementDoses', {
                    defaultValue:
                      'No scheduled doses today, log any supplement as-needed below.',
                  })
                : t('medications.today.noSupplementDosesDay', {
                    defaultValue:
                      'No scheduled doses on this day, log any supplement as-needed below.',
                  })
            }
            emptyPrnText={t('medications.today.noPrnSupplements', {
              defaultValue:
                'No as-needed or non-scheduled supplements configured.',
            })}
            dueDoses={supplementDues}
            prnMedications={supplementPrns}
            dayEntries={dayEntries}
            dose={dose}
            isToday={isToday}
            onOpenMedication={openMedication}
          />
        )}
      </View>

      <MedicationLogCalendar
        medications={medications}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        subtype={activeSubtype}
      />

      <MedicationDayLog
        title={
          isToday
            ? t('medications.today.loggedActivity', {
                defaultValue: 'Logged today',
              })
            : t('medications.dayLog.titleDay', {
                defaultValue: 'Logged on {{date}}',
                date: formatDateLabel(selectedDate, t, dateLocale),
              })
        }
        description={t('medications.today.loggedActivityDescription', {
          defaultValue: "Everything you've taken or skipped on this date.",
        })}
        entries={dayEntries}
        isLoading={adherence.isPlaceholderData}
        onEdit={handleEdit}
        onDelete={handleDelete}
        busy={isDeleting}
      />
    </>
  );

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
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
      >
        {hasSupplements && (
          <View className="pb-3">
            <SegmentedControl
              segments={subtypeSegments}
              activeKey={activeSubtype}
              onSelect={setSubtype}
            />
          </View>
        )}
        {!isToday && (
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm text-text-secondary">
              {t('medications.adherence.viewingDate', {
                defaultValue: 'Viewing {{date}}',
                date: formatDateLabel(selectedDate, t, dateLocale),
              })}
            </Text>
            <Button variant="link" onPress={() => setSelectedDate(today)}>
              {t('medications.adherence.backToToday', {
                defaultValue: 'Back to today',
              })}
            </Button>
          </View>
        )}
        {body}
        <MedicalDisclaimer />
      </ScrollView>
    </View>
  );
};

export default MedicationAdherenceScreen;
