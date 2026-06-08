import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
} from 'react-native';
import Button from '../components/ui/Button';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import FadeView from '../components/FadeView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import StepperInput from '../components/StepperInput';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { normalizeDate, formatDateLabel } from '../utils/dateUtils';
import { getMealTypeLabel } from '../constants/meals';
import { useMealTypes, usePreferences } from '../hooks';
import { useFoodVariants } from '../hooks/useFoodVariants';
import { useDeleteFoodEntry } from '../hooks/useDeleteFoodEntry';
import { useUpdateFoodEntry } from '../hooks/useUpdateFoodEntry';
import { useProfile } from '../hooks/useProfile';
import type { UpdateFoodEntryPayload } from '../services/api/foodEntriesApi';
import type { FoodFormData } from '../components/FoodForm';
import { toFormString, parseOptional, buildNutrientDisplayList } from '../types/foodInfo';
import { getNetCarbsValue } from '../utils/nutrientUtils';
import type { FoodVariantDetail } from '../types/foods';
import type { FoodEntry } from '../types/foodEntries';
import type {
  FoodUnitSelectionResult,
  FoodUnitVariant,
} from '../types/foodUnitVariants';
import type { RootStackScreenProps } from '../types/navigation';
import {
  formatVariantLabel,
  formatServingUnit,
  buildLocalUnitVariants,
  unitVariantToDisplayValues,
} from '../utils/foodDetails';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';

type FoodEntryViewScreenProps = RootStackScreenProps<'FoodEntryView'>;

const scaledValue = (value: number | undefined, entry: FoodEntry): number => {
  if (value === undefined || !entry.serving_size) return 0;
  return (value * entry.quantity) / entry.serving_size;
};

const foodEntryToUnitVariant = (entry: FoodEntry): FoodUnitVariant => ({
  id: entry.variant_id,
  food_id: entry.food_id,
  serving_size: entry.serving_size,
  serving_unit: entry.unit,
  calories: entry.calories,
  protein: entry.protein ?? 0,
  carbs: entry.carbs ?? 0,
  fat: entry.fat ?? 0,
  saturated_fat: entry.saturated_fat,
  polyunsaturated_fat: entry.polyunsaturated_fat,
  monounsaturated_fat: entry.monounsaturated_fat,
  trans_fat: entry.trans_fat,
  cholesterol: entry.cholesterol,
  sodium: entry.sodium,
  potassium: entry.potassium,
  dietary_fiber: entry.dietary_fiber,
  sugars: entry.sugars,
  vitamin_a: entry.vitamin_a,
  vitamin_c: entry.vitamin_c,
  calcium: entry.calcium,
  iron: entry.iron,
  glycemic_index: entry.glycemic_index,
  custom_nutrients: entry.custom_nutrients ?? null,
});

const entryToDisplayValues = (entry: FoodEntry) => ({
  servingSize: entry.serving_size,
  servingUnit: entry.unit,
  calories: entry.calories,
  protein: entry.protein ?? 0,
  carbs: entry.carbs ?? 0,
  fat: entry.fat ?? 0,
  fiber: entry.dietary_fiber,
  saturatedFat: entry.saturated_fat,
  transFat: entry.trans_fat,
  sodium: entry.sodium,
  sugars: entry.sugars,
  potassium: entry.potassium,
  calcium: entry.calcium,
  iron: entry.iron,
  cholesterol: entry.cholesterol,
  vitaminA: entry.vitamin_a,
  vitaminC: entry.vitamin_c,
});

