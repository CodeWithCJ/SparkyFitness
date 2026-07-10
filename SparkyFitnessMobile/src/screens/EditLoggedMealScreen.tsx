import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import { useScreenHeader } from '../hooks/useScreenHeader';
import StepperInput from '../components/StepperInput';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import NutritionMacroCard from '../components/NutritionMacroCard';
import SwipeableIngredientRow from '../components/SwipeableIngredientRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useMealTypes, usePreferences } from '../hooks';
import { useFoodEntryMealDetails } from '../hooks/useFoodEntryMealDetails';
import { useUpdateFoodEntryMeal } from '../hooks/useUpdateFoodEntryMeal';
import { useDeleteFoodEntryMeal } from '../hooks/useDeleteFoodEntryMeal';
import { consumePendingMealIngredientSelection } from '../services/mealBuilderSelection';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { formatDateLabel, normalizeDate } from '../utils/dateUtils';
import { buildMealIngredientDraftFromEntryMealFood } from '../utils/mealBuilderDraft';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import { mealIngredientDraftToFoodInfo } from '../types/foodInfo';
import type { MealIngredientDraft } from '../types/meals';
import type { FoodEntryMealUpdateData } from '../types/foodEntryMeals';
import type { RootStackScreenProps } from '../types/navigation';
import {
  formatMobileNumber,
  formatMobilePreciseCalories,
  localizeMealType,
  localizeServingUnit,
  mobileT,
} from '../localization';

type EditLoggedMealScreenProps = RootStackScreenProps<'EditLoggedMeal'>;

interface IngredientTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
}

// Sum nutrition across the ingredient drafts at their stored quantities (each
// food scaled by its own quantity / serving_size). The meal-level servings
// factor is applied by the caller. Recomputing here (rather than reading
// meal.calories) keeps totals correct after foods are added/removed/edited.
function computeBaseTotals(ingredients: MealIngredientDraft[]): IngredientTotals {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let fiber = 0;
  let hasFiber = false;
  for (const food of ingredients) {
    const scale = food.serving_size > 0 ? food.quantity / food.serving_size : 0;
    calories += (food.calories ?? 0) * scale;
    protein += (food.protein ?? 0) * scale;
    carbs += (food.carbs ?? 0) * scale;
    fat += (food.fat ?? 0) * scale;
    if (food.dietary_fiber != null) {
      hasFiber = true;
      fiber += food.dietary_fiber * scale;
    }
  }
  return { calories, protein, carbs, fat, fiber: hasFiber ? fiber : undefined };
}

