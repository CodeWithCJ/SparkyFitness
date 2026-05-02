import React, { useState, useRef, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, ScrollView } from 'react-native';
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
import { useMealTypes } from '../hooks';
import { useFoodVariants } from '../hooks/useFoodVariants';
import { useSaveFood } from '../hooks/useSaveFood';
import { useAddFoodEntry } from '../hooks/useAddFoodEntry';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import type { FoodFormData } from '../components/FoodForm';
import type { MealIngredientDraft } from '../types/meals';
import { toFormString, parseOptional } from '../types/foodInfo';
import type { RootStackScreenProps } from '../types/navigation';
import {
  buildExternalVariantOptions,
  buildLocalVariantOptions,
  resolveFoodDisplayValues,
} from '../utils/foodDetails';
import {
  buildMealIngredientDraft,
  buildMealIngredientDraftFromSavedFood,
} from '../utils/mealBuilderDraft';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';

type FoodEntryAddScreenProps = RootStackScreenProps<'FoodEntryAdd'>;

const FoodEntryAddScreen: React.FC<FoodEntryAddScreenProps> = ({ navigation, route }) => {
  const { item, date: initialDate } = route.params;
  const pickerMode = route.params?.pickerMode ?? 'log-entry';
  const returnDepth = route.params?.returnDepth ?? 1;
  const ingredientIndex = route.params?.ingredientIndex;
  const isMealBuilderMode = pickerMode === 'meal-builder';
  const [selectedDate, setSelectedDate] = useState(initialDate ?? getTodayDate());
  const calendarRef = useRef<CalendarSheetRef>(null);
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>();
  const [adjustedValues, setAdjustedValues] = useState<FoodFormData | null>(null);
  const effectiveMealId = selectedMealId ?? defaultMealTypeId;
  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);

  const isLocalFood = item.source === 'local';
  const hasExternalVariants = !!(item.externalVariants && item.externalVariants.length > 1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    hasExternalVariants ? (item.variantId ?? 'ext-0') : item.variantId,
  );

  const { variants } = useFoodVariants(item.id, { enabled: isLocalFood });

  const localVariantOptions = useMemo(
    () => buildLocalVariantOptions(variants),
    [variants],
  );
  const externalVariantOptions = useMemo(
    () => buildExternalVariantOptions(item.externalVariants),
    [item.externalVariants],
  );

  const activeVariant = useMemo(() => {
    return resolveFoodDisplayValues({
      item,
      selectedVariantId,
      localVariantOptions,
      externalVariantOptions,
    });
  }, [item, selectedVariantId, localVariantOptions, externalVariantOptions]);

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
  }, [adjustedValues, activeVariant]);

  const variantPickerOptions = useMemo(() => {
    if (localVariantOptions.length > 0) {
      return localVariantOptions.map((variant) => ({
        label: variant.label,
        value: variant.id,
      }));
    }
    if (externalVariantOptions.length > 0) {
      return externalVariantOptions.map((variant) => ({
        label: variant.label,
        value: variant.id,
      }));
    }
    return [];
  }, [localVariantOptions, externalVariantOptions]);

  const initialQuantity = useMemo(() => {
    if (
      item.source === 'local' &&
      'quantity' in item.originalItem &&
      typeof item.originalItem.quantity === 'number'
    ) {
      return item.originalItem.quantity;
    }
    return activeVariant.servingSize;
  }, [activeVariant.servingSize, item]);

  const [quantityText, setQuantityText] = useState(String(initialQuantity));
  const quantity = parseDecimalInput(quantityText) || 0;
  const servings = displayValues.servingSize > 0 ? quantity / displayValues.servingSize : 0;
  const servingSizeRef = useRef(displayValues.servingSize);

  const adjustedFromNav = route.params?.adjustedValues;
  useEffect(() => {
    servingSizeRef.current = displayValues.servingSize;
  }, [displayValues.servingSize]);

  useEffect(() => {
    if (adjustedFromNav) {
      const previousServingSize = servingSizeRef.current;
      const newServingSize = parseDecimalInput(adjustedFromNav.servingSize) || previousServingSize;
      setAdjustedValues(adjustedFromNav);
      if (newServingSize !== previousServingSize) {
        setQuantityText(String(newServingSize));
      }
      // Clear route params so variant changes don't replay stale overrides
      navigation.setParams({ adjustedValues: undefined });
    }
  }, [adjustedFromNav, navigation]);

  useEffect(() => {
    if (!selectedVariantId && localVariantOptions.length > 0) {
      setSelectedVariantId(localVariantOptions[0].id);
      setQuantityText(String(localVariantOptions[0].servingSize));
    }
  }, [selectedVariantId, localVariantOptions]);

  const handleVariantChange = (variantId: string) => {
    setSelectedVariantId(variantId);
    setAdjustedValues(null);
    if (localVariantOptions.length > 0) {
      const localVariant = localVariantOptions.find((variant) => variant.id === variantId);
      if (localVariant) { setQuantityText(String(localVariant.servingSize)); return; }
    }
    if (externalVariantOptions.length > 0) {
      const externalVariant = externalVariantOptions.find((variant) => variant.id === variantId);
      if (externalVariant) { setQuantityText(String(externalVariant.servingSize)); return; }
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
    const next = boundary !== quantity ? boundary : quantity + delta * increment;
    setQuantityText(String(Math.max(increment, next)));
  };

  const scaled = (value: number) => value * servings;

  const insets = useSafeAreaInsets();
  const [accentColor, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
  ]) as [string, string];

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

  const {
    saveFood: saveFoodMutate,
    saveFoodAsync,
    isPending: isSavePending,
    isSaved,
  } = useSaveFood();

  const buildFoodEntryPayload = (): CreateFoodEntryPayload => {
    const base = {
      meal_type_id: effectiveMealId!,
      quantity,
      unit: displayValues.servingUnit,
      entry_date: selectedDate,
    };

    switch (item.source) {
      case 'local':
        if (!selectedVariantId) throw new Error('Missing variant ID for local food');
        if (adjustedValues) {
          return {
            ...base,
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
        return { ...base, food_id: item.id, variant_id: selectedVariantId };
      case 'external':
        // food_id and variant_id are set by useAddFoodEntry after saving the food
        return base;
      case 'meal':
        return {
          ...base,
          meal_id: item.id,
          food_name: item.name,
          serving_size: item.servingSize,
          serving_unit: item.servingUnit,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          dietary_fiber: item.fiber,
          saturated_fat: item.saturatedFat,
          sodium: item.sodium,
          sugars: item.sugars,
          trans_fat: item.transFat,
          potassium: item.potassium,
          calcium: item.calcium,
          iron: item.iron,
          cholesterol: item.cholesterol,
          vitamin_a: item.vitaminA,
          vitamin_c: item.vitaminC,
        };
    }
  };

  const { addEntry, isPending: isAddPending, invalidateCache } = useAddFoodEntry({
    onSuccess: () => {
      invalidateCache(selectedDate);
      navigation.dispatch(StackActions.popToTop());
    },
  });

  const buildDraftFromCurrentValues = (
    foodId: string,
    variantId: string,
    foodName: string,
    brand?: string | null,
  ): MealIngredientDraft => {
    return buildMealIngredientDraft({
      foodId,
      variantId,
      quantity,
      unit: displayValues.servingUnit,
      foodName,
      brand,
      values: displayValues,
    });
  };

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

    switch (item.source) {
      case 'local': {
        try {
          const variantId = selectedVariantId ?? item.variantId;
          if (!variantId) {
            throw new Error('Missing variant ID for local food');
          }

          finishMealBuilderSelection(
            buildDraftFromCurrentValues(
              item.id,
              variantId,
              adjustedValues?.name || item.name,
              adjustedValues?.brand ?? item.brand,
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
          // Save failures already show a toast in useSaveFood.
          return;
        }

        try {
          finishMealBuilderSelection(
            buildMealIngredientDraftFromSavedFood(
              savedFood,
              quantity,
              displayValues.servingUnit,
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
      case 'meal':
        Toast.show({
          type: 'error',
          text1: 'Meals not supported here',
          text2: 'Select a food instead of another meal.',
        });
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

  const calorieGoalPct = goalPercent(scaled(displayValues.calories), goals?.calories);
  const proteinGoalPct = goalPercent(scaled(displayValues.protein), goals?.protein);
  const carbsGoalPct = goalPercent(scaled(displayValues.carbs), goals?.carbs);
  const fatGoalPct = goalPercent(scaled(displayValues.fat), goals?.fat);

  const mealPickerOptions = mealTypes.map((mt) => ({ label: getMealTypeLabel(mt.name), value: mt.id }));

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>

        {item.source !== 'meal' && (
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
                        const selectedVariant = variants.find((v) => v.id === selectedVariantId);
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

            {item.source === 'external' && (
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
            )}
          </View>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4">
        <FoodNutritionSummary
          name={adjustedValues?.name || item.name}
          brand={adjustedValues?.brand ?? item.brand}
          values={displayValues}
          servings={servings}
          goalPercentages={isGoalsLoading ? undefined : {
            calories: calorieGoalPct,
            protein: proteinGoalPct,
            carbs: carbsGoalPct,
            fat: fatGoalPct,
          }}
        />

        {/* Quantity control */}
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
                      {' · '}{displayValues.servingSize} {displayValues.servingUnit} per serving
                    </Text>
                    <Icon name="chevron-down" size={12} color={textPrimary} style={{ marginLeft: 4 }} weight="medium" />
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text className="text-text-secondary text-sm">
                {' · '}{displayValues.servingSize} {displayValues.servingUnit} per serving
              </Text>
            )}
          </View>
        </View>

        {!isMealBuilderMode ? (
          <>
            {/* Date selector */}
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

            {/* Meal type selector */}
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
                      <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
                    </TouchableOpacity>
                  )}
                />
              </View>
            ) : null}
          </>
        ) : null}


        {/* Action buttons */}
        <Button
          variant="primary"
          className="mt-2"
          disabled={isAddPending || isSavePending || (!isMealBuilderMode && !effectiveMealId) || quantity <= 0}
          onPress={() => {
            if (isMealBuilderMode) {
              void handleMealBuilderAdd();
              return;
            }

            if (!effectiveMealId) return;
            const saveFoodPayload = item.source === 'external' ? buildSaveFoodPayload() : undefined;
            addEntry({
              saveFoodPayload,
              createEntryPayload: buildFoodEntryPayload(),
            });
          }}
        >
          {isAddPending || isSavePending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-base font-semibold">
              {item.source === 'meal' ? 'Add Meal' : 'Add Food'}
            </Text>
          )}
        </Button>
      </ScrollView>
      <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
    </View>
  );
};

export default FoodEntryAddScreen;
