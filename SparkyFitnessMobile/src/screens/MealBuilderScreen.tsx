import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import BottomSheetPicker from '../components/BottomSheetPicker';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import NutritionMacroCard from '../components/NutritionMacroCard';
import { useCreateMeal } from '../hooks';
import { consumePendingMealIngredientSelection } from '../services/mealBuilderSelection';
import { mealIngredientDraftToFoodInfo } from '../types/foodInfo';
import type { MealIngredientDraft } from '../types/meals';
import type { RootStackScreenProps } from '../types/navigation';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';

type MealBuilderScreenProps = RootStackScreenProps<'MealBuilder'>;

const SERVING_UNIT_OPTIONS = [
  'serving', 'g', 'ml', 'oz', 'cup', 'tbsp', 'tsp', 'piece',
].map((unit) => ({ label: unit, value: unit }));

interface MealTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function toMealTotals(ingredients: MealIngredientDraft[]): MealTotals {
  return ingredients.reduce<MealTotals>(
    (totals, ingredient) => {
      const scale =
        ingredient.serving_size > 0 ? ingredient.quantity / ingredient.serving_size : 0;

      totals.calories += ingredient.calories * scale;
      totals.protein += ingredient.protein * scale;
      totals.carbs += ingredient.carbs * scale;
      totals.fat += ingredient.fat * scale;
      return totals;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

const MealBuilderScreen: React.FC<MealBuilderScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [accentColor, textMuted, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-text-primary',
  ]) as [string, string, string];

  const [mealName, setMealName] = useState('');
  const [description, setDescription] = useState('');
  const [servingSizeText, setServingSizeText] = useState('1');
  const [servingUnit, setServingUnit] = useState('serving');
  const [ingredients, setIngredients] = useState<MealIngredientDraft[]>([]);

  const { createMealAsync, isPending } = useCreateMeal();

  useFocusEffect(
    useCallback(() => {
      const selection = consumePendingMealIngredientSelection();
      if (!selection) return;

      setIngredients((currentIngredients) => {
        const nextIngredients = [...currentIngredients];
        if (
          selection.ingredientIndex != null &&
          selection.ingredientIndex >= 0 &&
          selection.ingredientIndex < nextIngredients.length
        ) {
          nextIngredients[selection.ingredientIndex] = selection.ingredient;
          return nextIngredients;
        }

        nextIngredients.push(selection.ingredient);
        return nextIngredients;
      });
    }, []),
  );

  const totals = useMemo(() => toMealTotals(ingredients), [ingredients]);

  const updateServingSize = (value: string) => {
    if (DECIMAL_INPUT_REGEX.test(value)) {
      setServingSizeText(value);
    }
  };

  const removeIngredient = (index: number) => {
    setIngredients((currentIngredients) =>
      currentIngredients.filter((_, ingredientIndex) => ingredientIndex !== index),
    );
  };

  const openIngredientPicker = () => {
    navigation.push('FoodSearch', { pickerMode: 'meal-builder' });
  };

  const editIngredient = (ingredient: MealIngredientDraft, ingredientIndex: number) => {
    navigation.navigate('FoodEntryAdd', {
      item: mealIngredientDraftToFoodInfo(ingredient),
      pickerMode: 'meal-builder',
      ingredientIndex,
      returnDepth: 1,
    });
  };

  const handleSaveMeal = async () => {
    const trimmedMealName = mealName.trim();
    const parsedServingSize = parseDecimalInput(servingSizeText);

    if (!trimmedMealName) {
      Toast.show({
        type: 'error',
        text1: 'Missing meal name',
        text2: 'Please enter a name for your meal.',
      });
      return;
    }

    if (!parsedServingSize || parsedServingSize <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Invalid serving size',
        text2: 'Serving size must be greater than zero.',
      });
      return;
    }

    if (!ingredients.length) {
      Toast.show({
        type: 'error',
        text1: 'No ingredients yet',
        text2: 'Add at least one food before saving this meal.',
      });
      return;
    }

    if (ingredients.some((ingredient) => !ingredient.variant_id)) {
      Toast.show({
        type: 'error',
        text1: 'Missing ingredient data',
        text2: 'One of the selected foods is missing a serving variant. Please re-add it.',
      });
      return;
    }