const EditLoggedMealScreen: React.FC<EditLoggedMealScreenProps> = ({ navigation, route }) => {
  const { foodEntryMealId, initialMeal } = route.params;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const calendarRef = useRef<CalendarSheetRef>(null);

  const { meal, isLoading, isError, error } = useFoodEntryMealDetails(foodEntryMealId, { initialMeal });
  const { mealTypes } = useMealTypes();
  const { preferences } = usePreferences();
  const showNetCarbs = preferences?.show_net_carbs === true;

  const [name, setName] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>(undefined);
  const [quantityText, setQuantityText] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<MealIngredientDraft[]>([]);
  const [initializedMealId, setInitializedMealId] = useState<string | null>(null);
  const [foodsTouched, setFoodsTouched] = useState(false);
  // Latest displayScale, read inside useFocusEffect without re-creating it.
  const displayScaleRef = useRef(1);

  // Seed the editable ingredient list once the meal loads. meal.foods come back
  // at their stored quantities: for non-template meals that is the consumed
  // amount at the meal's logged servings (server multiplier is 1.0); for
  // template meals it is the recipe base, which the server rescales. Either way
  // the Servings stepper rescales via scaleFactor (defined below). Guard on
  // meal.id so returning from the food picker (which re-focuses and may refetch)
  // never clobbers in-progress edits.
  useEffect(() => {
    if (!meal || initializedMealId === meal.id) return;
    // One-time form initialization from the async-loaded meal, guarded by its id.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIngredients(meal.foods.map(buildMealIngredientDraftFromEntryMealFood));
    setInitializedMealId(meal.id);
  }, [meal, initializedMealId]);

  // Consume a food chosen via the meal-builder picker flow: append on add, or
  // replace at index on edit. Mirrors MealAddScreen's selection handoff.
  useFocusEffect(
    useCallback(() => {
      const selection = consumePendingMealIngredientSelection();
      if (!selection) return;
      // The picker works in CONSUMED amounts (what the user sees on the row), so
      // unscale back to the base quantity we store and save.
      const scale = displayScaleRef.current;
      const ingredient = {
        ...selection.ingredient,
        quantity:
          scale > 0 ? selection.ingredient.quantity / scale : selection.ingredient.quantity,
      };
      setIngredients((current) => {
        const next = [...current];
        if (
          selection.ingredientIndex != null &&
          selection.ingredientIndex >= 0 &&
          selection.ingredientIndex < next.length
        ) {
          next[selection.ingredientIndex] = ingredient;
          return next;
        }
        next.push(ingredient);
        return next;
      });
      setFoodsTouched(true);
    }, []),
  );

  const effectiveName = name ?? meal?.name ?? '';
  const effectiveDate = selectedDate ?? (meal ? normalizeDate(meal.entry_date) : null);
  const effectiveMealId = selectedMealId ?? meal?.meal_type_id ?? undefined;
  const effectiveQuantityText =
    quantityText ??
    (meal
      ? formatMobileNumber(meal.quantity, {
          maximumFractionDigits: 4,
          useGrouping: false,
        })
      : '');
  const quantity = parseDecimalInput(effectiveQuantityText) || 0;
  const originalQuantity = meal?.quantity && meal.quantity > 0 ? meal.quantity : 1;
  // Rescale stored component quantities by the CHANGE in servings, not the raw
  // servings count: meal.foods are already at the logged-servings amount
  // (originalQuantity), so the factor is newServings / loadedServings. This
  // matches the server, which persists non-template components verbatim
  // (multiplier 1.0). Multiplying by `quantity` directly would double-count
  // whenever the meal was logged at servings != 1.
  const scaleFactor = originalQuantity > 0 ? quantity / originalQuantity : 0;

  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);
  const mealPickerOptions = useMemo(
    () =>
      mealTypes.map((mt) => ({
        label: localizeMealType(mt.name),
        value: mt.id,
      })),
    [mealTypes],
  );

  const initialDate = meal ? normalizeDate(meal.entry_date) : null;
  const dirty =
    meal != null &&
    (
      (name !== null && name !== meal.name) ||
      (selectedDate !== null && selectedDate !== initialDate) ||
      (selectedMealId !== undefined && selectedMealId !== meal.meal_type_id) ||
      (quantityText !== null && quantity !== meal.quantity) ||
      foodsTouched
    );

  const { updateMeal, isPending: isSavePending, invalidateCache: invalidateUpdateCache } = useUpdateFoodEntryMeal({
    mealId: foodEntryMealId,
    entryDate: meal?.entry_date ?? '',
    onSuccess: () => {
      invalidateUpdateCache(effectiveDate ?? undefined);
      navigation.goBack();
    },
  });

  const { confirmAndDelete, isPending: isDeletePending, invalidateCache: invalidateDeleteCache } =
    useDeleteFoodEntryMeal({
      mealId: foodEntryMealId,
      entryDate: meal?.entry_date ?? '',
      onSuccess: () => {
        invalidateDeleteCache();
        navigation.goBack();
      },
    });

  const isRowBusy = isSavePending || isDeletePending;

  const baseTotals = useMemo(() => computeBaseTotals(ingredients), [ingredients]);

  // Template-linked meals come back with component foods at recipe BASE
  // quantities but meal.calories as the CONSUMED total (server divides foods by
  // the storage multiplier on read, foodEntryService.ts). Base totals alone
  // would therefore understate the meal, so recover that multiplier (consumed /
  // base) from the loaded snapshot and fold it into all display scaling.
  // Non-template meals already store consumed amounts, so this is 1 for them.
  const templateScale = useMemo(() => {
    // Guard null/zero calories: without it a template meal with no aggregate
    // calories would yield templateScale 0 and zero out the whole display.
    if (!meal?.meal_template_id || !meal.calories) return 1;
    const base = computeBaseTotals(
      meal.foods.map(buildMealIngredientDraftFromEntryMealFood),
    ).calories;
    return base > 0 ? meal.calories / base : 1;
  }, [meal]);

  // Keep displayScaleRef current so the deferred handlers (editIngredient and
  // the meal-builder focus effect) unscale consumed amounts using the latest
  // scale. Updated in an effect rather than during render to satisfy
  // react-hooks/refs.
  useLayoutEffect(() => {
    displayScaleRef.current = templateScale * scaleFactor;
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
      setQuantityText(
        formatMobileNumber(1, { maximumFractionDigits: 0 }),
      );
    }
  };

  const adjustQuantity = (delta: number) => {
    const step = 0.5;
    const next = quantity + delta * step;
    setQuantityText(
      formatMobileNumber(Math.max(step, next), {
        maximumFractionDigits: 1,
        useGrouping: false,
      }),
    );
  };

  const openIngredientPicker = () => {
    navigation.push('FoodSearch', { pickerMode: 'meal-builder' });
  };

  const editIngredient = (index: number) => {
    const ingredient = ingredients[index];
    if (!ingredient) return;
    // Open the editor on the CONSUMED quantity the user sees on the row; the
    // return path (useFocusEffect) unscales it back to base.
    const scaledIngredient = {
      ...ingredient,
      quantity: ingredient.quantity * displayScaleRef.current,
    };
    navigation.navigate('FoodEntryAdd', {
      item: mealIngredientDraftToFoodInfo(scaledIngredient),
      pickerMode: 'meal-builder',
      ingredientIndex: index,
      returnDepth: 1,
    });
  };

  // SwipeableIngredientRow confirms before invoking this. Removal is always
  // staged and committed on Save, including the last ingredient: canSave blocks
  // saving an empty meal, so the user can swap the final food (remove, Add Food)
  // without losing the meal entry. Deleting the whole meal is the dedicated
  // "Delete Meal" button.
  const handleRemoveIngredient = (index: number) => {
    setIngredients((current) => current.filter((_, i) => i !== index));
    setFoodsTouched(true);
  };

  const canSave =
    dirty &&
    quantity > 0 &&
    !!meal &&
    ingredients.length > 0 &&
    ingredients.every((food) => !!food.variant_id && food.quantity > 0) &&
    !!effectiveDate;

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
      foods: ingredients.map(({ brand: _brand, ...food }) => ({
        ...food,
        // Non-template meals persist consumed (scaled) component quantities;
        // template-linked meals are rescaled server-side, so send base values.
        quantity: meal.meal_template_id ? food.quantity : food.quantity * scaleFactor,
      })),
    };

    updateMeal(payload);
  };

  // Diary drill-in, so the left slot stays a back chevron (not a modal X).
  const header = useScreenHeader({
    left: { kind: 'back' },
    right: {
      kind: 'primary',
      label: mobileT('common.save'),
      busyLabel: mobileT('common.saving'),
      busy: isSavePending,
      disabled: !canSave || isRowBusy,
      onPress: handleSave,
      accessibilityLabel: mobileT('editLoggedMeal.saveMeal'),
      identifier: 'edit-logged-meal-save',
    },
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-background justify-center items-center" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (isError || !meal) {
    throw error instanceof Error
      ? error
      : new Error(mobileT('editLoggedMeal.loadFailed'));
  }

  // displayScale converts a draft's stored quantity to the consumed amount:
  // templateScale (base -> consumed for template meals) x scaleFactor (the
  // change in servings). Used by both the nutrition card and the rows so they
  // always agree with each other and with the saved payload.
  const displayScale = templateScale * scaleFactor;
  const scaledCalories = baseTotals.calories * displayScale;
  const scaledProtein = baseTotals.protein * displayScale;
  const scaledCarbs = baseTotals.carbs * displayScale;
  const scaledFat = baseTotals.fat * displayScale;
  const scaledFiber =
    baseTotals.fiber != null ? baseTotals.fiber * displayScale : undefined;

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-4 gap-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <View>
          <Text className="text-text-secondary text-sm mb-1">
            {mobileT('editLoggedMeal.mealName')}
          </Text>
          <FormInput
            value={effectiveName}
            onChangeText={setName}
            placeholder={mobileT('editLoggedMeal.mealName')}
            autoCapitalize="sentences"
          />
        </View>

        {/* Aggregate nutrition */}
        <NutritionMacroCard
          calories={scaledCalories}
          protein={scaledProtein}
          carbs={scaledCarbs}
          fat={scaledFat}
          fiber={scaledFiber}
          showNetCarbs={showNetCarbs}
        />

        {/* Quantity */}
        <View>
          <Text className="text-text-secondary text-sm mb-1">
            {mobileT('editLoggedMeal.servings')}
          </Text>
          <View className="flex-row items-center">
            <StepperInput
              value={effectiveQuantityText}
              onChangeText={updateQuantityText}
              onBlur={clampQuantity}
              onIncrement={() => adjustQuantity(1)}
              onDecrement={() => adjustQuantity(-1)}
              keyboardType="decimal-pad"
            />
            <Text
              className="text-text-primary text-base font-medium"
              style={{ marginStart: 8 }}
            >
              {localizeServingUnit(meal.unit)}
            </Text>
          </View>
        </View>

        {/* Date row */}
        <Animated.View layout={LinearTransition.duration(300)} className="flex-row items-center">
          <View className="flex-1 flex-row items-center">
            <Text
              className="text-text-secondary text-base"
              style={{ marginEnd: 8 }}
            >
              {mobileT('foodEntry.date')}
            </Text>
            <TouchableOpacity
              onPress={() => calendarRef.current?.present()}
              activeOpacity={0.7}
              className="flex-row items-center"
            >
              <Text className="text-text-primary text-base font-medium">
                {effectiveDate ? formatDateLabel(effectiveDate) : ''}
              </Text>
              <Icon name="chevron-down" size={12} color={textPrimary} style={{ marginStart: 6 }} weight="medium" />
            </TouchableOpacity>
          </View>

          {/* Meal type */}
          <View className="flex-1 flex-row items-center">
            <Text
              className="text-text-secondary text-base"
              style={{ marginEnd: 8 }}
            >
              {mobileT('foodEntry.meal')}
            </Text>
            {selectedMealType && effectiveMealId ? (
              <BottomSheetPicker
                value={effectiveMealId}
                options={mealPickerOptions}
                onSelect={(id) => setSelectedMealId(id)}
                title={mobileT('foodEntry.selectMeal')}
                renderTrigger={({ onPress }) => (
                  <TouchableOpacity
                    onPress={onPress}
                    activeOpacity={0.7}
                    className="flex-row items-center"
                  >
                    <Text className="text-text-primary text-base font-medium">
                      {localizeMealType(selectedMealType.name)}
                    </Text>
                    <Icon name="chevron-down" size={12} color={textPrimary} style={{ marginStart: 6 }} weight="medium" />
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text className="text-text-primary text-base font-medium">
                {localizeMealType(meal.meal_type)}
              </Text>
            )}
          </View>
        </Animated.View>

        {/* Component foods: tap a row to edit, swipe to remove, button to add. */}
        <View className="mt-2">
          <Text className="text-text-secondary text-sm mb-2">
            {mobileT('editLoggedMeal.foods')}
          </Text>
          {ingredients.length > 0 ? (
            <View className="bg-surface rounded-xl overflow-hidden">
              {ingredients.map((food, index) => {
                // Show consumed amounts (stored quantity x servings change), so
                // rows stay consistent with the nutrition card and the payload.
                const scaledQty = food.quantity * displayScale;
                const scale = food.serving_size > 0 ? scaledQty / food.serving_size : 0;
                const foodCals = formatMobilePreciseCalories(
                  (food.calories ?? 0) * scale,
                );
                return (
                  <SwipeableIngredientRow
                    key={`${food.food_id}-${food.variant_id}-${index}`}
                    foodName={food.food_name ?? mobileT('mealAdd.foodFallback')}
                    quantityLabel={`${formatMobileNumber(scaledQty, {
                      maximumFractionDigits: 4,
                    })} ${localizeServingUnit(food.unit)}`}
                    caloriesLabel={foodCals}
                    showBottomBorder={index < ingredients.length - 1}
                    isLastIngredient={ingredients.length === 1}
                    disabled={isRowBusy}
                    onPress={() => editIngredient(index)}
                    onConfirmDelete={() => handleRemoveIngredient(index)}
                  />
                );
              })}
            </View>
          ) : (
            <Text className="text-text-muted text-sm">
              {mobileT('editLoggedMeal.noFoods')}
            </Text>
          )}

          <View className="items-center pt-3">
            <Button
              variant="ghost"
              onPress={openIngredientPicker}
              disabled={isRowBusy}
              className="min-h-11 flex-row items-center gap-1.5 rounded-xl px-3 py-2"
              accessibilityLabel={mobileT('editLoggedMeal.addFood')}
            >
              <Icon name="add" size={16} color={accentColor} />
              <Text className="text-accent-primary text-sm font-semibold">
                {mobileT('editLoggedMeal.addFood')}
              </Text>
            </Button>
          </View>
        </View>

        {/* Delete meal */}
        <Button
          variant="ghost"
          onPress={confirmAndDelete}
          disabled={isRowBusy}
          className="mt-2"
          textClassName="text-bg-danger font-medium"
        >
          {isDeletePending
            ? mobileT('mealDetail.deleting')
            : mobileT('mealDetail.deleteMeal')}
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
