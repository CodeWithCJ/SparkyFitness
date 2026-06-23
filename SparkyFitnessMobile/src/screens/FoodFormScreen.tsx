import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, TouchableOpacity, Platform, Text, Switch } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { CommonActions, StackActions } from '@react-navigation/native';
import { createNativeHeaderTextButtonItem } from '../utils/nativeHeaderItems';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import StepperInput from '../components/StepperInput';
import FormInput from '../components/FormInput';
import Button from '../components/ui/Button';
import FoodForm, { type FoodFormData } from '../components/FoodForm';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { setPendingMealIngredientSelection } from '../services/mealBuilderSelection';
import { useMealTypes, usePreferences } from '../hooks';
import { useSaveFood } from '../hooks/useSaveFood';
import { useAddFoodEntry } from '../hooks/useAddFoodEntry';
import { useCreateFoodVariant, useFoodVariants } from '../hooks/useFoodVariants';
import { getMealTypeLabel } from '../constants/meals';
import { getTodayDate, normalizeDate, formatDateLabel } from '../utils/dateUtils';
import { parseOptional } from '../types/foodInfo';
import {
  createFoodVariant,
  deleteFoodVariant,
  updateFoodVariant,
  updateFood,
  type CreateFoodVariantPayload,
  type UpdateFoodVariantPayload,
} from '../services/api/foodsApi';
import { foodVariantsQueryKey, foodsQueryKey } from '../hooks/queryKeys';
import type { RootStackScreenProps } from '../types/navigation';
import type { FoodInfoItem } from '../types/foodInfo';
import type { FoodVariantDetail } from '../types/foods';
import type {
  EquivalentUnit,
  FoodUnitSelectionResult,
  FoodUnitVariant,
} from '../types/foodUnitVariants';
import {
  buildLocalUnitVariants,
  buildCreateFoodVariantPayload,
  diffSiblingRows,
  formatServingSizeDisplay,
  formatServingUnit,
  groupEquivalentVariants,
  toEquivalentUnit,
} from '../utils/foodDetails';
import { buildMealIngredientDraftFromSavedFood } from '../utils/mealBuilderDraft';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';

type FoodFormScreenProps = RootStackScreenProps<'FoodForm'>;

type CreateFoodParams = Extract<FoodFormScreenProps['route']['params'], { mode: 'create-food' }>;
type AdjustNutritionParams = Extract<FoodFormScreenProps['route']['params'], { mode: 'adjust-entry-nutrition' }>;
type EditFoodParams = Extract<FoodFormScreenProps['route']['params'], { mode: 'edit-food' }>;

const CREATE_FORM_SOURCE_VARIANT_ID = '__create-form-source-variant__';

const BARCODE_REGEX = /^\d{8,14}$/;

const FOOD_VARIANT_FIELDS: (keyof FoodFormData)[] = [
  'servingSize',
  'servingUnit',
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'saturatedFat',
  'transFat',
  'sodium',
  'sugars',
  'potassium',
  'cholesterol',
  'calcium',
  'iron',
  'vitaminA',
  'vitaminC',
];

const FOOD_METADATA_FIELDS: (keyof FoodFormData)[] = ['name', 'brand'];
const NUMERIC_FOOD_FIELDS = new Set<keyof FoodFormData>([
  'servingSize',
  'calories',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'saturatedFat',
  'transFat',
  'sodium',
  'sugars',
  'potassium',
  'cholesterol',
  'calcium',
  'iron',
  'vitaminA',
  'vitaminC',
]);

function isBlankEquivalent(eq: EquivalentUnit): boolean {
  return !eq.serving_unit || eq.serving_size <= 0;
}

function equivalentsDiffer(a: EquivalentUnit[], b: EquivalentUnit[]): boolean {
  const left = a.filter((eq) => !isBlankEquivalent(eq));
  const right = b.filter((eq) => !isBlankEquivalent(eq));
  if (left.length !== right.length) return true;
  for (let i = 0; i < left.length; i++) {
    if ((left[i].id ?? '') !== (right[i].id ?? '')) return true;
    if (Number(left[i].serving_size) !== Number(right[i].serving_size)) return true;
    if ((left[i].serving_unit ?? '') !== (right[i].serving_unit ?? '')) return true;
  }
  return false;
}

function confirmDiscardEquivalents(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Discard unsaved equivalents?',
      'You have unsaved equivalent sizes. Discard them to continue?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Discard', style: 'destructive', onPress: () => resolve(true) },
      ],
      { onDismiss: () => resolve(false) },
    );
  });
}

