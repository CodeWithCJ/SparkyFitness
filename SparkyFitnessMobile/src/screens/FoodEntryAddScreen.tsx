import React, { useState, useRef, useMemo, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import Toast from 'react-native-toast-message';
import Button from '../components/ui/Button';
import { StackActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useQuery } from '@tanstack/react-query';
import Icon from '../components/Icon';
import StepperInput from '../components/StepperInput';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FoodNutritionSummary from '../components/FoodNutritionSummary';
import { fetchDailyGoals } from '../services/api/goalsApi';
import { setPendingMealIngredientSelection } from '../services/mealBuilderSelection';
import { CreateFoodEntryPayload } from '../services/api/foodEntriesApi';
import { getTodayDate, formatDateLabel } from '../utils/dateUtils';
import { getMealTypeLabel } from '../constants/meals';
import { goalsQueryKey } from '../hooks/queryKeys';
import { useMealTypes, usePreferences, useServerConnection } from '../hooks';
import { getNetCarbsValue } from '../utils/nutrientUtils';
import {
  useCreateFoodVariant,
  useFoodVariants,
} from '../hooks/useFoodVariants';
import { useSaveFood } from '../hooks/useSaveFood';
import { useAddFoodEntry } from '../hooks/useAddFoodEntry';
import { useAddFoodEntryMeal } from '../hooks/useAddFoodEntryMeal';
import type { FoodEntryMealCreateData } from '../types/foodEntryMeals';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import type { FoodFormData } from '../components/FoodForm';
import type { MealIngredientDraft } from '../types/meals';
import type {
  EquivalentUnit,
  FoodUnitSelectionResult,
  FoodUnitVariant,
} from '../types/foodUnitVariants';
import {
  createFoodVariant,
  type CreateFoodVariantPayload,
} from '../services/api/foodsApi';
import {
  createNativeHeaderTextButtonItem,
} from '../utils/nativeHeaderItems';
import {
  type FoodInfoItem,
  foodItemToFoodInfo,
  toFormString,
  parseOptional,
} from '../types/foodInfo';
import type { RootStackScreenProps } from '../types/navigation';
import {
  buildCreateFoodVariantInput,
  buildCreateFoodVariantPayload,
  buildExternalUnitVariants,
  buildExternalVariantOptions,
  buildLocalUnitVariants,
  buildLocalVariantOptions,
  foodInfoToUnitVariant,
  formatServingDescription,
  formatServingUnit,
  formatVariantLabel,
  resolveFoodDisplayValues,
  unitVariantToDisplayValues,
  type FoodDisplayValues,
} from '../utils/foodDetails';
import { buildMealIngredientDraft } from '../utils/mealBuilderDraft';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';

type FoodEntryAddScreenProps = RootStackScreenProps<'FoodEntryAdd'>;
const EXTERNAL_DRAFT_VARIANT_ID = '__draft-external-unit__';
// Sentinel written by FoodForm for AI-converted draft units; never a real DB ID.
const FORM_DRAFT_UNIT_ID = '__food-form-draft-unit__';
const NUTRITION_FIELDS = [
  'fiber',
  'saturatedFat',
  'sodium',
  'sugars',
  'transFat',
  'potassium',
  'calcium',
  'iron',
  'cholesterol',
  'vitaminA',
  'vitaminC',
] as const;

function toFiniteNumber(value: unknown, fallback: number): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function toOptionalFiniteNumber(
  value: unknown,
  fallback: number | undefined,
): number | undefined {
  if (value == null || value === '') {
    return fallback;
  }

  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function toNonEmptyString(value: unknown, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : fallback;
}

function mergeVariantDisplayValues(
  variant: Partial<FoodUnitVariant> | null | undefined,
  fallback: FoodDisplayValues,
): FoodDisplayValues {
  const mergedValues: FoodDisplayValues = {
    servingSize: toFiniteNumber(variant?.serving_size, fallback.servingSize),
    servingUnit: toNonEmptyString(variant?.serving_unit, fallback.servingUnit),
    calories: toFiniteNumber(variant?.calories, fallback.calories),
    protein: toFiniteNumber(variant?.protein, fallback.protein),
    carbs: toFiniteNumber(variant?.carbs, fallback.carbs),
    fat: toFiniteNumber(variant?.fat, fallback.fat),
  };

  for (const field of NUTRITION_FIELDS) {
    const variantFieldKey =
      field === 'fiber'
        ? 'dietary_fiber'
        : field === 'saturatedFat'
          ? 'saturated_fat'
          : field === 'transFat'
            ? 'trans_fat'
            : field === 'vitaminA'
              ? 'vitamin_a'
              : field === 'vitaminC'
                ? 'vitamin_c'
                : field;

    mergedValues[field] = toOptionalFiniteNumber(
      variant?.[variantFieldKey as keyof FoodUnitVariant],
      fallback[field],
    );
  }

  return mergedValues;
}

const FoodEntryAddScreen: React.FC<FoodEntryAddScreenProps> = ({
  navigation,
  route,
}) => {
  const { item, date: initialDate } = route.params;
  const pickerMode = route.params?.pickerMode ?? 'log-entry';
  const returnDepth = route.params?.returnDepth ?? 1;
  const ingredientIndex = route.params?.ingredientIndex;
  const isMealBuilderMode = pickerMode === 'meal-builder';
  const [selectedDate, setSelectedDate] = useState(
    initialDate ?? getTodayDate(),
  );
  const calendarRef = useRef<CalendarSheetRef>(null);
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const { isConnected } = useServerConnection();
  const { preferences } = usePreferences({ enabled: isConnected });
  const showNetCarbs = preferences?.show_net_carbs === true;
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>();
  // When editing an existing meal ingredient, pre-populate adjustedValues from
  // the ingredient's stored nutrition snapshot so the form shows the actual
  // saved values, not the API variant which may differ.
  const [adjustedValues, setAdjustedValues] = useState<FoodFormData | null>(() => {
    if (ingredientIndex === undefined) return null;
    return {
      name: item.name,
      brand: item.brand ?? '',
      servingSize: item.servingSize != null ? String(item.servingSize) : '',
      servingUnit: item.servingUnit,
      calories: item.calories != null ? String(item.calories) : '',
      protein: item.protein != null ? String(item.protein) : '',
      carbs: item.carbs != null ? String(item.carbs) : '',
      fat: item.fat != null ? String(item.fat) : '',
      fiber: toFormString(item.fiber),
      saturatedFat: toFormString(item.saturatedFat),
      transFat: toFormString(item.transFat),
      sodium: toFormString(item.sodium),
      sugars: toFormString(item.sugars),
      potassium: toFormString(item.potassium),
      cholesterol: toFormString(item.cholesterol),
      calcium: toFormString(item.calcium),
      iron: toFormString(item.iron),
      vitaminA: toFormString(item.vitaminA),
      vitaminC: toFormString(item.vitaminC),
    };
  });
  // Custom-nutrient overrides returned from the adjust screen. `undefined`
  // means "not adjusted" (fall back to the variant/item snapshot).
  const [adjustedCustomNutrients, setAdjustedCustomNutrients] = useState<
    Record<string, string | number> | null | undefined
  >(undefined);
  const [savedFoodOverride, setSavedFoodOverride] =
    useState<FoodInfoItem | null>(null);
  const [selectedVariantOverride, setSelectedVariantOverride] =
    useState<FoodUnitVariant | null>(route.params?.selectedVariantOverride ?? null);
  const activeItem = savedFoodOverride ?? item;
  const effectiveMealId = selectedMealId ?? defaultMealTypeId;
  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);

  const isLocalFood = activeItem.source === 'local';
  const hasExternalVariants = !!(
    activeItem.externalVariants && activeItem.externalVariants.length >= 1
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    hasExternalVariants ? item.variantId ?? 'ext-0' : item.variantId,
  );

  const { variants } = useFoodVariants(activeItem.id, { enabled: isLocalFood });
  const { createVariant, isPending: isCreateVariantPending } =
    useCreateFoodVariant();

  const localVariantOptions = useMemo(
    () => buildLocalVariantOptions(variants),
    [variants],
  );
  const localUnitVariants = useMemo(
    () => buildLocalUnitVariants(variants),
    [variants],
  );
  const externalVariantOptions = useMemo(
    () => buildExternalVariantOptions(activeItem.externalVariants),
    [activeItem.externalVariants],
  );
  const externalUnitVariants = useMemo(
    () => buildExternalUnitVariants(activeItem.externalVariants),
    [activeItem.externalVariants],
  );
  const activeItemVariant = useMemo(
    () => foodInfoToUnitVariant(activeItem),
    [activeItem],
  );

  const selectorVariants = useMemo(() => {
    if (isLocalFood) {
      const currentVariant =
        selectedVariantId &&
        !localUnitVariants.some((variant) => variant.id === selectedVariantId)
          ? {
              ...activeItemVariant,
              id: selectedVariantId,
            }
          : null;
      const loadedVariants =
        selectedVariantOverride?.id &&
        !localUnitVariants.some((variant) => variant.id === selectedVariantOverride.id)
          ? [selectedVariantOverride, ...localUnitVariants]
          : currentVariant
            ? [currentVariant, ...localUnitVariants]
          : localUnitVariants;

      return loadedVariants.length > 0
        ? loadedVariants
        : [activeItemVariant];
    }

    const loadedVariants =
      selectedVariantOverride &&
      !externalUnitVariants.some((variant) => variant.id === selectedVariantOverride.id)
        ? [selectedVariantOverride, ...externalUnitVariants]
        : externalUnitVariants;

    return loadedVariants.length > 0
      ? loadedVariants
      : [activeItemVariant];
  }, [
    activeItemVariant,
    externalUnitVariants,
    isLocalFood,
    localUnitVariants,
    selectedVariantId,
    selectedVariantOverride,
  ]);

  const variantPickerOptions = useMemo(() => {
    const baseOptions = isLocalFood ? localVariantOptions : externalVariantOptions;
    if (
      selectedVariantId &&
      !baseOptions.some((variant) => variant.id === selectedVariantId)
    ) {
      const fallbackVariant: FoodDisplayValues =
        selectedVariantOverride && selectedVariantOverride.id === selectedVariantId
          ? unitVariantToDisplayValues(selectedVariantOverride)
          : unitVariantToDisplayValues(activeItemVariant);

      return [
        {
          id: selectedVariantId,
          label: formatVariantLabel(fallbackVariant),
          ...fallbackVariant,
        },
        ...baseOptions,
      ];
    }

    if (
      !selectedVariantOverride?.id ||
      selectedVariantOverride.id === EXTERNAL_DRAFT_VARIANT_ID
    ) {
      return baseOptions;
    }

    if (baseOptions.some((variant) => variant.id === selectedVariantOverride.id)) {
      return baseOptions;
    }

    return [
      {
        id: selectedVariantOverride.id,
        label: formatVariantLabel(
          unitVariantToDisplayValues(selectedVariantOverride),
        ),
        ...unitVariantToDisplayValues(selectedVariantOverride),
      },
      ...baseOptions,
    ];
  }, [
    activeItemVariant,
    externalVariantOptions,
    isLocalFood,
    localVariantOptions,
    selectedVariantId,
    selectedVariantOverride,
  ]);

  const selectedUnitSelection = useMemo<FoodUnitSelectionResult | undefined>(() => {
    if (selectedVariantOverride) {
      return {
        kind:
          !selectedVariantOverride.id ||
          selectedVariantOverride.id === EXTERNAL_DRAFT_VARIANT_ID ||
          selectedVariantOverride.id === FORM_DRAFT_UNIT_ID
            ? 'draft'
            : 'existing',
        variant: selectedVariantOverride,
      };
    }

    const selectedVariant =
      selectorVariants.find((variant) => variant.id === selectedVariantId) ?? null;
    return selectedVariant
      ? { kind: 'existing', variant: selectedVariant }
      : undefined;
  }, [selectedVariantId, selectedVariantOverride, selectorVariants]);

  const selectedBaseVariant = useMemo(
    () =>
      resolveFoodDisplayValues({
        item: activeItem,
        selectedVariantId,
        localVariantOptions,
        externalVariantOptions,
      }),
    [activeItem, selectedVariantId, localVariantOptions, externalVariantOptions],
  );

  const activeVariant = useMemo(
    () =>
      selectedVariantOverride
        ? unitVariantToDisplayValues(selectedVariantOverride)
        : selectedBaseVariant,
    [selectedBaseVariant, selectedVariantOverride],
  );

  const selectedCustomNutrients = useMemo(() => {
    // Edits from the adjust screen take priority over the stored snapshot.
    if (adjustedCustomNutrients !== undefined) {
      return adjustedCustomNutrients;
    }

    if (selectedVariantOverride) {
      return selectedVariantOverride.custom_nutrients ?? null;
    }

    if (isLocalFood && variants && selectedVariantId) {
      const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
      if (selectedVariant) {
        return selectedVariant.custom_nutrients ?? null;
      }
    }

    if ((selectedVariantId ?? null) === (activeItem.variantId ?? null)) {
      return activeItem.customNutrients ?? null;
    }

    return undefined;
  }, [
    adjustedCustomNutrients,
    activeItem.customNutrients,
    activeItem.variantId,
    isLocalFood,
    selectedVariantId,
    selectedVariantOverride,
    variants,
  ]);

  const displayValues = useMemo(() => {
    if (!adjustedValues) return activeVariant;
    return {
      servingSize:
        parseDecimalInput(adjustedValues.servingSize) || activeVariant.servingSize,
      servingUnit: adjustedValues.servingUnit || activeVariant.servingUnit,
      calories: parseDecimalInput(adjustedValues.calories) || 0,
      protein: parseDecimalInput(adjustedValues.protein) || 0,
      carbs: parseDecimalInput(adjustedValues.carbs) || 0,
      fat: parseDecimalInput(adjustedValues.fat) || 0,
      fiber: parseOptional(adjustedValues.fiber),
      saturatedFat: parseOptional(adjustedValues.saturatedFat),
      sodium: parseOptional(adjustedValues.sodium),
      sugars: parseOptional(adjustedValues.sugars),
      transFat: parseOptional(adjustedValues.transFat),
      potassium: parseOptional(adjustedValues.potassium),
      calcium: parseOptional(adjustedValues.calcium),
      iron: parseOptional(adjustedValues.iron),
      cholesterol: parseOptional(adjustedValues.cholesterol),
      vitaminA: parseOptional(adjustedValues.vitaminA),
      vitaminC: parseOptional(adjustedValues.vitaminC),
    };
  }, [adjustedValues, activeVariant]);

  const pendingVariantToPersist = useMemo<FoodUnitVariant | null>(() => {
    if (!selectedVariantOverride) return null;

    return {
      ...selectedVariantOverride,
      serving_size: displayValues.servingSize,
      serving_unit: displayValues.servingUnit,
      calories: displayValues.calories,
      protein: displayValues.protein,
      carbs: displayValues.carbs,
      fat: displayValues.fat,
      saturated_fat: displayValues.saturatedFat,
      trans_fat: displayValues.transFat,
      cholesterol: displayValues.cholesterol,
      sodium: displayValues.sodium,
      potassium: displayValues.potassium,
      dietary_fiber: displayValues.fiber,
      sugars: displayValues.sugars,
      vitamin_a: displayValues.vitaminA,
      vitamin_c: displayValues.vitaminC,
      calcium: displayValues.calcium,
      iron: displayValues.iron,
    };
  }, [displayValues, selectedVariantOverride]);

  const saveFoodSourceValues = useMemo(() => {
    if (activeItem.source === 'external' && pendingVariantToPersist) {
      return selectedBaseVariant;
    }
    return displayValues;
  }, [
    activeItem.source,
    displayValues,
    pendingVariantToPersist,
    selectedBaseVariant,
  ]);

  const initialQuantity = useMemo(() => {
    if (
      activeItem.source === 'local' &&
      'quantity' in activeItem.originalItem &&
      activeItem.originalItem.quantity != null
    ) {
      const originalQuantity = parseDecimalInput(
        String(activeItem.originalItem.quantity),
      );
      if (originalQuantity && originalQuantity > 0) {
        return originalQuantity;
      }
    }
    return activeVariant.servingSize;
  }, [activeItem, activeVariant.servingSize]);

  const [quantityText, setQuantityText] = useState(String(initialQuantity));
  const quantity = parseDecimalInput(quantityText) || 0;
  const servings =
    displayValues.servingSize > 0 ? quantity / displayValues.servingSize : 0;
  const servingSizeRef = useRef(displayValues.servingSize);
  const pendingEquivalentsRef = useRef<EquivalentUnit[] | null>(null);

  const adjustedFromNav = route.params?.adjustedValues;
  const adjustedUnitSelectionFromNav = route.params?.adjustedUnitSelection;
  const adjustedCustomNutrientsFromNav = route.params?.adjustedCustomNutrients;
  const pendingEquivalentsFromNav = route.params?.pendingEquivalents;
  useEffect(() => {
    servingSizeRef.current = displayValues.servingSize;
  }, [displayValues.servingSize]);

  useEffect(() => {
    if (
      !adjustedFromNav &&
      !adjustedUnitSelectionFromNav &&
      adjustedCustomNutrientsFromNav === undefined
    ) {
      return;
    }

    const previousServingSize = servingSizeRef.current;
    const nextServingSize =
      parseDecimalInput(adjustedFromNav?.servingSize ?? '') ||
      adjustedUnitSelectionFromNav?.variant.serving_size ||
      previousServingSize;

    if (adjustedUnitSelectionFromNav) {
      if (adjustedUnitSelectionFromNav.kind === 'draft') {
        const draftVariant = {
          ...adjustedUnitSelectionFromNav.variant,
          id:
            adjustedUnitSelectionFromNav.variant.id ?? EXTERNAL_DRAFT_VARIANT_ID,
        };
        setSelectedVariantOverride(draftVariant);
        // selectedUnitSelection prefers selectedVariantOverride for UI/re-entry
        // consistency. For local foods, preserve the real persisted
        // selectedVariantId so save payloads use the real variant_id, not a
        // draft ID that was never written to the database.
        if (!isLocalFood) {
          setSelectedVariantId(draftVariant.id);
        }
      } else {
        const knownVariants = isLocalFood ? localUnitVariants : externalUnitVariants;
        const isKnownVariant = knownVariants.some(
          (variant) => variant.id === adjustedUnitSelectionFromNav.variant.id,
        );
        setSelectedVariantOverride(
          isKnownVariant ? null : adjustedUnitSelectionFromNav.variant,
        );
        // For local foods, guard against draft sentinel IDs that were classified
        // as 'existing' by the selectedUnitSelection memo (e.g. FORM_DRAFT_UNIT_ID
        // from AI-converted units, which isn't EXTERNAL_DRAFT_VARIANT_ID so the
        // memo assigns kind:'existing' even though it's never a real DB ID).
        const isDraftSentinel =
          adjustedUnitSelectionFromNav.variant.id === EXTERNAL_DRAFT_VARIANT_ID ||
          adjustedUnitSelectionFromNav.variant.id === FORM_DRAFT_UNIT_ID;
        if (adjustedUnitSelectionFromNav.variant.id && !(isLocalFood && isDraftSentinel)) {
          setSelectedVariantId(adjustedUnitSelectionFromNav.variant.id);
        }
      }
    }

    if (adjustedFromNav) {
      setAdjustedValues(adjustedFromNav);
    }

    if (adjustedCustomNutrientsFromNav !== undefined) {
      setAdjustedCustomNutrients(adjustedCustomNutrientsFromNav);
    }

    if (nextServingSize !== previousServingSize) {
      setQuantityText(String(nextServingSize));
    }

    navigation.setParams({
      adjustedValues: undefined,
      adjustedUnitSelection: undefined,
      adjustedCustomNutrients: undefined,
    });
  }, [
    adjustedFromNav,
    adjustedUnitSelectionFromNav,
    adjustedCustomNutrientsFromNav,
    externalUnitVariants,
    isLocalFood,
    localUnitVariants,
    navigation,
  ]);

  useEffect(() => {
    if (!pendingEquivalentsFromNav) return;
    pendingEquivalentsRef.current = pendingEquivalentsFromNav;
    navigation.setParams({ pendingEquivalents: undefined });
  }, [pendingEquivalentsFromNav, navigation]);

  useEffect(() => {
    if (!selectedVariantId) {
      const firstVariant =
        localVariantOptions[0] ?? externalVariantOptions[0] ?? null;
      if (firstVariant) {
        setSelectedVariantId(firstVariant.id);
        setQuantityText(String(firstVariant.servingSize));
      }
    }
  }, [externalVariantOptions, localVariantOptions, selectedVariantId]);

  const handleVariantChange = useCallback(
    (variantId: string) => {
      setSelectedVariantId(variantId);
      setSelectedVariantOverride(null);
      setAdjustedValues(null);

      const localVariant = localVariantOptions.find((variant) => variant.id === variantId);
      if (localVariant) {
        setQuantityText(String(localVariant.servingSize));
        return;
      }

      const externalVariant = externalVariantOptions.find(
        (variant) => variant.id === variantId,
      );
      if (externalVariant) {
        setQuantityText(String(externalVariant.servingSize));
      }
    },
    [externalVariantOptions, localVariantOptions],
  );

  const updateQuantityText = (text: string) => {
    if (DECIMAL_INPUT_REGEX.test(text)) {
      setQuantityText(text);
    }
  };

  const clampQuantity = () => {
    if (quantity <= 0) {
      const minQuantity = displayValues.servingSize * 0.5 || 1;
      setQuantityText(String(minQuantity));
    }
  };

  const adjustQuantity = (delta: number) => {
    const step = displayValues.servingSize;
    const increment = step * 0.5 || 1;
    const boundary =
      delta > 0
        ? Math.ceil(quantity / increment) * increment
        : Math.floor(quantity / increment) * increment;
    const next =
      boundary !== quantity ? boundary : quantity + delta * increment;
    setQuantityText(String(Math.max(increment, next)));
  };

  const scaled = (value: number) => value * servings;

  const insets = useSafeAreaInsets();
  const [accentColor, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
  ]) as [string, string];

  const buildSaveFoodPayload = useCallback(
    () => ({
      name: adjustedValues?.name || activeItem.name,
      brand: adjustedValues?.brand ?? activeItem.brand ?? null,
      serving_size: saveFoodSourceValues.servingSize,
      serving_unit: saveFoodSourceValues.servingUnit,
      calories: saveFoodSourceValues.calories,
      protein: saveFoodSourceValues.protein,
      carbs: saveFoodSourceValues.carbs,
      fat: saveFoodSourceValues.fat,
      dietary_fiber: saveFoodSourceValues.fiber,
      saturated_fat: saveFoodSourceValues.saturatedFat,
      sodium: saveFoodSourceValues.sodium,
      sugars: saveFoodSourceValues.sugars,
      trans_fat: saveFoodSourceValues.transFat,
      potassium: saveFoodSourceValues.potassium,
      calcium: saveFoodSourceValues.calcium,
      iron: saveFoodSourceValues.iron,
      cholesterol: saveFoodSourceValues.cholesterol,
      vitamin_a: saveFoodSourceValues.vitaminA,
      vitamin_c: saveFoodSourceValues.vitaminC,
    }),
    [activeItem.brand, activeItem.name, adjustedValues, saveFoodSourceValues],
  );

  const {
    saveFoodAsync,
    isPending: isSavePending,
  } = useSaveFood();

  const buildFoodEntryPayload = (): CreateFoodEntryPayload => {
    const base = {
      meal_type_id: effectiveMealId!,
      quantity,
      unit: displayValues.servingUnit,
      entry_date: selectedDate,
    };

    switch (activeItem.source) {
      case 'local':
        if (!selectedVariantId) throw new Error('Missing variant ID for local food');
        if (adjustedValues) {
          return {
            ...base,
            food_id: activeItem.id,
            variant_id: selectedVariantId,
            food_name: adjustedValues.name || activeItem.name,
            brand_name: adjustedValues.brand ?? activeItem.brand,
            serving_size: displayValues.servingSize,
            serving_unit: displayValues.servingUnit,
            calories: displayValues.calories,
            protein: displayValues.protein,
            carbs: displayValues.carbs,
            fat: displayValues.fat,
            dietary_fiber: displayValues.fiber,
            saturated_fat: displayValues.saturatedFat,
            sodium: displayValues.sodium,
            sugars: displayValues.sugars,
            trans_fat: displayValues.transFat,
            potassium: displayValues.potassium,
            calcium: displayValues.calcium,
            iron: displayValues.iron,
            cholesterol: displayValues.cholesterol,
            vitamin_a: displayValues.vitaminA,
            vitamin_c: displayValues.vitaminC,
            ...(selectedCustomNutrients !== undefined
              ? { custom_nutrients: selectedCustomNutrients }
              : {}),
          };
        }
        return { ...base, food_id: activeItem.id, variant_id: selectedVariantId };
      case 'external':
        return base;
      case 'meal':
        // Meal entries are dispatched via useAddFoodEntryMeal, not addEntry.
        throw new Error('Meal entries must use buildFoodEntryMealPayload');
    }
  };

  const buildFoodEntryMealPayload = (): FoodEntryMealCreateData => {
    if (item.source !== 'meal') {
      throw new Error('buildFoodEntryMealPayload called for non-meal item');
    }
    const mealTypeName = selectedMealType?.name ?? '';
    return {
      meal_template_id: item.id,
      meal_type: mealTypeName,
      meal_type_id: effectiveMealId ?? undefined,
      entry_date: selectedDate,
      name: item.name,
      quantity,
      unit: displayValues.servingUnit,
    };
  };

  const { addEntry, addEntryAsync, isPending: isAddPending, invalidateCache } =
    useAddFoodEntry({
      onSuccess: async (entry) => {
        if (entry.food_id && pendingEquivalentsRef.current) {
          const equivalents = pendingEquivalentsRef.current;
          pendingEquivalentsRef.current = null;
          try {
            await Promise.all(
              equivalents.map((eq) =>
                createFoodVariant({
                  food_id: entry.food_id!,
                  serving_size: eq.serving_size,
                  serving_unit: eq.serving_unit,
                  calories: displayValues.calories,
                  protein: displayValues.protein,
                  carbs: displayValues.carbs,
                  fat: displayValues.fat,
                  dietary_fiber: displayValues.fiber,
                  saturated_fat: displayValues.saturatedFat,
                  sodium: displayValues.sodium,
                  sugars: displayValues.sugars,
                  trans_fat: displayValues.transFat,
                  potassium: displayValues.potassium,
                  calcium: displayValues.calcium,
                  iron: displayValues.iron,
                  cholesterol: displayValues.cholesterol,
                  vitamin_a: displayValues.vitaminA,
                  vitamin_c: displayValues.vitaminC,
                } as CreateFoodVariantPayload),
              ),
            );
          } catch {
            Toast.show({ type: 'error', text1: 'Some equivalent units could not be saved' });
          }
        }
        invalidateCache(selectedDate);
        navigation.dispatch(StackActions.popToTop());
      },
    });

  const {
    addMeal,
    isPending: isAddMealPending,
    invalidateCache: invalidateMealCache,
  } = useAddFoodEntryMeal({
    onSuccess: () => {
      invalidateMealCache(selectedDate);
      navigation.dispatch(StackActions.popToTop());
    },
  });

  const buildDraftFromCurrentValues = (
    foodId: string,
    variantId: string,
    foodName: string,
    brand?: string | null,
  ): MealIngredientDraft =>
    buildMealIngredientDraft({
      foodId,
      variantId,
      quantity,
      unit: displayValues.servingUnit,
      foodName,
      brand,
      values: displayValues,
    });

  const finishMealBuilderSelection = (ingredient: MealIngredientDraft) => {
    setPendingMealIngredientSelection({
      ingredient,
      ingredientIndex,
    });
    navigation.dispatch(StackActions.pop(returnDepth));
  };

  const handleMealBuilderAdd = async () => {
    if (quantity <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Invalid amount',
        text2: 'Amount must be greater than zero.',
      });
      return;
    }

    switch (activeItem.source) {
      case 'local': {
        try {
          const variantId = selectedVariantId ?? activeItem.variantId;
          if (!variantId) {
            throw new Error('Missing variant ID for local food');
          }

          finishMealBuilderSelection(
            buildDraftFromCurrentValues(
              activeItem.id,
              variantId,
              adjustedValues?.name || activeItem.name,
              adjustedValues?.brand ?? activeItem.brand,
            ),
          );
        } catch {
          Toast.show({
            type: 'error',
            text1: 'Failed to add food',
            text2: 'Please try again.',
          });
        }
        return;
      }
      case 'external': {
        let savedFood;
        try {
          savedFood = await saveFoodAsync(buildSaveFoodPayload());
        } catch {
          return;
        }

        try {
          if (pendingVariantToPersist) {
            const createdVariant = await createVariant(
              buildCreateFoodVariantPayload(savedFood.id, pendingVariantToPersist),
            );
            const createdVariantValues = mergeVariantDisplayValues(
              createdVariant,
              unitVariantToDisplayValues(pendingVariantToPersist),
            );
            const createdVariantId = toNonEmptyString(createdVariant.id, '');

            if (!createdVariantId) {
              throw new Error('Server did not return a created variant ID');
            }

            finishMealBuilderSelection(
              buildMealIngredientDraft({
                foodId: savedFood.id,
                variantId: createdVariantId,
                quantity,
                unit: createdVariantValues.servingUnit,
                foodName: adjustedValues?.name || activeItem.name,
                brand: adjustedValues?.brand ?? activeItem.brand,
                values: createdVariantValues,
              }),
            );
            return;
          }

          if (!savedFood.default_variant?.id) {
            throw new Error('Server did not return a variant ID for the saved food');
          }
          finishMealBuilderSelection(
            buildMealIngredientDraft({
              foodId: savedFood.id,
              variantId: savedFood.default_variant.id,
              quantity,
              unit: displayValues.servingUnit,
              foodName: adjustedValues?.name || activeItem.name,
              brand: adjustedValues?.brand ?? activeItem.brand,
              values: displayValues,
            }),
          );
        } catch {
          Toast.show({
            type: 'error',
            text1: 'Failed to add food',
            text2: 'Please try again.',
          });
        }
        return;
      }
      case 'meal':
        Toast.show({
          type: 'error',
          text1: 'Meals not supported here',
          text2: 'Select a food instead of another meal.',
        });
        return;
    }
  };

  const handleSaveExternalFood = async () => {
    try {
      const savedFood = await saveFoodAsync(buildSaveFoodPayload());
      const savedFoodInfo = foodItemToFoodInfo(savedFood);
      let nextVariantId = savedFoodInfo.variantId;
      let nextVariantOverride: FoodUnitVariant | null = null;

      if (pendingVariantToPersist) {
        try {
          const createdVariant = await createVariant(
            buildCreateFoodVariantPayload(savedFood.id, pendingVariantToPersist),
          );
          nextVariantId = createdVariant.id;
          nextVariantOverride = createdVariant;
        } catch {
          Toast.show({
            type: 'error',
            text1: 'Saved food, but not the new unit',
            text2: 'You can still add the food, then try saving that unit again.',
          });
        }
      }

      setSavedFoodOverride(savedFoodInfo);
      setSelectedVariantOverride(nextVariantOverride);
      setSelectedVariantId(nextVariantId);
      setAdjustedValues(null);
      setQuantityText(
        String(
          nextVariantOverride?.serving_size ?? savedFoodInfo.servingSize,
        ),
      );
    } catch {
      return;
    }
  };

  const { data: goals, isLoading: isGoalsLoading } = useQuery({
    queryKey: goalsQueryKey(selectedDate),
    queryFn: () => fetchDailyGoals(selectedDate),
    staleTime: 1000 * 60 * 5,
  });

  const goalPercent = (value: number, goalValue: number | undefined) => {
    if (!goalValue || goalValue === 0) return null;
    return Math.round((value / goalValue) * 100);
  };

  const carbsForGoal =
    showNetCarbs && displayValues.fiber !== undefined
      ? getNetCarbsValue(displayValues.carbs, displayValues.fiber)
      : displayValues.carbs;
  const calorieGoalPct = goalPercent(scaled(displayValues.calories), goals?.calories);
  const proteinGoalPct = goalPercent(scaled(displayValues.protein), goals?.protein);
  const carbsGoalPct = goalPercent(scaled(carbsForGoal), goals?.carbs);
  const fatGoalPct = goalPercent(scaled(displayValues.fat), goals?.fat);

  const mealPickerOptions = mealTypes.map((mealType) => ({
    label: getMealTypeLabel(mealType.name),
    value: mealType.id,
  }));

  const isActionPending =
    isAddPending || isAddMealPending || isSavePending || isCreateVariantPending;

  // Navigate to FoodForm in adjust-nutrition mode. Shared by the inline header
  // edit button (Android) and the native header Edit item (iOS).
  const handleAdjustNutrition = useCallback(() => {
    // Build selectedUnitSelection from displayValues so FoodForm's
    // variant-sync effect uses the current displayed nutrition rather
    // than overwriting initialValues with DB variant defaults.
    // Spread the existing variant's metadata (source, ai_confidence,
    // custom_nutrients, etc.) then override only the nutrition fields
    // with displayValues so FoodForm's variant-sync effect uses the
    // current displayed nutrition, not DB variant defaults.
    const displayVariant: FoodUnitVariant = {
      ...(selectedUnitSelection?.variant ?? {}),
      id: selectedUnitSelection?.variant.id,
      serving_size: displayValues.servingSize,
      serving_unit: displayValues.servingUnit,
      calories: displayValues.calories,
      protein: displayValues.protein,
      carbs: displayValues.carbs,
      fat: displayValues.fat,
      dietary_fiber: displayValues.fiber,
      saturated_fat: displayValues.saturatedFat,
      sodium: displayValues.sodium,
      sugars: displayValues.sugars,
      trans_fat: displayValues.transFat,
      potassium: displayValues.potassium,
      calcium: displayValues.calcium,
      iron: displayValues.iron,
      cholesterol: displayValues.cholesterol,
      vitamin_a: displayValues.vitaminA,
      vitamin_c: displayValues.vitaminC,
    };
    const displayUnitSelection: FoodUnitSelectionResult | undefined =
      selectedUnitSelection
        ? { kind: selectedUnitSelection.kind, variant: displayVariant }
        : undefined;
    navigation.navigate('FoodForm', {
      mode: 'adjust-entry-nutrition',
      returnTo: 'FoodEntryAdd',
      returnKey: route.key,
      foodId: isLocalFood ? activeItem.id : undefined,
      variantId: isLocalFood ? selectedVariantId : undefined,
      customNutrients: isLocalFood ? (selectedCustomNutrients ?? null) : undefined,
      availableUnitVariants: selectorVariants,
      selectedUnitSelection: displayUnitSelection,
      initialValues: {
        name: adjustedValues?.name || activeItem.name,
        brand: adjustedValues?.brand ?? activeItem.brand ?? '',
        servingSize: String(displayValues.servingSize),
        servingUnit: displayValues.servingUnit,
        calories: String(displayValues.calories),
        protein: String(displayValues.protein),
        carbs: String(displayValues.carbs),
        fat: String(displayValues.fat),
        fiber: toFormString(displayValues.fiber),
        saturatedFat: toFormString(displayValues.saturatedFat),
        sodium: toFormString(displayValues.sodium),
        sugars: toFormString(displayValues.sugars),
        transFat: toFormString(displayValues.transFat),
        potassium: toFormString(displayValues.potassium),
        calcium: toFormString(displayValues.calcium),
        iron: toFormString(displayValues.iron),
        cholesterol: toFormString(displayValues.cholesterol),
        vitaminA: toFormString(displayValues.vitaminA),
        vitaminC: toFormString(displayValues.vitaminC),
      },
    });
  }, [
    navigation,
    route.key,
    isLocalFood,
    activeItem.id,
    activeItem.name,
    activeItem.brand,
    selectedVariantId,
    selectedCustomNutrients,
    selectorVariants,
    selectedUnitSelection,
    adjustedValues,
    displayValues,
  ]);

  const showHeaderActions = activeItem.source !== 'meal';
  const showSaveExternalAction = activeItem.source === 'external';

  // iOS uses the native stack header (configured in App.tsx with the food
  // name as the title). Drive the Edit / Save actions through native header
  // items and hide the custom in-screen header below. Android keeps the
  // custom header.
  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;

    navigation.setOptions({
      title: '',
      unstable_headerLeftItems: () => [
        createNativeHeaderTextButtonItem({
          label: 'Cancel',
          identifier: 'food-entry-add-cancel',
          tintColor: textPrimary,
          onPress: () => navigation.goBack(),
          disabled: isActionPending,
        }),
      ],
      unstable_headerRightItems: showHeaderActions
        ? () => {
            const items = [
              createNativeHeaderTextButtonItem({
                label: 'Edit',
                identifier: 'food-entry-add-edit',
                tintColor: textPrimary,
                accessibilityLabel: 'Adjust nutrition',
                disabled: isActionPending,
                onPress: () => handleAdjustNutrition(),
              }),
            ];
            if (showSaveExternalAction) {
              items.unshift(
                createNativeHeaderTextButtonItem({
                  label: 'Save',
                  identifier: 'food-entry-add-save',
                  tintColor: textPrimary,
                  accessibilityLabel: 'Save Food',
                  disabled: isActionPending,
                  onPress: () => void handleSaveExternalFood(),
                }),
              );
            }
            return items;
          }
        : undefined,
    });
  }, [
    navigation,
    textPrimary,
    showHeaderActions,
    showSaveExternalAction,
    isActionPending,
    handleAdjustNutrition,
    handleSaveExternalFood,
  ]);

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {Platform.OS !== 'ios' && (
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>

        {showHeaderActions && (
          <View className="flex-row items-center ml-auto gap-4 z-10">
            <TouchableOpacity
              onPress={() => handleAdjustNutrition()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
              disabled={isActionPending}
            >
              <Icon name="pencil" size={20} color={accentColor} />
            </TouchableOpacity>

            {showSaveExternalAction && (
              <TouchableOpacity
                onPress={() => {
                  void handleSaveExternalFood();
                }}
                disabled={isActionPending}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Save Food"
              >
                {isSavePending || isCreateVariantPending ? (
                  <ActivityIndicator size="small" color={accentColor} />
                ) : (
                  <Icon
                    name="bookmark"
                    size={22}
                    color={accentColor}
                  />
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      )}

      <ScrollView className="flex-1" contentContainerClassName="px-4 pt-4 pb-safe-or-4 gap-4">
        <FoodNutritionSummary
          name={adjustedValues?.name || activeItem.name}
          brand={adjustedValues?.brand ?? activeItem.brand}
          values={displayValues}
          servings={servings}
          goalPercentages={{
            calories: calorieGoalPct,
            protein: proteinGoalPct,
            carbs: carbsGoalPct,
            fat: fatGoalPct,
          }}
          goalsLoading={isGoalsLoading}
          showNetCarbs={showNetCarbs}
          provider_verified={activeItem.provider_verified}
          customNutrients={selectedCustomNutrients}
        />

        <View className="mt-2">
          <View className="flex-row items-center">
            <StepperInput
              value={quantityText}
              onChangeText={updateQuantityText}
              onBlur={clampQuantity}
              onDecrement={() => adjustQuantity(-1)}
              onIncrement={() => adjustQuantity(1)}
            />
            <Text className="text-text-primary text-base font-medium ml-2">
              {displayValues.servingDescription
                ? formatServingDescription(displayValues.servingDescription)
                : formatServingUnit(displayValues.servingUnit)}
            </Text>
          </View>
          <View className="flex-row items-center mt-2">
            <Text className="text-text-secondary text-sm">
              {servings % 1 === 0 ? servings : servings.toFixed(1)}{' '}
              {servings === 1 ? 'serving' : 'servings'}
            </Text>
            {/* Suppress the redundant "X serving per serving" suffix when the
                unit is already 'serving' \u2014 that would just say e.g.
                "1 serving \u00b7 1 serving per serving". Keep it for ml/g/etc.
                where "X ml per serving" is meaningful info. */}
            {displayValues.servingUnit !== 'serving' &&
              !displayValues.servingDescription?.toLowerCase().includes('serving') &&
              (variantPickerOptions.length > 1 ? (
              <BottomSheetPicker
                value={selectedVariantId ?? variantPickerOptions[0]?.id}
                options={variantPickerOptions.map((variant) => ({
                  label: variant.label,
                  value: variant.id,
                }))}
                onSelect={handleVariantChange}
                title="Select Serving"
                renderTrigger={({ onPress }) => (
                  <TouchableOpacity
                    onPress={onPress}
                    activeOpacity={0.7}
                    className="flex-row items-center ml-1"
                    disabled={isCreateVariantPending}
                  >
                    <Text className="text-text-secondary text-sm">
                      {' \u00b7 '}
                      {displayValues.servingDescription
                        ? formatServingDescription(displayValues.servingDescription)
                        : `${displayValues.servingSize} ${formatServingUnit(displayValues.servingUnit)}`} per
                      serving
                    </Text>
                    {isCreateVariantPending ? (
                      <ActivityIndicator
                        size="small"
                        color={accentColor}
                        style={{ marginLeft: 6 }}
                      />
                    ) : (
                      <Icon
                        name="chevron-down"
                        size={12}
                        color={textPrimary}
                        style={{ marginLeft: 4 }}
                        weight="medium"
                      />
                    )}
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text className="text-text-secondary text-sm">
                {' \u00b7 '}
                {displayValues.servingDescription
                  ? formatServingDescription(displayValues.servingDescription)
                  : `${displayValues.servingSize} ${formatServingUnit(displayValues.servingUnit)}`} per
                serving
              </Text>
              ))}
            {/* Serving-unit meals: surface the meal's yield count as a
                substitute for the suppressed "per serving" suffix above.
                Singular meals (total_servings <= 1) don't need this \u2014 there's
                no yield context to convey. */}
            {displayValues.servingUnit === 'serving' &&
              item.source === 'meal' &&
              (item.mealTotalServings ?? 1) > 1 && (
                <Text className="text-text-secondary text-sm">
                  {' \u00b7 '}meal makes {item.mealTotalServings}
                </Text>
              )}
          </View>
        </View>

        {!isMealBuilderMode ? (
          <>
            <View className="flex-row items-center mt-2">
              <TouchableOpacity
                onPress={() => calendarRef.current?.present()}
                activeOpacity={0.7}
                className="flex-row items-center"
              >
                <Text className="text-text-secondary text-base">Date</Text>
                <Text className="text-text-primary text-base font-medium mx-1.5">
                  {formatDateLabel(selectedDate)}
                </Text>
                <Icon
                  name="chevron-down"
                  size={12}
                  color={textPrimary}
                  weight="medium"
                />
              </TouchableOpacity>

              {selectedDate !== getTodayDate() && (
                <TouchableOpacity activeOpacity={0.7}
                  className="flex-row items-center mx-4"
                  onPress={() => setSelectedDate(getTodayDate())}
                >
                  <Text className="text-text-link text-sm font-medium mx-1.5">Use Today</Text>
                </TouchableOpacity>
              )}
            </View>

            {selectedMealType ? (
              <View className="flex-row items-center mt-2">
                <Text className="text-text-secondary text-base">Meal</Text>
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
          </>
        ) : null}

        <Button
          variant="primary"
          className="mt-2"
          disabled={
            isActionPending ||
            (!isMealBuilderMode && !effectiveMealId) ||
            quantity <= 0
          }
          onPress={() => {
            if (isMealBuilderMode) {
              void handleMealBuilderAdd();
              return;
            }

            if (!effectiveMealId) return;

            if (activeItem.source === 'meal') {
              addMeal(buildFoodEntryMealPayload());
              return;
            }
            if (activeItem.source === 'external' && pendingVariantToPersist) {
              void addEntryAsync({
                saveFoodPayload: buildSaveFoodPayload(),
                saveThenCreateVariantPayload: buildCreateFoodVariantInput(
                  pendingVariantToPersist,
                ),
                createEntryPayload: buildFoodEntryPayload(),
              }).catch(() => undefined);
              return;
            }

            const saveFoodPayload =
              activeItem.source === 'external' ? buildSaveFoodPayload() : undefined;
            addEntry({
              saveFoodPayload,
              createEntryPayload: buildFoodEntryPayload(),
            });
          }}
        >
          {isActionPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-base font-semibold">
              {activeItem.source === 'meal' ? 'Add Meal' : 'Add Food'}
            </Text>
          )}
        </Button>
      </ScrollView>
      <CalendarSheet
        ref={calendarRef}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />
    </View>
  );
};

export default FoodEntryAddScreen;
