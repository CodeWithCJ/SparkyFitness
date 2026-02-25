import React, { useState, useRef, useMemo } from 'react';
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
import type { FoodInfoItem } from '../types/foodInfo';

interface FoodEntryAddScreenProps {
  navigation?: { goBack: () => void };
  route?: { params: { item: FoodInfoItem; date?: string } };
}

const FoodEntryAddScreen: React.FC<FoodEntryAddScreenProps> = ({ navigation, route }) => {
  const { item, date: initialDate } = route!.params;
  const nav = useNavigation();
  const [selectedDate, setSelectedDate] = useState(initialDate ?? getTodayDate());
  const calendarRef = useRef<CalendarSheetRef>(null);
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>();
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

  const [servingsText, setServingsText] = useState('1');
  const servings = parseFloat(servingsText) || 0;

  const updateServingsText = (text: string) => {
    if (/^\d*\.?\d*$/.test(text)) {
      setServingsText(text);
    }
  };

  const clampServings = () => {
    const clamped = Math.max(0.5, servings);
    setServingsText(String(clamped));
  };

  const adjustServings = (delta: number) => {
    const next = Math.max(0.5, servings + delta);
    setServingsText(String(next));
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

  const saveFoodMutation = useMutation({
    mutationFn: () => saveFood({
      name: item.name,
      brand: item.brand,
      serving_size: activeVariant.servingSize,
      serving_unit: activeVariant.servingUnit,
      calories: activeVariant.calories,
      protein: activeVariant.protein,
      carbs: activeVariant.carbs,
      fat: activeVariant.fat,
      dietary_fiber: activeVariant.fiber,
      saturated_fat: activeVariant.saturatedFat,
      sodium: activeVariant.sodium,
      sugars: activeVariant.sugars,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
    },
  });

  const buildFoodEntryPayload = (savedFood?: { id: string; variantId: string }): CreateFoodEntryPayload => {
    const quantity = activeVariant.servingSize * servings;
    const base = {
      meal_type_id: effectiveMealId!,
      quantity,
      unit: activeVariant.servingUnit,
      entry_date: selectedDate,
    };

    switch (item.source) {
      case 'local':
        if (!selectedVariantId) throw new Error('Missing variant ID for local food');
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
        const saved = await saveFood({
          name: item.name,
          brand: item.brand,
          serving_size: activeVariant.servingSize,
          serving_unit: activeVariant.servingUnit,
          calories: activeVariant.calories,
          protein: activeVariant.protein,
          carbs: activeVariant.carbs,
          fat: activeVariant.fat,
          dietary_fiber: activeVariant.fiber,
          saturated_fat: activeVariant.saturatedFat,
          sodium: activeVariant.sodium,
          sugars: activeVariant.sugars,
        });
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

  const calorieGoalPct = goalPercent(scaled(activeVariant.calories), goals?.calories);
  const proteinGoalPct = goalPercent(scaled(activeVariant.protein), goals?.protein);
  const carbsGoalPct = goalPercent(scaled(activeVariant.carbs), goals?.carbs);
  const fatGoalPct = goalPercent(scaled(activeVariant.fat), goals?.fat);

  // Macro bar proportions by calorie contribution (ratios stay the same regardless of servings)
  const proteinCals = activeVariant.protein * 4;
  const carbsCals = activeVariant.carbs * 4;
  const fatCals = activeVariant.fat * 9;
  const totalMacroCals = proteinCals + carbsCals + fatCals;

  const mealPickerOptions = mealTypes.map((mt) => ({ label: getMealTypeLabel(mt.name), value: mt.id }));

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation!.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        
        {item.source === 'external' && (
          <TouchableOpacity
            onPress={() => saveFoodMutation.mutate()}
            disabled={saveFoodMutation.isPending || saveFoodMutation.isSuccess}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="ml-auto z-10"
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

      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4">
        {/* Food name & brand */}
        <View className="px-4">
          <Text className="text-text-primary text-3xl font-bold">{item.name}</Text>
          {item.brand && (
            <Text className="text-text-secondary text-base mt-1">{item.brand}</Text>
          )}

          {/* Servings control */}
          <View className="mt-4 items-start">
            <View className="flex-row items-center bg-raised border border-border-subtle rounded-xl overflow-hidden">
              <TouchableOpacity
                onPress={() => adjustServings(-0.5)}
                className="w-9 h-10 items-center justify-center border-r border-border-subtle"
                activeOpacity={0.7}
              >
                <Icon name="remove" size={20} color={accentColor} />
              </TouchableOpacity>
              <TextInput
                value={servingsText}
                onChangeText={updateServingsText}
                onBlur={clampServings}
                keyboardType="decimal-pad"
                selectTextOnFocus
                className="text-text-primary text-base text-center w-14 h-10"
                style={{ fontSize: 20, lineHeight: 24 }}
              />
              <TouchableOpacity
                onPress={() => adjustServings(0.5)}
                className="w-9 h-10 items-center justify-center border-l border-border-subtle"
                activeOpacity={0.7}
              >
                <Icon name="add" size={20} color={accentColor} />
              </TouchableOpacity>
            </View>
            {variantPickerOptions.length > 1 ? (
              <BottomSheetPicker
                value={selectedVariantId!}
                options={variantPickerOptions}
                onSelect={setSelectedVariantId}
                title="Select Serving"
                renderTrigger={({ onPress }) => (
                  <TouchableOpacity
                    onPress={onPress}
                    activeOpacity={0.7}
                    className="flex-row items-center mt-1"
                  >
                    <Text className="text-text-secondary text-base">
                      {activeVariant.servingSize} {activeVariant.servingUnit} per serving
                    </Text>
                    <Icon name="chevron-down" size={14} color={textPrimary} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text className="text-text-secondary text-base mt-2">
                {activeVariant.servingSize} {activeVariant.servingUnit} per serving
              </Text>
            )}
          </View>
        </View>

        {/* Calories & Macros */}
        <View className="bg-surface rounded-xl p-4 flex-row items-center">
          {/* Calories — left half */}
          <View className="flex-1 items-center pr-10">
            <Text className="text-text-primary text-3xl font-medium">{Math.round(scaled(activeVariant.calories))}</Text>
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
              { label: 'Protein', value: activeVariant.protein, color: proteinColor, pct: proteinGoalPct },
              { label: 'Carbs', value: activeVariant.carbs, color: carbsColor, pct: carbsGoalPct },
              { label: 'Fat', value: activeVariant.fat, color: fatColor, pct: fatGoalPct },
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
        {(activeVariant.fiber != null || activeVariant.saturatedFat != null || activeVariant.sodium != null || activeVariant.sugars != null) && (
          <View className="rounded-xl my-2 px-4">
            <Text className="text-text-secondary text-sm font-medium mb-2">Other Nutrients</Text>
            {[
              { label: 'Fiber', value: activeVariant.fiber, unit: 'g' },
              { label: 'Sugars', value: activeVariant.sugars, unit: 'g' },
              { label: 'Saturated Fat', value: activeVariant.saturatedFat, unit: 'g' },
              { label: 'Sodium', value: activeVariant.sodium, unit: 'mg' },
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

        {/* Date selector */}
        <TouchableOpacity
          onPress={() => calendarRef.current?.present()}
          activeOpacity={0.7}
          className="flex-row items-center mt-2 mx-4"
        >
          <Text className="text-text-secondary text-sm">Date</Text>
          <Text className="text-text-primary text-sm font-medium mx-1.5">
            {formatDateLabel(selectedDate)}
          </Text>
          <Icon name="chevron-down" size={12} color={textPrimary} />
        </TouchableOpacity>

        {/* Meal type selector */}
        {selectedMealType && (
          <View className="flex-row items-center mt-2 mx-4">
            <Text className="text-text-secondary text-sm">Meal</Text>
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
                  <Text className="text-text-primary text-sm font-medium mx-1.5">
                    {getMealTypeLabel(selectedMealType.name)}
                  </Text>
                  <Icon name="chevron-down" size={12} color={textPrimary} />
                </TouchableOpacity>
              )}
            />
          </View>
        )}


        {/* Action buttons */}
        <TouchableOpacity
          className="bg-accent-primary rounded-[10px] py-3.5 items-center mt-2 mx-4"
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
