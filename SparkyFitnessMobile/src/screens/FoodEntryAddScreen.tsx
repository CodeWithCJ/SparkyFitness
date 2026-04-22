import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { fetchDailyGoals } from '../services/api/goalsApi';
import { CreateFoodEntryPayload } from '../services/api/foodEntriesApi';
import { getTodayDate, formatDateLabel } from '../utils/dateUtils';
import { getMealTypeLabel } from '../constants/meals';
import { goalsQueryKey } from '../hooks/queryKeys';
import { useMealTypes } from '../hooks';
import { useFoodVariants } from '../hooks/useFoodVariants';
import { useSaveFood } from '../hooks/useSaveFood';
import { useAddFoodEntry } from '../hooks/useAddFoodEntry';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import type { FoodFormData } from '../components/FoodForm';
import { toFormString, parseOptional, buildNutrientDisplayList } from '../types/foodInfo';
import { setPendingMealIngredientSelection } from '../services/mealBuilderSelection';
import type { MealIngredientDraft } from '../types/meals';
import type { FoodItem } from '../types/foods';
import type { RootStackScreenProps } from '../types/navigation';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';

type FoodEntryAddScreenProps = RootStackScreenProps<'FoodEntryAdd'>;

function isMealIngredientDraft(
  value: FoodEntryAddScreenProps['route']['params']['item']['originalItem'],
): value is MealIngredientDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    'food_id' in value &&
    'variant_id' in value &&
    'quantity' in value
  );
}

