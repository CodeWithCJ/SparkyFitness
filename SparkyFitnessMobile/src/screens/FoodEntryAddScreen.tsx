import React, { useState, useRef, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, ScrollView, TextInput, Alert } from 'react-native';
import { StackActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import { fetchDailyGoals } from '../services/api/goalsApi';
import { saveFood, fetchFoodVariants } from '../services/api/foodsApi';
import { createFoodEntry, CreateFoodEntryPayload } from '../services/api/foodEntriesApi';
import { getTodayDate, formatDateLabel } from '../utils/dateUtils';
import { getMealTypeLabel } from '../constants/meals';
import { dailySummaryQueryKey, foodsQueryKey, goalsQueryKey, foodVariantsQueryKey } from '../hooks/queryKeys';
import { useMealTypes } from '../hooks';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import type { FoodFormData } from '../components/FoodForm';
import type { RootStackScreenProps } from '../types/navigation';

type FoodEntryAddScreenProps = RootStackScreenProps<'FoodEntryAdd'>;

const FoodEntryAddScreen: React.FC<FoodEntryAddScreenProps> = ({ navigation, route }) => {
  const { item, date: initialDate } = route.params;
  const nav = useNavigation();
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
    hasExternalVariants ? 'ext-0' : item.variantId,
  );

  const { data: variants } = useQuery({
    queryKey: foodVariantsQueryKey(item.id),
    queryFn: () => fetchFoodVariants(item.id),
    enabled: isLocalFood,
    staleTime: 1000 * 60 * 5,
  });

  const externalVariantOptions = useMemo(() => {
    if (!item.externalVariants || item.externalVariants.length <= 1) return null;
    return item.externalVariants.map((v, i) => ({
      id: `ext-${i}`,
      servingSize: v.serving_size,
      servingUnit: v.serving_unit,
      servingDescription: v.serving_description,
      calories: v.calories,
      protein: v.protein,
      carbs: v.carbs,
      fat: v.fat,
      fiber: v.fiber,
      saturatedFat: v.saturated_fat,
      sodium: v.sodium,
      sugars: v.sugars,
    }));
  }, [item.externalVariants]);

  const activeVariant = useMemo(() => {
    if (variants && selectedVariantId) {
      const v = variants.find((v) => v.id === selectedVariantId);
      if (v) {
        return {
          servingSize: v.serving_size,
          servingUnit: v.serving_unit,
          calories: v.calories,
          protein: v.protein,
          carbs: v.carbs,
          fat: v.fat,
          fiber: v.dietary_fiber,
          saturatedFat: v.saturated_fat,
          sodium: v.sodium,
          sugars: v.sugars,
        };
      }
    }
    if (externalVariantOptions && selectedVariantId) {
      const ev = externalVariantOptions.find((v) => v.id === selectedVariantId);
      if (ev) return ev;
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
      sodium: item.sodium,
      sugars: item.sugars,
    };
  }, [variants, externalVariantOptions, selectedVariantId, item]);

  const displayValues = useMemo(() => {
    if (!adjustedValues) return activeVariant;
    return {
      servingSize: parseFloat(adjustedValues.servingSize) || activeVariant.servingSize,
      servingUnit: adjustedValues.servingUnit || activeVariant.servingUnit,
      calories: parseFloat(adjustedValues.calories) || 0,
      protein: parseFloat(adjustedValues.protein) || 0,
      carbs: parseFloat(adjustedValues.carbs) || 0,
      fat: parseFloat(adjustedValues.fat) || 0,
      fiber: adjustedValues.fiber ? parseFloat(adjustedValues.fiber) : undefined,
      saturatedFat: adjustedValues.saturatedFat ? parseFloat(adjustedValues.saturatedFat) : undefined,
      sodium: adjustedValues.sodium ? parseFloat(adjustedValues.sodium) : undefined,
      sugars: adjustedValues.sugars ? parseFloat(adjustedValues.sugars) : undefined,
    };
  }, [adjustedValues, activeVariant]);

  const variantPickerOptions = useMemo(() => {
    if (variants && variants.length > 0) {
      return variants.map((v) => ({
        label: `${v.serving_size} ${v.serving_unit} (${v.calories} cal)`,
        value: v.id,
      }));
    }
    if (externalVariantOptions) {
      return externalVariantOptions.map((v) => ({
        label: `${v.servingDescription} (${v.calories} cal)`,
        value: v.id,
      }));
    }
    return [];
  }, [variants, externalVariantOptions]);

  const [quantityText, setQuantityText] = useState(String(activeVariant.servingSize));
  const quantity = parseFloat(quantityText) || 0;
  const servings = displayValues.servingSize > 0 ? quantity / displayValues.servingSize : 0;
  const servingSizeRef = useRef(displayValues.servingSize);

  const adjustedFromNav = route.params?.adjustedValues;
  useEffect(() => {
    servingSizeRef.current = displayValues.servingSize;
  }, [displayValues.servingSize]);

  useEffect(() => {
    if (adjustedFromNav) {
      const previousServingSize = servingSizeRef.current;
      const newServingSize = parseFloat(adjustedFromNav.servingSize) || previousServingSize;
      setAdjustedValues(adjustedFromNav);
      if (newServingSize !== previousServingSize) {
        setQuantityText(String(newServingSize));
      }
      // Clear route params so variant changes don't replay stale overrides
      navigation.setParams({ adjustedValues: undefined });
    }
  }, [adjustedFromNav, navigation]);

  const handleVariantChange = (variantId: string) => {
    setSelectedVariantId(variantId);
    setAdjustedValues(null);
    if (variants) {
      const v = variants.find((v) => v.id === variantId);
      if (v) { setQuantityText(String(v.serving_size)); return; }
    }
    if (externalVariantOptions) {
      const ev = externalVariantOptions.find((v) => v.id === variantId);
      if (ev) { setQuantityText(String(ev.servingSize)); return; }
    }
  };

  const updateQuantityText = (text: string) => {
    if (/^\d*\.?\d*$/.test(text)) {
      setQuantityText(text);
    }
  };

  const clampQuantity = () => {
    const minQuantity = displayValues.servingSize * 0.5;
    const clamped = Math.max(minQuantity, quantity);
    setQuantityText(String(clamped));
  };

  const adjustQuantity = (delta: number) => {
    const step = displayValues.servingSize;
    const increment = step * 0.5;
    const minQuantity = increment;
    if (quantity < minQuantity) {
      if (delta > 0) setQuantityText(String(minQuantity));
      return;
    }
    const boundary =
      delta > 0
        ? Math.ceil(quantity / increment) * increment
        : Math.floor(quantity / increment) * increment;
    const next = boundary !== quantity ? boundary : quantity + delta * increment;
    setQuantityText(String(Math.max(minQuantity, next)));
  };

  const scaled = (value: number) => value * servings;

  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
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
      brand: adjustedValues?.brand ?? item.brand,
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
    };
  };

  const saveFoodMutation = useMutation({
    mutationFn: () => saveFood(buildSaveFoodPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
    },
  });

  const buildFoodEntryPayload = (savedFood?: { id: string; variantId: string }): CreateFoodEntryPayload => {
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
          };
        }
        return { ...base, food_id: item.id, variant_id: selectedVariantId };
      case 'external':
        if (!savedFood) throw new Error('External food must be saved before creating entry');
        return { ...base, food_id: savedFood.id, variant_id: savedFood.variantId };
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
        };
    }
  };

  const addFoodEntryMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveMealId) throw new Error('No meal type selected');

      if (item.source === 'external') {
        const saved = await saveFood(buildSaveFoodPayload());
        return createFoodEntry(buildFoodEntryPayload({
          id: saved.id,
          variantId: saved.default_variant.id!,
        }));
      }

      return createFoodEntry(buildFoodEntryPayload());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(selectedDate) });
      queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
      nav.dispatch(StackActions.popToTop());
    },
    onError: () => {
      Alert.alert('Failed to add food', 'Please try again.');
    },
  });

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

  // Macro bar proportions by calorie contribution (ratios stay the same regardless of servings)
  const proteinCals = displayValues.protein * 4;
  const carbsCals = displayValues.carbs * 4;
  const fatCals = displayValues.fat * 9;
  const totalMacroCals = proteinCals + carbsCals + fatCals;

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
                  initialValues: {
                    name: adjustedValues?.name || item.name,
                    brand: adjustedValues?.brand ?? item.brand ?? '',
                    servingSize: String(displayValues.servingSize),
                    servingUnit: displayValues.servingUnit,
                    calories: String(displayValues.calories),
                    protein: String(displayValues.protein),
                    carbs: String(displayValues.carbs),
                    fat: String(displayValues.fat),
                    fiber: displayValues.fiber != null ? String(displayValues.fiber) : '',
                    saturatedFat: displayValues.saturatedFat != null ? String(displayValues.saturatedFat) : '',
                    sodium: displayValues.sodium != null ? String(displayValues.sodium) : '',
                    sugars: displayValues.sugars != null ? String(displayValues.sugars) : '',
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
                onPress={() => saveFoodMutation.mutate()}
                disabled={saveFoodMutation.isPending || saveFoodMutation.isSuccess}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                {saveFoodMutation.isPending ? (
                  <ActivityIndicator size="small" color={accentColor} />
                ) : (
                  <Icon
                    name={saveFoodMutation.isSuccess ? 'bookmark-filled' : 'bookmark'}
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
        {/* Food name & brand */}
        <View className="">
          <Text className="text-text-primary text-3xl font-bold">{adjustedValues?.name || item.name}</Text>
          {(adjustedValues?.brand ?? item.brand) ? (
            <Text className="text-text-secondary text-base mt-1">{adjustedValues?.brand ?? item.brand}</Text>
          ) : null}

        </View>

        {/* Calories & Macros */}
        <View className="bg-surface rounded-xl p-4 flex-row items-center">
          {/* Calories — left half */}
          <View className="flex-1 items-center pr-10">
            <Text className="text-text-primary text-3xl font-medium">{Math.round(scaled(displayValues.calories))}</Text>
            <Text className="text-text-secondary text-base mt-2">calories</Text>
            {isGoalsLoading ? (
              <ActivityIndicator size="small" color={accentColor} className="mt-2" />
            ) : calorieGoalPct !== null ? (
              <Text className="text-text-muted text-sm mt-1">
                {calorieGoalPct}% of goal
              </Text>
            ) : null}
          </View>

          {/* Macro bars — right half */}
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
                  {totalMacroCals > 0 && (
                    <View
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: macro.color,
                        width: `${Math.round((macro.value * (macro.label === 'Fat' ? 9 : 4) / totalMacroCals) * 100)}%`,
                      }}
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Additional nutrition details */}
        {(displayValues.fiber != null || displayValues.saturatedFat != null || displayValues.sodium != null || displayValues.sugars != null) && (
          <View className="rounded-xl">
            {[
              { label: 'Fiber', value: displayValues.fiber, unit: 'g' },
              { label: 'Sugars', value: displayValues.sugars, unit: 'g' },
              { label: 'Saturated Fat', value: displayValues.saturatedFat, unit: 'g' },
              { label: 'Sodium', value: displayValues.sodium, unit: 'mg' },
            ]
              .filter((n) => n.value != null)
              .map((n, i, arr) => (
                <View key={n.label} className={`flex-row justify-between py-1 ${i < arr.length - 1 ? 'border-b border-border-subtle' : ''}`}>
                  <Text className="text-text-secondary text-sm">{n.label}</Text>
                  <Text className="text-text-primary text-sm">
                    {Math.round(scaled(n.value!))}{n.unit}
                  </Text>
                </View>
              ))}
          </View>
        )}
        {/* Quantity control */}
        <View className="mt-2">
          <View className="flex-row items-center">
            <View className="flex-row items-center bg-raised border border-border-subtle rounded-lg overflow-hidden">
              <TouchableOpacity
                onPress={() => adjustQuantity(-1)}
                className="w-10 h-10 items-center justify-center border-r border-border-subtle"
                activeOpacity={0.7}
              >
                <Icon name="remove" size={20} color={accentColor} />
              </TouchableOpacity>
              <TextInput
                value={quantityText}
                onChangeText={updateQuantityText}
                onBlur={clampQuantity}
                keyboardType="decimal-pad"
                selectTextOnFocus
                className="text-text-primary text-base text-center w-14 h-10"
                style={{ fontSize: 20, lineHeight: 22 }}
              />
              <TouchableOpacity
                onPress={() => adjustQuantity(1)}
                className="w-10 h-10 items-center justify-center border-l border-border-subtle"
                activeOpacity={0.7}
              >
                <Icon name="add" size={20} color={accentColor} />
              </TouchableOpacity>
            </View>
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
        {selectedMealType && (
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
        )}


        {/* Action buttons */}
        <TouchableOpacity
          className="bg-accent-primary rounded-[10px] py-3.5 items-center mt-2"
          activeOpacity={0.8}
          disabled={addFoodEntryMutation.isPending || !effectiveMealId || servings < 0.5}
          style={(!effectiveMealId || servings < 0.5) ? { opacity: 0.5 } : undefined}
          onPress={() => addFoodEntryMutation.mutate()}
        >
          {addFoodEntryMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-base font-semibold">Add Food</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
    </View>
  );
};

export default FoodEntryAddScreen;
