import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLocalizedNumber } from '../../localization';
import { View, TouchableOpacity, Platform, Text } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { StackActions } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import {
  buildNamedFoodPortion,
  getFoodPortionUnit,
  parseNamedFoodPortion,
  prefillEntryTime,
  userHourMinute,
} from '@workspace/shared';
import Icon from '../../components/Icon';
import StepperInput from '../../components/StepperInput';
import FoodForm, { type FoodFormData } from '../../components/FoodForm';
import FoodImagePicker from '../../components/FoodImagePicker';
import LabelScanSourceBanner from '../../components/LabelScanSourceBanner';
import { useRetryLabelScan } from '../../hooks/useRetryLabelScan';
import { usableFoodImages } from '../../utils/foodImages';
import { splitPickerImages, type PickerImage } from '../../utils/pickerImages';
import BottomSheetPicker from '../../components/BottomSheetPicker';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../../components/CalendarSheet';
import TimeSheet, { type TimeSheetRef } from '../../components/TimeSheet';
import Switch from '../../components/ui/Switch';
import { setPendingMealIngredientSelection } from '../../services/mealBuilderSelection';
import {
  buildMealPlanFoodAssignment,
  setPendingMealPlanSelection,
} from '../../services/mealPlanSelection';
import { useMealTypes, usePreferences } from '../../hooks';
import { useSaveFood } from '../../hooks/useSaveFood';
import {
  resolveSelectedVariant,
  useAddFoodEntry,
} from '../../hooks/useAddFoodEntry';
import { getLocalizedMealLabel } from '../../constants/meals';
import {
  getTodayDate,
  normalizeDate,
  formatDateLabel,
  getDeviceTimezone,
} from '../../utils/dateUtils';
import { formatTimeLabel } from '../../utils/entryTimeDisplay';
import { parseOptional } from '../../types/foodInfo';
import {
  createFoodVariant,
  deleteFoodVariant,
  fetchFoodVariants,
  updateFood,
  updateFoodVariant,
  type UpdateFoodPayload,
} from '../../services/api/foodsApi';
import type { FoodItem } from '../../types/foods';
import {
  saveNamedFoodPortions,
  type EditableFoodPortion,
} from '../../utils/namedFoodPortions';
import type { FoodFormScreenProps } from '../FoodFormScreen';
import type {
  EquivalentUnit,
  FoodUnitSelectionResult,
} from '../../types/foodUnitVariants';
import {
  formatServingSizeDisplay,
  formatServingUnit,
  buildCreateFoodVariantPayload,
  servingVariantKey,
} from '../../utils/foodDetails';
import { buildMealIngredientDraftFromSavedFood } from '../../utils/mealBuilderDraft';
import {
  DECIMAL_INPUT_REGEX,
  parseDecimalInput,
} from '../../utils/numericInput';
import { useNativeIOSHeadersActive } from '../../services/nativeTabBarPreference';
import { useScreenHeader } from '../../hooks/useScreenHeader';
import { setPendingActionTagSelection } from '../../services/actionTagSelection';
import { setPendingContainerLinkSelection } from '../../services/waterContainerLinkSelection';
import { isFoodSelectionMode } from '../../utils/foodPickerMode';
import { BarcodeField, BARCODE_REGEX } from './BarcodeField';
import {
  FOOD_VARIANT_FIELDS,
  hasFoodFormChanges,
  buildVariantFromFormData,
  buildVariantFromInitialValues,
  confirmDiscardEquivalents,
  equivalentsDiffer,
  isBlankEquivalent,
  invalidateFoodCaches,
} from './persistence';

type CreateFoodParams = Extract<
  FoodFormScreenProps['route']['params'],
  { mode: 'create-food' }
>;

const CREATE_FORM_SOURCE_VARIANT_ID = '__create-form-source-variant__';

interface FoodSaveSnapshot {
  data: FoodFormData;
  custom: string;
  images: string;
  barcode: string | null;
  isQuickFood: boolean;
}

