import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, TextInput } from 'react-native';
import Button from '../components/ui/Button';
import Animated, { LinearTransition } from 'react-native-reanimated';
import FadeView from '../components/FadeView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { normalizeDate, formatDateLabel } from '../utils/dateUtils';
import { getMealTypeLabel } from '../constants/meals';
import { useMealTypes } from '../hooks';
import { useFoodVariants } from '../hooks/useFoodVariants';
import { useDeleteFoodEntry } from '../hooks/useDeleteFoodEntry';
import { useUpdateFoodEntry } from '../hooks/useUpdateFoodEntry';
import { useProfile } from '../hooks/useProfile';
import type { UpdateFoodEntryPayload } from '../services/api/foodEntriesApi';
import type { FoodFormData } from '../components/FoodForm';
import { toFormString, parseOptional, buildNutrientDisplayList } from '../types/foodInfo';
import type { FoodVariantDetail } from '../types/foods';
import type { FoodEntry } from '../types/foodEntries';
import type { RootStackScreenProps } from '../types/navigation';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';

type FoodEntryViewScreenProps = RootStackScreenProps<'FoodEntryView'>;

const scaledValue = (value: number | undefined, entry: FoodEntry): number => {
  if (value === undefined || !entry.serving_size) return 0;
  return (value * entry.quantity) / entry.serving_size;
};

