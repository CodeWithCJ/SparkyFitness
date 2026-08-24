import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Alert, TouchableOpacity, type TextStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import BottomSheetPicker from '../components/BottomSheetPicker';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import {
  useMedicationDetail,
  useCreateMedicationSchedule,
  useUpdateMedicationSchedule,
  useDeleteMedicationSchedule,
} from '../hooks/useMedications';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import FormInput from '../components/FormInput';
import StepperInput from '../components/StepperInput';
import TimeSheet, { type TimeSheetRef } from '../components/TimeSheet';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import WeekdaySheet, { type WeekdaySheetRef } from '../components/medications/WeekdaySheet';
import Switch from '../components/ui/Switch';
import { formatLocalizedTimeOfDay, localizedMealTimingLabel, localizedWeekdayLabels } from '../utils/medicationScheduleLocalization';
import type { CreateScheduleInput, MedicationSchedule, MedicationWithMeal } from '@workspace/shared';
import { getTodayDate, formatDateLabel } from '../utils/dateUtils';
import { addLog } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';
import { scheduleTypeLabel } from '../utils/medicationLocalization';
import { SCHEDULE_TYPES } from '../types/medications';

type MedicationScheduleFormScreenProps = RootStackScreenProps<'MedicationScheduleForm'>;

interface FormState {
  scheduleTypeId: string;
  timeOfDay: string; // '' or 'HH:MM'
  doseAmount: string;
  daysOfWeek: number[];
  intervalDays: string;
  dayOfMonth: string;
  cycleOnDays: string;
  cycleOffDays: string;
  withMeal: string; // '' | MedicationWithMeal
  prnReason: string;
  prnMaxPerDay: string;
  startDate: string; // '' or YYYY-MM-DD
  endDate: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  scheduleTypeId: 'daily',
  timeOfDay: '',
  doseAmount: '',
  daysOfWeek: [],
  intervalDays: '2',
  dayOfMonth: '1',
  cycleOnDays: '21',
  cycleOffDays: '7',
  withMeal: '',
  prnReason: '',
  prnMaxPerDay: '',
  startDate: '',
  endDate: '',
  active: true,
};

// Ids the form knows how to author or round-trip. Anything else is a newer
// server addition: only universal fields are edited and the unknown
// discriminators are carried over verbatim (see buildPayload).
const KNOWN_TYPE_IDS = [
  'daily',
  'weekly',
  'specific_days',
  'every_n_days',
  'monthly',
  'cyclic',
  'prn',
  'taper',
];

// One type→field-family mapping shared by conditional rendering and
// buildPayload, so a field never renders without being saved or vice versa.
const usesDaysOfWeek = (type: string) => type === 'weekly' || type === 'specific_days';
const usesIntervalDays = (type: string) => type === 'every_n_days';
const usesDayOfMonth = (type: string) => type === 'monthly';
const usesCycle = (type: string) => type === 'cyclic';
const isPrnType = (type: string) => type === 'prn';
const requiresStartDate = (type: string) => type === 'every_n_days' || type === 'cyclic';

// Borderless right-aligned entry for inline editing inside a settings row.
const INLINE_INPUT_STYLE: TextStyle = {
  backgroundColor: 'transparent',
  borderWidth: 0,
  paddingTop: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  paddingRight: 0,
  textAlign: 'right',
  minWidth: 120,
  maxWidth: 200,
};