const FoodEntryViewScreen: React.FC<FoodEntryViewScreenProps> = ({
  navigation,
  route,
}) => {
  const [entry, setEntry] = useState(route.params.entry);
  const [createdVariantOverride, setCreatedVariantOverride] =
    useState<FoodUnitVariant | null>(null);
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { profile } = useProfile();
  const calendarRef = useRef<CalendarSheetRef>(null);

  useEffect(() => {
    if (entry.food_entry_meal_id) {
      navigation.replace('EditLoggedMeal', { foodEntryMealId: entry.food_entry_meal_id });
    }
  }, [entry.food_entry_meal_id, navigation]);

  const canEdit = !!(
    entry.user_id &&
    profile?.id === entry.user_id &&
    !entry.food_entry_meal_id
  );

  interface EditState {
    isEditing: boolean;
    selectedDate: string;
    selectedMealId: string | undefined;
    selectedVariantId: string | undefined;
    quantityText: string;
    adjustedValues: FoodFormData | null;
  }

  const initialDate = normalizeDate(entry.entry_date);
  const [editState, setEditState] = useState<EditState>({
    isEditing: false,
    selectedDate: initialDate,
    selectedMealId: entry.meal_type_id,
    selectedVariantId: entry.variant_id,
    quantityText: String(entry.quantity),
    adjustedValues: null,
  });

  const {
    isEditing,
    selectedDate,
    selectedMealId,
    selectedVariantId,
    quantityText,
    adjustedValues,
  } = editState;
  const updateEdit = useCallback(
    (patch: Partial<EditState>) => setEditState((prev) => ({ ...prev, ...patch })),
    [],
  );

  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const effectiveMealId = selectedMealId ?? defaultMealTypeId;
  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);

  const { variants } = useFoodVariants(entry.food_id!, {
    enabled: !!entry.food_id,
  });

  const selectorVariants = useMemo(() => {
    if (!entry.food_id) return [];
    const loadedVariants = buildLocalUnitVariants(variants);
    if (
      createdVariantOverride?.id &&
      !loadedVariants.some((variant) => variant.id === createdVariantOverride.id)
    ) {
      return [createdVariantOverride, ...loadedVariants];
    }
    return loadedVariants.length > 0
      ? loadedVariants
      : [foodEntryToUnitVariant(entry)];
  }, [createdVariantOverride, entry, variants]);

  const variantPickerOptions = useMemo(() => {
    const baseOptions = (variants ?? []).map((variant) => ({
      id: variant.id,
      label: formatVariantLabel({
        servingSize: variant.serving_size,
        servingUnit: variant.serving_unit,
        calories: variant.calories,
      }),
      servingSize: variant.serving_size,
      servingUnit: variant.serving_unit,
      calories: variant.calories,
      protein: variant.protein,
      carbs: variant.carbs,
      fat: variant.fat,
      fiber: variant.dietary_fiber,
      saturatedFat: variant.saturated_fat,
      sodium: variant.sodium,
      sugars: variant.sugars,
      transFat: variant.trans_fat,
      potassium: variant.potassium,
      calcium: variant.calcium,
      iron: variant.iron,
      cholesterol: variant.cholesterol,
      vitaminA: variant.vitamin_a,
      vitaminC: variant.vitamin_c,
    }));

    if (!createdVariantOverride?.id) {
      return baseOptions;
    }

    if (baseOptions.some((variant) => variant.id === createdVariantOverride.id)) {
      return baseOptions;
    }

    return [
      {
        id: createdVariantOverride.id,
        label: formatVariantLabel(
          unitVariantToDisplayValues(createdVariantOverride),
        ),
        ...unitVariantToDisplayValues(createdVariantOverride),
      },
      ...baseOptions,
    ];
  }, [createdVariantOverride, variants]);

  const selectedUnitSelection = useMemo<FoodUnitSelectionResult | undefined>(() => {
    if (createdVariantOverride && createdVariantOverride.id === selectedVariantId) {
      return {
        kind: 'existing',
        variant: createdVariantOverride,
      };
    }

    const selectedVariant = selectorVariants.find(
      (variant) => variant.id === selectedVariantId,
    );
    return selectedVariant
      ? { kind: 'existing', variant: selectedVariant }
      : undefined;
  }, [createdVariantOverride, selectedVariantId, selectorVariants]);

  const activeVariant = useMemo(() => {
    if (createdVariantOverride && createdVariantOverride.id === selectedVariantId) {
      return unitVariantToDisplayValues(createdVariantOverride);
    }

    if (variants && selectedVariantId && selectedVariantId !== entry.variant_id) {
      const variant = variants.find(
        (candidate: FoodVariantDetail) => candidate.id === selectedVariantId,
      );
      if (variant) {
        return {
          servingSize: variant.serving_size,
          servingUnit: variant.serving_unit,
          calories: variant.calories,
          protein: variant.protein,
          carbs: variant.carbs,
          fat: variant.fat,
          fiber: variant.dietary_fiber,
          saturatedFat: variant.saturated_fat,
          transFat: variant.trans_fat,
          sodium: variant.sodium,
          sugars: variant.sugars,
          potassium: variant.potassium,
          calcium: variant.calcium,
          iron: variant.iron,
          cholesterol: variant.cholesterol,
          vitaminA: variant.vitamin_a,
          vitaminC: variant.vitamin_c,
        };
      }
    }

    return entryToDisplayValues(entry);
  }, [createdVariantOverride, entry, selectedVariantId, variants]);

  const selectedCustomNutrients = useMemo(() => {
    if (createdVariantOverride && createdVariantOverride.id === selectedVariantId) {
      return createdVariantOverride.custom_nutrients ?? null;
    }

    if (variants && selectedVariantId) {
      const selectedVariant = variants.find(
        (candidate: FoodVariantDetail) => candidate.id === selectedVariantId,
      );
      if (selectedVariant) {
        return selectedVariant.custom_nutrients ?? null;
      }
    }

    if (selectedVariantId === entry.variant_id) {
      return entry.custom_nutrients ?? null;
    }

    return undefined;
  }, [createdVariantOverride, entry, selectedVariantId, variants]);

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

  const quantity = parseDecimalInput(quantityText) || 0;
  const editServings =
    displayValues.servingSize > 0 ? quantity / displayValues.servingSize : 0;
  const scaled = (value: number) => value * editServings;
  const servingSizeRef = useRef(displayValues.servingSize);

  const mealPickerOptions = mealTypes.map((mealType) => ({
    label: getMealTypeLabel(mealType.name),
    value: mealType.id,
  }));

  const adjustedFromNav = route.params?.adjustedValues;
  const adjustedUnitSelectionFromNav = route.params?.adjustedUnitSelection;
  useEffect(() => {
    servingSizeRef.current = displayValues.servingSize;
  }, [displayValues.servingSize]);

  useEffect(() => {
    if (!adjustedFromNav && !adjustedUnitSelectionFromNav) {
      return;
    }

    const previousServingSize = servingSizeRef.current;
    const nextServingSize =
      parseDecimalInput(adjustedFromNav?.servingSize ?? '') ||
      adjustedUnitSelectionFromNav?.variant.serving_size ||
      previousServingSize;

    if (adjustedUnitSelectionFromNav) {
      const isKnownVariant = (variants ?? []).some(
        (variant) => variant.id === adjustedUnitSelectionFromNav.variant.id,
      );
      setCreatedVariantOverride(
        isKnownVariant ? null : adjustedUnitSelectionFromNav.variant,
      );
      if (adjustedUnitSelectionFromNav.variant.id) {
        updateEdit({
          selectedVariantId: adjustedUnitSelectionFromNav.variant.id,
        });
      }
    }

    updateEdit({
      ...(adjustedFromNav ? { adjustedValues: adjustedFromNav } : {}),
      ...(nextServingSize !== previousServingSize
        ? { quantityText: String(nextServingSize) }
        : {}),
    });
    navigation.setParams({
      adjustedValues: undefined,
      adjustedUnitSelection: undefined,
    });
  }, [
    adjustedFromNav,
    adjustedUnitSelectionFromNav,
    navigation,
    updateEdit,
    variants,
  ]);

  const handleVariantChange = useCallback(
    (variantId: string) => {
      const variant = variants?.find(
        (candidate: FoodVariantDetail) => candidate.id === variantId,
      );
      setCreatedVariantOverride(null);
      updateEdit({
        selectedVariantId: variantId,
        adjustedValues: null,
        ...(variant ? { quantityText: String(variant.serving_size) } : {}),
      });
    },
    [updateEdit, variants],
  );

  const updateQuantityText = (text: string) => {
    if (DECIMAL_INPUT_REGEX.test(text)) {
      updateEdit({ quantityText: text });
    }
  };

  const clampQuantity = () => {
    if (quantity <= 0) {
      const minQuantity = displayValues.servingSize * 0.5 || 1;
      updateEdit({ quantityText: String(minQuantity) });
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
    updateEdit({ quantityText: String(Math.max(increment, next)) });
  };

  const navigateToNutritionForm = () => {
    navigation.navigate('FoodForm', {
      mode: 'adjust-entry-nutrition',
      returnTo: 'FoodEntryView',
      returnKey: route.key,
      foodId: entry.food_id ?? undefined,
      variantId: selectedVariantId,
      customNutrients: selectedCustomNutrients,
      availableUnitVariants: selectorVariants,
      selectedUnitSelection,
      initialValues: {
        name: adjustedValues?.name || entry.food_name || '',
        brand: adjustedValues?.brand ?? entry.brand_name ?? '',
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
  };

  const { updateEntry, isPending: isUpdatePending, invalidateCache: invalidateUpdateCache } =
    useUpdateFoodEntry({
      entryId: entry.id,
      entryDate: entry.entry_date,
      onSuccess: (updatedEntry) => {
        invalidateUpdateCache(selectedDate);
        const mergedEntry = { ...entry, ...updatedEntry };
        if (
          updatedEntry.meal_type_id &&
          updatedEntry.meal_type_id !== entry.meal_type_id
        ) {
          const mealType = mealTypes.find(
            (candidate) => candidate.id === updatedEntry.meal_type_id,
          );
          if (mealType) mergedEntry.meal_type = mealType.name;
        }
        setCreatedVariantOverride(null);
        setEntry(mergedEntry);
        setEditState({
          isEditing: false,
          selectedDate: normalizeDate(mergedEntry.entry_date),
          selectedMealId: mergedEntry.meal_type_id,
          selectedVariantId: mergedEntry.variant_id,
          quantityText: String(mergedEntry.quantity),
          adjustedValues: null,
        });
      },
    });

  const handleSave = () => {
    const payload: UpdateFoodEntryPayload = {};
    if (quantity !== entry.quantity) payload.quantity = quantity;
    if (displayValues.servingUnit !== entry.unit) payload.unit = displayValues.servingUnit;
    if (selectedVariantId !== entry.variant_id) {
      payload.variant_id = selectedVariantId;
      payload.unit = displayValues.servingUnit;
    }
    if (selectedDate !== initialDate) payload.entry_date = selectedDate;
    if (effectiveMealId && effectiveMealId !== entry.meal_type_id) {
      payload.meal_type_id = effectiveMealId;
    }

    if (adjustedValues) {
      payload.food_name = adjustedValues.name;
      payload.brand_name = adjustedValues.brand;
      payload.serving_size = displayValues.servingSize;
      payload.serving_unit = displayValues.servingUnit;
      payload.calories = displayValues.calories;
      payload.protein = displayValues.protein;
      payload.carbs = displayValues.carbs;
      payload.fat = displayValues.fat;
      payload.saturated_fat = displayValues.saturatedFat;
      payload.sodium = displayValues.sodium;
      payload.dietary_fiber = displayValues.fiber;
      payload.sugars = displayValues.sugars;
      payload.trans_fat = displayValues.transFat;
      payload.potassium = displayValues.potassium;
      payload.calcium = displayValues.calcium;
      payload.iron = displayValues.iron;
      payload.cholesterol = displayValues.cholesterol;
      payload.vitamin_a = displayValues.vitaminA;
      payload.vitamin_c = displayValues.vitaminC;
    }

    if (Object.keys(payload).length === 0) {
      updateEdit({ isEditing: false });
      return;
    }

    updateEntry(payload);
  };

  const { confirmAndDelete, isPending: isDeletePending, invalidateCache: invalidateDeleteCache } =
    useDeleteFoodEntry({
      entryId: entry.id,
      entryDate: entry.entry_date,
      onSuccess: () => {
        invalidateDeleteCache();
        navigation.goBack();
      },
    });

  const [accentColor, textPrimary, proteinColor, carbsColor, fatColor] =
    useCSSVariable([
      '--color-accent-primary',
      '--color-text-primary',
      '--color-macro-protein',
      '--color-macro-carbs',
      '--color-macro-fat',
    ]) as [string, string, string, string, string];

  const { preferences } = usePreferences();
  const showNetCarbs = preferences?.show_net_carbs === true;

  const viewCalories = Math.round(scaledValue(entry.calories, entry));
  const viewProtein = Math.round(scaledValue(entry.protein, entry));
  const viewCarbs = Math.round(scaledValue(entry.carbs, entry));
  const viewFat = Math.round(scaledValue(entry.fat, entry));
  const viewFiber = Math.round(scaledValue(entry.dietary_fiber, entry));

  // Per-mode gates: each mode reads from a different source (view = entry,
  // edit = displayValues), so each needs its own fiber check. Without these
  // the label could say "Net Carbs" while the value silently fell back to
  // total carbs.
  const viewUseNetCarbs = showNetCarbs && entry.dietary_fiber != null;
  const editUseNetCarbs = showNetCarbs && displayValues.fiber !== undefined;
  const viewDisplayCarbs = viewUseNetCarbs
    ? getNetCarbsValue(viewCarbs, viewFiber)
    : viewCarbs;
  const editDisplayCarbs = editUseNetCarbs
    ? getNetCarbsValue(displayValues.carbs, displayValues.fiber)
    : displayValues.carbs;
  const viewCarbsLabel = viewUseNetCarbs ? 'Net Carbs' : 'Carbs';
  const editCarbsLabel = editUseNetCarbs ? 'Net Carbs' : 'Carbs';

  const viewProteinCals = viewProtein * 4;
  const viewCarbsCals = viewDisplayCarbs * 4;
  const viewFatCals = viewFat * 9;
  const viewTotalMacroCals =
    viewProteinCals + viewCarbsCals + viewFatCals;

  const editProteinCals = displayValues.protein * 4;
  const editCarbsCals = editDisplayCarbs * 4;
  const editFatCals = displayValues.fat * 9;
  const editTotalMacroCals =
    editProteinCals + editCarbsCals + editFatCals;

  const servings = entry.serving_size
    ? entry.quantity / entry.serving_size
    : entry.quantity;
  const servingsCount =
    servings % 1 === 0 ? servings : parseFloat(servings.toFixed(2));
  const formattedEntryUnit = formatServingUnit(entry.unit || '');
  const servingsDisplay =
    servings === 1
      ? `1 serving \u00b7 ${entry.serving_size} ${formattedEntryUnit} per serving`
      : `${servingsCount} servings \u00b7 ${entry.serving_size} ${formattedEntryUnit} per serving`;

  const [showMoreNutrients, setShowMoreNutrients] = useState(false);
  // Use the same per-mode gate the macro bar uses, and pass carbs raw —
  // renderNutrientValue scales every other row the same way, so pre-scaling
  // here would double-scale the displayed Total Carbs value.
  const useNetCarbsInList = isEditing ? editUseNetCarbs : viewUseNetCarbs;
  const { primary: primaryNutrients, additional: additionalNutrients } =
    buildNutrientDisplayList(displayValues, {
      showNetCarbs: useNetCarbsInList,
      carbs: useNetCarbsInList ? displayValues.carbs : undefined,
    });
  const hasAdditional = additionalNutrients.length > 0;
  const showAdditionalRows = showMoreNutrients && hasAdditional;
  const renderNutrientValue = (value: number, unit: string) =>
    isEditing
      ? `${Math.round(scaled(value))}${unit}`
      : `${Math.round(scaledValue(value, entry))}${unit}`;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        {canEdit && !isEditing && (
          <FadeView style={{ marginLeft: 'auto', zIndex: 10 }}>
            <Button
              variant="ghost"
              onPress={() => updateEdit({ isEditing: true })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              textClassName="font-medium"
            >
              Edit
            </Button>
          </FadeView>
        )}
        {isEditing && (
          <FadeView style={{ marginLeft: 'auto', zIndex: 10 }}>
            <Button
              variant="ghost"
              onPress={handleSave}
              disabled={isUpdatePending || quantity <= 0}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              Done
            </Button>
          </FadeView>
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-4 gap-4"
        contentContainerStyle={{
          paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding,
        }}
      >
        <Animated.View layout={LinearTransition.duration(300)}>
          <Text className="text-text-primary text-3xl font-bold">
            {(isEditing && adjustedValues?.name) || entry.food_name || 'Unknown food'}
          </Text>
          {((isEditing && adjustedValues?.brand) || entry.brand_name) && (
            <Text className="text-text-muted mt-1 font-semibold">
              {(isEditing && adjustedValues?.brand) || entry.brand_name}
            </Text>
          )}
          {isEditing ? (
            <FadeView key="edit-serving">
              <View className="mt-3">
                <View className="flex-row items-center">
                  <StepperInput
                    value={quantityText}
                    onChangeText={updateQuantityText}
                    onBlur={clampQuantity}
                    onIncrement={() => adjustQuantity(1)}
                    onDecrement={() => adjustQuantity(-1)}
                    keyboardType="decimal-pad"
                  />
                  <Text className="text-text-primary text-base font-medium ml-2">
                    {formatServingUnit(displayValues.servingUnit)}
                  </Text>
                </View>
                <View className="flex-row items-center mt-2">
                  <Text className="text-text-secondary text-sm">
                    {editServings % 1 === 0
                      ? editServings
                      : parseFloat(editServings.toFixed(2))}{' '}
                    {editServings === 1 ? 'serving' : 'servings'}
                  </Text>
                  {variantPickerOptions.length > 1 ? (
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
                        >
                          <Text className="text-text-secondary text-sm">
                            {' - '}
                            {displayValues.servingSize} {formatServingUnit(displayValues.servingUnit)} per
                            serving
                          </Text>
                          <Icon
                            name="chevron-down"
                            size={12}
                            color={textPrimary}
                            style={{ marginLeft: 4 }}
                            weight="medium"
                          />
                        </TouchableOpacity>
                      )}
                    />
                  ) : (
                    <Text className="text-text-secondary text-sm">
                      {' - '}
                      {displayValues.servingSize} {formatServingUnit(displayValues.servingUnit)} per
                      serving
                    </Text>
                  )}
                </View>
              </View>
            </FadeView>
          ) : (
            <FadeView key="view-serving">
              <Text className="text-text-secondary text-sm mt-3">
                {servingsDisplay}
              </Text>
            </FadeView>
          )}
        </Animated.View>

        <Animated.View
          layout={LinearTransition.duration(300)}
          className="bg-surface rounded-xl p-4 shadow-sm"
        >
          <Pressable onPress={isEditing ? navigateToNutritionForm : undefined} disabled={!isEditing}>
            <Animated.View
              layout={LinearTransition.duration(300)}
              className="flex-row items-center"
            >
              <View className="flex-1 items-center pr-10">
                <Text className="text-text-primary text-3xl font-medium">
                  {isEditing
                    ? Math.round(scaled(displayValues.calories))
                    : viewCalories}
                </Text>
                <Text className="text-text-secondary text-base mt-1">
                  calories
                </Text>
              </View>
              <Animated.View
                layout={LinearTransition.duration(300)}
                className="flex-2 gap-3"
              >
                {(isEditing
                  ? [
                      {
                        label: 'Protein',
                        value: displayValues.protein,
                        color: proteinColor,
                        calFactor: 4,
                        totalCals: editTotalMacroCals,
                        displayValue: Math.round(scaled(displayValues.protein)),
                      },
                      {
                        label: editCarbsLabel,
                        value: editDisplayCarbs,
                        color: carbsColor,
                        calFactor: 4,
                        totalCals: editTotalMacroCals,
                        displayValue: Math.round(scaled(editDisplayCarbs)),
                      },
                      {
                        label: 'Fat',
                        value: displayValues.fat,
                        color: fatColor,
                        calFactor: 9,
                        totalCals: editTotalMacroCals,
                        displayValue: Math.round(scaled(displayValues.fat)),
                      },
                    ]
                  : [
                      {
                        label: 'Protein',
                        value: viewProtein,
                        color: proteinColor,
                        calFactor: 4,
                        totalCals: viewTotalMacroCals,
                        displayValue: viewProtein,
                      },
                      {
                        label: viewCarbsLabel,
                        value: viewDisplayCarbs,
                        color: carbsColor,
                        calFactor: 4,
                        totalCals: viewTotalMacroCals,
                        displayValue: viewDisplayCarbs,
                      },
                      {
                        label: 'Fat',
                        value: viewFat,
                        color: fatColor,
                        calFactor: 9,
                        totalCals: viewTotalMacroCals,
                        displayValue: viewFat,
                      },
                    ]
                ).map((macro) => (
                  <View key={macro.label} className="flex-row items-center">
                    <Text className="text-text-secondary text-sm w-14">
                      {macro.label}
                    </Text>
                    <View className="flex-1 h-2 rounded-full bg-progress-track overflow-hidden mx-2">
                      {macro.totalCals > 0 && (
                        <View
                          className="h-full rounded-full"
                          style={{
                            backgroundColor: macro.color,
                            width: `${Math.round(
                              (macro.value * macro.calFactor / macro.totalCals) * 100,
                            )}%`,
                          }}
                        />
                      )}
                    </View>
                    <Text className="text-text-primary text-sm font-medium w-10 text-right">
                      {macro.displayValue}g
                    </Text>
                  </View>
                ))}
              </Animated.View>
              {isEditing && (
                <FadeView>
                  <Icon
                    name="chevron-forward"
                    size={16}
                    color={textPrimary}
                    style={{ marginLeft: 8 }}
                  />
                </FadeView>
              )}
            </Animated.View>
            {isEditing && (
              <FadeView>
                <Text className="text-text-secondary text-xs text-center mt-4">
                  Tap to edit nutrition
                </Text>
              </FadeView>
            )}
          </Pressable>
        </Animated.View>

        {(primaryNutrients.length > 0 || hasAdditional) && (
          <Animated.View layout={LinearTransition.duration(300)} className="my-2 gap-2">
            {primaryNutrients.length > 0 && (
              <View className="rounded-xl">
                {primaryNutrients.map((nutrient, index) => {
                  const isLastVisible =
                    index === primaryNutrients.length - 1 && !showAdditionalRows;
                  return (
                    <View
                      key={nutrient.label}
                      className={`flex-row justify-between py-1 ${
                        !isLastVisible ? 'border-b border-border-subtle' : ''
                      }`}
                    >
                      <Text className="text-text-secondary text-sm">
                        {nutrient.label}
                      </Text>
                      <Text className="text-text-primary text-sm">
                        {renderNutrientValue(nutrient.value, nutrient.unit)}
                      </Text>
                    </View>
                  );
                })}
                {showAdditionalRows && (
                  <Animated.View
                    entering={FadeIn.duration(250)}
                    exiting={FadeOut.duration(150)}
                    layout={LinearTransition.duration(250)}
                  >
                    {additionalNutrients.map((nutrient, index) => (
                      <View
                        key={nutrient.label}
                        className={`flex-row justify-between py-1 ${
                          index < additionalNutrients.length - 1
                            ? 'border-b border-border-subtle'
                            : ''
                        }`}
                      >
                        <Text className="text-text-secondary text-sm">
                          {nutrient.label}
                        </Text>
                        <Text className="text-text-primary text-sm">
                          {renderNutrientValue(nutrient.value, nutrient.unit)}
                        </Text>
                      </View>
                    ))}
                  </Animated.View>
                )}
              </View>
            )}
            {hasAdditional && (
              <Animated.View layout={LinearTransition.duration(250)}>
                <Button
                  variant="ghost"
                  onPress={() => setShowMoreNutrients((prev) => !prev)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="self-start py-0 px-0"
                >
                  <Text style={{ color: accentColor }} className="text-sm font-medium">
                    {showMoreNutrients
                      ? 'Hide extra nutrients'
                      : 'Show more nutrients'}
                  </Text>
                </Button>
              </Animated.View>
            )}
          </Animated.View>
        )}

        <Animated.View
          layout={LinearTransition.duration(300)}
          className="mt-2 flex-row items-center"
        >
          <View className="flex-1 flex-row items-center">
            <Text className="text-text-secondary text-base mr-2">Date</Text>
            {isEditing ? (
              <TouchableOpacity
                onPress={() => calendarRef.current?.present()}
                activeOpacity={0.7}
                className="flex-row items-center"
              >
                <Text className="text-text-primary text-base font-medium">
                  {formatDateLabel(selectedDate)}
                </Text>
                <Icon
                  name="chevron-down"
                  size={12}
                  color={textPrimary}
                  style={{ marginLeft: 6 }}
                  weight="medium"
                />
              </TouchableOpacity>
            ) : (
              <Text className="text-text-primary text-base font-medium">
                {formatDateLabel(normalizeDate(entry.entry_date))}
              </Text>
            )}
          </View>

          <View className="flex-1 flex-row items-center">
            <Text className="text-text-secondary text-base mr-2">Meal</Text>
            {isEditing && selectedMealType ? (
              <BottomSheetPicker
                value={effectiveMealId!}
                options={mealPickerOptions}
                onSelect={(id) => updateEdit({ selectedMealId: id })}
                title="Select Meal"
                renderTrigger={({ onPress }) => (
                  <TouchableOpacity
                    onPress={onPress}
                    activeOpacity={0.7}
                    className="flex-row items-center"
                  >
                    <Text className="text-text-primary text-base font-medium">
                      {getMealTypeLabel(selectedMealType.name)}
                    </Text>
                    <Icon
                      name="chevron-down"
                      size={12}
                      color={textPrimary}
                      style={{ marginLeft: 6 }}
                      weight="medium"
                    />
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text className="text-text-primary text-base font-medium">
                {getMealTypeLabel(entry.meal_type)}
              </Text>
            )}
          </View>
        </Animated.View>

        <Animated.View layout={LinearTransition.duration(300)}>
          <Button
            variant="ghost"
            onPress={confirmAndDelete}
            disabled={isDeletePending}
            className="mt-2"
            textClassName="text-bg-danger font-medium"
          >
            {isDeletePending ? 'Deleting...' : 'Delete Entry'}
          </Button>
        </Animated.View>
      </ScrollView>

      {isEditing && (
        <CalendarSheet
          ref={calendarRef}
          selectedDate={selectedDate}
          onSelectDate={(date) => updateEdit({ selectedDate: date })}
        />
      )}
    </View>
  );
};

export default FoodEntryViewScreen;