function confirmVariantOverwrite(unitLabel: string): Promise<'overwrite' | 'new' | 'cancel'> {
  return new Promise((resolve) => {
    Alert.alert(
      'Save nutrition',
      `"${unitLabel}" is already a saved variant. Do you want to update it with these values, or save as a new variant?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'Save as new', onPress: () => resolve('new') },
        { text: 'Update existing', style: 'destructive', onPress: () => resolve('overwrite') },
      ],
      { onDismiss: () => resolve('cancel') },
    );
  });
}

function validateFoodForm(data: FoodFormData): boolean {
  if (!data.name.trim()) {
    Toast.show({ type: 'error', text1: 'Missing name', text2: 'Please enter a food name.' });
    return false;
  }

  if (!parseDecimalInput(data.servingSize)) {
    Toast.show({ type: 'error', text1: 'Invalid serving size', text2: 'Serving size must be greater than zero.' });
    return false;
  }

  return true;
}

function hasFoodFormChanges(
  initialValues: Partial<FoodFormData>,
  data: FoodFormData,
  fields: (keyof FoodFormData)[],
): boolean {
  return fields.some((field) => {
    if (!NUMERIC_FOOD_FIELDS.has(field)) {
      return (initialValues[field] ?? '') !== data[field];
    }

    const initialValue = initialValues[field] ?? '';
    const nextValue = data[field];
    if (initialValue === '' && nextValue === '') {
      return false;
    }
    if (initialValue === '' || nextValue === '') {
      return true;
    }

    return parseDecimalInput(initialValue) !== parseDecimalInput(nextValue);
  });
}

function invalidateFoodCaches(queryClient: QueryClient, foodId: string) {
  void queryClient.invalidateQueries({ queryKey: foodVariantsQueryKey(foodId), refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: foodsQueryKey, refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: ['foodsLibrary'], refetchType: 'all' });
  void queryClient.invalidateQueries({ queryKey: ['foodSearch'], refetchType: 'all' });
}

function updateFoodVariantCache(queryClient: QueryClient, updatedVariant: FoodVariantDetail) {
  queryClient.setQueryData<FoodVariantDetail[] | undefined>(
    foodVariantsQueryKey(updatedVariant.food_id),
    (current) => {
      if (!current) return current;
      return current.map((variant) => (
        variant.id === updatedVariant.id ? updatedVariant : variant
      ));
    },
  );
}

function buildUpdatedFoodInfo(item: FoodInfoItem, data: FoodFormData, variantId: string): FoodInfoItem {
  return {
    ...item,
    name: data.name,
    brand: data.brand || null,
    servingSize: parseDecimalInput(data.servingSize) || item.servingSize,
    servingUnit: data.servingUnit || item.servingUnit,
    calories: parseDecimalInput(data.calories) || 0,
    protein: parseDecimalInput(data.protein) || 0,
    carbs: parseDecimalInput(data.carbs) || 0,
    fat: parseDecimalInput(data.fat) || 0,
    fiber: parseOptional(data.fiber),
    saturatedFat: parseOptional(data.saturatedFat),
    sodium: parseOptional(data.sodium),
    sugars: parseOptional(data.sugars),
    transFat: parseOptional(data.transFat),
    potassium: parseOptional(data.potassium),
    calcium: parseOptional(data.calcium),
    iron: parseOptional(data.iron),
    cholesterol: parseOptional(data.cholesterol),
    vitaminA: parseOptional(data.vitaminA),
    vitaminC: parseOptional(data.vitaminC),
    variantId,
  };
}

function buildVariantFromFormData(
  data: FoodFormData,
  selection?: FoodUnitSelectionResult | null,
): FoodUnitVariant {
  return {
    ...selection?.variant,
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
  };
}

function buildVariantFromInitialValues(
  initialValues?: Partial<FoodFormData>,
  id?: string,
): FoodUnitVariant | null {
  if (!initialValues) {
    return null;
  }

  const servingSize = parseDecimalInput(initialValues.servingSize ?? '');
  const servingUnit = initialValues.servingUnit?.trim();

  if (!servingSize || !servingUnit) {
    return null;
  }

  return {
    id,
    serving_size: servingSize,
    serving_unit: servingUnit,
    calories: parseDecimalInput(initialValues.calories ?? '') || 0,
    protein: parseDecimalInput(initialValues.protein ?? '') || 0,
    carbs: parseDecimalInput(initialValues.carbs ?? '') || 0,
    fat: parseDecimalInput(initialValues.fat ?? '') || 0,
    dietary_fiber: parseOptional(initialValues.fiber ?? ''),
    saturated_fat: parseOptional(initialValues.saturatedFat ?? ''),
    sodium: parseOptional(initialValues.sodium ?? ''),
    sugars: parseOptional(initialValues.sugars ?? ''),
    trans_fat: parseOptional(initialValues.transFat ?? ''),
    potassium: parseOptional(initialValues.potassium ?? ''),
    calcium: parseOptional(initialValues.calcium ?? ''),
    iron: parseOptional(initialValues.iron ?? ''),
    cholesterol: parseOptional(initialValues.cholesterol ?? ''),
    vitamin_a: parseOptional(initialValues.vitaminA ?? ''),
    vitamin_c: parseOptional(initialValues.vitaminC ?? ''),
  };
}

function buildFormValuesFromVariant(
  variant: FoodUnitVariant,
): Partial<FoodFormData> {
  return {
    servingSize: String(variant.serving_size),
    servingUnit: variant.serving_unit,
    calories: String(variant.calories),
    protein: String(variant.protein),
    carbs: String(variant.carbs),
    fat: String(variant.fat),
    fiber: variant.dietary_fiber != null ? String(variant.dietary_fiber) : '',
    saturatedFat:
      variant.saturated_fat != null ? String(variant.saturated_fat) : '',
    transFat: variant.trans_fat != null ? String(variant.trans_fat) : '',
    sodium: variant.sodium != null ? String(variant.sodium) : '',
    sugars: variant.sugars != null ? String(variant.sugars) : '',
    potassium: variant.potassium != null ? String(variant.potassium) : '',
    cholesterol:
      variant.cholesterol != null ? String(variant.cholesterol) : '',
    calcium: variant.calcium != null ? String(variant.calcium) : '',
    iron: variant.iron != null ? String(variant.iron) : '',
    vitaminA: variant.vitamin_a != null ? String(variant.vitamin_a) : '',
    vitaminC: variant.vitamin_c != null ? String(variant.vitamin_c) : '',
  };
}

async function persistFoodEdits({
  queryClient,
  foodId,
  variantId,
  customNutrients,
  data,
  variantInitialValues,
  foodInitialValues,
}: {
  queryClient: QueryClient;
  foodId: string;
  variantId: string;
  customNutrients?: Record<string, string | number> | null;
  data: FoodFormData;
  variantInitialValues: Partial<FoodFormData>;
  foodInitialValues: Partial<FoodFormData>;
}): Promise<boolean> {
  const shouldUpdateVariant = hasFoodFormChanges(
    variantInitialValues,
    data,
    FOOD_VARIANT_FIELDS,
  );
  const shouldUpdateFood = hasFoodFormChanges(
    foodInitialValues,
    data,
    FOOD_METADATA_FIELDS,
  );

  if (!shouldUpdateVariant && !shouldUpdateFood) {
    return false;
  }

  const updates: Promise<unknown>[] = [];

  if (shouldUpdateVariant) {
    updates.push(
      updateFoodVariant(variantId, {
        food_id: foodId,
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
        custom_nutrients: customNutrients || undefined,
      }).then((updatedVariant) => {
        updateFoodVariantCache(queryClient, updatedVariant);
        return updatedVariant;
      }),
    );
  }

  if (shouldUpdateFood) {
    const foodPayload: { name?: string; brand?: string } = {};
    if (data.name !== foodInitialValues.name) foodPayload.name = data.name;
    if (data.brand !== foodInitialValues.brand) foodPayload.brand = data.brand || '';
    updates.push(updateFood(foodId, foodPayload));
  }

  await Promise.all(updates);
  invalidateFoodCaches(queryClient, foodId);
  return true;
}

async function persistFoodMetadataEdits({
  queryClient,
  foodId,
  data,
  initialValues,
}: {
  queryClient: QueryClient;
  foodId: string;
  data: FoodFormData;
  initialValues: Partial<FoodFormData>;
}): Promise<boolean> {
  const shouldUpdateFood = hasFoodFormChanges(initialValues, data, FOOD_METADATA_FIELDS);

  if (!shouldUpdateFood) {
    return false;
  }

  const foodPayload: { name?: string; brand?: string } = {};
  if (data.name !== initialValues.name) foodPayload.name = data.name;
  if (data.brand !== initialValues.brand) foodPayload.brand = data.brand || '';

  await updateFood(foodId, foodPayload);
  invalidateFoodCaches(queryClient, foodId);
  return true;
}

function BarcodeField({
  value,
  onChange,
  onScan,
  textSecondary,
}: {
  value: string;
  onChange: (next: string) => void;
  onScan: () => void;
  textSecondary: string;
}) {
  const trimmed = value.trim();
  const isInvalid = trimmed !== '' && !BARCODE_REGEX.test(trimmed);
  return (
    <View className="bg-surface rounded-xl p-4 gap-2 shadow-sm">
      <Text className="text-text-secondary text-sm font-medium">Barcode</Text>
      <FormInput
        placeholder="012345678905"
        keyboardType="number-pad"
        value={value}
        onChangeText={onChange}
        maxLength={14}
        autoCorrect={false}
        returnKeyType="done"
      />
      {isInvalid ? (
        <Text className="text-sm" style={{ color: '#dc2626' }}>
          Barcode must be 8-14 digits.
        </Text>
      ) : (
        <Text className="text-xs" style={{ color: textSecondary }}>
          Optional. Standard barcodes are 8 to 14 digits.
        </Text>
      )}
      <Button variant="ghost" onPress={onScan} className="self-start py-0 px-0">
        Scan with camera
      </Button>
    </View>
  );
}

function CreateFoodMode({ params, navigation, routeKey }: { params: CreateFoodParams; navigation: FoodFormScreenProps['navigation']; routeKey: string }) {
  const insets = useSafeAreaInsets();
  const [accentColor, textPrimary, textSecondary, formEnabled, formDisabled] = useCSSVariable(['--color-accent-primary', '--color-text-primary', '--color-text-secondary', '--color-form-enabled', '--color-form-disabled']) as [string, string, string, string, string];
  const pickerMode = params.pickerMode ?? 'log-entry';
  const returnDepth = params.returnDepth ?? 1;
  const isMealBuilderMode = pickerMode === 'meal-builder';
  const isLibraryMode = pickerMode === 'library';
  const isLogEntryMode = !isMealBuilderMode && !isLibraryMode;
  const showBarcodeField = !isMealBuilderMode;
  const initialFood = params.initialFood;
  const hasImportedInitialFood = !!initialFood;
  const showAutoScaleNutrition = isMealBuilderMode || hasImportedInitialFood;
  const { preferences } = usePreferences({ enabled: showAutoScaleNutrition });
  const initialAutoScaleNutritionEnabled =
    preferences?.auto_scale_online_imports ?? false;

  const providerType = params.providerType;
  const [barcodeInput, setBarcodeInput] = useState(params.barcode ?? '');
  const { pendingScannedBarcode, scannedBarcodeNonce } = params;

  useEffect(() => {
    if (scannedBarcodeNonce == null || pendingScannedBarcode == null) return;
    setBarcodeInput(pendingScannedBarcode);
    navigation.setParams({
      pendingScannedBarcode: undefined,
      scannedBarcodeNonce: undefined,
    });
  }, [scannedBarcodeNonce, pendingScannedBarcode, navigation]);
  const importedSourceVariant = useMemo(
    () => buildVariantFromInitialValues(initialFood, CREATE_FORM_SOURCE_VARIANT_ID),
    [initialFood],
  );
  const [pendingUnitSelection, setPendingUnitSelection] =
    useState<FoodUnitSelectionResult | null>(() =>
      importedSourceVariant
        ? {
            kind: 'existing',
            variant: importedSourceVariant,
          }
        : null,
    );

  const [equivalentDraft, setEquivalentDraft] = useState<EquivalentUnit[]>([]);
  // Baseline is always empty for a new food — use a stable ref so it doesn't
  // need to be listed as a useEffect dependency.
  const equivalentBaselineRef = useRef<EquivalentUnit[]>([]);
  const isSavingRef = useRef(false);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (isSavingRef.current) return;
      if (!equivalentsDiffer(equivalentDraft, equivalentBaselineRef.current)) return;
      e.preventDefault();
      void confirmDiscardEquivalents().then((ok) => {
        if (ok) navigation.dispatch(e.data.action);
      });
    });
    return unsub;
  }, [navigation, equivalentDraft]);

  const [selectedDate, setSelectedDate] = useState(params.date ?? getTodayDate());
  const calendarRef = useRef<CalendarSheetRef>(null);
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>();
  const effectiveMealId = selectedMealId ?? defaultMealTypeId;
  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);

  const [saveToDatabase, setSaveToDatabase] = useState(true);
  const initialServingSize = parseDecimalInput(initialFood?.servingSize ?? '') || 100;
  const [formServingSize, setFormServingSize] = useState(initialServingSize);
  const [formServingUnit, setFormServingUnit] = useState(initialFood?.servingUnit ?? 'g');
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
    async (selection: FoodUnitSelectionResult): Promise<FoodUnitSelectionResult> => {
      setPendingUnitSelection(selection);
      return selection;
    },
    [],
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
    const next = boundary !== quantity ? boundary : quantity + delta * increment;
    setQuantityText(String(Math.max(minQuantity, next)));
    setQuantityTouched(true);
  };

  const mealPickerOptions = mealTypes.map((mt) => ({ label: getMealTypeLabel(mt.name), value: mt.id }));

  const [customNutrientValues, setCustomNutrientValues] = useState<Record<string, number>>({});

  const { saveFoodAsync, isPending: isSavePending } = useSaveFood();
  // Holds the equivalent-save function for the current submit so onSuccess can
  // fire it after the food+entry are both confirmed, without a separate pre-save.
  const pendingEquivalentSaveRef = useRef<((foodId: string) => void) | null>(null);
  const { addEntry, isPending: isAddPending, invalidateCache } = useAddFoodEntry({
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

  const isSubmitting = isAddPending || isSavePending;

  const handleSubmit = async (data: FoodFormData) => {
    if (!data.name.trim()) {
      Toast.show({ type: 'error', text1: 'Missing name', text2: 'Please enter a food name.' });
      return;
    }
    if (!parseDecimalInput(data.servingSize)) {
      Toast.show({ type: 'error', text1: 'Invalid serving size', text2: 'Serving size must be greater than zero.' });
      return;
    }
    const trimmedBarcode = barcodeInput.trim();
    if (showBarcodeField && trimmedBarcode !== '' && !BARCODE_REGEX.test(trimmedBarcode)) {
      Toast.show({ type: 'error', text1: 'Invalid barcode', text2: 'Barcode must be 8-14 digits.' });
      return;
    }
    const resolvedBarcode = showBarcodeField
      ? trimmedBarcode || null
      : params.barcode ?? null;
    const saveFoodPayload = {
      name: data.name,
      brand: data.brand || null,
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
      is_custom: true,
      is_quick_food: isLogEntryMode ? !saveToDatabase : false,
      is_default: true,
      barcode: resolvedBarcode,
      provider_type: providerType ?? null,
      custom_nutrients: Object.keys(customNutrientValues).length > 0 ? customNutrientValues : undefined,
    };

    const cleanEquivalents = equivalentDraft.filter((eq) => !isBlankEquivalent(eq));

    // Schedules equivalent-variant creation after the food is saved. Fires
    // and forgets ??? navigation has already occurred. Any failures are shown
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
          }),
        ),
      ).catch(() => {
        Toast.show({ type: 'error', text1: 'Some equivalent units could not be saved' });
      });
    };

    if (isMealBuilderMode) {
      try {
        const savedFood = await saveFoodAsync(saveFoodPayload);
        isSavingRef.current = true;
        saveEquivalentsAsync(savedFood.id);
        setPendingMealIngredientSelection({
          ingredient: buildMealIngredientDraftFromSavedFood(
            savedFood,
            parseDecimalInput(data.servingSize) || 0,
            data.servingUnit || 'serving',
          ),
        });
        navigation.dispatch(StackActions.pop(returnDepth));
      } catch {
        // Error toast is handled in the save hook.
      }
      return;
    }

    if (isLibraryMode) {
      try {
        const savedFood = await saveFoodAsync(saveFoodPayload);
        isSavingRef.current = true;
        saveEquivalentsAsync(savedFood.id);
        Toast.show({ type: 'success', text1: 'Food saved' });
        navigation.dispatch(StackActions.pop(returnDepth));
      } catch {
        // Error toast is handled in the save hook.
      }
      return;
    }

    if (!quantity) {
      Toast.show({ type: 'error', text1: 'Invalid amount', text2: 'Amount must be greater than zero.' });
      return;
    }
    if (!effectiveMealId) {
      Toast.show({ type: 'error', text1: 'No meal type', text2: 'No meal types are available. Please check your account settings.' });
      return;
    }

    // Always overwrite the ref so a stale callback from a previous failed
    // attempt can never fire on this retry with the wrong equivalents.
    pendingEquivalentSaveRef.current = cleanEquivalents.length > 0 ? saveEquivalentsAsync : null;
    // isSavingRef is set in onSuccess so it stays false if addEntry fails.
    addEntry({
      saveFoodPayload,
      createEntryPayload: {
        meal_type_id: effectiveMealId,
        quantity,
        unit: data.servingUnit || 'serving',
        entry_date: selectedDate,
      },
    });
  };

  const headerTintColor = String(useCSSVariable('--color-text-primary'));

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;
    const saveLabel = isLibraryMode ? 'Save Food' : 'Save';
    navigation.setOptions({
      unstable_headerLeftItems: () => [
        createNativeHeaderTextButtonItem({
          label: 'Cancel',
          identifier: 'food-create-cancel',
          tintColor: headerTintColor,
          onPress: () => navigation.goBack(),
          disabled: isSubmitting,
        }),
      ],
      unstable_headerRightItems: () => [
        createNativeHeaderTextButtonItem({
          label: saveLabel,
          identifier: 'food-create-save',
          tintColor: headerTintColor,
          onPress: () => { /* submit handled by FoodForm */ },
          disabled: isSubmitting,
          fontWeight: '600',
        }),
      ],
    });
  }, [navigation, headerTintColor, isSubmitting, isLibraryMode]);

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {/* Header */}
      {Platform.OS !== 'ios' && (
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          New Food
        </Text>
      </View>
      )}

      <FoodForm
        onSubmit={(data) => {
          void handleSubmit(data);
        }}
        onServingChange={handleServingChange}
        isSubmitting={isSubmitting}
        initialValues={initialFood}
        submitLabel={isLibraryMode ? 'Save Food' : undefined}
        hideSubmitButton={Platform.OS === 'ios'}
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
              <Text className="text-text-secondary text-base mr-3">Date</Text>
              <Text className="text-text-primary text-base font-medium mx-1.5">
                {formatDateLabel(selectedDate)}
              </Text>
              <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
            </TouchableOpacity>

            {/* Meal */}
            {selectedMealType ? (
              <View className="flex-1 flex-row items-center">
                <Text className="text-text-secondary text-base mx-3">Meal</Text>
                <BottomSheetPicker
                  value={effectiveMealId!}
                  options={mealPickerOptions}
                  onSelect={setSelectedMealId}
                  title="Select Meal"
                  renderTrigger={({ onPress }) => (
                    <TouchableOpacity
                      onPress={onPress}
                      activeOpacity={0.7}
                      className="flex-row items-center"
                    >
                      <Text className="text-text-primary text-base font-medium mx-1.5">
                        {getMealTypeLabel(selectedMealType.name)}
                      </Text>
                      <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
                    </TouchableOpacity>
                  )}
                />
              </View>
            ) : null}
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
              {servings % 1 === 0 ? servings : servings.toFixed(1)} {servings === 1 ? 'serving' : 'servings'}
              {' \u00b7 '}{formatServingSizeDisplay(formServingSize)} {formatServingUnit(formServingUnit)} per serving
            </Text>
          </View>
          {/* Save to Database */}
          <View className="flex-row items-center justify-between">
            <Text className="text-text-secondary text-base">Save to Database</Text>
            <Switch
              value={saveToDatabase}
              onValueChange={setSaveToDatabase}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
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
        <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      ) : null}
    </View>
  );
}

function AdjustNutritionMode({ params, navigation }: { params: AdjustNutritionParams; navigation: FoodFormScreenProps['navigation'] }) {
  const {
    initialValues,
    returnKey,
    foodId,
    variantId,
    customNutrients,
    availableUnitVariants,
    selectedUnitSelection,
  } = params;
  const insets = useSafeAreaInsets();
  const [accentColor, formEnabled, formDisabled] = useCSSVariable(['--color-accent-primary', '--color-form-enabled', '--color-form-disabled']) as [string, string, string];
  const queryClient = useQueryClient();
  const { createVariant } = useCreateFoodVariant();
  const { preferences } = usePreferences();
  const initialAutoScaleNutritionEnabled =
    preferences?.auto_scale_online_imports ?? false;

  const [pendingUnitSelection, setPendingUnitSelection] =
    useState<FoodUnitSelectionResult | null>(selectedUnitSelection ?? null);
  const [currentVariantId, setCurrentVariantId] = useState(variantId);
  // Allow saving a new variant even when no currentVariantId exists yet ???
  // the user may be creating a variant for the first time from an unsaved entry.
  const canUpdateVariant = !!(foodId && customNutrients !== undefined);
  const [updateFoodToggle, setUpdateFoodToggle] = useState(false);
  // Editable custom-nutrient values for this entry, seeded from the entry's
  // snapshot. Mirrors EditFoodMode so the fields populate and edits round-trip.
  const [currentCustomNutrients, setCurrentCustomNutrients] = useState<
    Record<string, string | number> | null | undefined
  >(customNutrients);

  // Equivalent units — only fetched/shown when we have a real saved food.
  const { variants } = useFoodVariants(foodId ?? '', { enabled: !!foodId });
  const groups = useMemo(
    () => groupEquivalentVariants(variants),
    [variants],
  );
  const activeGroup = useMemo(
    () =>
      groups.find(
        (g) =>
          g.base.id === currentVariantId ||
          g.equivalents.some((eq) => eq.id === currentVariantId),
      ),
    [groups, currentVariantId],
  );
  const otherSiblings = useMemo<EquivalentUnit[]>(() => {
    if (!activeGroup) return [];
    const all: EquivalentUnit[] = [
      toEquivalentUnit(activeGroup.base),
      ...activeGroup.equivalents,
    ];
    return all.filter((eq) => eq.id !== currentVariantId);
  }, [activeGroup, currentVariantId]);

  const [equivalentDraft, setEquivalentDraft] = useState<EquivalentUnit[]>([]);
  const [equivalentBaseline, setEquivalentBaseline] = useState<EquivalentUnit[]>([]);

  const seedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const seedKey = `${currentVariantId}|${otherSiblings
      .map((eq) => `${eq.id ?? ''}:${eq.serving_size}:${eq.serving_unit}`)
      .join(',')}`;
    if (seedKeyRef.current === seedKey) return;
    seedKeyRef.current = seedKey;
    setEquivalentDraft(otherSiblings);
    setEquivalentBaseline(otherSiblings);
  }, [currentVariantId, otherSiblings]);

  const isSavingRef = useRef(false);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (isSavingRef.current) return;
      if (!equivalentsDiffer(equivalentDraft, equivalentBaseline)) return;
      e.preventDefault();
      void confirmDiscardEquivalents().then((ok) => {
        if (ok) navigation.dispatch(e.data.action);
      });
    });
    return unsub;
  }, [navigation, equivalentDraft, equivalentBaseline]);

  const buildGroupNutrition = useCallback(
    (
      data: FoodFormData,
      snapshot: FoodVariantDetail | undefined,
    ): Partial<FoodVariantDetail> => ({
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
      polyunsaturated_fat: snapshot?.polyunsaturated_fat,
      monounsaturated_fat: snapshot?.monounsaturated_fat,
      glycemic_index: snapshot?.glycemic_index,
      custom_nutrients: currentCustomNutrients ?? snapshot?.custom_nutrients ?? undefined,
    }),
    [currentCustomNutrients],
  );

  const handleUnitSelectionChange = useCallback(
    async (
      selection: FoodUnitSelectionResult,
    ): Promise<FoodUnitSelectionResult> => {
      if (selection.kind === 'existing') {
        setPendingUnitSelection(selection);
        setCurrentVariantId(selection.variant.id ?? variantId);
        return selection;
      }
      setPendingUnitSelection(selection);
      return selection;
    },
    [variantId],
  );

  const isDraftSelection = pendingUnitSelection?.kind === 'draft';
  // Show equivalents for local foods (canUpdateVariant) and also when navigating
  // from FoodEntryAdd for external foods — equivalents get deferred to onSuccess
  // of addEntry once the food has a real food_id.
  const showEquivalents = canUpdateVariant || params.returnTo === 'FoodEntryAdd';

  const handleSubmit = async (data: FoodFormData) => {
    if (!validateFoodForm(data)) {
      return;
    }

    // If the user wants to save equivalents we need the full variant list to
    // diff sibling rows. Guard the same way EditFoodMode does.
    const draftSelectionEarly =
      pendingUnitSelection?.kind === 'draft' ? pendingUnitSelection : null;
    if (
      updateFoodToggle &&
      canUpdateVariant &&
      !draftSelectionEarly &&
      equivalentsDiffer(equivalentDraft, equivalentBaseline) &&
      !variants
    ) {
      Toast.show({
        type: 'error',
        text1: 'Still loading food details — try again in a moment.',
      });
      return;
    }

    let nextUnitSelection = pendingUnitSelection ?? undefined;
    let nextVariantId = currentVariantId;
    const draftSelection =
      pendingUnitSelection?.kind === 'draft' ? pendingUnitSelection : null;

    // Adjust-entry-nutrition mode: the food entry itself always saves with
    // the chosen unit + nutrition inline (food_entries has inline columns).
    // The food's saved-variants list only gains the new draft variant when
    // the user opts to "save for future use" via updateFoodToggle. Without
    // this gate, every cross-unit estimate (AI or manual) would pollute the
    // user's saved-unit picker even when they didn't ask for it.
    if (draftSelection && foodId && updateFoodToggle) {
      try {
        const createdVariant = await createVariant(
          buildCreateFoodVariantPayload(
            foodId,
            buildVariantFromFormData(data, draftSelection),
          ),
        );
        nextUnitSelection = {
          kind: 'existing',
          variant: createdVariant,
        };
        nextVariantId = createdVariant.id;
        setPendingUnitSelection(nextUnitSelection);
        setCurrentVariantId(createdVariant.id);
      } catch {
        Toast.show({ type: 'error', text1: 'Could not save new unit' });
        return;
      }
    }

    // Snapshot the variant ID before any create inside the toggle block so the
    // equivalent diff can tell whether the variant pre-existed or was just created.
    // equivDiffVariantId tracks which variant the diff should target — it follows
    // "Save as new" creates but stays undefined when the variant was brand-new.
    const variantIdBeforeToggle = nextVariantId;
    let equivDiffVariantId = nextVariantId;

    if (updateFoodToggle && canUpdateVariant) {
      try {
        if (!nextVariantId && foodId) {
          // No saved variant exists for this food yet (e.g. entry was created
          // from an external search that stored nutrition inline). Create a new
          // variant from the current form values so future uses see this unit.
          const createdVariant = await createVariant(
            buildCreateFoodVariantPayload(
              foodId,
              buildVariantFromFormData(data),
            ),
          );
          nextUnitSelection = { kind: 'existing', variant: createdVariant };
          nextVariantId = createdVariant.id;
          setPendingUnitSelection(nextUnitSelection);
          setCurrentVariantId(createdVariant.id);
          // First-ever variant — no existing siblings to diff against, so create
          // draft equivalents directly (same pattern as "Save as new" above).
          const cleanEqFirst = equivalentDraft.filter((eq) => !isBlankEquivalent(eq));
          if (cleanEqFirst.length > 0) {
            const groupNutrFirst = buildGroupNutrition(data, undefined);
            void Promise.all(
              cleanEqFirst.map((eq) =>
                createFoodVariant({
                  food_id: foodId,
                  serving_size: eq.serving_size,
                  serving_unit: eq.serving_unit,
                  ...groupNutrFirst,
                } as CreateFoodVariantPayload),
              ),
            ).catch(() => {
              Toast.show({ type: 'error', text1: 'Some equivalent units could not be saved' });
            }).finally(() => {
              invalidateFoodCaches(queryClient, foodId);
            });
            setEquivalentBaseline(equivalentDraft);
          }
        } else if (draftSelection && foodId) {
          // Variant was created above ??? update name/brand if changed, then
          // warm the cache with the correct nutrition via persistFoodEdits.
          await persistFoodMetadataEdits({
            queryClient,
            foodId,
            data,
            initialValues,
          });
          if (nextVariantId) {
            await persistFoodEdits({
              queryClient,
              foodId,
              variantId: nextVariantId,
              customNutrients: currentCustomNutrients,
              data,
              variantInitialValues: initialValues,
              foodInitialValues: initialValues,
            });
          }
        } else if (nextVariantId) {
          // When the user has an existing saved variant selected and their
          // form values differ from what's stored, ask whether they want to
          // overwrite that variant or save the edited values as a new one.
          const existingSelection =
            pendingUnitSelection?.kind === 'existing' ? pendingUnitSelection : null;
          const variantValues = existingSelection
            ? buildFormValuesFromVariant(existingSelection.variant)
            : null;
          const nutritionChanged = variantValues
            ? hasFoodFormChanges(variantValues, data, FOOD_VARIANT_FIELDS)
            : false;

          let saveVariantId = nextVariantId;
          if (existingSelection && nutritionChanged && foodId) {
            const choice = await confirmVariantOverwrite(
              `${existingSelection.variant.serving_size} ${existingSelection.variant.serving_unit}`,
            );
            if (choice === 'cancel') return;
            if (choice === 'new') {
              try {
                const createdVariant = await createVariant(
                  buildCreateFoodVariantPayload(
                    foodId,
                    buildVariantFromFormData(data, existingSelection),
                  ),
                );
                nextUnitSelection = { kind: 'existing', variant: createdVariant };
                saveVariantId = createdVariant.id;
                equivDiffVariantId = createdVariant.id;
                setPendingUnitSelection(nextUnitSelection);
                setCurrentVariantId(createdVariant.id);
                // New variant has no existing siblings — create draft equivalents
                // directly rather than diffing against a stale snapshot.
                const cleanEq = equivalentDraft.filter((eq) => !isBlankEquivalent(eq));
                if (cleanEq.length > 0) {
                  const groupNutr = buildGroupNutrition(data, undefined);
                  void Promise.all(
                    cleanEq.map((eq) =>
                      createFoodVariant({
                        food_id: foodId,
                        serving_size: eq.serving_size,
                        serving_unit: eq.serving_unit,
                        ...groupNutr,
                      } as CreateFoodVariantPayload),
                    ),
                  ).catch(() => {
                    Toast.show({ type: 'error', text1: 'Some equivalent units could not be saved' });
                  }).finally(() => {
                    invalidateFoodCaches(queryClient, foodId);
                  });
                  setEquivalentBaseline(equivalentDraft);
                }
              } catch {
                Toast.show({ type: 'error', text1: 'Could not save new variant' });
                return;
              }
              // Fall through to persistFoodEdits with the new variant ID so the
              // cache is populated with the correct nutrition values.
            }
          }

          // Check whether the form's serving size/unit matches an existing DB
          // variant. If not, save as new directly — no dialog needed since the
          // user explicitly toggled save ON and the variant doesn't exist yet.
          if (saveVariantId && foodId) {
            const formServingSize = parseDecimalInput(data.servingSize) || 0;
            const formServingUnit = data.servingUnit || 'serving';
            const matchingDbVariant = (variants ?? []).find(
              (v) =>
                Number(v.serving_size) === formServingSize &&
                v.serving_unit === formServingUnit,
            );

            if (!matchingDbVariant) {
              // No DB variant matches these serving values — create a new one.
              const createdVariant = await createVariant(
                buildCreateFoodVariantPayload(
                  foodId,
                  buildVariantFromFormData(data, existingSelection),
                ),
              );
              nextUnitSelection = { kind: 'existing', variant: createdVariant };
              saveVariantId = createdVariant.id;
              equivDiffVariantId = createdVariant.id;
              setPendingUnitSelection(nextUnitSelection);
              setCurrentVariantId(createdVariant.id);
              invalidateFoodCaches(queryClient, foodId);
            } else {
              // Matching variant exists — update it if nutrition changed.
              const dbVariantValues = buildFormValuesFromVariant(matchingDbVariant);
              const saved = await persistFoodEdits({
                queryClient,
                foodId,
                variantId: matchingDbVariant.id,
                customNutrients: currentCustomNutrients,
                data,
                variantInitialValues: dbVariantValues,
                foodInitialValues: initialValues,
              });
              if (!saved) {
                invalidateFoodCaches(queryClient, foodId);
              }
            }
          }
        }

        // Persist any equivalent-unit edits using the same diff approach as
        // EditFoodMode. Only runs when a pre-existing variant is in play —
        // skipped when nextVariantId was just created above (variants snapshot
        // would be stale and diffSiblingRows would duplicate the new variant).
        // Only diff equivalents when the active variant pre-existed in the
        // snapshot. If "Save as new" just created a fresh variant, it isn't in
        // the stale variants list yet — diffing would collapse currentRows to []
        // and duplicate every sibling. Skip it; the user can add equivalents on
        // a subsequent edit once the new variant is persisted and loaded.
        if (
          equivDiffVariantId &&
          equivDiffVariantId === variantIdBeforeToggle &&
          variants &&
          equivalentsDiffer(equivalentDraft, equivalentBaseline)
        ) {
          const activeSnapshot = variants.find((v) => v.id === equivDiffVariantId);
          const groupNutrition = buildGroupNutrition(data, activeSnapshot);

          const activeRow: Partial<FoodVariantDetail> & { id?: string } = {
            id: equivDiffVariantId,
            food_id: foodId,
            serving_size: parseDecimalInput(data.servingSize) || 0,
            serving_unit: data.servingUnit || 'serving',
            ...groupNutrition,
          };

          const cleanEquivalents = equivalentDraft.filter((eq) => !isBlankEquivalent(eq));
          const siblingRows = cleanEquivalents.map((eq) => ({
            id: eq.id,
            food_id: foodId,
            serving_size: eq.serving_size,
            serving_unit: eq.serving_unit,
            ...groupNutrition,
          }));
          const desired = [activeRow, ...siblingRows];

          const diffGroups = groupEquivalentVariants(variants);
          const diffGroup = diffGroups.find(
            (g) =>
              g.base.id === equivDiffVariantId ||
              g.equivalents.some((eq) => eq.id === equivDiffVariantId),
          );
          const activeGroupIds = new Set<string>();
          if (diffGroup) {
            activeGroupIds.add(diffGroup.base.id);
            diffGroup.equivalents.forEach((eq) => {
              if (eq.id) activeGroupIds.add(eq.id);
            });
          }
          const currentRows: FoodVariantDetail[] = variants.filter((v) =>
            activeGroupIds.has(v.id),
          );

          const diff = diffSiblingRows(currentRows, desired);
          const writes: Promise<unknown>[] = [];
          for (const row of diff.creates) {
            writes.push(createFoodVariant(row as CreateFoodVariantPayload));
          }
          for (const row of diff.updates) {
            const { id, ...payload } = row;
            writes.push(updateFoodVariant(id, payload as UpdateFoodVariantPayload));
          }
          for (const delId of diff.deletes) {
            writes.push(deleteFoodVariant(delId));
          }
          if (writes.length > 0) {
            await Promise.all(writes);
            invalidateFoodCaches(queryClient, foodId);
          }
          setEquivalentBaseline(equivalentDraft);
        }
      } catch {
        Toast.show({ type: 'error', text1: 'Could not save nutrition for future use' });
      }
    }

    const cleanEquivalentsForReturn = equivalentDraft.filter((eq) => !isBlankEquivalent(eq));

    isSavingRef.current = true;
    navigation.dispatch({
      ...CommonActions.setParams({
        adjustedValues: data,
        adjustedUnitSelection: nextUnitSelection,
        adjustedCustomNutrients: currentCustomNutrients ?? null,
        // For external foods on the FoodEntryAdd path, return equivalents so
        // FoodEntryAddScreen can persist them after the food is saved.
        pendingEquivalents:
          !canUpdateVariant && params.returnTo === 'FoodEntryAdd' && cleanEquivalentsForReturn.length > 0
            ? cleanEquivalentsForReturn
            : undefined,
      }),
      source: returnKey,
    });
    navigation.goBack();
  };

  const headerTintColor = String(useCSSVariable('--color-text-primary'));
  const submitRequestRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;
    navigation.setOptions({
      unstable_headerLeftItems: () => [
        createNativeHeaderTextButtonItem({
          label: 'Cancel',
          identifier: 'food-adjust-cancel',
          tintColor: headerTintColor,
          onPress: () => navigation.goBack(),
        }),
      ],
      unstable_headerRightItems: () => [
        createNativeHeaderTextButtonItem({
          label: 'Update Values',
          identifier: 'food-adjust-save',
          tintColor: headerTintColor,
          onPress: () => submitRequestRef.current?.(),
          fontWeight: '600',
        }),
      ],
    });
  }, [navigation, headerTintColor]);

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {Platform.OS !== 'ios' && (
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Adjust Nutrition
        </Text>
      </View>
      )}

      <FoodForm
        onSubmit={handleSubmit}
        submitRequestRef={submitRequestRef}
        initialValues={initialValues}
        submitLabel="Update Values"
        hideSubmitButton={Platform.OS === 'ios'}
        showAutoScaleNutrition
        initialAutoScaleNutritionEnabled={initialAutoScaleNutritionEnabled}
        unitSelector={
          availableUnitVariants && availableUnitVariants.length > 0
            ? {
                variants: availableUnitVariants,
                selectedSelection: pendingUnitSelection,
                onUnitSelectionChange: handleUnitSelectionChange,
              }
            : undefined
        }
        equivalents={showEquivalents ? {
          items: equivalentDraft,
          onChange: setEquivalentDraft,
          disabled: isDraftSelection,
        } : undefined}
        customNutrients={currentCustomNutrients}
        onCustomNutrientsChange={setCurrentCustomNutrients}
      >
        {canUpdateVariant && (
          <View className="bg-surface rounded-xl p-4 shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="text-text-secondary text-base">
                Save nutrition for future use
              </Text>
              <Switch
                accessibilityLabel="Save nutrition for future use"
                value={updateFoodToggle}
                onValueChange={setUpdateFoodToggle}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        )}
      </FoodForm>
    </View>
  );
}

function EditFoodMode({ params, navigation }: { params: EditFoodParams; navigation: FoodFormScreenProps['navigation'] }) {
  const { item, initialValues, returnKey, foodId, variantId, customNutrients } = params;
  const insets = useSafeAreaInsets();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createVariant } = useCreateFoodVariant();
  const { variants } = useFoodVariants(foodId, { enabled: true });
  const savedUnitVariants = useMemo(
    () => buildLocalUnitVariants(variants),
    [variants],
  );
  const fallbackVariant = useMemo(
    () => buildVariantFromInitialValues(initialValues, variantId),
    [initialValues, variantId],
  );
  const availableUnitVariants = useMemo(
    () =>
      savedUnitVariants.length > 0
        ? savedUnitVariants
        : fallbackVariant
          ? [fallbackVariant]
          : [],
    [fallbackVariant, savedUnitVariants],
  );
  const [pendingUnitSelection, setPendingUnitSelection] =
    useState<FoodUnitSelectionResult | null>(() =>
      fallbackVariant
        ? {
            kind: 'existing',
            variant: fallbackVariant,
          }
        : null,
    );
  // initialValues (from FoodFormData) doesn't carry source/ai_confidence, so
  // the fallback selection lands without AI provenance. When the server-backed
  // variants resolve, swap in the matching saved variant so the inline AI
  // badge surfaces on first render (not only after switching units and back).
  useEffect(() => {
    if (savedUnitVariants.length === 0) return;
    setPendingUnitSelection((prev) => {
      if (!prev || prev.kind !== 'existing' || !prev.variant.id) return prev;
      const match = savedUnitVariants.find((v) => v.id === prev.variant.id);
      if (!match || match === prev.variant) return prev;
      return { ...prev, variant: match };
    });
  }, [savedUnitVariants]);
  const [currentVariantId, setCurrentVariantId] = useState(variantId);
  const [variantBaselineValues, setVariantBaselineValues] = useState<
    Partial<FoodFormData>
  >(() => {
    if (fallbackVariant) {
      return buildFormValuesFromVariant(fallbackVariant);
    }

    return initialValues;
  });
  const [currentCustomNutrients, setCurrentCustomNutrients] = useState<
    Record<string, string | number> | null | undefined
  >(customNutrients);

  const groups = useMemo(
    () => groupEquivalentVariants(variants),
    [variants],
  );
  const activeGroup = useMemo(
    () =>
      groups.find(
        (g) =>
          g.base.id === currentVariantId ||
          g.equivalents.some((eq) => eq.id === currentVariantId),
      ),
    [groups, currentVariantId],
  );
  const otherSiblings = useMemo<EquivalentUnit[]>(() => {
    if (!activeGroup) return [];
    const all: EquivalentUnit[] = [
      toEquivalentUnit(activeGroup.base),
      ...activeGroup.equivalents,
    ];
    return all.filter((eq) => eq.id !== currentVariantId);
  }, [activeGroup, currentVariantId]);

  const [equivalentDraft, setEquivalentDraft] = useState<EquivalentUnit[]>([]);
  const [equivalentBaseline, setEquivalentBaseline] = useState<EquivalentUnit[]>(
    [],
  );

  const seedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const seedKey = `${currentVariantId}|${otherSiblings
      .map((eq) => `${eq.id ?? ''}:${eq.serving_size}:${eq.serving_unit}`)
      .join(',')}`;
    if (seedKeyRef.current === seedKey) return;
    seedKeyRef.current = seedKey;
    setEquivalentDraft(otherSiblings);
    setEquivalentBaseline(otherSiblings);
  }, [currentVariantId, otherSiblings]);

  const isSavingRef = useRef(false);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (isSavingRef.current) return;
      if (!equivalentsDiffer(equivalentDraft, equivalentBaseline)) return;
      e.preventDefault();
      void confirmDiscardEquivalents().then((ok) => {
        if (ok) navigation.dispatch(e.data.action);
      });
    });
    return unsub;
  }, [navigation, equivalentDraft, equivalentBaseline]);

  const handleUnitSelectionChange = useCallback(
    async (
      selection: FoodUnitSelectionResult,
    ): Promise<FoodUnitSelectionResult> => {
      const isSwappingActive =
        selection.kind === 'existing' &&
        selection.variant.id !== currentVariantId;

      if (
        isSwappingActive &&
        equivalentsDiffer(equivalentDraft, equivalentBaseline)
      ) {
        const confirmed = await confirmDiscardEquivalents();
        if (!confirmed) {
          return pendingUnitSelection ?? selection;
        }
      }

      if (selection.kind === 'existing') {
        setPendingUnitSelection(selection);
        setCurrentVariantId(selection.variant.id ?? variantId);
        setVariantBaselineValues(buildFormValuesFromVariant(selection.variant));
        setCurrentCustomNutrients(selection.variant.custom_nutrients ?? null);
        return selection;
      }
      setPendingUnitSelection(selection);
      return selection;
    },
    [
      variantId,
      currentVariantId,
      equivalentDraft,
      equivalentBaseline,
      pendingUnitSelection,
    ],
  );

  const isDraftSelection = pendingUnitSelection?.kind === 'draft';

  const buildGroupNutrition = useCallback(
    (
      data: FoodFormData,
      snapshot: FoodVariantDetail | undefined,
    ): Partial<FoodVariantDetail> => ({
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
      polyunsaturated_fat: snapshot?.polyunsaturated_fat,
      monounsaturated_fat: snapshot?.monounsaturated_fat,
      glycemic_index: snapshot?.glycemic_index,
      custom_nutrients: currentCustomNutrients ?? snapshot?.custom_nutrients ?? undefined,
    }),
    [currentCustomNutrients],
  );

  const handleSubmit = async (data: FoodFormData) => {
    if (!validateFoodForm(data)) {
      return;
    }

    const draftSelection =
      pendingUnitSelection?.kind === 'draft' ? pendingUnitSelection : null;
    if (!draftSelection && !variants) {
      // Without the current variant list we can't diff sibling rows: the active
      // row would be misclassified as a create and duplicate the existing variant.
      Toast.show({
        type: 'error',
        text1: 'Still loading food details — try again in a moment.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      let nextVariantId = currentVariantId;
      let nextVariantBaselineValues = variantBaselineValues;
      let nextCustomNutrients = currentCustomNutrients;

      const foodPayload: { name?: string; brand?: string } = {};
      if (data.name !== initialValues.name) foodPayload.name = data.name;
      if (data.brand !== initialValues.brand) foodPayload.brand = data.brand || '';
      const hasFoodMetadataChange = Object.keys(foodPayload).length > 0;

      let equivalentChangedCount = 0;

      if (draftSelection) {
        const createdVariant = await createVariant(
          buildCreateFoodVariantPayload(
            foodId,
            buildVariantFromFormData(data, draftSelection),
          ),
        );
        nextVariantId = createdVariant.id;
        setCurrentVariantId(createdVariant.id);
        setPendingUnitSelection({
          kind: 'existing',
          variant: createdVariant,
        });
        nextVariantBaselineValues = buildFormValuesFromVariant(createdVariant);
        nextCustomNutrients = createdVariant.custom_nutrients ?? null;
        setVariantBaselineValues(nextVariantBaselineValues);
        setCurrentCustomNutrients(nextCustomNutrients);

        if (hasFoodMetadataChange) {
          await updateFood(foodId, foodPayload);
        }
        invalidateFoodCaches(queryClient, foodId);
      } else {
        const activeSnapshot = variants?.find((v) => v.id === currentVariantId);
        const groupNutrition = buildGroupNutrition(data, activeSnapshot);

        const activeRow: Partial<FoodVariantDetail> & { id?: string } = {
          id: currentVariantId,
          food_id: foodId,
          serving_size: parseDecimalInput(data.servingSize) || 0,
          serving_unit: data.servingUnit || 'serving',
          ...groupNutrition,
        };

        const cleanEquivalents = equivalentDraft.filter(
          (eq) => !isBlankEquivalent(eq),
        );
        const siblingRows = cleanEquivalents.map((eq) => ({
          id: eq.id,
          food_id: foodId,
          serving_size: eq.serving_size,
          serving_unit: eq.serving_unit,
          ...groupNutrition,
        }));
        const desired = [activeRow, ...siblingRows];

        const activeGroupIds = new Set<string>();
        if (activeGroup) {
          activeGroupIds.add(activeGroup.base.id);
          activeGroup.equivalents.forEach((eq) => {
            if (eq.id) activeGroupIds.add(eq.id);
          });
        }
        const currentRows: FoodVariantDetail[] = (variants ?? []).filter((v) =>
          activeGroupIds.has(v.id),
        );

        // If the active variant's nutrition changed, ask whether to overwrite
        // the existing variant or save as a new one.
        const nutritionChanged = hasFoodFormChanges(
          variantBaselineValues,
          data,
          FOOD_VARIANT_FIELDS,
        );
        if (nutritionChanged && currentVariantId) {
          const activeVariant = variants?.find((v) => v.id === currentVariantId);
          const unitLabel = activeVariant
            ? `${activeVariant.serving_size} ${activeVariant.serving_unit}`
            : data.servingUnit;
          const choice = await confirmVariantOverwrite(unitLabel);
          if (choice === 'cancel') {
            setIsSubmitting(false);
            return;
          }
          if (choice === 'new') {
            const pendingSelection = pendingUnitSelection?.kind === 'existing'
              ? pendingUnitSelection
              : null;
            const createdVariant = await createVariant(
              buildCreateFoodVariantPayload(
                foodId,
                buildVariantFromFormData(data, pendingSelection),
              ),
            );
            nextVariantId = createdVariant.id;
            setCurrentVariantId(createdVariant.id);
            setPendingUnitSelection({ kind: 'existing', variant: createdVariant });
            nextVariantBaselineValues = buildFormValuesFromVariant(createdVariant);
            nextCustomNutrients = createdVariant.custom_nutrients ?? null;
            setVariantBaselineValues(nextVariantBaselineValues);
            setCurrentCustomNutrients(nextCustomNutrients);
            if (hasFoodMetadataChange) {
              await updateFood(foodId, foodPayload);
            }
            invalidateFoodCaches(queryClient, foodId);
            // Skip the diff/overwrite path ??? new variant is already saved.
            setEquivalentBaseline(equivalentDraft);
            Toast.show({ type: 'success', text1: 'Saved as new variant' });
            isSavingRef.current = true;
            navigation.dispatch({
              ...CommonActions.setParams({
                updatedItem: buildUpdatedFoodInfo(item, data, nextVariantId),
                updatedSelectedVariantId: nextVariantId,
              }),
              source: returnKey,
            });
            navigation.goBack();
            return;
          }
          // choice === 'overwrite': fall through to normal diff/update path
        }

        const diff = diffSiblingRows(currentRows, desired);
        equivalentChangedCount =
          diff.creates.length +
          diff.updates.filter((u) => u.id !== currentVariantId).length +
          diff.deletes.length;

        const writes: Promise<unknown>[] = [];

        if (hasFoodMetadataChange) {
          writes.push(updateFood(foodId, foodPayload));
        }

        for (const row of diff.creates) {
          writes.push(
            createFoodVariant(row as CreateFoodVariantPayload),
          );
        }
        for (const row of diff.updates) {
          const { id, ...payload } = row;
          writes.push(
            updateFoodVariant(id, payload as UpdateFoodVariantPayload),
          );
        }
        for (const delId of diff.deletes) {
          writes.push(deleteFoodVariant(delId));
        }

        if (writes.length > 0) {
          await Promise.all(writes);
          invalidateFoodCaches(queryClient, foodId);
        }
      }

      setEquivalentBaseline(equivalentDraft);

      Toast.show({
        type: 'success',
        text1:
          equivalentChangedCount > 0
            ? `Saved · ${equivalentChangedCount} equivalent unit${equivalentChangedCount === 1 ? '' : 's'} updated`
            : 'Saved',
      });

      isSavingRef.current = true;
      navigation.dispatch({
        ...CommonActions.setParams({
          updatedItem: buildUpdatedFoodInfo(item, data, nextVariantId),
          updatedSelectedVariantId: nextVariantId,
        }),
        source: returnKey,
      });

      navigation.goBack();
    } catch {
      Toast.show({ type: 'error', text1: 'Could not update food' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const headerTintColor = String(useCSSVariable('--color-text-primary'));

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;
    navigation.setOptions({
      unstable_headerLeftItems: () => [
        createNativeHeaderTextButtonItem({
          label: 'Cancel',
          identifier: 'food-edit-cancel',
          tintColor: headerTintColor,
          onPress: () => navigation.goBack(),
          disabled: isSubmitting,
        }),
      ],
      unstable_headerRightItems: () => [
        createNativeHeaderTextButtonItem({
          label: 'Save Changes',
          identifier: 'food-edit-save',
          tintColor: headerTintColor,
          onPress: () => { /* submit handled by FoodForm */ },
          disabled: isSubmitting,
          fontWeight: '600',
        }),
      ],
    });
  }, [navigation, headerTintColor, isSubmitting]);

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {Platform.OS !== 'ios' && (
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Edit Food
        </Text>
      </View>
      )}

      <FoodForm
        onSubmit={(data) => {
          void handleSubmit(data);
        }}
        initialValues={initialValues}
        submitLabel="Save Changes"
        isSubmitting={isSubmitting}
        hideSubmitButton={Platform.OS === 'ios'}
        unitSelector={
          availableUnitVariants.length > 0
            ? {
                variants: availableUnitVariants,
                selectedSelection: pendingUnitSelection,
                onUnitSelectionChange: handleUnitSelectionChange,
              }
            : undefined
        }
        equivalents={{
          items: equivalentDraft,
          onChange: setEquivalentDraft,
          disabled: isDraftSelection,
        }}
        customNutrients={currentCustomNutrients}
        onCustomNutrientsChange={setCurrentCustomNutrients}
      />
    </View>
  );
}

const FoodFormScreen: React.FC<FoodFormScreenProps> = ({ route, navigation }) => {
  if (route.params.mode === 'adjust-entry-nutrition') {
    return <AdjustNutritionMode params={route.params} navigation={navigation} />;
  }
  if (route.params.mode === 'edit-food') {
    return <EditFoodMode params={route.params} navigation={navigation} />;
  }
  return <CreateFoodMode params={route.params} navigation={navigation} routeKey={route.key} />;
};

export default FoodFormScreen;