const FoodEntryAddScreen: React.FC<FoodEntryAddScreenProps> = ({ navigation, route }) => {
  const { item, date: initialDate, pickerMode = 'log-entry', ingredientIndex, returnDepth } = route.params;
  const isMealBuilderMode = pickerMode === 'meal-builder';
  const [selectedDate, setSelectedDate] = useState(initialDate ?? getTodayDate());
  const calendarRef = useRef<CalendarSheetRef>(null);
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>();
  const [adjustedValues, setAdjustedValues] = useState<FoodFormData | null>(null);
  const [isReturningIngredient, setIsReturningIngredient] = useState(false);
  const effectiveMealId = selectedMealId ?? defaultMealTypeId;
  const selectedMealType = mealTypes.find((mealType) => mealType.id === effectiveMealId);

  const isLocalFood = item.source === 'local';
  const hasExternalVariants = !!(item.externalVariants && item.externalVariants.length > 1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    hasExternalVariants ? 'ext-0' : item.variantId,
  );

  const { variants } = useFoodVariants(item.id, { enabled: isLocalFood });

  const externalVariantOptions = useMemo(() => {
    if (!item.externalVariants || item.externalVariants.length <= 1) return null;

    return item.externalVariants.map((variant, index) => ({
      id: `ext-${index}`,
      servingSize: variant.serving_size,
      servingUnit: variant.serving_unit,
      servingDescription: variant.serving_description,
      calories: variant.calories,
      protein: variant.protein,
      carbs: variant.carbs,
      fat: variant.fat,
      fiber: variant.fiber,
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
  }, [item.externalVariants]);

  const activeVariant = useMemo(() => {
    if (variants && selectedVariantId) {
      const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
      if (selectedVariant) {
        return {
          servingSize: selectedVariant.serving_size,
          servingUnit: selectedVariant.serving_unit,
          calories: selectedVariant.calories,
          protein: selectedVariant.protein,
          carbs: selectedVariant.carbs,
          fat: selectedVariant.fat,
          fiber: selectedVariant.dietary_fiber,
          saturatedFat: selectedVariant.saturated_fat,
          sodium: selectedVariant.sodium,
          sugars: selectedVariant.sugars,
          transFat: selectedVariant.trans_fat,
          potassium: selectedVariant.potassium,
          calcium: selectedVariant.calcium,
          iron: selectedVariant.iron,
          cholesterol: selectedVariant.cholesterol,
          vitaminA: selectedVariant.vitamin_a,
          vitaminC: selectedVariant.vitamin_c,
        };
      }
    }

    if (externalVariantOptions && selectedVariantId) {
      const selectedVariant = externalVariantOptions.find((variant) => variant.id === selectedVariantId);
      if (selectedVariant) {
        return selectedVariant;
      }
    }

    return {
      servingSize: item.servingSize,
      servingUnit: item.servingUnit,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      fiber: item.fiber,
      saturatedFat: item.saturatedFat,
      transFat: item.transFat,
      sodium: item.sodium,
      sugars: item.sugars,
      potassium: item.potassium,
      calcium: item.calcium,
      iron: item.iron,
      cholesterol: item.cholesterol,
      vitaminA: item.vitaminA,
      vitaminC: item.vitaminC,
    };
  }, [externalVariantOptions, item, selectedVariantId, variants]);

  const displayValues = useMemo(() => {
    if (!adjustedValues) return activeVariant;

    return {
      servingSize: parseDecimalInput(adjustedValues.servingSize) || activeVariant.servingSize,
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
  }, [activeVariant, adjustedValues]);

  const variantPickerOptions = useMemo(() => {
    if (variants && variants.length > 0) {
      return variants.map((variant) => ({
        label: `${variant.serving_size} ${variant.serving_unit} (${variant.calories} cal)`,
        value: variant.id,
      }));
    }

    if (externalVariantOptions) {
      return externalVariantOptions.map((variant) => ({
        label: `${variant.servingDescription} (${variant.calories} cal)`,
        value: variant.id,
      }));
    }

    return [];
  }, [externalVariantOptions, variants]);

  const initialIngredientDraft = useMemo(
    () => (isMealIngredientDraft(item.originalItem) ? item.originalItem : null),
    [item.originalItem],
  );

  const [quantityText, setQuantityText] = useState(
    String(initialIngredientDraft?.quantity ?? activeVariant.servingSize),
  );
  const quantity = parseDecimalInput(quantityText) || 0;
  const servings = displayValues.servingSize > 0 ? quantity / displayValues.servingSize : 0;
  const servingSizeRef = useRef(displayValues.servingSize);

  const adjustedFromNav = route.params?.adjustedValues;
  useEffect(() => {
    servingSizeRef.current = displayValues.servingSize;
  }, [displayValues.servingSize]);

  useEffect(() => {
    if (!adjustedFromNav) return;

    const previousServingSize = servingSizeRef.current;
    const newServingSize = parseDecimalInput(adjustedFromNav.servingSize) || previousServingSize;
    setAdjustedValues(adjustedFromNav);
    if (newServingSize !== previousServingSize) {
      setQuantityText(String(newServingSize));
    }

    navigation.setParams({ adjustedValues: undefined });
  }, [adjustedFromNav, navigation]);

  const handleVariantChange = (variantId: string) => {
    setSelectedVariantId(variantId);
    setAdjustedValues(null);

    if (variants) {
      const selectedVariant = variants.find((variant) => variant.id === variantId);
      if (selectedVariant) {
        setQuantityText(String(selectedVariant.serving_size));
        return;
      }
    }

    if (externalVariantOptions) {
      const selectedVariant = externalVariantOptions.find((variant) => variant.id === variantId);
      if (selectedVariant) {
        setQuantityText(String(selectedVariant.servingSize));
      }
    }
  };

  const updateQuantityText = (text: string) => {
    if (DECIMAL_INPUT_REGEX.test(text)) {
      setQuantityText(text);
    }
  };

  const clampQuantity = () => {
    if (quantity <= 0) {
      const minQuantity = (displayValues.servingSize * 0.5) || 1;
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
    const nextQuantity = boundary !== quantity ? boundary : quantity + delta * increment;
    setQuantityText(String(Math.max(increment, nextQuantity)));
  };

  const scaled = (value: number) => value * servings;

  const insets = useSafeAreaInsets();
  const [accentColor, textPrimary, proteinColor, carbsColor, fatColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
  ]) as [string, string, string, string, string];

  const buildSaveFoodPayload = () => {
    const source = adjustedValues ? displayValues : activeVariant;

    return {
      name: adjustedValues?.name || item.name,
      brand: adjustedValues?.brand ?? item.brand ?? null,
      serving_size: source.servingSize,
      serving_unit: source.servingUnit,
      calories: source.calories,
      protein: source.protein,
      carbs: source.carbs,
      fat: source.fat,
      dietary_fiber: source.fiber,
      saturated_fat: source.saturatedFat,
      sodium: source.sodium,
      sugars: source.sugars,
      trans_fat: source.transFat,
      potassium: source.potassium,
      calcium: source.calcium,
      iron: source.iron,
      cholesterol: source.cholesterol,
      vitamin_a: source.vitaminA,
      vitamin_c: source.vitaminC,
    };
  };

  const buildMealIngredientDraft = (foodId: string, variantId: string): MealIngredientDraft => ({
    food_id: foodId,
    variant_id: variantId,
    quantity,
    unit: displayValues.servingUnit,
    food_name: adjustedValues?.name || item.name,
    brand: adjustedValues?.brand ?? item.brand ?? null,
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
  });

  const buildIngredientFromSavedFood = (savedFood: FoodItem): MealIngredientDraft => {
    const defaultVariant = savedFood.default_variant;
    if (!defaultVariant.id) {
      throw new Error('Saved food is missing a default variant ID');
    }

    return {
      food_id: savedFood.id,
      variant_id: defaultVariant.id,
      quantity,
      unit: defaultVariant.serving_unit,
      food_name: savedFood.name,
      brand: savedFood.brand,
      serving_size: defaultVariant.serving_size,
      serving_unit: defaultVariant.serving_unit,
      calories: defaultVariant.calories,
      protein: defaultVariant.protein,
      carbs: defaultVariant.carbs,
      fat: defaultVariant.fat,
      dietary_fiber: defaultVariant.dietary_fiber,
      saturated_fat: defaultVariant.saturated_fat,
      sodium: defaultVariant.sodium,
      sugars: defaultVariant.sugars,
      trans_fat: defaultVariant.trans_fat,
      potassium: defaultVariant.potassium,
      calcium: defaultVariant.calcium,
      iron: defaultVariant.iron,
      cholesterol: defaultVariant.cholesterol,
      vitamin_a: defaultVariant.vitamin_a,
      vitamin_c: defaultVariant.vitamin_c,
    };
  };

  const {
    saveFood: saveFoodMutate,
    saveFoodAsync,
    isPending: isSavePending,
    isSaved,
  } = useSaveFood();

  const buildFoodEntryPayload = (): CreateFoodEntryPayload => {
    const basePayload = {
      meal_type_id: effectiveMealId!,
      quantity,
      unit: displayValues.servingUnit,
      entry_date: selectedDate,
    };

    switch (item.source) {
      case 'local':
        if (!selectedVariantId) {
          throw new Error('Missing variant ID for local food');
        }

        if (adjustedValues) {
          return {
            ...basePayload,
            food_id: item.id,
            variant_id: selectedVariantId,
            food_name: adjustedValues.name || item.name,
            brand_name: adjustedValues.brand ?? item.brand,
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
        }

        return { ...basePayload, food_id: item.id, variant_id: selectedVariantId };
      case 'external':
        return basePayload;
      case 'meal':
        return {
          ...basePayload,
          meal_id: item.id,
          food_name: item.name,
          serving_size: item.servingSize,
          serving_unit: item.servingUnit,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
        };
    }
  };

  const { addEntry, isPending: isAddPending, invalidateCache } = useAddFoodEntry({
    onSuccess: () => {
      invalidateCache(selectedDate);
      navigation.dispatch(StackActions.popToTop());
    },
  });

  const { data: goals, isLoading: isGoalsLoading } = useQuery({
    queryKey: goalsQueryKey(selectedDate),
    queryFn: () => fetchDailyGoals(selectedDate),
    staleTime: 1000 * 60 * 5,
    enabled: !isMealBuilderMode,
  });

  const goalPercent = (value: number, goalValue: number | undefined) => {
    if (!goalValue || goalValue === 0) return null;
    return Math.round((value / goalValue) * 100);
  };

  const calorieGoalPct = goalPercent(scaled(displayValues.calories), goals?.calories);
  const proteinGoalPct = goalPercent(scaled(displayValues.protein), goals?.protein);
  const carbsGoalPct = goalPercent(scaled(displayValues.carbs), goals?.carbs);
  const fatGoalPct = goalPercent(scaled(displayValues.fat), goals?.fat);

  const proteinCals = displayValues.protein * 4;
  const carbsCals = displayValues.carbs * 4;
  const fatCals = displayValues.fat * 9;
  const totalMacroCals = proteinCals + carbsCals + fatCals;

  const mealPickerOptions = mealTypes.map((mealType) => ({
    label: getMealTypeLabel(mealType.name),
    value: mealType.id,
  }));
  const otherNutrients = buildNutrientDisplayList(displayValues);

  const handleSubmit = async () => {
    if (quantity <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Invalid amount',
        text2: 'Amount must be greater than zero.',
      });
      return;
    }

    if (isMealBuilderMode) {
      if (item.source === 'meal') {
        Toast.show({
          type: 'error',
          text1: 'Meals are not supported here',
          text2: 'Choose individual foods while building a meal.',
        });
        return;
      }

      if (item.source === 'external') {
        setIsReturningIngredient(true);
        try {
          const savedFood = await saveFoodAsync(buildSaveFoodPayload());
          setPendingMealIngredientSelection({
            ingredient: buildIngredientFromSavedFood(savedFood),
            ingredientIndex,
          });
          navigation.dispatch(StackActions.pop(returnDepth ?? 1));
        } catch {
          setIsReturningIngredient(false);
        }
        return;
      }

      if (!selectedVariantId) {
        Toast.show({
          type: 'error',
          text1: 'Missing serving option',
          text2: 'Select a serving before adding this ingredient.',
        });
        return;
      }

      setPendingMealIngredientSelection({
        ingredient: buildMealIngredientDraft(item.id, selectedVariantId),
        ingredientIndex,
      });
      navigation.dispatch(StackActions.pop(returnDepth ?? 1));
      return;
    }

    if (!effectiveMealId) return;

    const saveFoodPayload = item.source === 'external' ? buildSaveFoodPayload() : undefined;
    addEntry({
      saveFoodPayload,
      createEntryPayload: buildFoodEntryPayload(),
    });
  };

  const submitLabel = isMealBuilderMode
    ? ingredientIndex != null
      ? 'Update Ingredient'
      : 'Add Ingredient'
    : 'Add Food';

  const isSubmitting = isMealBuilderMode ? isReturningIngredient || isSavePending : isAddPending;

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>

        {!isMealBuilderMode && item.source !== 'meal' ? (
          <View className="flex-row items-center ml-auto gap-4 z-10">
            <TouchableOpacity
              onPress={() => {
                navigation.navigate('FoodForm', {
                  mode: 'adjust-entry-nutrition',
                  returnTo: 'FoodEntryAdd',
                  returnKey: route.key,
                  foodId: isLocalFood ? item.id : undefined,
                  variantId: isLocalFood ? selectedVariantId : undefined,
                  customNutrients: isLocalFood && variants
                    ? (() => {
                        const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
                        return selectedVariant ? (selectedVariant.custom_nutrients ?? null) : undefined;
                      })()
                    : undefined,
                  initialValues: {
                    name: adjustedValues?.name || item.name,
                    brand: adjustedValues?.brand ?? item.brand ?? '',
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
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Icon name="pencil" size={20} color={accentColor} />
            </TouchableOpacity>

            {item.source === 'external' ? (
              <TouchableOpacity
                onPress={() => saveFoodMutate(buildSaveFoodPayload())}
                disabled={isSavePending || isSaved}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                {isSavePending ? (
                  <ActivityIndicator size="small" color={accentColor} />
                ) : (
                  <Icon
                    name={isSaved ? 'bookmark-filled' : 'bookmark'}
                    size={22}
                    color={accentColor}
                  />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4">
        <View>
          <Text className="text-text-primary text-3xl font-bold">
            {adjustedValues?.name || item.name}
          </Text>
          {adjustedValues?.brand ?? item.brand ? (
            <Text className="text-text-secondary text-base mt-1">
              {adjustedValues?.brand ?? item.brand}
            </Text>
          ) : null}
        </View>

        <View className="bg-surface rounded-xl p-4 flex-row items-center">
          <View className="flex-1 items-center pr-10">
            <Text className="text-text-primary text-3xl font-medium">
              {Math.round(scaled(displayValues.calories))}
            </Text>
            <Text className="text-text-secondary text-base mt-2">calories</Text>
            {isGoalsLoading ? (
              <ActivityIndicator size="small" color={accentColor} className="mt-2" />
            ) : calorieGoalPct !== null ? (
              <Text className="text-text-muted text-sm mt-1">
                {calorieGoalPct}% of goal
              </Text>
            ) : null}
          </View>

          <View className="flex-1 gap-3">
            {[
              { label: 'Protein', value: displayValues.protein, color: proteinColor, pct: proteinGoalPct },
              { label: 'Carbs', value: displayValues.carbs, color: carbsColor, pct: carbsGoalPct },
              { label: 'Fat', value: displayValues.fat, color: fatColor, pct: fatGoalPct },
            ].map((macro) => (
              <View key={macro.label}>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-text-secondary text-sm">{macro.label}</Text>
                  <Text className="text-text-primary text-sm font-medium">
                    {Math.round(scaled(macro.value))}g
                  </Text>
                </View>
                <View className="h-2 rounded-full bg-progress-track overflow-hidden">
                  {totalMacroCals > 0 ? (
                    <View
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: macro.color,
                        width: `${Math.round((macro.value * (macro.label === 'Fat' ? 9 : 4) / totalMacroCals) * 100)}%`,
                      }}
                    />
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </View>

        {otherNutrients.length > 0 ? (
          <View className="rounded-xl">
            {otherNutrients.map((nutrient, index) => (
              <View
                key={nutrient.label}
                className={`flex-row justify-between py-1 ${
                  index < otherNutrients.length - 1 ? 'border-b border-border-subtle' : ''
                }`}
              >
                <Text className="text-text-secondary text-sm">{nutrient.label}</Text>
                <Text className="text-text-primary text-sm">
                  {Math.round(scaled(nutrient.value))}{nutrient.unit}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

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
              {displayValues.servingUnit}
            </Text>
          </View>
          <View className="flex-row items-center mt-2">
            <Text className="text-text-secondary text-sm">
              {servings % 1 === 0 ? servings : servings.toFixed(1)} {servings === 1 ? 'serving' : 'servings'}
            </Text>
            {variantPickerOptions.length > 1 ? (
              <BottomSheetPicker
                value={selectedVariantId!}
                options={variantPickerOptions}
                onSelect={handleVariantChange}
                title="Select Serving"
                renderTrigger={({ onPress }) => (
                  <TouchableOpacity
                    onPress={onPress}
                    activeOpacity={0.7}
                    className="flex-row items-center ml-1"
                  >
                    <Text className="text-text-secondary text-sm">
                      {' \u00b7 '}{displayValues.servingSize} {displayValues.servingUnit} per serving
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
                {' \u00b7 '}{displayValues.servingSize} {displayValues.servingUnit} per serving
              </Text>
            )}
          </View>
        </View>

        {!isMealBuilderMode ? (
          <TouchableOpacity
            onPress={() => calendarRef.current?.present()}
            activeOpacity={0.7}
            className="flex-row items-center mt-2"
          >
            <Text className="text-text-secondary text-base">Date</Text>
            <Text className="text-text-primary text-base font-medium mx-1.5">
              {formatDateLabel(selectedDate)}
            </Text>
            <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
          </TouchableOpacity>
        ) : null}

        {!isMealBuilderMode && selectedMealType ? (
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
                  <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
                </TouchableOpacity>
              )}
            />
          </View>
        ) : null}

        <Button
          variant="primary"
          className="mt-2"
          disabled={
            isSubmitting ||
            quantity <= 0 ||
            (!isMealBuilderMode && !effectiveMealId)
          }
          onPress={() => {
            void handleSubmit();
          }}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-base font-semibold">{submitLabel}</Text>
          )}
        </Button>
      </ScrollView>
      {!isMealBuilderMode ? (
        <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      ) : null}
    </View>
  );
};

export default FoodEntryAddScreen;
