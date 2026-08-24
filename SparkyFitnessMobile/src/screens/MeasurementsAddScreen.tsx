import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../localization/i18n';
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
import YesNoClearControl from '../components/YesNoClearControl';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { FooterSaveBar } from '../components/FormScreenChrome';
import { useMeasurements } from '../hooks/useMeasurements';
import { useUpsertCheckIn } from '../hooks/useUpsertCheckIn';
import { usePreferences } from '../hooks/usePreferences';
import { getTodayDate, addDays, formatDate } from '../utils/dateUtils';
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
import {
  syncCustomForm,
  buildCustomOps,
  isManualSource,
  type CustomFormState,
  type CustomRow,
  type CustomOp,
} from '../utils/customMeasurementsForm';
import { isAutoHealthSyncCustomCategoryName } from '../utils/autoHealthSyncCategories';
import type { RootStackScreenProps } from '../types/navigation';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import {
  useCustomCategories,
  useCustomMeasurementsByDate,
  useSaveCustomMeasurement,
  useDeleteCustomMeasurement,
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

const joinWithAnd = (items: string[], conjunction: string, finalSeparator: string): string => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}${finalSeparator}${items[items.length - 1]}`;
};

/**
 * Categories eligible for the manual Daily editor: only `Daily` frequency and
 * Hourly / All / Unlimited are intentionally not exposed (scope cut; future
 * feature PR).
 *
 * Health-sync name matching is NOT applied here: the form/save model must
 * include every Daily category (known health-sync names included) so a value
 * typed inside the collapsed "More categories" section still saves with
 * source 'manual'. Presentation (primary vs More) is partitioned separately
 * from the form model.
 */
function isDailyCustomCategory(category: {
  frequency: string | null | undefined;
}): boolean {
  return category.frequency === 'Daily';
}

const MeasurementsAddScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const fieldLabel = React.useCallback((key: FieldKey, fallback: string) => {
    switch (key) {
      case 'weight': return t('measurements.fields.weight', { defaultValue: 'Weight' });
      case 'bodyFatPercentage': return t('measurements.fields.bodyFatPercentage', { defaultValue: 'Body fat %' });
      case 'height': return t('measurements.fields.height', { defaultValue: 'Height' });
      case 'neck': return t('measurements.fields.neck', { defaultValue: 'Neck' });
      case 'waist': return t('measurements.fields.waist', { defaultValue: 'Waist' });
      case 'hips': return t('measurements.fields.hips', { defaultValue: 'Hips' });
      case 'steps': return t('measurements.fields.steps', { defaultValue: 'Steps' });
      default: return fallback;
    }
  }, [t]);
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const [accentPrimary, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
  ]) as [string, string];

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
  // Keep the ref in sync outside the render body so the reconciliation effect
  // below can read the latest form without re-running on every keystroke.
  useEffect(() => {
    customFormRef.current = customForm;
  }, [customForm]);
  // Per-row dirty tracking: a refetch preserves dirty rows (local values) and
  // drops untouched rows that no longer exist on the server.
  const dirtyCustomKeysRef = useRef<Set<string>>(new Set());
  const lastCustomDateRef = useRef<string | null>(null);

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
  const {
    data: customCategories,
    isLoading: isCustomCategoriesLoading,
    isError: isCustomCategoriesError,
    refetch: refetchCustomCategories,
  } = useCustomCategories();
  const {
    data: customMeasurements,
    isLoading: isCustomMeasurementsLoading,
    isError: isCustomMeasurementsError,
    refetch: refetchCustomEntries,
  } = useCustomMeasurementsByDate(selectedDate);

  // Filter BEFORE presentation: the manual Daily editor only exposes eligible
  // Daily categories. Health-sync categories (and Hourly/All/Unlimited) never
  // reach the form state, so they cannot flood the screen. Memoized so the
  // reconciliation effect below has a stable identity across renders.
  /** FORM MODEL: every Daily category (health-sync names included). Used by
   * syncCustomForm / buildCustomOps / delete lookup / reconciliation / dirty
   * preservation — never the presentation partition, so a value typed inside
   * "More categories" is always part of the form regardless of expansion. */
  const dailyCustomCategories = useMemo(
    () => (customCategories ?? []).filter(isDailyCustomCategory),
    [customCategories],
  );

  /** Server-backed manual entries for the CURRENT selected date only. Synced /
   * null / undefined sources never count. This is the temporary mobile
   * heuristic (selected-day entries); a long-term server-side
   * has_manual_entries flag remains future work per maintainer. */
  const manualCategoryIds = useMemo(
    () =>
      new Set(
        (customMeasurements ?? [])
          .filter((entry) => isManualSource(entry.source))
          .map((entry) => entry.category_id),
      ),
    [customMeasurements],
  );

  /** Primary: not a known health-sync name, OR it already has a manual entry
   * for the selected date. Always visible in the main custom list. */
  const primaryCustomCategories = useMemo(
    () =>
      dailyCustomCategories.filter(
        (cat) =>
          !isAutoHealthSyncCustomCategoryName(cat.name) ||
          manualCategoryIds.has(cat.id),
      ),
    [dailyCustomCategories, manualCategoryIds],
  );

  /** More: a known health-sync name with NO manual entry for the selected
   * date — collapsed behind one tap so integration-heavy accounts stay
   * compact while legitimate collisions (weight, Blood Pressure) remain
   * accessible. */
  const moreCustomCategories = useMemo(
    () =>
      dailyCustomCategories.filter(
        (cat) =>
          isAutoHealthSyncCustomCategoryName(cat.name) &&
          !manualCategoryIds.has(cat.id),
      ),
    [dailyCustomCategories, manualCategoryIds],
  );

  // Lazy "More categories" expansion state (presentation only — never owns the
  // form value; collapsing keeps typed values in customForm).
  const [showMoreCategories, setShowMoreCategories] = useState(false);

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
  // Only eligible Daily categories participate; synced (non-manual) entries are
  // excluded by syncCustomForm so they never become editable manual state.
  useEffect(() => {
    if (lastCustomDateRef.current !== selectedDate) {
      lastCustomDateRef.current = selectedDate;
      dirtyCustomKeysRef.current = new Set();
    }
    const dirtyKeys = new Set(dirtyCustomKeysRef.current);
    const synced = syncCustomForm({
      categories: dailyCustomCategories,
      serverEntries: customMeasurements ?? [],
      current: customFormRef.current,
      dirtyKeys,
    });
    setCustomForm(synced.form);
  }, [selectedDate, dailyCustomCategories, customMeasurements]);

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

  const setSingleCustomValue = useCallback((categoryId: string, value: string) => {
    const existing = customFormRef.current[categoryId]?.rows[0] ?? null;
    const key = existing?.key ?? `single-${categoryId}`;
    dirtyCustomKeysRef.current.add(key);
    setCustomForm((prev) => {
      const catForm = prev[categoryId];
      const row = catForm?.rows[0] ?? null;
      const nextRow: CustomRow = row
        ? { ...row, value }
        : { key, entryId: null, source: 'manual', value };
      return { ...prev, [categoryId]: { rows: [nextRow], deleted: catForm?.deleted ?? [] } };
    });
  }, []);

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
        Toast.show({ type: 'error', text1: t('measurements.validation.invalid', { defaultValue: 'Invalid {{label}}', label }), text2: t('measurements.validation.enterNumber', { defaultValue: 'Enter a number.' }) });
        return { kind: 'invalid' };
      }
      if (parsed < 0) {
        Toast.show({ type: 'error', text1: t('measurements.validation.invalid', { defaultValue: 'Invalid {{label}}', label }), text2: t('measurements.validation.nonNegative', { defaultValue: "Values must be 0 or greater." }) });
        return { kind: 'invalid' };
      }
      if (opts?.integer && !Number.isInteger(parsed)) {
        Toast.show({ type: 'error', text1: t('measurements.validation.invalid', { defaultValue: 'Invalid {{label}}', label }), text2: t('measurements.validation.wholeNumber', { defaultValue: '{{label}} must be a whole number.', label }) });
        return { kind: 'invalid' };
      }
      if (opts?.max != null && parsed > opts.max) {
        Toast.show({ type: 'error', text1: t('measurements.validation.invalid', { defaultValue: 'Invalid {{label}}', label }), text2: opts.maxMessage ?? t('measurements.validation.max', { defaultValue: 'Must be {{max}} or less.', max: opts.max }) });
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
          Toast.show({ type: 'error', text1: t('measurements.validation.invalidWeight', { defaultValue: 'Invalid weight' }), text2: t('measurements.validation.stonesLbsNumber', { defaultValue: 'Enter a number for stones and lbs.' }) });
          return;
        }
        if (stones < 0 || lbs < 0) {
          Toast.show({ type: 'error', text1: t('measurements.validation.invalidWeight', { defaultValue: 'Invalid weight' }), text2: t('measurements.validation.nonNegative', { defaultValue: 'Values must be 0 or greater.' }) });
          return;
        }
        payload.weight = stonesLbsToKg(stones, lbs);
      }
    } else {
      if (!apply('weight', evaluateField('weight', fieldLabel('weight', 'Weight')), (v) => weightToKg(v, weightMode))) return;
    }
    if (!apply('neck', evaluateField('neck', fieldLabel('neck', 'Neck')), (v) => lengthToCm(v, bodyUnit))) return;
    if (!apply('waist', evaluateField('waist', fieldLabel('waist', 'Waist')), (v) => lengthToCm(v, bodyUnit))) return;
    if (!apply('hips', evaluateField('hips', fieldLabel('hips', 'Hips')), (v) => lengthToCm(v, bodyUnit))) return;
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
          Toast.show({ type: 'error', text1: t('measurements.validation.invalidHeight', { defaultValue: 'Invalid height' }), text2: t('measurements.validation.feetInchesNumber', { defaultValue: 'Enter a number for feet and inches.' }) });
          return;
        }
        if (feet < 0 || inches < 0) {
          Toast.show({ type: 'error', text1: t('measurements.validation.invalidHeight', { defaultValue: 'Invalid height' }), text2: t('measurements.validation.nonNegative', { defaultValue: 'Values must be 0 or greater.' }) });
          return;
        }
        payload.height = feetInchesToCm(feet, inches);
      }
    } else {
      if (!apply('height', evaluateField('height', fieldLabel('height', 'Height')), (v) => lengthToCm(v, heightMode))) return;
    }
    if (!apply('steps', evaluateField('steps', fieldLabel('steps', 'Steps'), { integer: true }), (v) => v)) return;
    if (
      !apply(
        'bodyFatPercentage',
        evaluateField('bodyFatPercentage', fieldLabel('bodyFatPercentage', 'Body fat %'), {
          max: 100,
          maxMessage: t('measurements.validation.bodyFatRange', { defaultValue: 'Body fat % must be between 0 and 100.' }),
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
    const customResult = buildCustomOps({
      categories: dailyCustomCategories,
      form: customForm,
      dirtyKeys: new Set(dirtyCustomKeysRef.current),
      onInvalid: (label) => {
        Toast.show({ type: 'error', text1: t('measurements.validation.invalid', { defaultValue: 'Invalid {{label}}', label }), text2: t('measurements.validation.enterNumber', { defaultValue: 'Enter a number.' }) });
      },
    });
    if (!customResult.ok) return;
    const customOps = customResult.operations;

    if (!hasAnyField && customOps.length === 0) {
       Toast.show({ type: 'info', text1: t('measurements.nothingToSave', { defaultValue: 'Nothing to save' }), text2: t('measurements.enterValue', { defaultValue: 'Enter or clear at least one value.' }) });
      return;
    }

    const doSave = async () => {
      // Rows whose custom operation already succeeded are removed from the
      // pending set; failed and not-yet-attempted rows stay dirty so the
      // refetch keeps their typed values and a retry sends only the rest.
      const remainingDirtyCustom = new Set(dirtyCustomKeysRef.current);
      let customSucceeded = true;

      try {
        for (const op of customOps) {
          try {
            if (op.kind === 'delete') {
              await deleteCustomMutation.mutateAsync({ id: op.entryId, entryDate: selectedDate });
              // A confirmed delete must never be retried: drop its tombstone so
              // a retry after a later partial failure cannot re-send the delete
              // for an already-removed entry id.
              setCustomForm((prev) => {
                const catForm = prev[op.categoryId];
                if (!catForm) return prev;
                return {
                  ...prev,
                  [op.categoryId]: {
                    ...catForm,
                    deleted: catForm.deleted.filter((d) => d.entryId !== op.entryId),
                  },
                };
              });
            } else {
              // Daily upsert semantics on the backend match by
              // (category, date, source). Every save from this screen sends
              // source 'manual' (never a preserved synced source), so a manual
              // value stays separate from health-synced entries.
              await saveCustomMutation.mutateAsync({
                category_id: op.categoryId,
                value: op.value,
                entry_date: selectedDate,
                source: op.source,
              });
            }
            // This operation reached the server successfully; it must not be
            // retried by a later partial-failure retry.
            if (op.rowKey) remainingDirtyCustom.delete(op.rowKey);
          } catch {
            // Stop at the first failure; later operations remain pending.
            customSucceeded = false;
            break;
          }
        }

        if (customSucceeded && hasAnyField) {
          try {
            await upsertMutation.mutateAsync(payload);
          } catch {
            customSucceeded = false;
          }
        }

        if (customSucceeded) {
          Toast.show({ type: 'success', text1: t('measurements.saved', { defaultValue: 'Saved' }) });
          navigation.goBack();
          return;
        }
      } catch {
        // Unreachable in practice (every mutation above is individually
        // caught), but keep the screen open rather than crashing.
        customSucceeded = false;
      }

      // Partial failure: do NOT clear the forms. The custom rows that failed
      // (or never ran) keep their values via the pending dirty set, and the
      // standard fields keep their dirty markers because the upsert did not
      // persist (or was never attempted). Only the rows that succeeded are
      // dropped from the pending set.
      dirtyCustomKeysRef.current = remainingDirtyCustom;
      await Promise.allSettled([
        refetchMeasurements(),
        refetchCustomCategories(),
        refetchCustomEntries(),
      ]);
      Toast.show({ type: 'error', text1: t('measurements.partialSave', { defaultValue: 'Some changes may not have been saved.' }) });
    };

    // Custom deletes (clearing a prefilled entry or pressing the row delete
    // button) require confirmation and the message lists affected categories.
    const customDeleteOps = customOps.filter(
      (op): op is Extract<CustomOp, { kind: 'delete' }> => op.kind === 'delete',
    );
    const clearingLabels = [
      ...cleared.map((k) => fieldLabel(k, k)),
      ...customDeleteOps.map((op) => {
        const cat = dailyCustomCategories.find((c) => c.id === op.categoryId);
        return cat ? (cat.display_name ?? cat.name) : op.categoryId;
      }),
    ];

    if (clearingLabels.length > 0) {
      const noun = t('measurements.confirm.measurements', { defaultValue: 'measurements' });
      Alert.alert(
        t('measurements.confirm.title', { defaultValue: 'Clear {{count}} measurements?', count: clearingLabels.length, noun }),
        t('measurements.confirm.message', { defaultValue: '{{labels}} will be cleared.', labels: joinWithAnd(clearingLabels, t('common.and', { defaultValue: 'and' }), t('common.listFinalSeparator', { defaultValue: ', and ' })) }),
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          { text: t('common.save', { defaultValue: 'Save' }), style: 'destructive', onPress: doSave },
        ],
      );
      return;
    }

    doSave();
  }, [form, prefilledKeys, selectedDate, weightMode, bodyUnit, heightMode, upsertMutation, saveCustomMutation, deleteCustomMutation, navigation, dailyCustomCategories, customForm, refetchMeasurements, refetchCustomCategories, refetchCustomEntries, fieldLabel, t]);

  const isCustomDataLoading = isCustomCategoriesLoading || isCustomMeasurementsLoading;
  const isCustomDataError = isCustomCategoriesError || isCustomMeasurementsError;
  // One coherent mutation-pending state: both the native header and the footer
  // Save reflect every mutation that can actually be in flight.
  const isMutationPending =
    upsertMutation.isPending ||
    saveCustomMutation.isPending ||
    deleteCustomMutation.isPending;
  const isSaveDisabled =
    isLoading ||
    isPreferencesLoading ||
    isCustomDataLoading ||
    isMutationPending;
  // Closing stays available during a fetch error so the user is never trapped;
  // only an in-flight mutation blocks dismissal.
  const isDismissDisabled = isMutationPending;
  const isSaving = isMutationPending;

  const weightLabel = t('measurements.fields.weightWithUnit', {
    defaultValue: 'Weight ({{unit}})',
    unit: weightMode === 'st_lbs' ? 'st, lb' : weightMode,
  });
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
        {t('measurements.willBeCleared', { defaultValue: 'Will be cleared' })}
      </Text>
    ) : null;
  };

  const header = useScreenHeader({
    title: t('screens.measurements', { defaultValue: 'Measurements' }),
    left: { kind: 'dismiss', onPress: handleClose, disabled: isDismissDisabled },
    right: {
      kind: 'primary',
      label: t('common.save', { defaultValue: 'Save' }),
      busyLabel: t('common.saving', { defaultValue: 'Saving…' }),
      busy: isSaving,
      disabled: isSaveDisabled,
      placement: 'native-only',
      onPress: handleSave,
      identifier: 'measurements-save',
    },
  });

  const booleanLabels = {
    yes: t('common.yes', { defaultValue: 'Yes' }),
    no: t('common.no', { defaultValue: 'No' }),
    clear: t('common.clear', { defaultValue: 'Clear' }),
  };

  // Daily manual editor: exactly one editable row per category. Health-sync
  // categories and Hourly/All/Unlimited never reach this renderer.
  const renderCustomCategory = (cat: NonNullable<typeof customCategories>[number]) => {
    const label = cat.display_name ?? cat.name;
    const suffix = cat.measurement_type ? ` (${cat.measurement_type})` : '';
    const isBoolean = cat.data_type === 'boolean';
    const isNumeric = cat.data_type === 'numeric' || cat.data_type == null;
    const catForm = customForm[cat.id] ?? { rows: [], deleted: [] };
    const row = catForm.rows[0] ?? null;

    return (
      <View key={cat.id} className="mb-4">
        <Text className="text-text-secondary text-sm mb-1">
          {label}{suffix}
        </Text>
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            {isBoolean ? (
              <YesNoClearControl
                value={row?.value ?? ''}
                onChange={(v) => setSingleCustomValue(cat.id, v)}
                labels={booleanLabels}
              />
            ) : (
              <FormInput
                value={row?.value ?? ''}
                onChangeText={(v) => setSingleCustomValue(cat.id, v)}
                keyboardType={isNumeric ? 'decimal-pad' : 'default'}
                placeholder={isNumeric ? '0' : ''}
                accessibilityLabel={label}
                returnKeyType="done"
                testID={`custom-input-${cat.id}`}
              />
            )}
          </View>
          {row != null && (
            <TouchableOpacity
              onPress={() => deleteCustomRow(cat.id, row)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('measurements.custom.deleteEntry', { defaultValue: 'Delete {{label}} entry', label })}
              testID={`delete-custom-${row.key}`}
            >
              <Icon name="trash" size={18} color={textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        {row?.entryId != null && row.value.trim() === '' ? (
          <Text className="text-xs italic mt-1" style={{ color: textSecondary }}>
            {t('measurements.willBeCleared', { defaultValue: 'Will be cleared' })}
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
          <Text className="text-text-primary text-base">{t('measurements.date', { defaultValue: 'Date' })}</Text>
          <Text className="text-accent-primary text-base font-medium mx-1.5">
            {selectedDate === getTodayDate()
              ? t('date.today', { defaultValue: 'Today' })
              : selectedDate === addDays(getTodayDate(), -1)
                ? t('date.yesterday', { defaultValue: 'Yesterday' })
                : formatDate(selectedDate, i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US')}
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
                      placeholder={t('measurements.units.st', { defaultValue: 'st' })}
                      accessibilityLabel={t('measurements.fields.weightStones', { defaultValue: 'Weight in stones' })}
                      returnKeyType="done"
                    />
                  </View>
                  <View className="flex-1">
                    <FormInput
                      value={form.weight}
                      onChangeText={(v) => updateField('weight', v)}
                      keyboardType="decimal-pad"
                      placeholder={t('measurements.units.lb', { defaultValue: 'lb' })}
                      accessibilityLabel={t('measurements.fields.weightPounds', { defaultValue: 'Weight in pounds' })}
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
                  accessibilityLabel={t('measurements.fields.weightWithUnit', { defaultValue: 'Weight ({{unit}})', unit: weightMode })}
                  returnKeyType="done"
                />
              )}
              {renderClearHint('weight')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.fields.bodyFatPercentage', { defaultValue: 'Body fat %' })}</Text>
              <FormInput
                value={form.bodyFatPercentage}
                onChangeText={(v) => updateField('bodyFatPercentage', v)}
                keyboardType="decimal-pad"
                placeholder="0"
                accessibilityLabel={t('measurements.fields.bodyFatPercentage', { defaultValue: 'Body fat %' })}
                returnKeyType="done"
              />
              {renderClearHint('bodyFatPercentage')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.fields.heightWithUnit', { defaultValue: 'Height ({{unit}})', unit: heightSuffix })}</Text>
              {heightMode === 'ft_in' ? (
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <FormInput
                      value={form.heightFeet}
                      onChangeText={(v) => updateField('heightFeet', v)}
                      keyboardType="number-pad"
                      placeholder={t('measurements.units.ft', { defaultValue: 'ft' })}
                      accessibilityLabel={t('measurements.fields.heightFeet', { defaultValue: 'Height in feet' })}
                      returnKeyType="done"
                    />
                  </View>
                  <View className="flex-1">
                    <FormInput
                      value={form.height}
                      onChangeText={(v) => updateField('height', v)}
                      keyboardType="decimal-pad"
                      placeholder={t('measurements.units.in', { defaultValue: 'in' })}
                      accessibilityLabel={t('measurements.fields.heightInches', { defaultValue: 'Height in inches' })}
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
                  accessibilityLabel={t('measurements.fields.heightWithUnit', { defaultValue: 'Height ({{unit}})', unit: heightSuffix })}
                  returnKeyType="done"
                />
              )}
              {renderClearHint('height')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.fields.neckWithUnit', { defaultValue: 'Neck ({{unit}})', unit: bodySuffix })}</Text>
              <FormInput
                value={form.neck}
                onChangeText={(v) => updateField('neck', v)}
                keyboardType="decimal-pad"
                placeholder="0"
                accessibilityLabel={t('measurements.fields.neckWithUnit', { defaultValue: 'Neck ({{unit}})', unit: bodySuffix })}
                returnKeyType="done"
              />
              {renderClearHint('neck')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.fields.waistWithUnit', { defaultValue: 'Waist ({{unit}})', unit: bodySuffix })}</Text>
              <FormInput
                value={form.waist}
                onChangeText={(v) => updateField('waist', v)}
                keyboardType="decimal-pad"
                placeholder="0"
                accessibilityLabel={t('measurements.fields.waistWithUnit', { defaultValue: 'Waist ({{unit}})', unit: bodySuffix })}
                returnKeyType="done"
              />
              {renderClearHint('waist')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.fields.hipsWithUnit', { defaultValue: 'Hips ({{unit}})', unit: bodySuffix })}</Text>
              <FormInput
                value={form.hips}
                onChangeText={(v) => updateField('hips', v)}
                keyboardType="decimal-pad"
                placeholder="0"
                accessibilityLabel={t('measurements.fields.hipsWithUnit', { defaultValue: 'Hips ({{unit}})', unit: bodySuffix })}
                returnKeyType="done"
              />
              {renderClearHint('hips')}
            </View>

            <View className="mb-4">
              <Text className="text-text-secondary text-sm mb-1">{t('measurements.fields.steps', { defaultValue: 'Steps' })}</Text>
              <FormInput
                value={form.steps}
                onChangeText={(v) => updateField('steps', v)}
                keyboardType="number-pad"
                placeholder="0"
                accessibilityLabel={t('measurements.fields.steps', { defaultValue: 'Steps' })}
                returnKeyType="done"
              />
              {renderClearHint('steps')}
            </View>

            {isCustomDataError ? (
              <View className="mt-4 mb-2 py-6 items-center">
                <Text className="text-text-secondary text-sm text-center mb-3">
                  {t('measurements.custom.loadError', { defaultValue: "Couldn't load custom measurements." })}
                </Text>
                <Button variant="secondary" onPress={handleRetryCustomData} className="px-6">
                  <Text className="text-text-primary text-sm font-semibold">
                    {t('common.tryAgain', { defaultValue: "Please try again." })}
                  </Text>
                </Button>
              </View>
            ) : isCustomDataLoading ? (
              <View className="mt-4 mb-2 py-6 items-center">
                <ActivityIndicator size="small" color={accentPrimary} />
              </View>
            ) : (
              dailyCustomCategories.length > 0 && (
                <View className="mt-4 mb-2">
                  <Text className="text-text-primary text-base font-semibold mb-3">
                    {t('measurements.custom.title', { defaultValue: 'Custom Measurements' })}
                  </Text>
                  {primaryCustomCategories.map(renderCustomCategory)}
                  {moreCustomCategories.length > 0 && (
                    <>
                      <Button
                        variant="ghost"
                        onPress={() => setShowMoreCategories((prev) => !prev)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        className="self-start py-0 px-0"
                        textClassName="text-sm"
                        accessibilityRole="button"
                        accessibilityState={{ expanded: showMoreCategories }}
                        accessibilityLabel={showMoreCategories
                          ? t('measurements.custom.hideCategories', { defaultValue: "Hide categories ▴" })
                          : t('measurements.custom.moreCategories', { defaultValue: "More categories ▾" })}
                      >
                        <Text style={{ color: accentPrimary }} className="text-sm font-medium">
                          {showMoreCategories
                            ? t('measurements.custom.hideCategories', { defaultValue: 'Hide categories ▴' })
                            : t('measurements.custom.moreCategories', { defaultValue: 'More categories ▾' })}
                        </Text>
                      </Button>
                      {showMoreCategories &&
                        moreCustomCategories.map(renderCustomCategory)}
                    </>
                  )}
                </View>
              )
            )}
          </>
        )}

        <View style={{ height: 80 }} />
      </KeyboardAwareScrollView>

      {/* Sticky footer */}
      {!usesNativeHeader && (
        <FooterSaveBar
          onPress={handleSave}
          disabled={isSaveDisabled}
          busy={isMutationPending}
        />
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
