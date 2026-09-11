import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import Switch from '../components/ui/Switch';
import YesNoClearControl from '../components/YesNoClearControl';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import { FooterSaveBar } from '../components/FormScreenChrome';
import {
  useLatestMeasurementsOnOrBefore,
  useMeasurements,
} from '../hooks/useMeasurements';
import { useUpsertCheckIn } from '../hooks/useUpsertCheckIn';
import { usePreferences } from '../hooks/usePreferences';
import { useProfile } from '../hooks/useProfile';
import { getTodayDate, addDays, formatDate } from '../utils/dateUtils';
import {
  weightToKg,
  lengthToCm,
  feetInchesToCm,
  stonesLbsToKg,
} from '../utils/unitConversions';
import { parseDecimalInput } from '../utils/numericInput';
import {
  MIN_MEASURED_BMR_KCAL,
  MAX_MEASURED_BMR_KCAL,
  calculateAge,
} from '@workspace/shared';
import {
  EMPTY_FORM,
  FIELD_FORM_KEYS,
  FORM_FIELD_KEYS,
  buildStandardFormFromMeasurement,
  formatNumberForInput,
  standardFieldMetricValue,
  type FieldKey,
  type FormState,
  type MeasurementUnitModes,
} from '../utils/measurementForm';
import {
  deriveCustomFieldHints,
  deriveStandardFieldHints,
  selectedDayCustomValues,
  selectedDayDisplayValues,
  shouldOfferCustomHint,
  shouldOfferStandardHint,
  type StandardFieldHint,
} from '../utils/measurementHistory';
import {
  calculateBodyFatPercentage,
  resolveBodyFatInputs,
  type BodyFatCalculationFailure,
  type BodyFatMeasurementInputs,
} from '../utils/bodyFatCalculator';
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
  useLatestManualCustomEntriesOnOrBefore,
  useSaveCustomMeasurement,
  useDeleteCustomMeasurement,
} from '../hooks/useCustomMeasurements';

type Props = RootStackScreenProps<'MeasurementsAdd'>;