export function CreateFoodMode({
  params,
  navigation,
  routeKey,
}: {
  params: CreateFoodParams;
  navigation: FoodFormScreenProps['navigation'];
  routeKey: string;
}) {
  const { t, i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl')
    ? 'pl-PL'
    : 'en-US';
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [textPrimary, textSecondary] = useCSSVariable([
    '--color-text-primary',
    '--color-text-secondary',
  ]) as [string, string];
  const pickerMode = params.pickerMode ?? 'log-entry';
  const returnDepth = params.returnDepth ?? 1;
  const isMealBuilderMode = pickerMode === 'meal-builder';
  const isMealPlanMode = pickerMode === 'meal-plan';
  const isSelectionMode = isFoodSelectionMode(pickerMode);
  const isLibraryMode = pickerMode === 'library';
  const isLogEntryMode = !isSelectionMode && !isLibraryMode;
  const showBarcodeField = !isMealBuilderMode;
  const initialFood = params.initialFood;
  const hasImportedInitialFood = !!initialFood;
  const showAutoScaleNutrition = isSelectionMode || hasImportedInitialFood;
  const { preferences } = usePreferences({
    enabled: showAutoScaleNutrition || isLogEntryMode,
  });
  const initialAutoScaleNutritionEnabled = showAutoScaleNutrition
    ? (preferences?.auto_scale_online_imports ?? false)
    : false;

  const providerType = params.providerType;
  const [barcodeInput, setBarcodeInput] = useState(params.barcode ?? '');
  const { pendingScannedBarcode, scannedBarcodeNonce } = params;

  useEffect(() => {
    if (scannedBarcodeNonce == null || pendingScannedBarcode == null) return;
    // Consume a one-shot navigation param: guarded by the nonce and paired with
    // clearing the param via setParams, so it can't move to a render-time derive.
    setBarcodeInput(pendingScannedBarcode);
    navigation.setParams({
      pendingScannedBarcode: undefined,
      scannedBarcodeNonce: undefined,
    });
  }, [scannedBarcodeNonce, pendingScannedBarcode, navigation]);
  const importedSourceVariant = useMemo(
    () =>
      buildVariantFromInitialValues(initialFood, CREATE_FORM_SOURCE_VARIANT_ID),
    [initialFood]
  );
  const [pendingUnitSelection, setPendingUnitSelection] =
    useState<FoodUnitSelectionResult | null>(() =>
      importedSourceVariant
        ? {
            kind: 'existing',
            variant: importedSourceVariant,
          }
        : null
    );

  const [equivalentDraft, setEquivalentDraft] = useState<EquivalentUnit[]>([]);
  const [portionDraft, setPortionDraft] = useState<EditableFoodPortion[]>([]);
  const [isPortionSaving, setIsPortionSaving] = useState(false);
  const savedFoodRef = useRef<FoodItem | null>(null);
  const savedReferenceVariantIdRef = useRef<string | null>(null);
  const savedRequestRef = useRef<FoodSaveSnapshot | null>(null);
  const pendingFoodSaveSnapshotRef = useRef<FoodSaveSnapshot | null>(null);
  const pendingMetadataKeysRef = useRef(new Set<keyof UpdateFoodPayload>());
  const pendingMetadataImagesRef = useRef(false);
  const pendingReferenceWriteRef = useRef(false);
  const pendingCustomWriteRef = useRef(false);
  const initialVariantIdsRef = useRef<Set<string> | null>(null);
  const attemptedVariantKeysRef = useRef(new Set<string>());
  const queryClient = useQueryClient();
  // Baseline is always empty for a new food — use a stable ref so it doesn't
  // need to be listed as a useEffect dependency.
  const equivalentBaselineRef = useRef<EquivalentUnit[]>([]);
  const isSavingRef = useRef(false);
  // FoodForm assigns its submit handler here; the native header Save invokes it
  // (the body submit button is hidden on the native path).
  const submitRequestRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (isSavingRef.current) return;
      if (!equivalentsDiffer(equivalentDraft, equivalentBaselineRef.current))
        return;
      e.preventDefault();
      void confirmDiscardEquivalents().then((ok) => {
        if (ok) navigation.dispatch(e.data.action);
      });
    });
    return unsub;
  }, [navigation, equivalentDraft]);

  const [selectedDate, setSelectedDate] = useState(
    params.date ?? getTodayDate()
  );
  const calendarRef = useRef<CalendarSheetRef>(null);
  const timeSheetRef = useRef<TimeSheetRef>(null);
  const {
    mealTypes,
    defaultMealTypeId,
    isLoading: isMealTypesLoading,
    isError: isMealTypesError,
  } = useMealTypes();
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>(
    params.mealTypeId
  );
  const effectiveMealId =
    selectedMealId &&
    (isMealTypesLoading || mealTypes.some((mt) => mt.id === selectedMealId))
      ? selectedMealId
      : isMealTypesLoading
        ? undefined
        : (defaultMealTypeId ?? undefined);
  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);

  useEffect(() => {
    if (isMealTypesLoading || isMealTypesError || mealTypes.length === 0)
      return;
    if (selectedMealId && !mealTypes.some((mt) => mt.id === selectedMealId)) {
      setSelectedMealId(defaultMealTypeId ?? undefined);
    }
  }, [
    isMealTypesLoading,
    isMealTypesError,
    mealTypes,
    selectedMealId,
    defaultMealTypeId,
  ]);

  const [entryTime, setEntryTime] = useState(params.entryTime ?? '');
  const entryTimeTouched = useRef(params.entryTime !== undefined);
  useEffect(() => {
    if (entryTimeTouched.current) return;
    setEntryTime(
      prefillEntryTime({
        defaultTime: selectedMealType?.default_time,
        isToday: selectedDate === getTodayDate(),
        tz: getDeviceTimezone(),
      })
    );
  }, [selectedDate, selectedMealType?.default_time]);

  const handleSelectEntryTime = (time: string) => {
    entryTimeTouched.current = true;
    setEntryTime(time);
  };
  const handleSetEntryTimeNow = () => {
    const { hour, minute } = userHourMinute(getDeviceTimezone());
    handleSelectEntryTime(
      `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    );
  };
  const mealTypeLabel = (mealType: (typeof mealTypes)[number]) =>
    mealType.user_id == null
      ? getLocalizedMealLabel(
          t,
          mealType.name.toLowerCase() === 'snack'
            ? 'snacks'
            : mealType.name.toLowerCase()
        )
      : mealType.name;

  const [saveToDatabase, setSaveToDatabase] = useState(true);
  const initialServingSize =
    parseDecimalInput(initialFood?.servingSize ?? '') || 100;
  const [formServingSize, setFormServingSize] = useState(initialServingSize);
  const [formServingUnit, setFormServingUnit] = useState(
    initialFood?.servingUnit ?? 'g'
  );
  const [quantityText, setQuantityText] = useState(String(initialServingSize));
  const [quantityTouched, setQuantityTouched] = useState(false);
  const quantity = parseDecimalInput(quantityText) || 0;
  const servings = formServingSize > 0 ? quantity / formServingSize : 0;

  const handleServingChange = (sizeStr: string, unit: string) => {
    const size = parseDecimalInput(sizeStr) || 0;
    setFormServingSize(size);
    setFormServingUnit(unit);
    if (size > 0 && !quantityTouched) setQuantityText(String(size));
  };

  const handleImportedUnitSelectionChange = useCallback(
    async (
      selection: FoodUnitSelectionResult
    ): Promise<FoodUnitSelectionResult> => {
      setPendingUnitSelection(selection);
      return selection;
    },
    []
  );

  const updateQuantityText = (text: string) => {
    if (DECIMAL_INPUT_REGEX.test(text)) {
      setQuantityText(text);
      setQuantityTouched(true);
    }
  };

  const clampQuantity = () => {
    const step = formServingSize > 0 ? formServingSize : 1;
    const fallbackQuantity = step * 0.5;
    if (quantity <= 0) {
      setQuantityText(String(fallbackQuantity));
    }
  };

  const adjustQuantity = (delta: number) => {
    const step = formServingSize > 0 ? formServingSize : 1;
    const increment = step * 0.5;
    const minQuantity = increment;
    if (quantity < minQuantity) {
      if (delta > 0) {
        setQuantityText(String(minQuantity));
        setQuantityTouched(true);
      }
      return;
    }
    const boundary =
      delta > 0
        ? Math.ceil(quantity / increment) * increment
        : Math.floor(quantity / increment) * increment;
    const next =
      boundary !== quantity ? boundary : quantity + delta * increment;
    setQuantityText(String(Math.max(minQuantity, next)));
    setQuantityTouched(true);
  };

  const mealPickerOptions = mealTypes.map((mt) => ({
    label: mealTypeLabel(mt),
    value: mt.id,
  }));

  const [customNutrientValues, setCustomNutrientValues] = useState<
    Record<string, number>
  >({});

  const [pickerImages, setPickerImages] = useState<PickerImage[]>([]);
  const imageArgs =
    pickerImages.length > 0 ? splitPickerImages(pickerImages) : undefined;

  const { saveFoodAsync, isPending: isSavePending } = useSaveFood();
  // Holds the equivalent-save function for the current submit so onSuccess can
  // fire it after the food+entry are both confirmed, without a separate pre-save.
  const pendingEquivalentSaveRef = useRef<((foodId: string) => void) | null>(
    null
  );

  // Only already-saved photos can be embedded in a note: a staged file exists
  // solely on the device until the food is saved, so it has no path to link to.
  const savedNoteImages = useMemo(
    () =>
      usableFoodImages(
        pickerImages
          .filter((image) => image.kind === 'saved')
          .map((image) => image.path)
      ),
    [pickerImages]
  );
  const {
    addEntry,
    addEntryAsync,
    isPending: isAddPending,
    invalidateCache,
  } = useAddFoodEntry({
    onFoodSaved: (saved) => {
      savedFoodRef.current = saved;
      savedReferenceVariantIdRef.current = null;
      savedRequestRef.current = pendingFoodSaveSnapshotRef.current;
    },
    onSuccess: (entry) => {
      isSavingRef.current = true;
      if (entry.food_id && pendingEquivalentSaveRef.current) {
        pendingEquivalentSaveRef.current(entry.food_id);
        pendingEquivalentSaveRef.current = null;
      }
      invalidateCache(normalizeDate(entry.entry_date));
      navigation.dispatch(StackActions.popToTop());
    },
  });

  const isSubmitting = isAddPending || isSavePending || isPortionSaving;

  const handleSubmit = async (data: FoodFormData) => {
    if (!data.name.trim()) {
      Toast.show({
        type: 'error',
        text1: t('createFood.errors.missingName', {
          defaultValue: 'Missing name',
        }),
        text2: t('createFood.errors.nameRequired', {
          defaultValue: 'Please enter a food name.',
        }),
      });
      return;
    }
    if (!parseDecimalInput(data.servingSize)) {
      Toast.show({
        type: 'error',
        text1: t('createFood.errors.invalidServingSize', {
          defaultValue: 'Invalid serving size',
        }),
        text2: t('createFood.errors.servingSizeRequired', {
          defaultValue: 'Serving size must be greater than zero.',
        }),
      });
      return;
    }
    const metricUnit = getFoodPortionUnit(data.servingUnit);
    if (
      portionDraft.some((portion) => !portion.id && portion.unit !== metricUnit)
    ) {
      Toast.show({
        type: 'error',
        text1: t('foodForm.portions.metricReferenceRequired', {
          defaultValue:
            'Select a gram or milliliter serving that matches your new portions.',
        }),
      });
      return;
    }
    const trimmedBarcode = barcodeInput.trim();
    if (
      showBarcodeField &&
      trimmedBarcode !== '' &&
      !BARCODE_REGEX.test(trimmedBarcode)
    ) {
      Toast.show({
        type: 'error',
        text1: t('createFood.errors.invalidBarcode', {
          defaultValue: 'Invalid barcode',
        }),
        text2: t('createFood.errors.barcodeRequired', {
          defaultValue: 'Barcode must be 8-14 digits.',
        }),
      });
      return;
    }
    const resolvedBarcode = showBarcodeField
      ? trimmedBarcode || null
      : (params.barcode ?? null);
    const saveFoodPayload = {
      name: data.name,
      brand: data.brand || null,
      notes: (data.notes ?? '').trim() || null,
      serving_size: parseDecimalInput(data.servingSize) || 0,
      serving_unit: data.servingUnit || 'serving',
      calories: parseDecimalInput(data.calories) || 0,
      protein: parseDecimalInput(data.protein) || 0,
      carbs: parseDecimalInput(data.carbs) || 0,
      fat: parseDecimalInput(data.fat) || 0,
      dietary_fiber: parseOptional(data.fiber),
      saturated_fat: parseOptional(data.saturatedFat),
      sodium: parseOptional(data.sodium),
      sugars: parseOptional(data.sugars),
      trans_fat: parseOptional(data.transFat),
      potassium: parseOptional(data.potassium),
      calcium: parseOptional(data.calcium),
      iron: parseOptional(data.iron),
      cholesterol: parseOptional(data.cholesterol),
      vitamin_a: parseOptional(data.vitaminA),
      vitamin_c: parseOptional(data.vitaminC),
      caffeine_mg: parseOptional(data.caffeineMg),
      water_ml: parseOptional(data.waterMl),
      alcohol_g: parseOptional(data.alcoholG),
      is_custom: true,
      is_quick_food: isLogEntryMode ? !saveToDatabase : false,
      is_default: true,
      barcode: resolvedBarcode,
      provider_type: providerType ?? null,
      custom_nutrients:
        Object.keys(customNutrientValues).length > 0
          ? customNutrientValues
          : undefined,
    };

    const cleanEquivalents = equivalentDraft.filter(
      (eq) => !isBlankEquivalent(eq)
    );
    const requestSnapshot: FoodSaveSnapshot = {
      data: { ...data },
      custom: JSON.stringify(customNutrientValues),
      images: JSON.stringify(imageArgs ?? null),
      barcode: resolvedBarcode,
      isQuickFood: saveFoodPayload.is_quick_food,
    };

    const saveFoodForForm = async () => {
      if (portionDraft.length === 0 && !savedFoodRef.current) {
        return saveFoodAsync(saveFoodPayload, imageArgs);
      }
      setIsPortionSaving(true);
      try {
        let saved = savedFoodRef.current;
        let source: FoodItem['default_variant'];
        if (!saved) {
          saved = await saveFoodAsync(saveFoodPayload, imageArgs);
          savedFoodRef.current = saved;
          savedRequestRef.current = requestSnapshot;
          source = saved.default_variant;
          savedReferenceVariantIdRef.current = source.id ?? null;
        } else {
          const previous = savedRequestRef.current;
          const persistedRows = await fetchFoodVariants(saved.id);
          const referenceId = savedReferenceVariantIdRef.current;
          const selectedReference = referenceId
            ? persistedRows.find((variant) => variant.id === referenceId)
            : await resolveSelectedVariant(
                saved.id,
                parseDecimalInput(
                  previous?.data.servingSize ?? data.servingSize
                ),
                previous?.data.servingUnit ?? data.servingUnit,
                saved.default_variant
              );
          if (!selectedReference)
            throw new Error('Saved serving could not be confirmed');
          const persistedReference = persistedRows.find(
            (variant) => variant.id === selectedReference.id
          );
          if (!persistedReference)
            throw new Error('Saved serving could not be confirmed');
          source = persistedReference;
          // Keep the row identity even if a unit-changing PUT loses its response.
          savedReferenceVariantIdRef.current = selectedReference.id;
          const metadata: UpdateFoodPayload = {};
          const metadataChanged = (
            key: keyof UpdateFoodPayload,
            changed: boolean
          ) => changed || pendingMetadataKeysRef.current.has(key);
          if (metadataChanged('name', data.name !== previous?.data.name))
            metadata.name = data.name;
          if (metadataChanged('brand', data.brand !== previous?.data.brand))
            metadata.brand = data.brand;
          if (metadataChanged('notes', data.notes !== previous?.data.notes))
            metadata.notes = saveFoodPayload.notes;
          if (metadataChanged('barcode', resolvedBarcode !== previous?.barcode))
            metadata.barcode = resolvedBarcode;
          if (
            metadataChanged(
              'is_quick_food',
              requestSnapshot.isQuickFood !== previous?.isQuickFood
            )
          )
            metadata.is_quick_food = requestSnapshot.isQuickFood;
          const imagesChanged =
            pendingMetadataImagesRef.current ||
            previous?.images !== requestSnapshot.images;
          if (Object.keys(metadata).length > 0 || imagesChanged) {
            // A failed response may still mean the write committed. Retain only
            // attempted fields so a later reversion can restore the user's intent.
            for (const key of Object.keys(
              metadata
            ) as (keyof UpdateFoodPayload)[])
              pendingMetadataKeysRef.current.add(key);
            pendingMetadataImagesRef.current = imagesChanged;
            const updated = await updateFood(
              saved.id,
              metadata,
              imagesChanged ? splitPickerImages(pickerImages) : undefined
            );
            saved = {
              ...saved,
              ...updated,
              default_variant: saved.default_variant,
            };
            savedFoodRef.current = saved;
            savedRequestRef.current = {
              ...requestSnapshot,
              data: {
                ...(previous?.data ?? data),
                name: data.name,
                brand: data.brand,
                notes: data.notes,
              },
              custom: previous?.custom ?? requestSnapshot.custom,
            };
            pendingMetadataKeysRef.current.clear();
            pendingMetadataImagesRef.current = false;
          }
          const customChanged = previous?.custom !== requestSnapshot.custom;
          if (
            source.id &&
            (pendingReferenceWriteRef.current ||
              customChanged ||
              hasFoodFormChanges(
                previous?.data ?? data,
                data,
                FOOD_VARIANT_FIELDS
              ))
          ) {
            const payload = buildCreateFoodVariantPayload(saved.id, {
              ...source,
              ...buildVariantFromFormData(data, pendingUnitSelection),
              custom_nutrients:
                customChanged || pendingCustomWriteRef.current
                  ? customNutrientValues
                  : source.custom_nutrients,
            });
            pendingReferenceWriteRef.current = true;
            pendingCustomWriteRef.current ||= customChanged;
            await updateFoodVariant(source.id, payload);
            pendingReferenceWriteRef.current = false;
            pendingCustomWriteRef.current = false;
            source = { ...source, ...payload };
            if (source.id === saved.default_variant.id) {
              saved = { ...saved, default_variant: source };
            }
          }
          savedFoodRef.current = saved;
          savedRequestRef.current = requestSnapshot;
        }
        const existing = await fetchFoodVariants(saved.id);
        initialVariantIdsRef.current ??= new Set(
          existing.map((variant) => variant.id)
        );
        const variantKey = (size: number, unit: string) =>
          servingVariantKey({ serving_size: size, serving_unit: unit });
        const baselineKeys = new Set(
          existing
            .filter((variant) => initialVariantIdsRef.current?.has(variant.id))
            .map(servingVariantKey)
        );
        // Creation may resolve an existing barcode/provider food. Its saved
        // reference stays authoritative until the user changes this form.
        const desiredNamedKeys = new Set(
          portionDraft.flatMap((portion) => {
            const variant = buildNamedFoodPortion(source, portion);
            return variant ? [servingVariantKey(variant)] : [];
          })
        );
        for (const key of desiredNamedKeys)
          attemptedVariantKeysRef.current.add(key);
        for (const equivalent of cleanEquivalents)
          attemptedVariantKeysRef.current.add(
            variantKey(equivalent.serving_size, equivalent.serving_unit)
          );
        const mayRemove = (variant: {
          id: string;
          serving_size: number;
          serving_unit: string;
        }) =>
          !initialVariantIdsRef.current?.has(variant.id) &&
          attemptedVariantKeysRef.current.has(
            variantKey(variant.serving_size, variant.serving_unit)
          );
        const removedIds = existing
          .filter(
            (variant) =>
              mayRemove(variant) &&
              parseNamedFoodPortion(variant.serving_unit) &&
              !desiredNamedKeys.has(servingVariantKey(variant))
          )
          .map((variant) => variant.id);
        // Reused foods keep their independently saved baseline nutrition.
        const portionsToSave = portionDraft.flatMap((portion) => {
          const variant = buildNamedFoodPortion(source, portion);
          const key = variant ? servingVariantKey(variant) : null;
          if (key && baselineKeys.has(key)) return [];
          const match = key
            ? existing.find((row) => servingVariantKey(row) === key)
            : undefined;
          return [{ ...portion, id: match?.id ?? portion.id }];
        });
        const confirmed = await saveNamedFoodPortions(
          saved.id,
          source,
          portionsToSave,
          removedIds
        );
        // Only equivalents created by this attempt are recalculated on retry.
        for (const equivalent of cleanEquivalents) {
          const match = confirmed.find(
            (variant) =>
              servingVariantKey(variant) === servingVariantKey(equivalent)
          );
          if (match && initialVariantIdsRef.current.has(match.id)) continue;
          const payload = buildCreateFoodVariantPayload(saved.id, {
            ...source,
            serving_size: equivalent.serving_size,
            serving_unit: equivalent.serving_unit,
          });
          if (match) await updateFoodVariant(match.id, payload);
          else await createFoodVariant(payload);
        }
        for (const variant of confirmed) {
          if (
            mayRemove(variant) &&
            variant.id !== saved.default_variant.id &&
            !parseNamedFoodPortion(variant.serving_unit) &&
            !cleanEquivalents.some(
              (equivalent) =>
                servingVariantKey(equivalent) === servingVariantKey(variant)
            )
          )
            await deleteFoodVariant(variant.id);
        }
        const readback = await fetchFoodVariants(saved.id);
        const readbackKeys = new Set(readback.map(servingVariantKey));
        if (
          [...desiredNamedKeys].some((key) => !readbackKeys.has(key)) ||
          cleanEquivalents.some(
            (equivalent) => !readbackKeys.has(servingVariantKey(equivalent))
          )
        )
          throw new Error('Food equivalents could not be confirmed');
        queryClient.setQueryData(['foodVariants', saved.id], readback);
        invalidateFoodCaches(queryClient, saved.id);
        return saved;
      } catch (error) {
        Toast.show({
          type: 'error',
          text1: t('foodForm.portions.saveFailed', {
            defaultValue: 'Could not save all portions. Try saving again.',
          }),
        });
        throw error;
      } finally {
        setIsPortionSaving(false);
      }
    };

    // Schedules equivalent-variant creation after the food is saved. Fires
    // and forgets — navigation has already occurred. Any failures are shown
    // via toast; missing equivalents can be added later via the food detail
    // edit screen (same recovery path as EditFoodMode).
    const saveEquivalentsAsync = (foodId: string) => {
      if (cleanEquivalents.length === 0) return;
      const groupNutrition = buildVariantFromFormData(data);
      void Promise.all(
        cleanEquivalents.map((eq) =>
          createFoodVariant({
            food_id: foodId,
            serving_size: eq.serving_size,
            serving_unit: eq.serving_unit,
            calories: groupNutrition.calories,
            protein: groupNutrition.protein,
            carbs: groupNutrition.carbs,
            fat: groupNutrition.fat,
            dietary_fiber: groupNutrition.dietary_fiber,
            saturated_fat: groupNutrition.saturated_fat,
            sodium: groupNutrition.sodium,
            sugars: groupNutrition.sugars,
            trans_fat: groupNutrition.trans_fat,
            potassium: groupNutrition.potassium,
            calcium: groupNutrition.calcium,
            iron: groupNutrition.iron,
            cholesterol: groupNutrition.cholesterol,
            vitamin_a: groupNutrition.vitamin_a,
            vitamin_c: groupNutrition.vitamin_c,
            caffeine_mg: groupNutrition.caffeine_mg,
            water_ml: groupNutrition.water_ml,
            alcohol_g: groupNutrition.alcohol_g,
          })
        )
      ).catch(() => {
        Toast.show({
          type: 'error',
          text1: t('createFood.errors.equivalentsSaveFailed', {
            defaultValue: 'Some equivalent units could not be saved',
          }),
        });
      });
    };

    if (isSelectionMode) {
      if (isMealPlanMode && !params.mealPlanTarget) {
        Toast.show({
          type: 'error',
          text1: t('createFood.errors.foodSaveFailed', {
            defaultValue: 'Failed to save food',
          }),
          text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
        });
        return;
      }
      try {
        const savedFood = await saveFoodForForm();
        isSavingRef.current = true;
        if (portionDraft.length === 0 && !savedFoodRef.current)
          saveEquivalentsAsync(savedFood.id);
        const ingredient = buildMealIngredientDraftFromSavedFood(
          savedFood,
          parseDecimalInput(data.servingSize) || 0,
          data.servingUnit || 'serving'
        );
        if (pickerMode === 'action-tag') {
          if (ingredient.food_id && ingredient.variant_id) {
            setPendingActionTagSelection({
              kind: 'food',
              foodId: ingredient.food_id,
              variantId: ingredient.variant_id,
              name: ingredient.food_name ?? savedFood.name,
              quantity: ingredient.quantity,
              unit: ingredient.unit,
            });
          }
        } else if (pickerMode === 'container-link') {
          if (ingredient.food_id && ingredient.variant_id) {
            setPendingContainerLinkSelection({
              foodId: ingredient.food_id,
              variantId: ingredient.variant_id,
              foodName: ingredient.food_name ?? savedFood.name,
              quantity: ingredient.quantity,
            });
          }
        } else if (isMealPlanMode && params.mealPlanTarget) {
          setPendingMealPlanSelection({
            ...(params.mealPlanTarget.assignmentIndex === undefined
              ? {}
              : { assignmentIndex: params.mealPlanTarget.assignmentIndex }),
            assignment: buildMealPlanFoodAssignment(
              ingredient,
              params.mealPlanTarget,
              data.servingSize
            ),
          });
        } else {
          setPendingMealIngredientSelection({ ingredient });
        }
        navigation.dispatch(StackActions.pop(returnDepth));
      } catch {
        // Error toast is handled in the save hook.
      }
      return;
    }

    if (isLibraryMode) {
      try {
        const savedFood = await saveFoodForForm();
        isSavingRef.current = true;
        if (portionDraft.length === 0 && !savedFoodRef.current)
          saveEquivalentsAsync(savedFood.id);
        Toast.show({
          type: 'success',
          text1: t('createFood.success.foodSaved', {
            defaultValue: 'Food saved',
          }),
        });
        navigation.dispatch(StackActions.pop(returnDepth));
      } catch {
        // Error toast is handled in the save hook.
      }
      return;
    }

    if (!quantity) {
      Toast.show({
        type: 'error',
        text1: t('createFood.errors.invalidAmount', {
          defaultValue: 'Invalid amount',
        }),
        text2: t('createFood.errors.amountRequired', {
          defaultValue: 'Amount must be greater than zero.',
        }),
      });
      return;
    }
    if (isMealTypesLoading) {
      Toast.show({
        type: 'info',
        text1: t('common.loading', { defaultValue: 'Loading...' }),
        text2: t('createFood.errors.loadingMealTypes', {
          defaultValue:
            'Meal types are still loading. Please try again in a moment.',
        }),
      });
      return;
    }
    if (isMealTypesError && !effectiveMealId) {
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('createFood.errors.mealTypesLoadFailed', {
          defaultValue: 'Failed to load meal types. Please try again.',
        }),
      });
      return;
    }
    if (!effectiveMealId) {
      Toast.show({
        type: 'error',
        text1: t('createFood.errors.noMealType', {
          defaultValue: 'No meal type',
        }),
        text2: t('createFood.errors.noMealTypesAvailable', {
          defaultValue:
            'No meal types are available. Please check your account settings.',
        }),
      });
      return;
    }

    if (portionDraft.length > 0 || savedFoodRef.current) {
      // This path reconciles equivalents before logging instead of on success.
      pendingEquivalentSaveRef.current = null;
      try {
        const saved = await saveFoodForForm();
        await addEntryAsync({
          savedFood: saved,
          saveFoodPayload,
          createEntryPayload: {
            food_id: saved.id,
            variant_id: saved.default_variant.id,
            meal_type_id: effectiveMealId,
            quantity,
            unit: data.servingUnit || 'serving',
            entry_date: selectedDate,
            entry_time: entryTime || null,
          },
        });
      } catch {
        // Keep this form and savedFoodRef for a retry of the same food.
      }
      return;
    }

    // Always overwrite the ref so a stale callback from a previous failed
    // attempt can never fire on this retry with the wrong equivalents.
    pendingEquivalentSaveRef.current =
      cleanEquivalents.length > 0 ? saveEquivalentsAsync : null;
    pendingFoodSaveSnapshotRef.current = requestSnapshot;
    // isSavingRef is set in onSuccess so it stays false if addEntry fails.
    addEntry({
      saveFoodPayload,
      saveFoodImages: imageArgs,
      createEntryPayload: {
        meal_type_id: effectiveMealId,
        quantity,
        unit: data.servingUnit || 'serving',
        entry_date: selectedDate,
        entry_time: entryTime || null,
      },
    });
  };

  // Library mode saves a food record (a form Save); the diary/meal-builder
  // modes commit the food to the diary, so keep the "Add Food" verb there.
  const primaryLabel = isLibraryMode
    ? t('common.save', { defaultValue: 'Save' })
    : t('createFood.actions.addFood', { defaultValue: 'Add Food' });

  const header = useScreenHeader({
    title: t('createFood.title', { defaultValue: 'New Food' }),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      disabled: isSubmitting,
      identifier: 'food-create-cancel',
    },
    right: {
      kind: 'primary',
      label: primaryLabel,
      busyLabel: t('common.saving', { defaultValue: 'Saving…' }),
      busy: isSubmitting,
      disabled: isSubmitting,
      placement: 'native-only',
      onPress: () => submitRequestRef.current?.(),
      identifier: 'food-create-save',
    },
  });

  const {
    canRetry: canRetryLabelScan,
    retry: retryLabelScan,
    retrying: retryingLabelScan,
  } = useRetryLabelScan(params, navigation);

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}

      <FoodForm
        onSubmit={(data) => {
          void handleSubmit(data);
        }}
        onServingChange={handleServingChange}
        submitRequestRef={submitRequestRef}
        isSubmitting={isSubmitting}
        initialValues={initialFood}
        showNotes
        noteImages={savedNoteImages}
        submitLabel={primaryLabel}
        hideSubmitButton={usesNativeHeader}
        headerChildren={
          <View className="mb-4">
            {params.labelScanSource && (
              <LabelScanSourceBanner
                source={params.labelScanSource}
                onRetry={canRetryLabelScan ? retryLabelScan : undefined}
                busy={retryingLabelScan}
              />
            )}
            <FoodImagePicker
              items={pickerImages}
              onItemsChange={setPickerImages}
              disabled={isSubmitting}
            />
          </View>
        }
        showAutoScaleNutrition={showAutoScaleNutrition}
        initialAutoScaleNutritionEnabled={initialAutoScaleNutritionEnabled}
        unitSelector={
          importedSourceVariant
            ? {
                variants: [importedSourceVariant],
                selectedSelection: pendingUnitSelection,
                onUnitSelectionChange: handleImportedUnitSelectionChange,
              }
            : undefined
        }
        equivalents={{ items: equivalentDraft, onChange: setEquivalentDraft }}
        portions={{ items: portionDraft, onChange: setPortionDraft }}
        onCustomNutrientsChange={setCustomNutrientValues}
      >
        {isLogEntryMode ? (
          <View className="gap-4 bg-surface rounded-xl p-4 shadow-sm">
            <View className="flex-row items-start">
              {/* Date */}
              <TouchableOpacity
                onPress={() => calendarRef.current?.present()}
                activeOpacity={0.7}
                className="flex-1 flex-row items-center"
              >
                <Text className="text-text-secondary text-base mr-3">
                  {t('common.date', { defaultValue: 'Date' })}
                </Text>
                <Text className="text-text-primary text-base font-medium mx-1.5">
                  {formatDateLabel(selectedDate, t, dateLocale)}
                </Text>
                <Icon
                  name="chevron-down"
                  size={12}
                  color={textPrimary}
                  weight="medium"
                />
              </TouchableOpacity>

              {/* Meal */}
              {selectedMealType ? (
                <View className="flex-1 flex-row items-center">
                  <Text className="text-text-secondary text-base mx-3">
                    {t('createFood.meal', { defaultValue: 'Meal' })}
                  </Text>
                  <BottomSheetPicker
                    value={effectiveMealId!}
                    options={mealPickerOptions}
                    onSelect={setSelectedMealId}
                    title={t('createFood.selectMeal', {
                      defaultValue: 'Select Meal',
                    })}
                    renderTrigger={({ onPress }) => (
                      <TouchableOpacity
                        onPress={onPress}
                        activeOpacity={0.7}
                        className="flex-row items-center"
                      >
                        <Text className="text-text-primary text-base font-medium mx-1.5">
                          {mealTypeLabel(selectedMealType)}
                        </Text>
                        <Icon
                          name="chevron-down"
                          size={12}
                          color={textPrimary}
                          weight="medium"
                        />
                      </TouchableOpacity>
                    )}
                  />
                </View>
              ) : null}
            </View>

            {/* Time */}
            <View className="flex-row items-center">
              <TouchableOpacity
                onPress={() => timeSheetRef.current?.present()}
                activeOpacity={0.7}
                className="flex-row items-center"
              >
                <Text className="text-text-secondary text-base">
                  {t('foodEntryAdd.labels.time', { defaultValue: 'Time' })}
                </Text>
                <Text className="text-text-primary text-base font-medium mx-1.5">
                  {formatTimeLabel(entryTime, preferences?.time_format) ??
                    t('foodEntryAdd.labels.none', { defaultValue: 'None' })}
                </Text>
                <Icon
                  name="chevron-down"
                  size={12}
                  color={textPrimary}
                  weight="medium"
                />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                className="flex-row items-center mx-4"
                onPress={handleSetEntryTimeNow}
              >
                <Text className="text-text-link text-sm font-medium mx-1.5">
                  {t('foodEntryAdd.actions.now', { defaultValue: 'Now' })}
                </Text>
              </TouchableOpacity>

              {entryTime !== '' && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  className="flex-row items-center"
                  onPress={() => handleSelectEntryTime('')}
                >
                  <Text className="text-text-link text-sm font-medium mx-1.5">
                    {t('foodEntryAdd.actions.clear', { defaultValue: 'Clear' })}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {/* Amount */}
            <View>
              <View className="flex-row items-center">
                <StepperInput
                  value={quantityText}
                  onChangeText={updateQuantityText}
                  onBlur={clampQuantity}
                  onDecrement={() => adjustQuantity(-1)}
                  onIncrement={() => adjustQuantity(1)}
                />
                <Text className="text-text-primary text-base font-medium ml-2">
                  {formServingUnit}
                </Text>
              </View>
              <Text className="text-text-secondary text-sm mt-2">
                {t('foodEntryAdd.labels.mealMakes', {
                  defaultValue: 'meal makes {{formattedCount}} servings',
                  defaultValue_one: 'meal makes {{formattedCount}} serving',
                  defaultValue_other: 'meal makes {{formattedCount}} servings',
                  count: servings,
                  formattedCount: formatLocalizedNumber(servings, {
                    maximumFractionDigits: 1,
                  }),
                })}
                {' \u00b7 '}
                {formatServingSizeDisplay(formServingSize)}{' '}
                {formatServingUnit(formServingUnit)}{' '}
                {t('foodEntryAdd.labels.perServing', {
                  defaultValue: 'per serving',
                })}
              </Text>
            </View>
            {/* Save to Database */}
            <View className="flex-row items-center justify-between">
              <Text className="text-text-secondary text-base">
                {t('createFood.saveToDatabase', {
                  defaultValue: 'Save to Database',
                })}
              </Text>
              <Switch
                accessibilityLabel={t('createFood.saveToDatabase', {
                  defaultValue: 'Save to Database',
                })}
                value={saveToDatabase}
                onValueChange={setSaveToDatabase}
              />
            </View>
          </View>
        ) : null}
        {showBarcodeField ? (
          <BarcodeField
            value={barcodeInput}
            onChange={setBarcodeInput}
            onScan={() =>
              navigation.navigate('FoodScan', {
                mode: 'capture-barcode',
                returnKey: routeKey,
              })
            }
            textSecondary={textSecondary}
          />
        ) : null}
      </FoodForm>

      {isLogEntryMode ? (
        <>
          <CalendarSheet
            ref={calendarRef}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <TimeSheet
            ref={timeSheetRef}
            value={entryTime}
            onSelectTime={handleSelectEntryTime}
          />
        </>
      ) : null}
    </View>
  );
}
