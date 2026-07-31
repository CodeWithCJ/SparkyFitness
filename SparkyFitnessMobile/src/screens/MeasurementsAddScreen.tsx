import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import CustomBooleanControl from '../components/CustomBooleanControl';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useMeasurements } from '../hooks/useMeasurements';
import { useUpsertCheckIn } from '../hooks/useUpsertCheckIn';
import { usePreferences } from '../hooks/usePreferences';
import { formatDateLabel } from '../utils/dateUtils';
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
import { getVisibleSortedCustomCategories } from '../utils/customCategories';
import {
  syncCustomForm,
  buildCustomOps,
  isMultiEntryFrequency,
  entryTimestampFor,
  findHourlyHourConflict,
  type CustomFormState,
  type CustomRow,
  type CustomOp,
} from '../utils/customMeasurementsForm';
import type { RootStackScreenProps } from '../types/navigation';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader, SAVE_LABEL, SAVING_LABEL } from '../hooks/useScreenHeader';
import { useTranslation } from 'react-i18next';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import {
  useCustomCategories,
  useCustomMeasurementsByDate,
  useSaveCustomMeasurement,
  useDeleteCustomMeasurement,
  useUpdateCustomMeasurement,
} from '../hooks/useCustomMeasurements';

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

const getFieldLabels = (t: (key: string) => string): Record<FieldKey, string> => ({
  weight: t('measurements.weight'),
  bodyFatPercentage: t('measurements.bodyFat'),
  height: t('measurements.height'),
  neck: t('measurements.neck'),
  waist: t('measurements.waist'),
  hips: t('measurements.hips'),
  steps: t('measurements.steps'),
});

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

const formatHourLabel = (hour: number | null): string => {
  if (hour == null) return '';
  return `${String(hour).padStart(2, '0')}:00`;
};

const MeasurementsAddScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const [accentPrimary, borderSubtle, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-subtle',
    '--color-text-secondary',
  ]) as [string, string, string];

  const initialDate = route.params?.date ?? useDiaryDateStore.getState().selectedDate;
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [prefilledKeys, setPrefilledKeys] = useState<Set<FieldKey>>(() => new Set());
  // Once the user starts editing we stop syncing the form from refetched
  // measurements for that field, so a background refresh can't clobber their input.
  const dirtyFieldsRef = useRef<Set<FieldKey>>(new Set());
  const lastDateRef = useRef<string | null>(null);

  const [customForm, setCustomForm] = useState<CustomFormState>({});
  const customFormRef = useRef<CustomFormState>({});
  customFormRef.current = customForm;
  // Per-row dirty tracking: a refetch preserves dirty rows (local values) and
  // drops untouched rows that no longer exist on the server.
  const dirtyCustomKeysRef = useRef<Set<string>>(new Set());
  const lastCustomDateRef = useRef<string | null>(null);
  const newRowCounterRef = useRef(0);

  const { measurements, isLoading, refetch: refetchMeasurements } = useMeasurements({ date: selectedDate });
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

  const upsertMutation = useUpsertCheckIn({ showErrorToast: false });
  const saveCustomMutation = useSaveCustomMeasurement();
  const deleteCustomMutation = useDeleteCustomMeasurement();
  const updateCustomMutation = useUpdateCustomMeasurement();
  const {
    data: customCategories,
    isLoading: isCustomCategoriesLoading,
    isError: isCustomCategoriesError,
    refetch: refetchCustomCategories,
  } = useCustomCategories();
  // Only categories the user wants in input screens are rendered and validated.
  // Hidden categories still exist server-side (they stay in the manager and
  // reports) but must not appear here; ordering follows `sort_order`.
  const visibleCategories = useMemo(
    () => getVisibleSortedCustomCategories(customCategories ?? []),
    [customCategories],
  );
  const {
    data: customMeasurements,
    isLoading: isCustomMeasurementsLoading,
    isError: isCustomMeasurementsError,
    refetch: refetchCustomEntries,
  } = useCustomMeasurementsByDate(selectedDate);

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
      // Syncs the form to the latest measurements snapshot (cached-then-fresh)
      // with dirty-field tracking; a legitimate external-data sync effect.
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

  // Reconcile the custom form with the latest server entries. A date change
  // resets the dirty set so the previous day's input is never carried over.
  useEffect(() => {
    if (lastCustomDateRef.current !== selectedDate) {
      lastCustomDateRef.current = selectedDate;
      dirtyCustomKeysRef.current = new Set();
    }
    const dirtyKeys = new Set(dirtyCustomKeysRef.current);
    const synced = syncCustomForm({
      categories: visibleCategories,
      serverEntries: customMeasurements ?? [],
      current: customFormRef.current,
      dirtyKeys,
    });
    setCustomForm(synced.form);
  }, [selectedDate, visibleCategories, customMeasurements]);

  const updateField = useCallback((key: keyof FormState, value: string) => {
    dirtyFieldsRef.current.add(FORM_FIELD_KEYS[key]);
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date);
    useDiaryDateStore.getState().setSelectedDate(date);
  }, []);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const makeNewRowKey = useCallback((): string => {
    newRowCounterRef.current += 1;
    return `new-${newRowCounterRef.current}`;
  }, []);

  const updateCustomRowValue = useCallback((categoryId: string, rowKey: string, value: string) => {
    dirtyCustomKeysRef.current.add(rowKey);
    setCustomForm((prev) => {
      const catForm = prev[categoryId];
      if (!catForm) return prev;
      return {
        ...prev,
        [categoryId]: {
          ...catForm,
          rows: catForm.rows.map((r) => (r.key === rowKey ? { ...r, value } : r)),
        },
      };
    });
  }, []);

  const setSingleCustomValue = useCallback((categoryId: string, value: string) => {
    const existing = customFormRef.current[categoryId]?.rows[0] ?? null;
    const key = existing?.key ?? `single-${categoryId}`;
    dirtyCustomKeysRef.current.add(key);
    setCustomForm((prev) => {
      const catForm = prev[categoryId];
      const row = catForm?.rows[0] ?? null;
      const nextRow: CustomRow = row
        ? { ...row, value }
        : {
            key,
            entryId: null,
            hour: null,
            // Daily entries normalize to the selected calendar day; build the
            // timestamp client-side from selectedDate so it can never drift
            // across UTC boundaries like a raw `new Date()` instant could.
            timestamp: entryTimestampFor(selectedDate, 0),
            source: 'manual',
            value,
          };
      return { ...prev, [categoryId]: { rows: [nextRow], deleted: catForm?.deleted ?? [] } };
    });
  }, [selectedDate]);

  const addCustomRow = useCallback(
    (categoryId: string, frequency: string) => {
      const key = makeNewRowKey();
      const now = new Date();
      const hour = frequency === 'Hourly' ? now.getHours() : null;
      // Every new row is timestamped from the selected calendar day plus the
      // current local time, so a historical date keeps its own day (UTC
      // conversion can shift the instant but never `entry_date`).
      const timestamp =
        hour != null
          ? entryTimestampFor(selectedDate, hour)
          : entryTimestampFor(selectedDate, now.getHours(), { minutes: now.getMinutes() });
      const row: CustomRow = {
        key,
        entryId: null,
        hour,
        timestamp,
        source: 'manual',
        value: '',
      };
      dirtyCustomKeysRef.current.add(key);
      setCustomForm((prev) => {
        const catForm = prev[categoryId] ?? { rows: [], deleted: [] };
        return { ...prev, [categoryId]: { ...catForm, rows: [...catForm.rows, row] } };
      });
    },
    [makeNewRowKey, selectedDate],
  );

  const changeCustomRowHour = useCallback(
    (categoryId: string, rowKey: string, hour: number) => {
      dirtyCustomKeysRef.current.add(rowKey);
      setCustomForm((prev) => {
        const catForm = prev[categoryId];
        if (!catForm) return prev;
        return {
          ...prev,
          [categoryId]: {
            ...catForm,
            rows: catForm.rows.map((r) =>
              r.key === rowKey
                ? { ...r, hour, timestamp: entryTimestampFor(selectedDate, hour) }
                : r,
            ),
          },
        };
      });
    },
    [selectedDate],
  );

  const deleteCustomRow = useCallback((categoryId: string, row: CustomRow) => {
    setCustomForm((prev) => {
      const catForm = prev[categoryId];
      if (!catForm) return prev;
      if (row.entryId != null) {
        return {
          ...prev,
          [categoryId]: {
            rows: catForm.rows.filter((r) => r.key !== row.key),
            deleted: [...catForm.deleted, { entryId: row.entryId }],
          },
        };
      }
      return { ...prev, [categoryId]: { ...catForm, rows: catForm.rows.filter((r) => r.key !== row.key) } };
    });
  }, []);

  const handleRetryCustomData = useCallback(() => {
    refetchCustomCategories();
    refetchCustomEntries();
    refetchMeasurements();
  }, [refetchCustomCategories, refetchCustomEntries, refetchMeasurements]);

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

    // Build operation descriptors for CHANGED custom rows only. `ok: false`
    // means a changed row failed validation, so handleSave stops before any
    // mutation runs; untouched rows are never parsed and cannot block saves.
    const hourConflict = findHourlyHourConflict({
      categories: visibleCategories,
      form: customForm,
      serverEntries: customMeasurements ?? [],
      dirtyKeys: new Set(dirtyCustomKeysRef.current),
    });
    if (hourConflict) {
      const cat = visibleCategories.find((c) => c.id === hourConflict.categoryId);
      const label = cat ? (cat.display_name ?? cat.name) : hourConflict.categoryId;
      Toast.show({ type: 'error', text1: t('measurements.duplicateHour', { label }) });
      return;
    }

    const customResult = buildCustomOps({
      categories: visibleCategories,
      form: customForm,
      dirtyKeys: new Set(dirtyCustomKeysRef.current),
      onInvalid: (label) => {
        Toast.show({ type: 'error', text1: `Invalid ${label}`, text2: 'Enter a number.' });
      },
    });
    if (!customResult.ok) return;
    const customOps = customResult.operations;

    if (!hasAnyField && customOps.length === 0) {
      Toast.show({ type: 'info', text1: 'Nothing to save', text2: 'Enter or clear at least one value.' });
      return;
    }

    const doSave = async () => {
      try {
        for (const op of customOps) {
          if (op.kind === 'delete') {
            await deleteCustomMutation.mutateAsync({ id: op.entryId, entryDate: selectedDate });
          } else if (op.entryId != null) {
            await updateCustomMutation.mutateAsync({
              id: op.entryId,
              value: op.value,
              entryDate: selectedDate,
            });
          } else {
            await saveCustomMutation.mutateAsync({
              category_id: op.categoryId,
              value: op.value,
              entry_date: selectedDate,
              entry_hour: op.hour,
              entry_timestamp: op.timestamp ?? undefined,
            });
          }
        }
        if (hasAnyField) {
          await upsertMutation.mutateAsync(payload);
        }
        Toast.show({ type: 'success', text1: t('measurements.saved') });
        navigation.goBack();
      } catch {
        // A mutation failed after earlier ones may have succeeded. Do NOT show
        // success, do NOT close the screen; refetch so the form reflects the
        // server and surface one partial-failure message.
        dirtyCustomKeysRef.current = new Set();
        setCustomForm({});
        dirtyFieldsRef.current = new Set();
        setForm(EMPTY_FORM);
        setPrefilledKeys(new Set());
        await Promise.allSettled([
          refetchMeasurements(),
          refetchCustomCategories(),
          refetchCustomEntries(),
        ]);
        Toast.show({ type: 'error', text1: t('measurements.someChangesSaved') });
      }
    };

    // Custom deletes (clearing a prefilled entry or pressing the row delete
    // button) require confirmation and the message lists affected categories.
    const customDeleteOps = customOps.filter(
      (op): op is Extract<CustomOp, { kind: 'delete' }> => op.kind === 'delete',
    );
    const clearingLabels = [
      ...cleared.map((k) => getFieldLabels(t)[k]),
      ...customDeleteOps.map((op) => {
        const cat = visibleCategories.find((c) => c.id === op.categoryId);
        return cat ? (cat.display_name ?? cat.name) : op.categoryId;
      }),
    ];

    if (clearingLabels.length > 0) {
      const noun = t('measurements.measurement', { count: clearingLabels.length });
      Alert.alert(
        t('measurements.clearCount', { count: clearingLabels.length, noun }),
        t('measurements.willBeClearedList', { labels: joinWithAnd(clearingLabels) }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.save'), style: 'destructive', onPress: doSave },
        ],
      );
      return;
    }

    doSave();
  }, [form, prefilledKeys, selectedDate, weightMode, bodyUnit, heightMode, upsertMutation, saveCustomMutation, deleteCustomMutation, updateCustomMutation, navigation, t, visibleCategories, customForm, customMeasurements, refetchMeasurements, refetchCustomCategories, refetchCustomEntries]);

  const isCustomDataLoading = isCustomCategoriesLoading || isCustomMeasurementsLoading;
  const isCustomDataError = isCustomCategoriesError || isCustomMeasurementsError;
  const isMutationPending =
    upsertMutation.isPending ||
    saveCustomMutation.isPending ||
    deleteCustomMutation.isPending ||
    updateCustomMutation.isPending;
  const isSaveDisabled =
    isLoading ||
    isPreferencesLoading ||
    isCustomDataLoading ||
    isCustomDataError ||
    isMutationPending;
  // Closing stays available during a fetch error so the user is never trapped;
  // only an in-flight mutation blocks dismissal.
  const isDismissDisabled = isMutationPending;
  const isSaving = isMutationPending;

  const weightLabel =
    weightMode === 'st_lbs' ? t('measurements.weightStLabel') : t('measurements.weightLabel', { unit: weightMode });
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
        {t('measurements.willBeCleared')}
      </Text>
    ) : null;
  };

  const header = useScreenHeader({
    title: t('measurements.title'),
    left: { kind: 'dismiss', onPress: handleClose, disabled: isDismissDisabled },
    right: {
      kind: 'primary',
      label: SAVE_LABEL,
      busyLabel: SAVING_LABEL,
      busy: isSaving,
      disabled: isSaveDisabled,
      placement: 'native-only',
      onPress: handleSave,
      identifier: 'measurements-save',
    },
  });

  const booleanLabels = {
    yes: t('measurements.yes'),
    no: t('measurements.no'),
    clear: t('measurements.clear'),
  };

  const renderCustomCategory = (cat: NonNullable<typeof visibleCategories>[number]) => {
    const label = cat.display_name ?? cat.name;
    const suffix = cat.measurement_type ? ` (${cat.measurement_type})` : '';
    const isMulti = isMultiEntryFrequency(cat.frequency);
    const isBoolean = cat.data_type === 'boolean';
    const isNumeric = cat.data_type === 'numeric' || cat.data_type == null;
    const catForm = customForm[cat.id] ?? { rows: [], deleted: [] };

    if (isMulti) {
      return (
        <View key={cat.id} className="mb-4">
          <Text className="text-text-secondary text-sm mb-1">
            {label}{suffix}
          </Text>
          {catForm.rows.map((row) => (
            <View key={row.key} className="mb-2">
              <View className="flex-row items-center gap-2">
                {cat.frequency === 'Hourly' &&
                  (row.entryId == null ? (
                    <View className="flex-row items-center gap-1" testID={`hour-stepper-${row.key}`}>
                      <TouchableOpacity
                        onPress={() =>
                          changeCustomRowHour(cat.id, row.key, ((row.hour ?? 0) + 23) % 24)
                        }
                        hitSlop={8}
                        testID={`hour-minus-${row.key}`}
                      >
                        <Icon name="remove" size={16} color={accentPrimary} />
                      </TouchableOpacity>
                      <Text className="text-text-secondary text-sm w-12 text-center">
                        {formatHourLabel(row.hour)}
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          changeCustomRowHour(cat.id, row.key, ((row.hour ?? 0) + 1) % 24)
                        }
                        hitSlop={8}
                        testID={`hour-plus-${row.key}`}
                      >
                        <Icon name="add" size={16} color={accentPrimary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text className="text-text-secondary text-sm w-12">
                      {formatHourLabel(row.hour)}
                    </Text>
                  ))}
                <View className="flex-1">
                  {isBoolean ? (
                    <CustomBooleanControl
                      value={row.value}
                      onChange={(v) => updateCustomRowValue(cat.id, row.key, v)}
                      labels={booleanLabels}
                    />
                  ) : (
                    <FormInput
                      value={row.value}
                      onChangeText={(v) => updateCustomRowValue(cat.id, row.key, v)}
                      keyboardType={isNumeric ? 'decimal-pad' : 'default'}
                      placeholder="0"
                      returnKeyType="done"
                      testID={`custom-input-${row.key}`}
                    />
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => deleteCustomRow(cat.id, row)}
                  hitSlop={8}
                  testID={`delete-custom-${row.key}`}
                >
                  <Icon name="trash" size={18} color={textSecondary} />
                </TouchableOpacity>
              </View>
              {row.entryId != null && row.value.trim() === '' ? (
                <Text className="text-xs italic mt-1" style={{ color: textSecondary }}>
                  {t('measurements.willBeCleared')}
                </Text>
              ) : null}
            </View>
          ))}
          <TouchableOpacity
            onPress={() => addCustomRow(cat.id, cat.frequency)}
            className="mt-1"
            testID={`add-custom-${cat.id}`}
          >
            <Text className="text-accent-primary text-sm">{t('measurements.addEntry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const row = catForm.rows[0] ?? null;
    return (
      <View key={cat.id} className="mb-4">
        <Text className="text-text-secondary text-sm mb-1">
          {label}{suffix}
        </Text>
        {isBoolean ? (
          <CustomBooleanControl
            value={row?.value ?? ''}
            onChange={(v) => setSingleCustomValue(cat.id, v)}
            labels={booleanLabels}
          />
        ) : (
          <FormInput
            value={row?.value ?? ''}
            onChangeText={(v) => setSingleCustomValue(cat.id, v)}
            keyboardType={isNumeric ? 'decimal-pad' : 'default'}
            placeholder="0"
            returnKeyType="done"
            testID={`custom-single-${cat.id}`}
          />
        )}
        {row?.entryId != null && row.value.trim() === '' ? (
          <Text className="text-xs italic mt-1" style={{ color: textSecondary }}>
            {t('measurements.willBeCleared')}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}

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
          <Text className="text-text-primary text-base">{t('measurements.date')}</Text>
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
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.bodyFat')}</Text>
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
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.height')} ({heightSuffix})</Text>
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
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.neck')} ({bodySuffix})</Text>
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
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.waist')} ({bodySuffix})</Text>
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
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.hips')} ({bodySuffix})</Text>
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
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.steps')}</Text>
              <FormInput
                value={form.steps}
                onChangeText={(v) => updateField('steps', v)}
                keyboardType="number-pad"
                placeholder="0"
                returnKeyType="done"
              />
              {renderClearHint('steps')}
            </View>

            {isCustomDataError ? (
              <View className="mt-4 mb-2 py-6 items-center">
                <Text className="text-text-secondary text-sm text-center mb-3">
                  {t('measurements.customLoadError')}
                </Text>
                <Button variant="secondary" onPress={handleRetryCustomData} className="px-6">
                  <Text className="text-text-primary text-sm font-semibold">
                    {t('measurements.customRetry')}
                  </Text>
                </Button>
              </View>
            ) : isCustomDataLoading ? (
              <View className="mt-4 mb-2 py-6 items-center">
                <ActivityIndicator size="small" color={accentPrimary} />
              </View>
            ) : (
              visibleCategories &&
              visibleCategories.length > 0 && (
                <View className="mt-4 mb-2">
                  <Text className="text-text-primary text-base font-semibold mb-3">
                    Custom Measurements
                  </Text>
                  {visibleCategories.map(renderCustomCategory)}
                </View>
              )
            )}
          </>
        )}

        <View style={{ height: 80 }} />
      </KeyboardAwareScrollView>

      {/* Sticky footer */}
      {!usesNativeHeader && (
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
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-sm font-semibold text-center" style={{ color: '#fff' }}>
              {SAVE_LABEL}
            </Text>
          )}
        </Button>
      </View>
      )}

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
      />
    </View>
  );
};

export default MeasurementsAddScreen;