const FoodEntryViewScreen: React.FC<FoodEntryViewScreenProps> = ({ navigation, route }) => {
  const [entry, setEntry] = useState(route.params.entry);
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const calendarRef = useRef<CalendarSheetRef>(null);

  const canEdit = !!(entry.user_id && profile?.id === entry.user_id && !entry.food_entry_meal_id);

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

  const { isEditing, selectedDate, selectedMealId, selectedVariantId, quantityText, adjustedValues } = editState;
  const updateEdit = useCallback((patch: Partial<EditState>) => setEditState(prev => ({ ...prev, ...patch })), []);

  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const effectiveMealId = selectedMealId ?? defaultMealTypeId;
  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);

  // Fetch variants if entry has a food_id
  const { variants } = useFoodVariants(entry.food_id!, { enabled: !!entry.food_id });

  // Active variant: the currently selected variant's data, or fallback to entry snapshot
  const activeVariant = useMemo(() => {
    if (variants && selectedVariantId && selectedVariantId !== entry.variant_id) {
      const v = variants.find((v: FoodVariantDetail) => v.id === selectedVariantId);
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
          transFat: v.trans_fat,
          potassium: v.potassium,
          calcium: v.calcium,
          iron: v.iron,
          cholesterol: v.cholesterol,
          vitaminA: v.vitamin_a,
          vitaminC: v.vitamin_c,
        };
      }
    }
    return {
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
    };
  }, [variants, selectedVariantId, entry]);

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

  const quantity = parseDecimalInput(quantityText) || 0;
  const editServings = displayValues.servingSize > 0 ? quantity / displayValues.servingSize : 0;
  const scaled = (value: number) => value * editServings;
  const servingSizeRef = useRef(displayValues.servingSize);

  // Variant picker options
  const variantPickerOptions = useMemo(() => {
    if (!variants || variants.length <= 1) return [];
    return variants.map((v: FoodVariantDetail) => ({
      label: `${v.serving_size} ${v.serving_unit} (${v.calories} cal)`,
      value: v.id,
    }));
  }, [variants]);

  // Watch for adjusted values returned from FoodForm
  const adjustedFromNav = route.params?.adjustedValues;
  useEffect(() => {
    servingSizeRef.current = displayValues.servingSize;
  }, [displayValues.servingSize]);

  useEffect(() => {
    if (adjustedFromNav) {
      const previousServingSize = servingSizeRef.current;
      const newServingSize = parseDecimalInput(adjustedFromNav.servingSize) || previousServingSize;
      updateEdit({
        adjustedValues: adjustedFromNav,
        ...(newServingSize !== previousServingSize ? { quantityText: String(newServingSize) } : {}),
      });
      // Clear route params so variant changes don't replay stale overrides
      navigation.setParams({ adjustedValues: undefined });
    }
  }, [adjustedFromNav, navigation, updateEdit]);

  const handleVariantChange = (variantId: string) => {
    const v = variants?.find((v: FoodVariantDetail) => v.id === variantId);
    updateEdit({
      selectedVariantId: variantId,
      adjustedValues: null,
      ...(v ? { quantityText: String(v.serving_size) } : {}),
    });
  };

  const updateQuantityText = (text: string) => {
    if (DECIMAL_INPUT_REGEX.test(text)) {
      updateEdit({ quantityText: text });
    }
  };

 const clampQuantity = () => {
    if (quantity <= 0) {
      const minQuantity = (displayValues.servingSize * 0.5) || 1;
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
    const next = boundary !== quantity ? boundary : quantity + delta * increment;
    updateEdit({ quantityText: String(Math.max(increment, next)) });
  };

  const navigateToNutritionForm = () => {
    navigation.navigate('FoodForm', {
      mode: 'adjust-entry-nutrition',
      returnTo: 'FoodEntryView',
      returnKey: route.key,
      foodId: entry.food_id ?? undefined,
      variantId: selectedVariantId,
      customNutrients: variants
        ? (() => {
            const selectedVariant = variants.find((v: FoodVariantDetail) => v.id === selectedVariantId);
            return selectedVariant ? (selectedVariant.custom_nutrients ?? null) : undefined;
          })()
        : undefined,
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

  const mealPickerOptions = mealTypes.map((mt) => ({ label: getMealTypeLabel(mt.name), value: mt.id }));

  // --- Update mutation ---
  const { updateEntry, isPending: isUpdatePending, invalidateCache: invalidateUpdateCache } = useUpdateFoodEntry({
    entryId: entry.id,
    entryDate: entry.entry_date,
    onSuccess: (updatedEntry) => {
      invalidateUpdateCache(selectedDate);
      // Merge with current entry to preserve fields the API doesn't return (e.g. meal_type name)
      const mergedEntry = { ...entry, ...updatedEntry };
      // If meal type changed, update the name from our local mealTypes list
      if (updatedEntry.meal_type_id && updatedEntry.meal_type_id !== entry.meal_type_id) {
        const mt = mealTypes.find((m) => m.id === updatedEntry.meal_type_id);
        if (mt) mergedEntry.meal_type = mt.name;
      }
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
    if (effectiveMealId && effectiveMealId !== entry.meal_type_id) payload.meal_type_id = effectiveMealId;

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

    // Nothing changed — just exit edit mode
    if (Object.keys(payload).length === 0) {
      updateEdit({ isEditing: false });
      return;
    }

    updateEntry(payload);
  };

  // --- Delete mutation ---
  const { confirmAndDelete, isPending: isDeletePending, invalidateCache: invalidateDeleteCache } = useDeleteFoodEntry({
    entryId: entry.id,
    entryDate: entry.entry_date,
    onSuccess: () => {
      invalidateDeleteCache();
      navigation.goBack();
    },
  });

  // --- CSS variables ---
  const [accentColor, textPrimary, proteinColor, carbsColor, fatColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
  ]) as [string, string, string, string, string];

  // --- View mode computed values ---
  const viewCalories = Math.round(scaledValue(entry.calories, entry));
  const viewProtein = Math.round(scaledValue(entry.protein, entry));
  const viewCarbs = Math.round(scaledValue(entry.carbs, entry));
  const viewFat = Math.round(scaledValue(entry.fat, entry));

  const viewProteinCals = viewProtein * 4;
  const viewCarbsCals = viewCarbs * 4;
  const viewFatCals = viewFat * 9;
  const viewTotalMacroCals = viewProteinCals + viewCarbsCals + viewFatCals;

  // --- Edit mode computed values ---
  const editProteinCals = displayValues.protein * 4;
  const editCarbsCals = displayValues.carbs * 4;
  const editFatCals = displayValues.fat * 9;
  const editTotalMacroCals = editProteinCals + editCarbsCals + editFatCals;

  const servings = entry.serving_size ? entry.quantity / entry.serving_size : entry.quantity;
  const servingsDisplay = servings === 1
    ? `1 serving · ${entry.serving_size} ${entry.unit} per serving`
    : `${servings % 1 === 0 ? servings : parseFloat(servings.toFixed(2))} servings · ${entry.serving_size} ${entry.unit} per serving`;

  const otherNutrients = buildNutrientDisplayList(displayValues);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
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

      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4">
        {/* Food name & brand */}
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
                  {editServings % 1 === 0 ? editServings : parseFloat(editServings.toFixed(2))} {editServings === 1 ? 'serving' : 'servings'}
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
            </FadeView>
          ) : (
            <FadeView key="view-serving">
              <Text className="text-text-secondary text-sm mt-3">{servingsDisplay}</Text>
            </FadeView>
          )}
        </Animated.View>

        {/* Calories & Macros */}
        <Animated.View layout={LinearTransition.duration(300)} className="bg-surface rounded-xl p-4 shadow-sm">
        <Pressable
          onPress={isEditing ? navigateToNutritionForm : undefined}
          disabled={!isEditing}
        >
          <Animated.View layout={LinearTransition.duration(300)} className="flex-row items-center">
            <View className="flex-1 items-center pr-10">
              <Text className="text-text-primary text-3xl font-medium">
                {isEditing ? Math.round(scaled(displayValues.calories)) : viewCalories}
              </Text>
              <Text className="text-text-secondary text-base mt-1">calories</Text>
            </View>
            <Animated.View layout={LinearTransition.duration(300)} className="flex-2 gap-3">
              {(isEditing
                ? [
                    { label: 'Protein', value: displayValues.protein, color: proteinColor, calFactor: 4, totalCals: editTotalMacroCals, displayValue: Math.round(scaled(displayValues.protein)) },
                    { label: 'Carbs', value: displayValues.carbs, color: carbsColor, calFactor: 4, totalCals: editTotalMacroCals, displayValue: Math.round(scaled(displayValues.carbs)) },
                    { label: 'Fat', value: displayValues.fat, color: fatColor, calFactor: 9, totalCals: editTotalMacroCals, displayValue: Math.round(scaled(displayValues.fat)) },
                  ]
                : [
                    { label: 'Protein', value: viewProtein, color: proteinColor, calFactor: 4, totalCals: viewTotalMacroCals, displayValue: viewProtein },
                    { label: 'Carbs', value: viewCarbs, color: carbsColor, calFactor: 4, totalCals: viewTotalMacroCals, displayValue: viewCarbs },
                    { label: 'Fat', value: viewFat, color: fatColor, calFactor: 9, totalCals: viewTotalMacroCals, displayValue: viewFat },
                  ]
              ).map((macro) => (
                <View key={macro.label} className="flex-row items-center">
                  <Text className="text-text-secondary text-sm w-14">{macro.label}</Text>
                  <View className="flex-1 h-2 rounded-full bg-progress-track overflow-hidden mx-2">
                    {macro.totalCals > 0 && (
                      <View
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: macro.color,
                          width: `${Math.round((macro.value * macro.calFactor / macro.totalCals) * 100)}%`,
                        }}
                      />
                    )}
                  </View>
                  <Text className="text-text-primary text-sm font-medium w-10 text-right">{macro.displayValue}g</Text>
                </View>
              ))}
            </Animated.View>
            {isEditing && (
              <FadeView>
                <Icon name="chevron-forward" size={16} color={textPrimary} style={{ marginLeft: 8 }} />
              </FadeView>
            )}
          </Animated.View>
          {isEditing && (
            <FadeView>
              <Text className="text-text-secondary text-xs text-center mt-4">Tap to edit nutrition</Text>
            </FadeView>
          )}
        </Pressable>
        </Animated.View>

        {/* Other Nutrients */}
        {otherNutrients.length > 0 && (
          <Animated.View layout={LinearTransition.duration(300)} className="rounded-xl my-2">
            {otherNutrients.map((n, i) => (
              <View key={n.label} className={`flex-row justify-between py-1 ${i < otherNutrients.length - 1 ? 'border-b border-border-subtle' : ''}`}>
                <Text className="text-text-secondary text-sm">{n.label}</Text>
                <Text className="text-text-primary text-sm">
                  {isEditing
                    ? `${Math.round(scaled(n.value!))}${n.unit}`
                    : `${Math.round(scaledValue(n.value!, entry))}${n.unit}`
                  }
                </Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* Date & Meal type */}
        <Animated.View layout={LinearTransition.duration(300)} className="mt-2 flex-row items-center">
          {/* Date */}
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
                <Icon name="chevron-down" size={12} color={textPrimary} style={{ marginLeft: 6 }} weight="medium" />
              </TouchableOpacity>
            ) : (
              <Text className="text-text-primary text-base font-medium">
                {formatDateLabel(normalizeDate(entry.entry_date))}
              </Text>
            )}
          </View>

          {/* Meal type */}
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
                    <Icon name="chevron-down" size={12} color={textPrimary} style={{ marginLeft: 6 }} weight="medium" />
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

        {/* Delete button */}
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
        <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={(date) => updateEdit({ selectedDate: date })} />
      )}
    </View>
  );
};

export default FoodEntryViewScreen;
