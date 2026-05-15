import React, { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import StepperInput from '../components/StepperInput';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import NutritionMacroCard from '../components/NutritionMacroCard';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useMealTypes } from '../hooks';
import { useFoodEntryMealDetails } from '../hooks/useFoodEntryMealDetails';
import { useUpdateFoodEntryMeal } from '../hooks/useUpdateFoodEntryMeal';
import { useDeleteFoodEntryMeal } from '../hooks/useDeleteFoodEntryMeal';
import { formatDateLabel, normalizeDate } from '../utils/dateUtils';
import { getMealTypeLabel } from '../constants/meals';
import { toMealFoodPayload } from '../utils/mealBuilderDraft';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import type { FoodEntryMealUpdateData } from '../types/foodEntryMeals';
import type { RootStackScreenProps } from '../types/navigation';

type EditLoggedMealScreenProps = RootStackScreenProps<'EditLoggedMeal'>;

const EditLoggedMealScreen: React.FC<EditLoggedMealScreenProps> = ({ navigation, route }) => {
  const { foodEntryMealId, initialMeal } = route.params;
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const calendarRef = useRef<CalendarSheetRef>(null);

  const { meal, isLoading, isError, error } = useFoodEntryMealDetails(foodEntryMealId, { initialMeal });
  const { mealTypes } = useMealTypes();

  const [name, setName] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>(undefined);
  const [quantityText, setQuantityText] = useState<string | null>(null);

  const effectiveName = name ?? meal?.name ?? '';
  const effectiveDate = selectedDate ?? (meal ? normalizeDate(meal.entry_date) : null);
  const effectiveMealId = selectedMealId ?? meal?.meal_type_id ?? undefined;
  const effectiveQuantityText = quantityText ?? (meal ? String(meal.quantity) : '');
  const quantity = parseDecimalInput(effectiveQuantityText) || 0;
  const originalQuantity = meal?.quantity ?? 1;
  const scaleFactor = originalQuantity > 0 ? quantity / originalQuantity : 0;

  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);
  const mealPickerOptions = useMemo(
    () => mealTypes.map((mt) => ({ label: getMealTypeLabel(mt.name), value: mt.id })),
    [mealTypes],
  );

  const initialDate = meal ? normalizeDate(meal.entry_date) : null;
  const dirty =
    meal != null &&
    (
      (name !== null && name !== meal.name) ||
      (selectedDate !== null && selectedDate !== initialDate) ||
      (selectedMealId !== undefined && selectedMealId !== meal.meal_type_id) ||
      (quantityText !== null && quantity !== meal.quantity)
    );

  const { updateMeal, isPending: isSavePending, invalidateCache: invalidateUpdateCache } = useUpdateFoodEntryMeal({
    mealId: foodEntryMealId,
    entryDate: meal?.entry_date ?? '',
    onSuccess: () => {
      invalidateUpdateCache(effectiveDate ?? undefined);
      navigation.goBack();
    },
  });

  const { confirmAndDelete, isPending: isDeletePending, invalidateCache: invalidateDeleteCache } = useDeleteFoodEntryMeal({
    mealId: foodEntryMealId,
    entryDate: meal?.entry_date ?? '',
    onSuccess: () => {
      invalidateDeleteCache();
      navigation.goBack();
    },
  });

  const [accentColor, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
  ]) as [string, string];

  const updateQuantityText = (text: string) => {
    if (DECIMAL_INPUT_REGEX.test(text)) {
      setQuantityText(text);
    }
  };

  const clampQuantity = () => {
    if (quantity <= 0) {
      setQuantityText('1');
    }
  };

  const adjustQuantity = (delta: number) => {
    const step = 0.5;
    const next = quantity + delta * step;
    setQuantityText(String(Math.max(step, next)));
  };

  const canSave = dirty && quantity > 0 && !!meal && meal.foods.length > 0 && !!effectiveDate;

  const handleSave = () => {
    if (!meal || !canSave || !effectiveDate) return;

    const payload: FoodEntryMealUpdateData = {
      name: effectiveName,
      meal_type: selectedMealType?.name ?? meal.meal_type,
      meal_type_id: effectiveMealId,
      entry_date: effectiveDate,
      quantity,
      unit: meal.unit,
      meal_template_id: meal.meal_template_id,
      foods: meal.foods.map(toMealFoodPayload),
    };

    updateMeal(payload);
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-background justify-center items-center" style={{ paddingTop: insets.top }}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (isError || !meal) {
    throw error instanceof Error ? error : new Error('Failed to load meal');
  }

  const scaledCalories = (meal.calories ?? 0) * scaleFactor;
  const scaledProtein = (meal.protein ?? 0) * scaleFactor;
  const scaledCarbs = (meal.carbs ?? 0) * scaleFactor;
  const scaledFat = (meal.fat ?? 0) * scaleFactor;

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
        <View style={{ marginLeft: 'auto', zIndex: 10 }}>
          <Button
            variant="ghost"
            onPress={handleSave}
            disabled={!canSave || isSavePending}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            textClassName="font-medium"
          >
            {isSavePending ? 'Saving...' : 'Save'}
          </Button>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-4 gap-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <View>
          <Text className="text-text-secondary text-sm mb-1">Meal name</Text>
          <FormInput
            value={effectiveName}
            onChangeText={setName}
            placeholder="Meal name"
            autoCapitalize="sentences"
          />
        </View>

        {/* Aggregate nutrition */}
        <NutritionMacroCard
          calories={scaledCalories}
          protein={scaledProtein}
          carbs={scaledCarbs}
          fat={scaledFat}
        />

        {/* Quantity */}
        <View>
          <Text className="text-text-secondary text-sm mb-1">Servings</Text>
          <View className="flex-row items-center">
            <StepperInput
              value={effectiveQuantityText}
              onChangeText={updateQuantityText}
              onBlur={clampQuantity}
              onIncrement={() => adjustQuantity(1)}
              onDecrement={() => adjustQuantity(-1)}
              keyboardType="decimal-pad"
            />
            <Text className="text-text-primary text-base font-medium ml-2">
              {meal.unit}
            </Text>
          </View>
        </View>

        {/* Date row */}
        <Animated.View layout={LinearTransition.duration(300)} className="flex-row items-center">
          <View className="flex-1 flex-row items-center">
            <Text className="text-text-secondary text-base mr-2">Date</Text>
            <TouchableOpacity
              onPress={() => calendarRef.current?.present()}
              activeOpacity={0.7}
              className="flex-row items-center"
            >
              <Text className="text-text-primary text-base font-medium">
                {effectiveDate ? formatDateLabel(effectiveDate) : ''}
              </Text>
              <Icon name="chevron-down" size={12} color={textPrimary} style={{ marginLeft: 6 }} weight="medium" />
            </TouchableOpacity>
          </View>

          {/* Meal type */}
          <View className="flex-1 flex-row items-center">
            <Text className="text-text-secondary text-base mr-2">Meal</Text>
            {selectedMealType && effectiveMealId ? (
              <BottomSheetPicker
                value={effectiveMealId}
                options={mealPickerOptions}
                onSelect={(id) => setSelectedMealId(id)}
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
                {getMealTypeLabel(meal.meal_type)}
              </Text>
            )}
          </View>
        </Animated.View>

        {/* Component foods (read-only) */}
        <View className="mt-2">
          <Text className="text-text-secondary text-sm mb-2">Foods in this meal</Text>
          <View className="bg-surface rounded-xl">
            {meal.foods.map((food, index) => {
              const ratio = food.serving_size > 0 ? food.quantity / food.serving_size : food.quantity;
              const foodCals = Math.round((food.calories ?? 0) * ratio * scaleFactor);
              return (
                <View
                  key={`${food.food_id}-${index}`}
                  className={`flex-row items-center px-3 py-2 ${index < meal.foods.length - 1 ? 'border-b border-border-subtle' : ''}`}
                >
                  <View className="flex-1 mr-2">
                    <Text className="text-text-primary text-base" numberOfLines={1}>
                      {food.food_name}
                    </Text>
                    <Text className="text-text-secondary text-xs mt-0.5">
                      {food.quantity * scaleFactor % 1 === 0
                        ? food.quantity * scaleFactor
                        : parseFloat((food.quantity * scaleFactor).toFixed(2))}{' '}
                      {food.unit}
                    </Text>
                  </View>
                  <Text className="text-text-secondary text-sm font-medium">
                    {foodCals} Cal
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Delete meal */}
        <Button
          variant="ghost"
          onPress={confirmAndDelete}
          disabled={isDeletePending}
          className="mt-2"
          textClassName="text-bg-danger font-medium"
        >
          {isDeletePending ? 'Deleting...' : 'Delete Meal'}
        </Button>
      </ScrollView>

      <CalendarSheet
        ref={calendarRef}
        selectedDate={effectiveDate ?? ''}
        onSelectDate={(date) => setSelectedDate(date)}
      />
    </View>
  );
};

export default EditLoggedMealScreen;