function humanizeTypeId(typeId: string): string {
  const words = typeId.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function baseFromSchedule(existing?: MedicationSchedule): FormState {
  if (!existing) return EMPTY_FORM;
  return {
    scheduleTypeId: existing.schedule_type_id,
    // Postgres TIME comes back as 'HH:MM:SS'; TimeSheet expects '' | 'HH:MM'.
    timeOfDay: (existing.time_of_day ?? '').slice(0, 5),
    doseAmount: existing.dose_amount != null ? String(existing.dose_amount) : '',
    daysOfWeek: existing.days_of_week ?? [],
    intervalDays:
      existing.interval_days != null ? String(existing.interval_days) : EMPTY_FORM.intervalDays,
    dayOfMonth:
      existing.day_of_month != null ? String(existing.day_of_month) : EMPTY_FORM.dayOfMonth,
    cycleOnDays:
      existing.cycle_on_days != null ? String(existing.cycle_on_days) : EMPTY_FORM.cycleOnDays,
    cycleOffDays:
      existing.cycle_off_days != null ? String(existing.cycle_off_days) : EMPTY_FORM.cycleOffDays,
    withMeal: existing.with_meal ?? '',
    prnReason: existing.prn_reason ?? '',
    prnMaxPerDay: existing.prn_max_per_day != null ? String(existing.prn_max_per_day) : '',
    startDate: (existing.start_date ?? '').slice(0, 10),
    endDate: (existing.end_date ?? '').slice(0, 10),
    active: existing.active,
  };
}

const MedicationScheduleFormScreen: React.FC<MedicationScheduleFormScreenProps> = ({
  route,
  navigation,
}) => {
  const { t , i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { medicationId, scheduleId } = route.params;
  const isEditing = !!scheduleId;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { data: med, isLoading } = useMedicationDetail(medicationId);
  const existing = useMemo(
    () => med?.schedules?.find((s) => s.id === scheduleId),
    [med, scheduleId],
  );

  const createScheduleMutation = useCreateMedicationSchedule();
  const updateScheduleMutation = useUpdateMedicationSchedule();
  const deleteScheduleMutation = useDeleteMedicationSchedule();

  const timeSheetRef = useRef<TimeSheetRef>(null);
  const startCalendarRef = useRef<CalendarSheetRef>(null);
  const endCalendarRef = useRef<CalendarSheetRef>(null);
  const weekdaySheetRef = useRef<WeekdaySheetRef>(null);

  const [edits, setEdits] = useState<Partial<FormState>>({});

  const form: FormState = useMemo(
    () => ({ ...baseFromSchedule(existing), ...edits }),
    [existing, edits],
  );

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSelectType = useCallback(
    (typeId: string) => {
      updateField('scheduleTypeId', typeId);
      if (requiresStartDate(typeId) && !form.startDate) {
        updateField('startDate', getTodayDate());
      }
    },
    [form.startDate, updateField],
  );

  const stepInt = useCallback(
    (
      key: 'intervalDays' | 'dayOfMonth' | 'cycleOnDays' | 'cycleOffDays' | 'prnMaxPerDay',
      current: string,
      delta: number,
      min: number,
      max?: number,
    ) => {
      const parsed = parseInt(current, 10);
      // An empty field steps straight to min, not min + delta.
      let next = Number.isFinite(parsed) ? parsed + delta : min;
      next = Math.max(min, next);
      if (max != null) next = Math.min(max, next);
      updateField(key, String(next));
    },
    [updateField],
  );

  const buildPayload = useCallback((): CreateScheduleInput => {
    const type = form.scheduleTypeId;
    const doseAmount = form.doseAmount ? parseFloat(form.doseAmount) : null;
    const universal = {
      schedule_type_id: type,
      time_of_day: isPrnType(type) ? null : form.timeOfDay || null,
      dose_amount: doseAmount,
      with_meal: (form.withMeal || null) as MedicationWithMeal | null,
      start_date: form.startDate || null,
      end_date: form.endDate || null,
      active: form.active,
    };

    if (!KNOWN_TYPE_IDS.includes(type)) {
      // Unknown (newer-server) type: never null out discriminators the form
      // can't represent — carry them over from the stored row untouched.
      return {
        ...universal,
        days_of_week: existing?.days_of_week ?? null,
        interval_days: existing?.interval_days ?? null,
        day_of_month: existing?.day_of_month ?? null,
        cycle_on_days: existing?.cycle_on_days ?? null,
        cycle_off_days: existing?.cycle_off_days ?? null,
        prn_reason: existing?.prn_reason ?? null,
        prn_max_per_day: existing?.prn_max_per_day ?? null,
      };
    }

    return {
      ...universal,
      days_of_week: usesDaysOfWeek(type) ? form.daysOfWeek : null,
      interval_days: usesIntervalDays(type) ? parseInt(form.intervalDays, 10) : null,
      day_of_month: usesDayOfMonth(type) ? parseInt(form.dayOfMonth, 10) : null,
      cycle_on_days: usesCycle(type) ? parseInt(form.cycleOnDays, 10) : null,
      cycle_off_days: usesCycle(type) ? parseInt(form.cycleOffDays, 10) : null,
      prn_reason: isPrnType(type) ? form.prnReason.trim() || null : null,
      prn_max_per_day:
        isPrnType(type) && form.prnMaxPerDay ? parseInt(form.prnMaxPerDay, 10) : null,
    };
  }, [form, existing]);

  const handleSave = useCallback(() => {
    if (createScheduleMutation.isPending || updateScheduleMutation.isPending) return;
    // A Save while the schedule is still loading (or gone) must never
    // overwrite a real schedule with create defaults.
    if (isEditing && !existing) return;

    const type = form.scheduleTypeId;
    if (usesDaysOfWeek(type) && form.daysOfWeek.length === 0) {
      Alert.alert(t('medications.schedule.required', { defaultValue: 'Required' }), t('medications.schedule.daysRequired', { defaultValue: 'Select at least one day of the week.' }));
      return;
    }
    if (usesIntervalDays(type)) {
      const interval = parseInt(form.intervalDays, 10);
      if (!Number.isFinite(interval) || interval < 1) {
        Alert.alert(t('medications.schedule.invalidInterval', { defaultValue: 'Invalid interval' }), t('medications.schedule.intervalMessage', { defaultValue: 'Interval must be at least 1 day.' }));
        return;
      }
      if (!form.startDate) {
        Alert.alert(t('medications.schedule.required', { defaultValue: 'Required' }), t('medications.schedule.everyNStart', { defaultValue: 'Every N days schedules need a start date.' }));
        return;
      }
    }
    if (usesCycle(type)) {
      const on = parseInt(form.cycleOnDays, 10);
      const off = parseInt(form.cycleOffDays, 10);
      if (!Number.isFinite(on) || on < 1 || !Number.isFinite(off) || off < 0) {
        Alert.alert(t('medications.schedule.invalidCycle', { defaultValue: 'Invalid cycle' }), t('medications.schedule.cycleMessage', { defaultValue: 'Days on must be at least 1 and days off at least 0.' }));
        return;
      }
      if (!form.startDate) {
        Alert.alert(t('medications.schedule.required', { defaultValue: 'Required' }), t('medications.schedule.cycleStart', { defaultValue: 'Cycle schedules need a start date.' }));
        return;
      }
    }
    if (usesDayOfMonth(type)) {
      const day = parseInt(form.dayOfMonth, 10);
      if (!Number.isFinite(day) || day < 1 || day > 31) {
        Alert.alert(t('medications.schedule.invalidDay', { defaultValue: 'Invalid day' }), t('medications.schedule.dayMessage', { defaultValue: 'Day of month must be between 1 and 31.' }));
        return;
      }
    }
    if (form.doseAmount) {
      const dose = parseFloat(form.doseAmount);
      if (!Number.isFinite(dose) || dose <= 0) {
        Alert.alert(t('medications.schedule.invalidDose', { defaultValue: 'Invalid dose' }), t('medications.schedule.doseMessage', { defaultValue: 'Please enter a valid dose amount.' }));
        return;
      }
    }
    if (isPrnType(type) && form.prnMaxPerDay) {
      const max = parseInt(form.prnMaxPerDay, 10);
      if (!Number.isFinite(max) || max < 1) {
        Alert.alert(t('medications.schedule.invalidLimit', { defaultValue: 'Invalid limit' }), t('medications.schedule.limitMessage', { defaultValue: 'Max per day must be at least 1.' }));
        return;
      }
    }
    // Lexical compare is safe for YYYY-MM-DD strings.
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      Alert.alert(t('medications.schedule.invalidDates', { defaultValue: 'Invalid dates' }), t('medications.schedule.datesMessage', { defaultValue: 'End date must be on or after the start date.' }));
      return;
    }

    const body = buildPayload();
    if (isEditing && scheduleId) {
      updateScheduleMutation.mutate(
        { id: scheduleId, medicationId, body },
        {
          onSuccess: () => navigation.goBack(),
          onError: (error) => Alert.alert(t('common.error', { defaultValue: 'Error' }), t('medications.schedule.updateFailed', { defaultValue: 'Failed to update schedule: {{error}}', error: error.message })),
        },
      );
    } else {
      createScheduleMutation.mutate(
        { medicationId, body },
        {
          onSuccess: () => navigation.goBack(),
          onError: (error) => Alert.alert(t('common.error', { defaultValue: 'Error' }), t('medications.schedule.createFailed', { defaultValue: 'Failed to create schedule: {{error}}', error: error.message })),
        },
      );
    }
  }, [
    form,
    isEditing,
    existing,
    scheduleId,
    medicationId,
    buildPayload,
    createScheduleMutation,
    updateScheduleMutation,
    navigation,
    t,
  ]);

  const handleDelete = useCallback(() => {
    if (!isEditing || !scheduleId || !existing) return;
    Alert.alert(t('medications.schedule.deleteTitle', { defaultValue: 'Delete Schedule' }), t('medications.schedule.deleteMessage', { defaultValue: 'Delete this schedule? Logged doses are kept.' }), [
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      {
        text: t('common.delete', { defaultValue: 'Delete' }),
        style: 'destructive',
        onPress: () => {
          deleteScheduleMutation.mutate(
            { id: scheduleId, medicationId },
            {
              onSuccess: () => navigation.goBack(),
              onError: (error) => {
                addLog(`Failed to delete schedule: ${error.message}`, 'ERROR');
                Toast.show({ type: 'error', text1: t('medications.schedule.deleteFailed', { defaultValue: 'Failed to delete schedule' }) });
              },
            },
          );
        },
      },
    ]);
  }, [isEditing, scheduleId, existing, medicationId, deleteScheduleMutation, navigation, t]);

  const header = useScreenHeader({
    title: isEditing ? t('medications.schedule.editTitle', { defaultValue: 'Edit Schedule' }) : t('medications.schedule.newTitle', { defaultValue: 'New Schedule' }),
    nativeTitle: isEditing ? t('medications.schedule.editTitle', { defaultValue: 'Edit Schedule' }) : t('medications.schedule.newTitle', { defaultValue: 'New Schedule' }),
    left: { kind: 'dismiss', onPress: () => navigation.goBack() },
    right: {
      kind: 'primary',
      label: t('common.save', { defaultValue: 'Save' }),
      busy: createScheduleMutation.isPending || updateScheduleMutation.isPending,
      busyLabel: t('common.saving', { defaultValue: 'Saving…' }),
      disabled: isEditing && !existing,
      onPress: handleSave,
    },
  });

  const typeOptions = useMemo(() => {
    const options: { label: string; value: string }[] = SCHEDULE_TYPES.map((id) => ({
      label: scheduleTypeLabel(id, t),
      value: id,
    }));
    if (form.scheduleTypeId && !options.some((o) => o.value === form.scheduleTypeId)) {
      options.push({ label: humanizeTypeId(form.scheduleTypeId), value: form.scheduleTypeId });
    }
    return options;
  }, [form.scheduleTypeId, t]);

  const withMealOptions = useMemo(
    () => [
      { label: t('medications.schedule.none', { defaultValue: 'None' }), value: '' },
      { label: localizedMealTimingLabel(t, 'before'), value: 'before' },
      { label: localizedMealTimingLabel(t, 'with'), value: 'with' },
      { label: localizedMealTimingLabel(t, 'after'), value: 'after' },
      { label: localizedMealTimingLabel(t, 'away_from_meals'), value: 'away_from_meals' },
    ],
    [t],
  );

  const type = form.scheduleTypeId;
  const startRequired = requiresStartDate(type);

  const weekdayLabels = localizedWeekdayLabels(t);
  const daysSummary =
    form.daysOfWeek.length === 7
      ? t('medications.schedule.everyDay', { defaultValue: 'Every day' })
      : form.daysOfWeek.length > 0
        ? form.daysOfWeek.map((d) => weekdayLabels[d]).join(', ')
        : t('medications.schedule.none', { defaultValue: 'None' });

  if (isEditing && !existing) {
    return (
      <View
        className="flex-1 bg-background"
        style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
      >
        {header}
        <View className="flex-1 items-center justify-center">
          <Text className="text-text-muted text-base">
            {isLoading || !med ? t('medications.schedule.loading', { defaultValue: 'Loading...' }) : t('medications.schedule.notFound', { defaultValue: 'Schedule not found' })}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        <SettingsRowGroup>
          {!isPrnType(type) && (
            <SettingsRow
              title={t('medications.schedule.time', { defaultValue: 'Time' })}
              accessibilityLabel={t('medications.schedule.setTime', { defaultValue: 'Set time' })}
              onPress={() => timeSheetRef.current?.present()}
              rightAccessory={
                <View className="flex-row items-center gap-3">
                  {form.timeOfDay !== '' && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => updateField('timeOfDay', '')}
                      accessibilityRole="button"
                      accessibilityLabel={t('medications.schedule.clearTime', { defaultValue: 'Clear time' })}
                    >
                      <Text className="text-text-link text-sm font-medium">{t('medications.schedule.clear', { defaultValue: 'Clear' })}</Text>
                    </TouchableOpacity>
                  )}
                  <Text className="text-base text-text-secondary">
                    {form.timeOfDay ? formatLocalizedTimeOfDay(form.timeOfDay) : t('medications.schedule.none', { defaultValue: 'None' })}
                  </Text>
                </View>
              }
            />
          )}

          <BottomSheetPicker
            value={form.scheduleTypeId}
            options={typeOptions}
            onSelect={handleSelectType}
            title={t('medications.schedule.scheduleType', { defaultValue: 'Schedule Type' })}
            renderTrigger={({ onPress, selectedOption }) => (
              <SettingsRow
                title={t('medications.schedule.frequency', { defaultValue: 'Frequency' })}
                onPress={onPress}
                rightAccessory={
                  <Text className="text-base text-text-secondary">
                    {selectedOption?.label ?? ''}
                  </Text>
                }
              />
            )}
          />

          {usesDaysOfWeek(type) && (
            <SettingsRow
              title={t('medications.schedule.daysOfWeek', { defaultValue: 'Days of week' })}
              accessibilityLabel={t('medications.schedule.selectDays', { defaultValue: 'Select days of week' })}
              onPress={() => weekdaySheetRef.current?.present()}
              rightAccessory={
                <Text className="text-base text-text-secondary">{daysSummary}</Text>
              }
            />
          )}

          {usesIntervalDays(type) && (
            <SettingsRow
              title={t('medications.schedule.everyNDays', { defaultValue: 'Every N days' })}
              rightAccessory={
                <StepperInput
                  value={form.intervalDays}
                  onChangeText={(v) => updateField('intervalDays', v)}
                  onIncrement={() => stepInt('intervalDays', form.intervalDays, 1, 1)}
                  onDecrement={() => stepInt('intervalDays', form.intervalDays, -1, 1)}
                  keyboardType="number-pad"
                  compact
                />
              }
            />
          )}

          {usesDayOfMonth(type) && (
            <SettingsRow
              title={t('medications.schedule.dayOfMonth', { defaultValue: 'Day of month' })}
              rightAccessory={
                <StepperInput
                  value={form.dayOfMonth}
                  onChangeText={(v) => updateField('dayOfMonth', v)}
                  onIncrement={() => stepInt('dayOfMonth', form.dayOfMonth, 1, 1, 31)}
                  onDecrement={() => stepInt('dayOfMonth', form.dayOfMonth, -1, 1, 31)}
                  keyboardType="number-pad"
                  compact
                />
              }
            />
          )}

          {usesCycle(type) && (
            <SettingsRow
              title={t('medications.schedule.daysOn', { defaultValue: 'Days on' })}
              rightAccessory={
                <StepperInput
                  value={form.cycleOnDays}
                  onChangeText={(v) => updateField('cycleOnDays', v)}
                  onIncrement={() => stepInt('cycleOnDays', form.cycleOnDays, 1, 1)}
                  onDecrement={() => stepInt('cycleOnDays', form.cycleOnDays, -1, 1)}
                  keyboardType="number-pad"
                  compact
                />
              }
            />
          )}
          {usesCycle(type) && (
            <SettingsRow
              title={t('medications.schedule.daysOff', { defaultValue: 'Days off' })}
              rightAccessory={
                <StepperInput
                  value={form.cycleOffDays}
                  onChangeText={(v) => updateField('cycleOffDays', v)}
                  onIncrement={() => stepInt('cycleOffDays', form.cycleOffDays, 1, 0)}
                  onDecrement={() => stepInt('cycleOffDays', form.cycleOffDays, -1, 0)}
                  keyboardType="number-pad"
                  compact
                />
              }
            />
          )}

          {isPrnType(type) && (
            <SettingsRow
              title={t('medications.schedule.reason', { defaultValue: 'Reason' })}
              rightAccessory={
                <FormInput
                  placeholder={t('medications.schedule.reasonPlaceholder', { defaultValue: 'Headache' })}
                  value={form.prnReason}
                  onChangeText={(v) => updateField('prnReason', v)}
                  style={INLINE_INPUT_STYLE}
                />
              }
            />
          )}
          {isPrnType(type) && (
            <SettingsRow
              title={t('medications.schedule.maxPerDay', { defaultValue: 'Max per day' })}
              rightAccessory={
                <StepperInput
                  value={form.prnMaxPerDay}
                  onChangeText={(v) => updateField('prnMaxPerDay', v)}
                  onIncrement={() => stepInt('prnMaxPerDay', form.prnMaxPerDay, 1, 1)}
                  onDecrement={() => stepInt('prnMaxPerDay', form.prnMaxPerDay, -1, 1)}
                  keyboardType="number-pad"
                  placeholder={t('medications.schedule.noLimit', { defaultValue: 'No limit' })}
                  compact
                />
              }
            />
          )}
        </SettingsRowGroup>

        {!isPrnType(type) && form.timeOfDay === '' && (
          <Text className="text-sm text-text-muted px-4 -mt-2 mb-4">
            {t('medications.schedule.noTimeReminder', { defaultValue: "A schedule without a time won't get a reminder." })}
          </Text>
        )}

        <SettingsRowGroup>
          <SettingsRow
            title={med?.dose_unit ? t('medications.schedule.doseOverride', { defaultValue: 'Dose override ({{unit}})', unit: med.dose_unit }) : t('medications.schedule.doseOverridePlain', { defaultValue: 'Dose override' })}
            rightAccessory={
              <FormInput
                placeholder={t('medications.schedule.default', { defaultValue: 'Default' })}
                value={form.doseAmount}
                onChangeText={(v) => updateField('doseAmount', v)}
                keyboardType="decimal-pad"
                style={INLINE_INPUT_STYLE}
              />
            }
          />
          <BottomSheetPicker
            value={form.withMeal}
            options={withMealOptions}
            onSelect={(val) => updateField('withMeal', val)}
            title={t('medications.schedule.withMealTitle', { defaultValue: 'With Meal' })}
            renderTrigger={({ onPress, selectedOption }) => (
              <SettingsRow
                title={t('medications.schedule.withMeal', { defaultValue: 'With meal' })}
                onPress={onPress}
                rightAccessory={
                  <Text className="text-base text-text-secondary">
                    {selectedOption?.label ?? ''}
                  </Text>
                }
              />
            )}
          />
        </SettingsRowGroup>

        <SettingsRowGroup>
          <SettingsRow
            title={startRequired ? t('medications.schedule.startDateRequired', { defaultValue: 'Start date *' }) : t('medications.schedule.startDate', { defaultValue: 'Start date' })}
            accessibilityLabel={t('medications.schedule.setStartDate', { defaultValue: 'Set start date' })}
            onPress={() => startCalendarRef.current?.present()}
            rightAccessory={
              <View className="flex-row items-center gap-3">
                {form.startDate !== '' && !startRequired && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => updateField('startDate', '')}
                    accessibilityRole="button"
                    accessibilityLabel={t('medications.schedule.clearStartDate', { defaultValue: 'Clear start date' })}
                  >
                    <Text className="text-text-link text-sm font-medium">{t('medications.schedule.clear', { defaultValue: 'Clear' })}</Text>
                  </TouchableOpacity>
                )}
                <Text className="text-base text-text-secondary">
                  {form.startDate ? formatDateLabel(form.startDate, t, dateLocale) : t('medications.schedule.none', { defaultValue: 'None' })}
                </Text>
              </View>
            }
          />
          <SettingsRow
            title={t('medications.schedule.endDate', { defaultValue: 'End date' })}
            accessibilityLabel={t('medications.schedule.setEndDate', { defaultValue: 'Set end date' })}
            onPress={() => endCalendarRef.current?.present()}
            rightAccessory={
              <View className="flex-row items-center gap-3">
                {form.endDate !== '' && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => updateField('endDate', '')}
                    accessibilityRole="button"
                    accessibilityLabel={t('medications.schedule.clearEndDate', { defaultValue: 'Clear end date' })}
                  >
                    <Text className="text-text-link text-sm font-medium">{t('medications.schedule.clear', { defaultValue: 'Clear' })}</Text>
                  </TouchableOpacity>
                )}
                <Text className="text-base text-text-secondary">
                  {form.endDate ? formatDateLabel(form.endDate, t, dateLocale) : t('medications.schedule.none', { defaultValue: 'None' })}
                </Text>
              </View>
            }
          />
        </SettingsRowGroup>

        {isEditing && (
          <SettingsRowGroup>
            <SettingsRow
              title={t('medications.schedule.active', { defaultValue: 'Active' })}
              rightAccessory={
                <Switch
                  value={form.active}
                  onValueChange={(v) => updateField('active', v)}
                />
              }
            />
          </SettingsRowGroup>
        )}

        {isEditing && (
          <TouchableOpacity className="p-4" onPress={handleDelete}>
            <Text className="text-base font-medium text-center text-text-danger-subtle">
              {t('medications.schedule.delete', { defaultValue: 'Delete Schedule' })}
            </Text>
          </TouchableOpacity>
        )}
      </KeyboardAwareScrollView>

      <TimeSheet
        ref={timeSheetRef}
        value={form.timeOfDay}
        onSelectTime={(time) => updateField('timeOfDay', time)}
      />
      <CalendarSheet
        ref={startCalendarRef}
        selectedDate={form.startDate || getTodayDate()}
        onSelectDate={(date) => updateField('startDate', date)}
      />
      <CalendarSheet
        ref={endCalendarRef}
        selectedDate={form.endDate || form.startDate || getTodayDate()}
        onSelectDate={(date) => updateField('endDate', date)}
      />
      <WeekdaySheet
        ref={weekdaySheetRef}
        value={form.daysOfWeek}
        onChange={(days) => updateField('daysOfWeek', days)}
      />
    </View>
  );
};

export default MedicationScheduleFormScreen;