    try {
      await createMealAsync({
        name: trimmedMealName,
        description: description.trim() || null,
        is_public: false,
        serving_size: parsedServingSize,
        serving_unit: servingUnit,
        foods: ingredients.map(({ brand: _brand, ...ingredient }) => ingredient),
      });

      Toast.show({
        type: 'success',
        text1: 'Meal created',
        text2: `${trimmedMealName} is ready to use.`,
      });
      navigation.goBack();
    } catch {
      // Error toast is handled in the mutation hook.
    }
  };

  return (
    <BottomSheetModalProvider>
      <View
        className="flex-1 bg-background"
        style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
      >
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-subtle">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="z-10 min-h-11 min-w-11 items-start justify-center"
            accessibilityLabel="Back"
            accessibilityRole="button"
          >
            <Icon name="chevron-back" size={22} color={accentColor} />
          </TouchableOpacity>
          <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
            Create Meal
          </Text>
          <View className="min-h-11 min-w-11" />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pt-4 pb-8 gap-4"
          keyboardShouldPersistTaps="handled"
        >
          <View className="bg-surface rounded-xl p-4 gap-4 shadow-sm">
            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">Meal Name *</Text>
              <TextInput
                className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 text-text-primary"
                style={{ fontSize: 16 }}
                placeholder="e.g. Chicken Rice Bowl"
                placeholderTextColor={textMuted}
                value={mealName}
                onChangeText={setMealName}
                returnKeyType="done"
              />
            </View>

            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">Description</Text>
              <TextInput
                className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 text-text-primary"
                style={{ fontSize: 16, minHeight: 92, textAlignVertical: 'top' }}
                placeholder="Optional"
                placeholderTextColor={textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
              />
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                <Text className="text-text-secondary text-sm font-medium">Serving Size</Text>
                <TextInput
                  className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 text-text-primary"
                  style={{ fontSize: 16 }}
                  placeholder="1"
                  placeholderTextColor={textMuted}
                  value={servingSizeText}
                  onChangeText={updateServingSize}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              <View className="flex-1 gap-1.5">
                <Text className="text-text-secondary text-sm font-medium">Serving Unit</Text>
                <BottomSheetPicker
                  value={servingUnit}
                  options={SERVING_UNIT_OPTIONS}
                  onSelect={setServingUnit}
                  title="Select Unit"
                  renderTrigger={({ onPress, selectedOption }) => (
                    <TouchableOpacity
                      onPress={onPress}
                      activeOpacity={0.7}
                      className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
                      style={{ minHeight: 44 }}
                    >
                      <Text className="text-text-primary" style={{ fontSize: 16 }}>
                        {selectedOption?.label ?? servingUnit}
                      </Text>
                      <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </View>

          <NutritionMacroCard
            heading="Total Nutrition"
            calories={totals.calories}
            protein={totals.protein}
            carbs={totals.carbs}
            fat={totals.fat}
          />

          <View className="bg-surface rounded-xl p-4 gap-4 shadow-sm">
            <View className="flex-row items-center justify-between">
              <Text className="text-text-primary text-lg font-semibold">Foods in Meal</Text>
              <Button
                variant="outline"
                onPress={openIngredientPicker}
                className="min-h-11 flex-row items-center gap-1.5 rounded-xl px-3 py-2"
                accessibilityLabel="Add Food"
              >
                <Icon name="add" size={16} color={accentColor} />
                <Text className="text-accent-primary text-sm font-semibold">Add Food</Text>
              </Button>
            </View>

            {!ingredients.length ? (
              <View className="items-center justify-center rounded-xl border border-dashed border-border-subtle px-5 py-8">
                <Text className="text-text-secondary text-base text-center">
                  No foods added to this meal yet.
                </Text>
              </View>
            ) : (
              <View className="gap-3">
                {ingredients.map((ingredient, index) => {
                  const scale =
                    ingredient.serving_size > 0 ? ingredient.quantity / ingredient.serving_size : 0;
                  const ingredientCalories = Math.round(ingredient.calories * scale);

                  return (
                    <View
                      key={`${ingredient.food_id}-${ingredient.variant_id}-${index}`}
                      className="rounded-xl border border-border-subtle bg-raised px-4 py-3"
                    >
                      <View className="flex-row items-start justify-between gap-3">
                        <View className="flex-1">
                          <Text className="text-text-primary text-base font-semibold">
                            {ingredient.food_name || 'Food'}
                          </Text>
                          {ingredient.brand ? (
                            <Text className="text-text-secondary text-sm mt-0.5">
                              {ingredient.brand}
                            </Text>
                          ) : null}
                          <Text className="text-text-muted text-sm mt-1">
                            {ingredient.quantity} {ingredient.unit}
                            {' \u00b7 '}
                            {ingredientCalories} cal
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                          <TouchableOpacity
                            onPress={() => editIngredient(ingredient, index)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            className="min-h-11 min-w-11 items-center justify-center"
                            accessibilityLabel={`Edit ${ingredient.food_name || 'ingredient'}`}
                            accessibilityRole="button"
                          >
                            <Icon name="pencil" size={18} color={accentColor} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => removeIngredient(index)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            className="min-h-11 min-w-11 items-center justify-center"
                            accessibilityLabel={`Remove ${ingredient.food_name || 'ingredient'}`}
                            accessibilityRole="button"
                          >
                            <Icon name="remove-circle" size={20} color={accentColor} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <Button
            variant="primary"
            onPress={() => {
              void handleSaveMeal();
            }}
            disabled={isPending}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-white text-base font-semibold">Save Meal</Text>
            )}
          </Button>
        </ScrollView>
      </View>
    </BottomSheetModalProvider>
  );
};

export default MealBuilderScreen;
