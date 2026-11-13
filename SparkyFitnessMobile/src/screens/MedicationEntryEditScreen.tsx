import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  INJECTION_SITES,
  type MedicationEntryStatus,
  type UpdateInjectionInput,
  type UpdateMedicationEntryInput,
} from '@workspace/shared';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import TimeSheet, { type TimeSheetRef } from '../components/TimeSheet';
import { useUpdateInjection } from '../hooks/useGlp1';
import { useUpdateMedicationEntry } from '../hooks/useMedications';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { addLog } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';
import { getDeviceTimezone } from '../utils/dateUtils';
import { editedTakenAt, entryTimeOfDay } from '../utils/medicationAdherence';
import { injectionSiteLabel } from '../utils/medicationLocalization';
import { formatLocalizedTimeOfDay } from '../utils/medicationScheduleLocalization';

type MedicationEntryEditScreenProps =
  RootStackScreenProps<'MedicationEntryEdit'>;

const NO_SITE = 'none';

/** Statuses a scheduled dose can be corrected between; as-needed doses keep theirs. */
const EDITABLE_STATUSES: MedicationEntryStatus[] = [
  'taken',
  'skipped',
  'snoozed',
];

const MedicationEntryEditScreen: React.FC<MedicationEntryEditScreenProps> = ({
  route,
  navigation,
}) => {
  const { t } = useTranslation();
  const { entry } = route.params;
  const isInjection = entry.entry_type === 'injection';
  const canEditStatus =
    !isInjection && EDITABLE_STATUSES.includes(entry.status);
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { preferences } = usePreferences();
  const timezone = getDeviceTimezone();
  const timeSheetRef = useRef<TimeSheetRef>(null);

  const updateEntry = useUpdateMedicationEntry();
  const updateInjection = useUpdateInjection();
  const isSaving = updateEntry.isPending || updateInjection.isPending;

  const [timeOfDay, setTimeOfDay] = useState(() =>
    entryTimeOfDay(entry.taken_at, timezone)
  );
  const [status, setStatus] = useState<MedicationEntryStatus>(entry.status);
  const [site, setSite] = useState(entry.site ?? NO_SITE);
  const [notes, setNotes] = useState(entry.notes ?? '');

  const handleSave = useCallback(() => {
    if (isSaving) return;
    const entryDay = entry.entry_date.slice(0, 10);
    const takenAt = editedTakenAt(entryDay, timeOfDay, timezone);
    const trimmedNotes = notes.trim() || null;

    const onSuccess = () => {
      Toast.show({
        type: 'success',
        text1: t('medications.entryEdit.saved', {
          defaultValue: 'Dose updated',
        }),
      });
      navigation.goBack();
    };
    const onError = (error: Error) => {
      addLog(`Failed to update medication entry: ${error.message}`, 'ERROR');
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('medications.entryEdit.saveFailed', {
          defaultValue: 'Failed to save: {{error}}',
          error: error.message,
        })
      );
    };

    if (isInjection) {
      const body: UpdateInjectionInput = {
        injected_at: takenAt,
        entry_date: entryDay,
        site: site === NO_SITE ? null : site,
        notes: trimmedNotes,
      };
      updateInjection.mutate({ id: entry.id, body }, { onSuccess, onError });
    } else {
      const body: UpdateMedicationEntryInput = {
        taken_at: takenAt,
        entry_date: entryDay,
        notes: trimmedNotes,
        ...(canEditStatus ? { status } : {}),
      };
      updateEntry.mutate({ id: entry.id, body }, { onSuccess, onError });
    }
  }, [
    isSaving,
    entry,
    timeOfDay,
    timezone,
    notes,
    isInjection,
    site,
    canEditStatus,
    status,
    updateInjection,
    updateEntry,
    navigation,
    t,
  ]);

  const title = t('medications.entryEdit.title', {
    defaultValue: 'Edit logged dose',
  });
  const header = useScreenHeader({
    title,
    nativeTitle: title,
    left: { kind: 'dismiss', onPress: () => navigation.goBack() },
    right: {
      kind: 'primary',
      label: t('common.save', { defaultValue: 'Save' }),
      busy: isSaving,
      busyLabel: t('common.saving', { defaultValue: 'Saving…' }),
      onPress: handleSave,
    },
  });

  const statusOptions = useMemo(
    () => [
      {
        label: t('medications.dose.taken', { defaultValue: 'Taken' }),
        value: 'taken' as const,
      },
      {
        label: t('medications.dose.skipped', { defaultValue: 'Skipped' }),
        value: 'skipped' as const,
      },
      {
        label: t('medications.today.snoozed', { defaultValue: 'Snoozed' }),
        value: 'snoozed' as const,
      },
    ],
    [t]
  );

  const siteOptions = useMemo(
    () => [
      {
        label: t('medications.entryEdit.noSite', { defaultValue: 'No site' }),
        value: NO_SITE,
      },
      ...INJECTION_SITES.map((s) => ({
        label: injectionSiteLabel(s.id, t),
        value: s.id,
      })),
    ],
    [t]
  );

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          rowGap: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        {entry.med_name_snapshot != null && (
          <Text className="text-lg font-semibold text-text-primary">
            {entry.med_name_snapshot}
          </Text>
        )}

        <SettingsRowGroup>
          <SettingsRow
            title={t('medications.entryEdit.takenAt', {
              defaultValue: 'Taken at',
            })}
            accessibilityLabel={t('medications.entryEdit.setTime', {
              defaultValue: 'Set time',
            })}
            onPress={() => timeSheetRef.current?.present()}
            rightAccessory={
              <Text className="text-base text-text-secondary">
                {formatLocalizedTimeOfDay(
                  timeOfDay,
                  undefined,
                  preferences?.time_format
                )}
              </Text>
            }
          />
        </SettingsRowGroup>

        {canEditStatus && (
          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {t('medications.entryEdit.status', { defaultValue: 'Status' })}
            </Text>
            <BottomSheetPicker
              value={status}
              options={statusOptions}
              onSelect={setStatus}
              title={t('medications.entryEdit.status', {
                defaultValue: 'Status',
              })}
            />
          </View>
        )}

        {isInjection && (
          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {t('medications.entryEdit.site', {
                defaultValue: 'Injection site',
              })}
            </Text>
            <BottomSheetPicker
              value={site}
              options={siteOptions}
              onSelect={setSite}
              title={t('medications.entryEdit.site', {
                defaultValue: 'Injection site',
              })}
            />
          </View>
        )}

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('medications.form.notes', { defaultValue: 'Notes' })}
          </Text>
          <FormInput
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={{ minHeight: 72 }}
          />
        </View>
      </KeyboardAwareScrollView>

      <TimeSheet
        ref={timeSheetRef}
        value={timeOfDay}
        timeFormat={preferences?.time_format}
        onSelectTime={setTimeOfDay}
      />
    </View>
  );
};

export default MedicationEntryEditScreen;