const joinWithAnd = (
  items: string[],
  conjunction: string,
  finalSeparator: string
): string => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}${finalSeparator}${items[items.length - 1]}`;
};

/**
 * Compact `Use last` control.
 *
 * A previous value is only ever a suggestion, so adopting it has to be an
 * explicit tap rather than something a placeholder does implicitly. Kept small
 * and inline with the field label so eleven of them do not lengthen the form.
 */
const UseLastButton: React.FC<{
  accentColor: string;
  onPress: () => void;
  accessibilityLabel: string;
  testID: string;
}> = ({ accentColor, onPress, accessibilityLabel, testID }) => {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      className="flex-row items-center gap-1"
    >
      <Icon name="history" size={13} color={accentColor} weight="medium" />
      <Text className="text-xs font-medium" style={{ color: accentColor }}>
        {t('measurements.useLast', { defaultValue: 'Use last' })}
      </Text>
    </TouchableOpacity>
  );
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
  const fieldLabel = React.useCallback(
    (key: FieldKey, fallback: string) => {
      switch (key) {
        case 'weight':
          return t('measurements.fields.weight', { defaultValue: 'Weight' });
        case 'bodyFatPercentage':
          return t('measurements.fields.bodyFatPercentage', {
            defaultValue: 'Body fat %',
          });
        case 'height':
          return t('measurements.fields.height', { defaultValue: 'Height' });
        case 'neck':
          return t('measurements.fields.neck', { defaultValue: 'Neck' });
        case 'waist':
          return t('measurements.fields.waist', { defaultValue: 'Waist' });
        case 'hips':
          return t('measurements.fields.hips', { defaultValue: 'Hips' });
        case 'steps':
          return t('measurements.fields.steps', { defaultValue: 'Steps' });
        case 'muscleMassKg':
          return t('measurements.fields.muscleMass', {
            defaultValue: 'Muscle mass',
          });
        case 'boneMassKg':
          return t('measurements.fields.boneMass', {
            defaultValue: 'Bone mass',
          });
        case 'bodyWaterPercentage':
          return t('measurements.fields.bodyWaterPercentage', {
            defaultValue: 'Body water %',
          });
        case 'bmr':
          return t('measurements.fields.bmr', { defaultValue: 'BMR' });
        default:
          return fallback;
      }
    },
    [t]
  );
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const [accentPrimary, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
  ]) as [string, string];

  const initialDate =
    route.params?.date ?? useDiaryDateStore.getState().selectedDate;
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [prefilledKeys, setPrefilledKeys] = useState<Set<FieldKey>>(
    () => new Set()
  );
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

  const {
    measurements,
    isLoading,
    refetch: refetchMeasurements,
  } = useMeasurements({ date: selectedDate });
  const { latestMeasurements } = useLatestMeasurementsOnOrBefore({
    date: selectedDate,
  });
  const { preferences, isLoading: isPreferencesLoading } = usePreferences();
  const { profile } = useProfile();
  // Weight supports a third "stones + lbs" mode that renders as two inputs.
  const weightMode: 'kg' | 'lbs' | 'st_lbs' =
    preferences?.default_weight_unit ?? 'kg';
  // Body measurements (waist/neck/hips) only support cm/inches — when the
  // pref is ft_in we fall back to cm, matching web's `formatMeasurement`.
  const bodyUnit: 'cm' | 'inches' =
    preferences?.default_measurement_unit === 'inches' ? 'inches' : 'cm';
  // Height supports a third "feet + inches" mode that renders as two inputs.
  const heightMode: 'cm' | 'inches' | 'ft_in' =
    preferences?.default_measurement_unit ?? 'cm';

  // Stable identity so the derivation memos below do not recompute per render.
  const units: MeasurementUnitModes = useMemo(
    () => ({ weightMode, bodyUnit, heightMode }),
    [weightMode, bodyUnit, heightMode]
  );

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
  // Previous-value suggestions for custom categories. Gated on there being an
  // eligible category so an account without custom measurements pays nothing.
  // The failure flag is surfaced in the UI because a failed lookup and "this
  // category has no earlier value" otherwise look identical on screen.
  const { data: latestManualCustomEntries, isError: isCustomHintError } =
    useLatestManualCustomEntriesOnOrBefore(selectedDate, {
      enabled: (customCategories ?? []).some(isDailyCustomCategory),
    });

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
    [customCategories]
  );

  /**
   * Previous-value suggestions. These are display-only: they never enter
   * `form` / `customForm`, so simply showing one can neither be submitted nor
   * create an entry. `Use last` is the only way a suggestion becomes state.
   *
   * The selected day's own values win by construction — a suggestion is only
   * offered while its input is empty and the day holds no value for that field.
   */
  const standardHints = useMemo(
    () => deriveStandardFieldHints(latestMeasurements, units),
    [latestMeasurements, units]
  );
  const selectedDayValues = useMemo(
    () => selectedDayDisplayValues(measurements, units),
    [measurements, units]
  );
  const customHints = useMemo(
    () =>
      deriveCustomFieldHints(dailyCustomCategories, latestManualCustomEntries),
    [dailyCustomCategories, latestManualCustomEntries]
  );
  const selectedDayCustom = useMemo(
    () => selectedDayCustomValues(customMeasurements, isManualSource),
    [customMeasurements]
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
          .map((entry) => entry.category_id)
      ),
    [customMeasurements]
  );

  /** Primary: not a known health-sync name, OR it already has a manual entry
   * for the selected date. Always visible in the main custom list. */
  const primaryCustomCategories = useMemo(
    () =>
      dailyCustomCategories.filter(
        (cat) =>
          !isAutoHealthSyncCustomCategoryName(cat.name) ||
          manualCategoryIds.has(cat.id)
      ),
    [dailyCustomCategories, manualCategoryIds]
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
          !manualCategoryIds.has(cat.id)
      ),
    [dailyCustomCategories, manualCategoryIds]
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

    const { values, prefilled } = buildStandardFormFromMeasurement(
      measurements,
      units
    );
    const next: FormState = { ...EMPTY_FORM, ...values };
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
  }, [selectedDate, isLoading, isPreferencesLoading, measurements, units]);

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

  /**
   * Adopts a previous-value suggestion. This is the only path by which a hint
   * becomes form state, and it deliberately runs through `updateField`, so the
   * adopted value is dirty and behaves exactly like typed input from here on.
   */
  const adoptStandardHint = useCallback(
    (field: FieldKey, hint: StandardFieldHint) => {
      for (const formKey of FIELD_FORM_KEYS[field]) {
        const nextValue = hint.adopt[formKey];
        if (nextValue != null) updateField(formKey, nextValue);
      }
    },
    [updateField]
  );

  /** The suggestion currently offered for a standard field, if any. */
  const standardHintFor = useCallback(
    (field: FieldKey): StandardFieldHint | undefined => {
      const [primaryKey] = FIELD_FORM_KEYS[field];
      return shouldOfferStandardHint({
        currentRaw: form[primaryKey] ?? '',
        selectedDayValues,
        field,
        hint: standardHints[field],
      })
        ? standardHints[field]
        : undefined;
    },
    [form, selectedDayValues, standardHints]
  );

  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date);
    useDiaryDateStore.getState().setSelectedDate(date);
  }, []);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const setSingleCustomValue = useCallback(
    (categoryId: string, value: string) => {
      const existing = customFormRef.current[categoryId]?.rows[0] ?? null;
      const key = existing?.key ?? `single-${categoryId}`;
      dirtyCustomKeysRef.current.add(key);
      setCustomForm((prev) => {
        const catForm = prev[categoryId];
        const row = catForm?.rows[0] ?? null;
        const nextRow: CustomRow = row
          ? { ...row, value }
          : { key, entryId: null, source: 'manual', value };
        return {
          ...prev,
          [categoryId]: { rows: [nextRow], deleted: catForm?.deleted ?? [] },
        };
      });
    },
    []
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
      return {
        ...prev,
        [categoryId]: {
          ...catForm,
          rows: catForm.rows.filter((r) => r.key !== row.key),
        },
      };
    });
  }, []);

  const handleRetryCustomData = useCallback(() => {
    refetchCustomCategories();
    refetchCustomEntries();
    refetchMeasurements();
  }, [refetchCustomCategories, refetchCustomEntries, refetchMeasurements]);

  // `Use Recent` mirrors the web check-in toggle and starts on, like web does.
  const [useRecentForCalculation, setUseRecentForCalculation] = useState(true);

  const bodyFatFailureMessage = useCallback(
    (reason: BodyFatCalculationFailure) => {
      switch (reason) {
        case 'profile-required':
          return t('measurements.bodyFat.profileRequired', {
            defaultValue:
              'Your profile needs a date of birth and gender for this calculation.',
          });
        case 'bmi-required-fields':
          return t('measurements.bodyFat.bmiRequiredFields', {
            defaultValue:
              'Weight, height, age, and gender are required for BMI Method.',
          });
        case 'navy-required-fields':
          return t('measurements.bodyFat.navyRequiredFields', {
            defaultValue:
              'Gender, height, waist, neck, and (if female) hips measurements are required for U.S. Navy Method.',
          });
        case 'uncomputable':
          return t('measurements.bodyFat.uncomputable', {
            defaultValue:
              'These measurements do not produce a valid body fat percentage. Check the waist, neck, height, and hips values.',
          });
      }
    },
    [t]
  );

  /**
   * Fills the Body Fat field from the configured algorithm. It only writes the
   * field — saving stays with the user, exactly like the web Calculate button.
   */
  const handleCalculateBodyFat = useCallback(() => {
    const formValues: BodyFatMeasurementInputs = {
      weightKg: standardFieldMetricValue('weight', form, units),
      heightCm: standardFieldMetricValue('height', form, units),
      waistCm: standardFieldMetricValue('waist', form, units),
      neckCm: standardFieldMetricValue('neck', form, units),
      hipsCm: standardFieldMetricValue('hips', form, units),
    };

    // `latestMeasurements` is the newest value on or before the selected day,
    // which is already loaded for the hints — so `Use Recent` needs no extra
    // request, and editing a past day cannot pull in values recorded after it.
    const recentValues: Partial<BodyFatMeasurementInputs> = {
      weightKg: latestMeasurements?.weight ?? null,
      heightCm: latestMeasurements?.height ?? null,
      waistCm: latestMeasurements?.waist ?? null,
      neckCm: latestMeasurements?.neck ?? null,
      hipsCm: latestMeasurements?.hips ?? null,
    };

    const inputs = resolveBodyFatInputs({
      useRecent: useRecentForCalculation,
      formValues,
      recentValues,
    });

    const age = profile?.date_of_birth
      ? calculateAge(profile.date_of_birth, preferences?.timezone ?? undefined)
      : 0;

    const result = calculateBodyFatPercentage({
      algorithm: preferences?.body_fat_algorithm,
      gender: profile?.gender,
      age,
      inputs,
    });

    if (!result.ok) {
      Toast.show({
        type: 'error',
        text1: t('measurements.bodyFat.calculateFailedTitle', {
          defaultValue: 'Could not calculate body fat',
        }),
        text2: bodyFatFailureMessage(result.reason),
      });
      return;
    }

    // Dirty, so it behaves like typed input and is submitted by the next save.
    updateField('bodyFatPercentage', formatNumberForInput(result.percentage));
    Toast.show({
      type: 'success',
      text1: t('measurements.bodyFat.calculatedTitle', {
        defaultValue: 'Body fat calculated',
      }),
      text2: t('measurements.bodyFat.calculatedMessage', {
        defaultValue: 'Review the value, then save to keep it.',
      }),
    });
  }, [
    form,
    units,
    latestMeasurements,
    useRecentForCalculation,
    profile,
    preferences,
    updateField,
    t,
    bodyFatFailureMessage,
  ]);

  const handleSave = useCallback(() => {
    type FieldResult =
      | { kind: 'invalid' }
      | { kind: 'omit' }
      | { kind: 'clear' }
      | { kind: 'value'; value: number };

    const evaluateField = (
      key: FieldKey,
      label: string,
      opts?: {
        integer?: boolean;
        min?: number;
        max?: number;
        minMessage?: string;
        maxMessage?: string;
      }
    ): FieldResult => {
      const trimmed = form[key].trim();
      if (trimmed === '') {
        return prefilledKeys.has(key) ? { kind: 'clear' } : { kind: 'omit' };
      }
      const parsed = parseDecimalInput(trimmed);
      if (Number.isNaN(parsed)) {
        Toast.show({
          type: 'error',
          text1: t('measurements.validation.invalid', {
            defaultValue: 'Invalid {{label}}',
            label,
          }),
          text2: t('measurements.validation.enterNumber', {
            defaultValue: 'Enter a number.',
          }),
        });
        return { kind: 'invalid' };
      }
      if (parsed < 0) {
        Toast.show({
          type: 'error',
          text1: t('measurements.validation.invalid', {
            defaultValue: 'Invalid {{label}}',
            label,
          }),
          text2: t('measurements.validation.nonNegative', {
            defaultValue: 'Values must be 0 or greater.',
          }),
        });
        return { kind: 'invalid' };
      }
      if (opts?.integer && !Number.isInteger(parsed)) {
        Toast.show({
          type: 'error',
          text1: t('measurements.validation.invalid', {
            defaultValue: 'Invalid {{label}}',
            label,
          }),
          text2: t('measurements.validation.wholeNumber', {
            defaultValue: '{{label}} must be a whole number.',
            label,
          }),
        });
        return { kind: 'invalid' };
      }
      if (opts?.min != null && parsed < opts.min) {
        Toast.show({
          type: 'error',
          text1: t('measurements.validation.invalid', {
            defaultValue: 'Invalid {{label}}',
            label,
          }),
          text2:
            opts.minMessage ??
            t('measurements.validation.min', {
              defaultValue: 'Must be {{min}} or greater.',
              min: opts.min,
            }),
        });
        return { kind: 'invalid' };
      }
      if (opts?.max != null && parsed > opts.max) {
        Toast.show({
          type: 'error',
          text1: t('measurements.validation.invalid', {
            defaultValue: 'Invalid {{label}}',
            label,
          }),
          text2:
            opts.maxMessage ??
            t('measurements.validation.max', {
              defaultValue: 'Must be {{max}} or less.',
              max: opts.max,
            }),
        });
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
      toStorage: (n: number) => number
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
          Toast.show({
            type: 'error',
            text1: t('measurements.validation.invalidWeight', {
              defaultValue: 'Invalid weight',
            }),
            text2: t('measurements.validation.stonesLbsNumber', {
              defaultValue: 'Enter a number for stones and lbs.',
            }),
          });
          return;
        }
        if (stones < 0 || lbs < 0) {
          Toast.show({
            type: 'error',
            text1: t('measurements.validation.invalidWeight', {
              defaultValue: 'Invalid weight',
            }),
            text2: t('measurements.validation.nonNegative', {
              defaultValue: 'Values must be 0 or greater.',
            }),
          });
          return;
        }
        payload.weight = stonesLbsToKg(stones, lbs);
      }
    } else {
      if (
        !apply(
          'weight',
          evaluateField('weight', fieldLabel('weight', 'Weight')),
          (v) => weightToKg(v, weightMode)
        )
      )
        return;
    }
    if (
      !apply('neck', evaluateField('neck', fieldLabel('neck', 'Neck')), (v) =>
        lengthToCm(v, bodyUnit)
      )
    )
      return;
    if (
      !apply(
        'waist',
        evaluateField('waist', fieldLabel('waist', 'Waist')),
        (v) => lengthToCm(v, bodyUnit)
      )
    )
      return;
    if (
      !apply('hips', evaluateField('hips', fieldLabel('hips', 'Hips')), (v) =>
        lengthToCm(v, bodyUnit)
      )
    )
      return;
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
          Toast.show({
            type: 'error',
            text1: t('measurements.validation.invalidHeight', {
              defaultValue: 'Invalid height',
            }),
            text2: t('measurements.validation.feetInchesNumber', {
              defaultValue: 'Enter a number for feet and inches.',
            }),
          });
          return;
        }
        if (feet < 0 || inches < 0) {
          Toast.show({
            type: 'error',
            text1: t('measurements.validation.invalidHeight', {
              defaultValue: 'Invalid height',
            }),
            text2: t('measurements.validation.nonNegative', {
              defaultValue: 'Values must be 0 or greater.',
            }),
          });
          return;
        }
        payload.height = feetInchesToCm(feet, inches);
      }
    } else {
      if (
        !apply(
          'height',
          evaluateField('height', fieldLabel('height', 'Height')),
          (v) => lengthToCm(v, heightMode)
        )
      )
        return;
    }
    if (
      !apply(
        'steps',
        evaluateField('steps', fieldLabel('steps', 'Steps'), { integer: true }),
        (v) => v
      )
    )
      return;
    if (
      !apply(
        'bodyFatPercentage',
        evaluateField(
          'bodyFatPercentage',
          fieldLabel('bodyFatPercentage', 'Body fat %'),
          {
            max: 100,
            maxMessage: t('measurements.validation.bodyFatRange', {
              defaultValue: 'Body fat % must be between 0 and 100.',
            }),
          }
        ),
        (v) => v
      )
    )
      return;
    if (
      !apply(
        'muscleMassKg',
        evaluateField(
          'muscleMassKg',
          fieldLabel('muscleMassKg', 'Muscle mass')
        ),
        (v) => weightToKg(v, weightMode === 'st_lbs' ? 'kg' : weightMode)
      )
    )
      return;
    if (
      !apply(
        'boneMassKg',
        evaluateField('boneMassKg', fieldLabel('boneMassKg', 'Bone mass')),
        (v) => weightToKg(v, weightMode === 'st_lbs' ? 'kg' : weightMode)
      )
    )
      return;
    if (
      !apply(
        'bodyWaterPercentage',
        evaluateField(
          'bodyWaterPercentage',
          fieldLabel('bodyWaterPercentage', 'Body water %'),
          {
            max: 100,
            maxMessage: t('measurements.validation.bodyWaterRange', {
              defaultValue: 'Body water % must be between 0 and 100.',
            }),
          }
        ),
        (v) => v
      )
    )
      return;
    if (
      !apply(
        'bmr',
        evaluateField('bmr', fieldLabel('bmr', 'BMR'), {
          min: MIN_MEASURED_BMR_KCAL,
          max: MAX_MEASURED_BMR_KCAL,
          minMessage: t('measurements.validation.bmrRange', {
            defaultValue: 'BMR must be between 600 and 6000 kcal.',
          }),
          maxMessage: t('measurements.validation.bmrRange', {
            defaultValue: 'BMR must be between 600 and 6000 kcal.',
          }),
        }),
        (v) => v
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
      'muscleMassKg',
      'boneMassKg',
      'bodyWaterPercentage',
      'bmr',
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
        Toast.show({
          type: 'error',
          text1: t('measurements.validation.invalid', {
            defaultValue: 'Invalid {{label}}',
            label,
          }),
          text2: t('measurements.validation.enterNumber', {
            defaultValue: 'Enter a number.',
          }),
        });
      },
    });
    if (!customResult.ok) return;
    const customOps = customResult.operations;

    if (!hasAnyField && customOps.length === 0) {
      Toast.show({
        type: 'info',
        text1: t('measurements.nothingToSave', {
          defaultValue: 'Nothing to save',
        }),
        text2: t('measurements.enterValue', {
          defaultValue: 'Enter or clear at least one value.',
        }),
      });
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
              await deleteCustomMutation.mutateAsync({
                id: op.entryId,
                entryDate: selectedDate,
              });
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
                    deleted: catForm.deleted.filter(
                      (d) => d.entryId !== op.entryId
                    ),
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
          Toast.show({
            type: 'success',
            text1: t('measurements.saved', { defaultValue: 'Saved' }),
          });
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
      Toast.show({
        type: 'error',
        text1: t('measurements.partialSave', {
          defaultValue: 'Some changes may not have been saved.',
        }),
      });
    };

    // Custom deletes (clearing a prefilled entry or pressing the row delete
    // button) require confirmation and the message lists affected categories.
    const customDeleteOps = customOps.filter(
      (op): op is Extract<CustomOp, { kind: 'delete' }> => op.kind === 'delete'
    );
    const clearingLabels = [
      ...cleared.map((k) => fieldLabel(k, k)),
      ...customDeleteOps.map((op) => {
        const cat = dailyCustomCategories.find((c) => c.id === op.categoryId);
        return cat ? (cat.display_name ?? cat.name) : op.categoryId;
      }),
    ];

    if (clearingLabels.length > 0) {
      const noun = t('measurements.confirm.measurements', {
        defaultValue: 'measurements',
      });
      Alert.alert(
        t('measurements.confirm.title', {
          defaultValue: 'Clear {{count}} measurements?',
          count: clearingLabels.length,
          noun,
        }),
        t('measurements.confirm.message', {
          defaultValue: '{{labels}} will be cleared.',
          labels: joinWithAnd(
            clearingLabels,
            t('common.and', { defaultValue: 'and' }),
            t('common.listFinalSeparator', { defaultValue: ', and ' })
          ),
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
          },
          {
            text: t('common.save', { defaultValue: 'Save' }),
            style: 'destructive',
            onPress: doSave,
          },
        ]
      );
      return;
    }

    doSave();
  }, [
    form,
    prefilledKeys,
    selectedDate,
    weightMode,
    bodyUnit,
    heightMode,
    upsertMutation,
    saveCustomMutation,
    deleteCustomMutation,
    navigation,
    dailyCustomCategories,
    customForm,
    refetchMeasurements,
    refetchCustomCategories,
    refetchCustomEntries,
    fieldLabel,
    t,
  ]);

  const isCustomDataLoading =
    isCustomCategoriesLoading || isCustomMeasurementsLoading;
  const isCustomDataError =
    isCustomCategoriesError || isCustomMeasurementsError;
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
  const heightSuffix =
    heightMode === 'cm' ? 'cm' : heightMode === 'inches' ? 'in' : 'ft, in';

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

  /**
   * A field label with the `Use last` control on the right when a previous
   * value is on offer. The label row is the same height either way, so the
   * control never adds vertical space to the form.
   */
  const renderFieldLabel = (field: FieldKey, label: string) => {
    const hint = standardHintFor(field);
    return (
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-text-secondary text-sm">{label}</Text>
        {hint ? (
          <UseLastButton
            accentColor={accentPrimary}
            onPress={() => adoptStandardHint(field, hint)}
            accessibilityLabel={t('measurements.useLastFor', {
              defaultValue: 'Use last {{label}} value',
              label,
            })}
            testID={`use-last-${field}`}
          />
        ) : null}
      </View>
    );
  };

  /** Placeholder for a standard field's input: the suggestion, else the hint-free default. */
  const standardPlaceholder = (field: FieldKey, fallback: string): string =>
    standardHintFor(field)?.display ?? fallback;

  /** Placeholder for the second input of a two-input field. */
  const companionPlaceholder = (field: FieldKey, fallback: string): string =>
    standardHintFor(field)?.companionDisplay ?? fallback;

  const header = useScreenHeader({
    title: t('screens.measurements', { defaultValue: 'Measurements' }),
    left: {
      kind: 'dismiss',
      onPress: handleClose,
      disabled: isDismissDisabled,
    },
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
  const renderCustomCategory = (
    cat: NonNullable<typeof customCategories>[number]
  ) => {
    const label = cat.display_name ?? cat.name;
    const suffix = cat.measurement_type ? ` (${cat.measurement_type})` : '';
    const isBoolean = cat.data_type === 'boolean';
    const isNumeric = cat.data_type === 'numeric' || cat.data_type == null;
    const catForm = customForm[cat.id] ?? { rows: [], deleted: [] };
    const row = catForm.rows[0] ?? null;

    // A previous value for this exact category, offered only while the field is
    // empty and the selected day holds no manual value of its own.
    const previousValue = shouldOfferCustomHint({
      categoryId: cat.id,
      currentValue: row?.value,
      selectedDayValues: selectedDayCustom,
      hints: customHints,
    })
      ? customHints[cat.id]
      : undefined;

    return (
      <View key={cat.id} className="mb-4">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-text-secondary text-sm">
            {label}
            {suffix}
          </Text>
          {previousValue != null ? (
            <UseLastButton
              accentColor={accentPrimary}
              onPress={() => setSingleCustomValue(cat.id, previousValue)}
              accessibilityLabel={t('measurements.useLastFor', {
                defaultValue: 'Use last {{label}} value',
                label,
              })}
              testID={`use-last-custom-${cat.id}`}
            />
          ) : null}
        </View>
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
                placeholder={previousValue ?? (isNumeric ? '0' : '')}
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
              accessibilityLabel={t('measurements.custom.deleteEntry', {
                defaultValue: 'Delete {{label}} entry',
                label,
              })}
              testID={`delete-custom-${row.key}`}
            >
              <Icon name="trash" size={18} color={textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        {isBoolean && previousValue != null ? (
          <Text
            className="text-xs italic mt-1"
            style={{ color: textSecondary }}
          >
            {t('measurements.custom.lastValue', {
              defaultValue: 'Last: {{value}}',
              value:
                previousValue === 'true'
                  ? booleanLabels.yes
                  : previousValue === 'false'
                    ? booleanLabels.no
                    : previousValue,
            })}
          </Text>
        ) : null}
        {row?.entryId != null && row.value.trim() === '' ? (
          <Text
            className="text-xs italic mt-1"
            style={{ color: textSecondary }}
          >
            {t('measurements.willBeCleared', {
              defaultValue: 'Will be cleared',
            })}
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
          <Text className="text-text-primary text-base">
            {t('measurements.date', { defaultValue: 'Date' })}
          </Text>
          <Text className="text-accent-primary text-base font-medium mx-1.5">
            {selectedDate === getTodayDate()
              ? t('date.today', { defaultValue: 'Today' })
              : selectedDate === addDays(getTodayDate(), -1)
                ? t('date.yesterday', { defaultValue: 'Yesterday' })
                : formatDate(
                    selectedDate,
                    i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US'
                  )}
          </Text>
          <Icon
            name="chevron-down"
            size={12}
            color={accentPrimary}
            weight="medium"
          />
        </TouchableOpacity>

        {isLoading || isPreferencesLoading ? (
          <View className="py-12 items-center">
            <ActivityIndicator size="small" color={accentPrimary} />
          </View>
        ) : (
          <>
            <View className="mb-4">
              {renderFieldLabel('weight', weightLabel)}
              {weightMode === 'st_lbs' ? (
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <FormInput
                      value={form.weightStones}
                      onChangeText={(v) => updateField('weightStones', v)}
                      keyboardType="number-pad"
                      placeholder={companionPlaceholder(
                        'weight',
                        t('measurements.units.st', { defaultValue: 'st' })
                      )}
                      accessibilityLabel={t(
                        'measurements.fields.weightStones',
                        { defaultValue: 'Weight in stones' }
                      )}
                      testID="field-weightStones"
                      returnKeyType="done"
                    />
                  </View>
                  <View className="flex-1">
                    <FormInput
                      value={form.weight}
                      onChangeText={(v) => updateField('weight', v)}
                      keyboardType="decimal-pad"
                      placeholder={standardPlaceholder(
                        'weight',
                        t('measurements.units.lb', { defaultValue: 'lb' })
                      )}
                      accessibilityLabel={t(
                        'measurements.fields.weightPounds',
                        { defaultValue: 'Weight in pounds' }
                      )}
                      testID="field-weight"
                      returnKeyType="done"
                    />
                  </View>
                </View>
              ) : (
                <FormInput
                  value={form.weight}
                  onChangeText={(v) => updateField('weight', v)}
                  keyboardType="decimal-pad"
                  placeholder={standardPlaceholder('weight', '0')}
                  accessibilityLabel={t('measurements.fields.weightWithUnit', {
                    defaultValue: 'Weight ({{unit}})',
                    unit: weightMode,
                  })}
                  testID="field-weight"
                  returnKeyType="done"
                />
              )}
              {renderClearHint('weight')}
            </View>

            <View className="mb-4">
              {renderFieldLabel(
                'bodyFatPercentage',
                t('measurements.fields.bodyFatPercentage', {
                  defaultValue: 'Body fat %',
                })
              )}
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <FormInput
                    value={form.bodyFatPercentage}
                    onChangeText={(v) => updateField('bodyFatPercentage', v)}
                    keyboardType="decimal-pad"
                    placeholder={standardPlaceholder('bodyFatPercentage', '0')}
                    accessibilityLabel={t(
                      'measurements.fields.bodyFatPercentage',
                      { defaultValue: 'Body fat %' }
                    )}
                    testID="field-bodyFatPercentage"
                    returnKeyType="done"
                  />
                </View>
                <Button
                  variant="secondary"
                  onPress={handleCalculateBodyFat}
                  className="py-2.5 px-3"
                  accessibilityRole="button"
                  accessibilityLabel={t('measurements.bodyFat.calculate', {
                    defaultValue: 'Calculate',
                  })}
                  testID="calculate-body-fat"
                >
                  <Text className="text-sm font-semibold text-accent-primary">
                    {t('measurements.bodyFat.calculate', {
                      defaultValue: 'Calculate',
                    })}
                  </Text>
                </Button>
              </View>
              <View className="flex-row items-center justify-end gap-2 mt-2">
                <Switch
                  value={useRecentForCalculation}
                  onValueChange={setUseRecentForCalculation}
                  accessibilityLabel={t('measurements.bodyFat.useRecent', {
                    defaultValue: 'Use recent',
                  })}
                />
                <Text className="text-text-secondary text-sm">
                  {t('measurements.bodyFat.useRecent', {
                    defaultValue: 'Use recent',
                  })}
                </Text>
              </View>
              {renderClearHint('bodyFatPercentage')}
            </View>

            <View className="mb-4">
              {renderFieldLabel(
                'height',
                t('measurements.fields.heightWithUnit', {
                  defaultValue: 'Height ({{unit}})',
                  unit: heightSuffix,
                })
              )}
              {heightMode === 'ft_in' ? (
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <FormInput
                      value={form.heightFeet}
                      onChangeText={(v) => updateField('heightFeet', v)}
                      keyboardType="number-pad"
                      placeholder={companionPlaceholder(
                        'height',
                        t('measurements.units.ft', { defaultValue: 'ft' })
                      )}
                      accessibilityLabel={t('measurements.fields.heightFeet', {
                        defaultValue: 'Height in feet',
                      })}
                      testID="field-heightFeet"
                      returnKeyType="done"
                    />
                  </View>
                  <View className="flex-1">
                    <FormInput
                      value={form.height}
                      onChangeText={(v) => updateField('height', v)}
                      keyboardType="decimal-pad"
                      placeholder={standardPlaceholder(
                        'height',
                        t('measurements.units.in', { defaultValue: 'in' })
                      )}
                      accessibilityLabel={t(
                        'measurements.fields.heightInches',
                        { defaultValue: 'Height in inches' }
                      )}
                      testID="field-height"
                      returnKeyType="done"
                    />
                  </View>
                </View>
              ) : (
                <FormInput
                  value={form.height}
                  onChangeText={(v) => updateField('height', v)}
                  keyboardType="decimal-pad"
                  placeholder={standardPlaceholder('height', '0')}
                  accessibilityLabel={t('measurements.fields.heightWithUnit', {
                    defaultValue: 'Height ({{unit}})',
                    unit: heightSuffix,
                  })}
                  testID="field-height"
                  returnKeyType="done"
                />
              )}
              {renderClearHint('height')}
            </View>

            <View className="mb-4">
              {renderFieldLabel(
                'neck',
                t('measurements.fields.neckWithUnit', {
                  defaultValue: 'Neck ({{unit}})',
                  unit: bodySuffix,
                })
              )}
              <FormInput
                value={form.neck}
                onChangeText={(v) => updateField('neck', v)}
                keyboardType="decimal-pad"
                placeholder={standardPlaceholder('neck', '0')}
                accessibilityLabel={t('measurements.fields.neckWithUnit', {
                  defaultValue: 'Neck ({{unit}})',
                  unit: bodySuffix,
                })}
                testID="field-neck"
                returnKeyType="done"
              />
              {renderClearHint('neck')}
            </View>

            <View className="mb-4">
              {renderFieldLabel(
                'waist',
                t('measurements.fields.waistWithUnit', {
                  defaultValue: 'Waist ({{unit}})',
                  unit: bodySuffix,
                })
              )}
              <FormInput
                value={form.waist}
                onChangeText={(v) => updateField('waist', v)}
                keyboardType="decimal-pad"
                placeholder={standardPlaceholder('waist', '0')}
                accessibilityLabel={t('measurements.fields.waistWithUnit', {
                  defaultValue: 'Waist ({{unit}})',
                  unit: bodySuffix,
                })}
                testID="field-waist"
                returnKeyType="done"
              />
              {renderClearHint('waist')}
            </View>

            <View className="mb-4">
              {renderFieldLabel(
                'hips',
                t('measurements.fields.hipsWithUnit', {
                  defaultValue: 'Hips ({{unit}})',
                  unit: bodySuffix,
                })
              )}
              <FormInput
                value={form.hips}
                onChangeText={(v) => updateField('hips', v)}
                keyboardType="decimal-pad"
                placeholder={standardPlaceholder('hips', '0')}
                accessibilityLabel={t('measurements.fields.hipsWithUnit', {
                  defaultValue: 'Hips ({{unit}})',
                  unit: bodySuffix,
                })}
                testID="field-hips"
                returnKeyType="done"
              />
              {renderClearHint('hips')}
            </View>

            <View className="mb-4">
              {renderFieldLabel(
                'steps',
                t('measurements.fields.steps', { defaultValue: 'Steps' })
              )}
              <FormInput
                value={form.steps}
                onChangeText={(v) => updateField('steps', v)}
                keyboardType="number-pad"
                placeholder={standardPlaceholder('steps', '0')}
                accessibilityLabel={t('measurements.fields.steps', {
                  defaultValue: 'Steps',
                })}
                testID="field-steps"
                returnKeyType="done"
              />
              {renderClearHint('steps')}
            </View>

            <View className="mb-4">
              {renderFieldLabel(
                'muscleMassKg',
                t('measurements.fields.muscleMassWithUnit', {
                  defaultValue: 'Muscle mass ({{unit}})',
                  unit: weightMode === 'st_lbs' ? 'kg' : weightMode,
                })
              )}
              <FormInput
                value={form.muscleMassKg}
                onChangeText={(v) => updateField('muscleMassKg', v)}
                keyboardType="decimal-pad"
                placeholder={standardPlaceholder('muscleMassKg', '0')}
                accessibilityLabel={t('measurements.fields.muscleMass', {
                  defaultValue: 'Muscle mass',
                })}
                testID="field-muscleMassKg"
                returnKeyType="done"
              />
              {renderClearHint('muscleMassKg')}
            </View>

            <View className="mb-4">
              {renderFieldLabel(
                'boneMassKg',
                t('measurements.fields.boneMassWithUnit', {
                  defaultValue: 'Bone mass ({{unit}})',
                  unit: weightMode === 'st_lbs' ? 'kg' : weightMode,
                })
              )}
              <FormInput
                value={form.boneMassKg}
                onChangeText={(v) => updateField('boneMassKg', v)}
                keyboardType="decimal-pad"
                placeholder={standardPlaceholder('boneMassKg', '0')}
                accessibilityLabel={t('measurements.fields.boneMass', {
                  defaultValue: 'Bone mass',
                })}
                testID="field-boneMassKg"
                returnKeyType="done"
              />
              {renderClearHint('boneMassKg')}
            </View>

            <View className="mb-4">
              {renderFieldLabel(
                'bodyWaterPercentage',
                t('measurements.fields.bodyWaterPercentage', {
                  defaultValue: 'Body water %',
                })
              )}
              <FormInput
                value={form.bodyWaterPercentage}
                onChangeText={(v) => updateField('bodyWaterPercentage', v)}
                keyboardType="decimal-pad"
                placeholder={standardPlaceholder('bodyWaterPercentage', '0')}
                accessibilityLabel={t(
                  'measurements.fields.bodyWaterPercentage',
                  { defaultValue: 'Body water %' }
                )}
                testID="field-bodyWaterPercentage"
                returnKeyType="done"
              />
              {renderClearHint('bodyWaterPercentage')}
            </View>

            <View className="mb-4">
              {renderFieldLabel(
                'bmr',
                t('measurements.fields.bmrWithUnit', {
                  defaultValue: 'BMR (kcal)',
                })
              )}
              <FormInput
                value={form.bmr}
                onChangeText={(v) => updateField('bmr', v)}
                keyboardType="decimal-pad"
                placeholder={standardPlaceholder('bmr', '0')}
                accessibilityLabel={t('measurements.fields.bmr', {
                  defaultValue: 'BMR',
                })}
                testID="field-bmr"
                returnKeyType="done"
              />
              {renderClearHint('bmr')}
            </View>

            {isCustomDataError ? (
              <View className="mt-4 mb-2 py-6 items-center">
                <Text className="text-text-secondary text-sm text-center mb-3">
                  {t('measurements.custom.loadError', {
                    defaultValue: "Couldn't load custom measurements.",
                  })}
                </Text>
                <Button
                  variant="secondary"
                  onPress={handleRetryCustomData}
                  className="px-6"
                >
                  <Text className="text-text-primary text-sm font-semibold">
                    {t('common.tryAgain', {
                      defaultValue: 'Please try again.',
                    })}
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
                    {t('measurements.custom.title', {
                      defaultValue: 'Custom Measurements',
                    })}
                  </Text>
                  {isCustomHintError ? (
                    // Distinguishes "the previous-value lookup failed" from
                    // "this category has no earlier value", which look the same
                    // otherwise: both leave the input on its empty placeholder.
                    <Text
                      className="text-xs italic mb-3"
                      style={{ color: textSecondary }}
                      testID="custom-hints-unavailable"
                    >
                      {t('measurements.custom.previousUnavailable', {
                        defaultValue:
                          "Couldn't load previous values. Your server may need updating.",
                      })}
                    </Text>
                  ) : null}
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
                        accessibilityLabel={
                          showMoreCategories
                            ? t('measurements.custom.hideCategories', {
                                defaultValue: 'Hide categories ▴',
                              })
                            : t('measurements.custom.moreCategories', {
                                defaultValue: 'More categories ▾',
                              })
                        }
                      >
                        <Text
                          style={{ color: accentPrimary }}
                          className="text-sm font-medium"
                        >
                          {showMoreCategories
                            ? t('measurements.custom.hideCategories', {
                                defaultValue: 'Hide categories ▴',
                              })
                            : t('measurements.custom.moreCategories', {
                                defaultValue: 'More categories ▾',
                              })}
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
