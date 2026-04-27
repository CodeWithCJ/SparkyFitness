import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useMeasurements } from '../hooks/useMeasurements';
import { useUpsertCheckIn } from '../hooks/useUpsertCheckIn';
import { usePreferences } from '../hooks/usePreferences';
import { formatDateLabel, getTodayDate } from '../utils/dateUtils';
import {
  weightToKg,
  weightFromKg,
  lengthToCm,
  lengthFromCm,
  cmToFeetInches,
  feetInchesToCm,
  kgToStonesLbs,
  stonesLbsToKg,
} from '../utils/unitConversions';
import { parseDecimalInput } from '../utils/numericInput';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'MeasurementsAdd'>;

type FieldKey =
  | 'weight'
  | 'neck'
  | 'waist'
  | 'hips'
  | 'steps'
  | 'height'
  | 'bodyFatPercentage';

type FormState = Record<FieldKey, string> & {
  heightFeet: string;
  weightStones: string;
};

const EMPTY_FORM: FormState = {
  weight: '',
  neck: '',
  waist: '',
  hips: '',
  steps: '',
  height: '',
  heightFeet: '',
  weightStones: '',
  bodyFatPercentage: '',
};

const FIELD_LABELS: Record<FieldKey, string> = {
  weight: 'Weight',
  bodyFatPercentage: 'Body fat %',
  height: 'Height',
  neck: 'Neck',
  waist: 'Waist',
  hips: 'Hips',
  steps: 'Steps',
};

const FIELD_FORM_KEYS: Record<FieldKey, (keyof FormState)[]> = {
  weight: ['weight', 'weightStones'],
  neck: ['neck'],
  waist: ['waist'],
  hips: ['hips'],
  steps: ['steps'],
  height: ['height', 'heightFeet'],
  bodyFatPercentage: ['bodyFatPercentage'],
};

const FORM_FIELD_KEYS: Record<keyof FormState, FieldKey> = {
  weight: 'weight',
  weightStones: 'weight',
  neck: 'neck',
  waist: 'waist',
  hips: 'hips',
  steps: 'steps',
  height: 'height',
  heightFeet: 'height',
  bodyFatPercentage: 'bodyFatPercentage',
};

const formatNumberForInput = (value: number): string => {
  // Round to 1 decimal place; trailing zeros are dropped by `String(...)`.
  return String(Math.round(value * 10) / 10);
};

const joinWithAnd = (items: string[]): string => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
};

const MeasurementsAddScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const [accentPrimary, borderSubtle, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-subtle',
    '--color-text-secondary',
  ]) as [string, string, string];

  const initialDate = route.params?.date ?? getTodayDate();
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [prefilledKeys, setPrefilledKeys] = useState<Set<FieldKey>>(() => new Set());
  // Once the user starts editing we stop syncing the form from refetched
  // measurements for that field, so a background refresh can't clobber their input.
  const dirtyFieldsRef = useRef<Set<FieldKey>>(new Set());
  const lastDateRef = useRef<string | null>(null);

  const { measurements, isLoading } = useMeasurements({ date: selectedDate });
  const { preferences, isLoading: isPreferencesLoading } = usePreferences();
  // Weight supports a third "stones + lbs" mode that renders as two inputs.
  const weightMode: 'kg' | 'lbs' | 'st_lbs' = preferences?.default_weight_unit ?? 'kg';
  // Body measurements (waist/neck/hips) only support cm/inches — when the
  // pref is ft_in we fall back to cm, matching web's `formatMeasurement`.
  const bodyUnit: 'cm' | 'inches' =
    preferences?.default_measurement_unit === 'inches' ? 'inches' : 'cm';
  // Height supports a third "feet + inches" mode that renders as two inputs.
  const heightMode: 'cm' | 'inches' | 'ft_in' =
    preferences?.default_measurement_unit ?? 'cm';

  const upsertMutation = useUpsertCheckIn();

  // Sync the form to the latest measurements snapshot. Re-runs on every
  // measurements change (including background refetches) so cached-then-fresh
  // updates land in the form, but bails out once the user has touched it.
  useEffect(() => {
    if (lastDateRef.current !== selectedDate) {
      lastDateRef.current = selectedDate;
      dirtyFieldsRef.current = new Set();
    }

    const dirtyFields = new Set(dirtyFieldsRef.current);

    if (isLoading || isPreferencesLoading) {
      setForm(EMPTY_FORM);
      setPrefilledKeys(new Set());
      return;
    }

    const next: FormState = { ...EMPTY_FORM };
    const prefilled = new Set<FieldKey>();
    if (measurements) {
      if (measurements.weight != null) {
        if (weightMode === 'st_lbs') {
          const { stones, lbs } = kgToStonesLbs(measurements.weight);
          next.weightStones = String(stones);
          next.weight = formatNumberForInput(lbs);
        } else {
          next.weight = formatNumberForInput(weightFromKg(measurements.weight, weightMode));
        }
        prefilled.add('weight');
      }
      if (measurements.neck != null) {
        next.neck = formatNumberForInput(lengthFromCm(measurements.neck, bodyUnit));
        prefilled.add('neck');
      }
      if (measurements.waist != null) {
        next.waist = formatNumberForInput(lengthFromCm(measurements.waist, bodyUnit));
        prefilled.add('waist');
      }
      if (measurements.hips != null) {
        next.hips = formatNumberForInput(lengthFromCm(measurements.hips, bodyUnit));
        prefilled.add('hips');
      }
      if (measurements.height != null) {
        if (heightMode === 'ft_in') {
          const { feet, inches } = cmToFeetInches(measurements.height);
          next.heightFeet = String(feet);
          next.height = formatNumberForInput(inches);
        } else {
          next.height = formatNumberForInput(lengthFromCm(measurements.height, heightMode));
        }
        prefilled.add('height');
      }
      if (measurements.steps != null) {
        next.steps = String(measurements.steps);
        prefilled.add('steps');
      }
      if (measurements.body_fat_percentage != null) {
        next.bodyFatPercentage = formatNumberForInput(measurements.body_fat_percentage);
        prefilled.add('bodyFatPercentage');
      }
    }
    setForm((current) => {
      if (dirtyFields.size === 0) return next;

      const merged = { ...current };
      for (const key of Object.keys(FIELD_FORM_KEYS) as FieldKey[]) {
        if (dirtyFields.has(key)) continue;
        for (const formKey of FIELD_FORM_KEYS[key]) {
          merged[formKey] = next[formKey];
        }
      }
      return merged;
    });
    setPrefilledKeys(prefilled);
  }, [selectedDate, isLoading, isPreferencesLoading, measurements, weightMode, bodyUnit, heightMode]);

  const updateField = useCallback((key: keyof FormState, value: string) => {
    dirtyFieldsRef.current.add(FORM_FIELD_KEYS[key]);
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date);
  }, []);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleSave = useCallback(() => {
    type FieldResult =
      | { kind: 'invalid' }
      | { kind: 'omit' }
      | { kind: 'clear' }
      | { kind: 'value'; value: number };

    const evaluateField = (
      key: FieldKey,
      label: string,
      opts?: { integer?: boolean; max?: number; maxMessage?: string },
    ): FieldResult => {
      const trimmed = form[key].trim();
      if (trimmed === '') {
        return prefilledKeys.has(key) ? { kind: 'clear' } : { kind: 'omit' };
      }
      const parsed = parseDecimalInput(trimmed);
      if (Number.isNaN(parsed)) {
        Toast.show({ type: 'error', text1: `Invalid ${label}`, text2: 'Enter a number.' });
        return { kind: 'invalid' };
      }
      if (parsed < 0) {
        Toast.show({ type: 'error', text1: `Invalid ${label}`, text2: 'Value must be 0 or greater.' });
        return { kind: 'invalid' };
      }
      if (opts?.integer && !Number.isInteger(parsed)) {
        Toast.show({ type: 'error', text1: `Invalid ${label}`, text2: `${label} must be a whole number.` });
        return { kind: 'invalid' };
      }
      if (opts?.max != null && parsed > opts.max) {
        Toast.show({ type: 'error', text1: `Invalid ${label}`, text2: opts.maxMessage ?? `Must be ${opts.max} or less.` });
        return { kind: 'invalid' };
      }
      return { kind: 'value', value: parsed };
    };

    const payload: Parameters<typeof upsertMutation.mutate>[0] = {
      entryDate: selectedDate,
    };
    const cleared: FieldKey[] = [];

    const apply = (
      key: FieldKey,
      result: FieldResult,
      toStorage: (n: number) => number,
    ): boolean => {
      if (result.kind === 'invalid') return false;
      if (result.kind === 'omit') return true;
      if (result.kind === 'clear') {
        payload[key] = null;
        cleared.push(key);
        return true;
      }
      payload[key] = toStorage(result.value);
      return true;
    };

    if (weightMode === 'st_lbs') {
      const stRaw = form.weightStones.trim();
      const lbRaw = form.weight.trim();
      if (stRaw === '' && lbRaw === '') {
        if (prefilledKeys.has('weight')) {
          payload.weight = null;
          cleared.push('weight');
        }
      } else {
        const stones = stRaw === '' ? 0 : parseDecimalInput(stRaw);
        const lbs = lbRaw === '' ? 0 : parseDecimalInput(lbRaw);
        if (Number.isNaN(stones) || Number.isNaN(lbs)) {
          Toast.show({ type: 'error', text1: 'Invalid weight', text2: 'Enter a number for stones and lbs.' });
          return;
        }
        if (stones < 0 || lbs < 0) {
          Toast.show({ type: 'error', text1: 'Invalid weight', text2: 'Values must be 0 or greater.' });
          return;
        }
        payload.weight = stonesLbsToKg(stones, lbs);
      }
    } else {
      if (!apply('weight', evaluateField('weight', 'weight'), (v) => weightToKg(v, weightMode))) return;
    }
    if (!apply('neck', evaluateField('neck', 'neck'), (v) => lengthToCm(v, bodyUnit))) return;
    if (!apply('waist', evaluateField('waist', 'waist'), (v) => lengthToCm(v, bodyUnit))) return;
    if (!apply('hips', evaluateField('hips', 'hips'), (v) => lengthToCm(v, bodyUnit))) return;
    if (heightMode === 'ft_in') {
      const feetRaw = form.heightFeet.trim();
      const inchesRaw = form.height.trim();
      if (feetRaw === '' && inchesRaw === '') {
        if (prefilledKeys.has('height')) {
          payload.height = null;
          cleared.push('height');
        }
      } else {
        const feet = feetRaw === '' ? 0 : parseDecimalInput(feetRaw);
        const inches = inchesRaw === '' ? 0 : parseDecimalInput(inchesRaw);
        if (Number.isNaN(feet) || Number.isNaN(inches)) {
          Toast.show({ type: 'error', text1: 'Invalid height', text2: 'Enter a number for feet and inches.' });
          return;
        }
        if (feet < 0 || inches < 0) {
          Toast.show({ type: 'error', text1: 'Invalid height', text2: 'Values must be 0 or greater.' });
          return;
        }
        payload.height = feetInchesToCm(feet, inches);
      }
    } else {
      if (!apply('height', evaluateField('height', 'height'), (v) => lengthToCm(v, heightMode))) return;
    }
    if (!apply('steps', evaluateField('steps', 'steps', { integer: true }), (v) => v)) return;
    if (
      !apply(
        'bodyFatPercentage',
        evaluateField('bodyFatPercentage', 'body fat %', {
          max: 100,
          maxMessage: 'Body fat % must be between 0 and 100.',
        }),
        (v) => v,
      )
    )
      return;

    const fieldKeys: FieldKey[] = [
      'weight',
      'neck',
      'waist',
      'hips',
      'height',
      'steps',
      'bodyFatPercentage',
    ];
    const hasAnyField = fieldKeys.some((k) => payload[k] !== undefined);
    if (!hasAnyField) {
      Toast.show({ type: 'info', text1: 'Nothing to save', text2: 'Enter or clear at least one value.' });
      return;
    }

    const doSave = () => {
      upsertMutation.mutate(payload, {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: 'Saved' });
          navigation.goBack();
        },
      });
    };

    if (cleared.length > 0) {
      const labels = cleared.map((k) => FIELD_LABELS[k]);
      const noun = cleared.length === 1 ? 'measurement' : 'measurements';
      Alert.alert(
        `Clear ${cleared.length} ${noun}?`,
        `${joinWithAnd(labels)} will be cleared.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', style: 'destructive', onPress: doSave },
        ],
      );
      return;
    }

    doSave();
  }, [form, prefilledKeys, selectedDate, weightMode, bodyUnit, heightMode, upsertMutation, navigation]);

  const isSaveDisabled = isLoading || isPreferencesLoading || upsertMutation.isPending;

  const weightLabel =
    weightMode === 'st_lbs' ? 'Weight (st, lb)' : `Weight (${weightMode})`;
  const bodySuffix = bodyUnit === 'cm' ? 'cm' : 'in';
  const heightSuffix = heightMode === 'cm' ? 'cm' : heightMode === 'inches' ? 'in' : 'ft, in';

  const isHeightEmpty =
    heightMode === 'ft_in'
      ? form.heightFeet.trim() === '' && form.height.trim() === ''
      : form.height.trim() === '';
  const isWeightEmpty =
    weightMode === 'st_lbs'
      ? form.weightStones.trim() === '' && form.weight.trim() === ''
      : form.weight.trim() === '';

  const renderClearHint = (key: FieldKey) => {
    const empty =
      key === 'height'
        ? isHeightEmpty
        : key === 'weight'
          ? isWeightEmpty
          : form[key].trim() === '';
    return prefilledKeys.has(key) && empty ? (
      <Text className="text-xs italic mt-1" style={{ color: textSecondary }}>
        Will be cleared
      </Text>
    ) : null;
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-subtle">
        <Button
          variant="ghost"
          onPress={handleClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10 p-0"
          accessibilityLabel="Close"
        >
          <Icon name="close" size={22} color={accentPrimary} />
        </Button>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Measurements
        </Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerClassName="px-4 py-4"
        bottomOffset={80}
        keyboardShouldPersistTaps="handled"
      >

        {/* Date row */}
        <TouchableOpacity
          onPress={() => calendarSheetRef.current?.present()}
          activeOpacity={0.7}
          className="flex-row items-center mb-4"
        >
          <Text className="text-text-primary text-base">Date</Text>
          <Text className="text-accent-primary text-base font-medium mx-1.5">
            {formatDateLabel(selectedDate)}
          </Text>
          <Icon name="chevron-down" size={12} color={accentPrimary} weight="medium" />
        </TouchableOpacity>

        {(isLoading || isPreferencesLoading) ? (
          <View className="py-12 items-center">
            <ActivityIndicator size="small" color={accentPrimary} />
          </View>
        ) : (
          <>
            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">{weightLabel}</Text>
              {weightMode === 'st_lbs' ? (
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <FormInput
                      value={form.weightStones}
                      onChangeText={(v) => updateField('weightStones', v)}
                      keyboardType="number-pad"
                      placeholder="st"
                      returnKeyType="done"
                    />
                  </View>
                  <View className="flex-1">
                    <FormInput
                      value={form.weight}
                      onChangeText={(v) => updateField('weight', v)}
                      keyboardType="decimal-pad"
                      placeholder="lb"
                      returnKeyType="done"
                    />
                  </View>
                </View>
              ) : (
                <FormInput
                  value={form.weight}
                  onChangeText={(v) => updateField('weight', v)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  returnKeyType="done"
                />
              )}
              {renderClearHint('weight')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">Body fat %</Text>
              <FormInput
                value={form.bodyFatPercentage}
                onChangeText={(v) => updateField('bodyFatPercentage', v)}
                keyboardType="decimal-pad"
                placeholder="0"
                returnKeyType="done"
              />
              {renderClearHint('bodyFatPercentage')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">Height ({heightSuffix})</Text>
              {heightMode === 'ft_in' ? (
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <FormInput
                      value={form.heightFeet}
                      onChangeText={(v) => updateField('heightFeet', v)}
                      keyboardType="number-pad"
                      placeholder="ft"
                      returnKeyType="done"
                    />
                  </View>
                  <View className="flex-1">
                    <FormInput
                      value={form.height}
                      onChangeText={(v) => updateField('height', v)}
                      keyboardType="decimal-pad"
                      placeholder="in"
                      returnKeyType="done"
                    />
                  </View>
                </View>
              ) : (
                <FormInput
                  value={form.height}
                  onChangeText={(v) => updateField('height', v)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  returnKeyType="done"
                />
              )}
              {renderClearHint('height')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">Neck ({bodySuffix})</Text>
              <FormInput
                value={form.neck}
                onChangeText={(v) => updateField('neck', v)}
                keyboardType="decimal-pad"
                placeholder="0"
                returnKeyType="done"
              />
              {renderClearHint('neck')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">Waist ({bodySuffix})</Text>
              <FormInput
                value={form.waist}
                onChangeText={(v) => updateField('waist', v)}
                keyboardType="decimal-pad"
                placeholder="0"
                returnKeyType="done"
              />
              {renderClearHint('waist')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">Hips ({bodySuffix})</Text>
              <FormInput
                value={form.hips}
                onChangeText={(v) => updateField('hips', v)}
                keyboardType="decimal-pad"
                placeholder="0"
                returnKeyType="done"
              />
              {renderClearHint('hips')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">Steps</Text>
              <FormInput
                value={form.steps}
                onChangeText={(v) => updateField('steps', v)}
                keyboardType="number-pad"
                placeholder="0"
                returnKeyType="done"
              />
              {renderClearHint('steps')}
            </View>
          </>
        )}

        <View style={{ height: 80 }} />
      </KeyboardAwareScrollView>

      {/* Sticky footer */}
      <View
        className="px-4 py-3"
        style={{
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopWidth: 1,
          borderTopColor: borderSubtle,
        }}
      >
        <Button
          variant="primary"
          onPress={handleSave}
          disabled={isSaveDisabled}
          className="py-3"
        >
          {upsertMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-sm font-semibold text-center" style={{ color: '#fff' }}>
              Save
            </Text>
          )}
        </Button>
      </View>

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
      />
    </View>
  );
};

export default MeasurementsAddScreen;
