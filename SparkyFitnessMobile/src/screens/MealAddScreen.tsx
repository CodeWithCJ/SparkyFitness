import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useFocusEffect } from '@react-navigation/native';
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from '../components/BottomSheetPicker';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import { useCreateMeal } from '../hooks';
import { consumePendingMealIngredientSelection } from '../services/mealBuilderSelection';
import { mealIngredientDraftToFoodInfo } from '../types/foodInfo';
import type { MealIngredientDraft } from '../types/meals';
import type { RootStackScreenProps } from '../types/navigation';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';

type MealAddScreenProps = RootStackScreenProps<'MealAdd'>;

const SERVING_UNIT_OPTIONS = [
  'serving', 'g', 'ml', 'oz', 'cup', 'tbsp', 'tsp', 'piece',
].map((unit) => ({ label: unit, value: unit }));

interface MealTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface MacroStatProps {
  color: string;
  value: number;
  label: string;
}

const MacroStat: React.FC<MacroStatProps> = ({ color, value, label }) => (
  <View className="flex-1 flex-row items-start gap-1.5">
    <View
      style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginTop: 6 }}
    />
    <Text className="flex-1 text-text-primary text-base">
      {value}
      {label}
    </Text>
  </View>
);

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

const MealAddScreen: React.FC<MealAddScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [accentColor, textMuted, proteinColor, carbsColor, fatColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
  ]) as [string, string, string, string, string];

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
  const servingsCount = parseDecimalInput(servingSizeText) ?? 0;
  const showPerServing = servingsCount > 1;

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

  const showIngredientMenu = (ingredient: MealIngredientDraft, ingredientIndex: number) => {
    Alert.alert(
      ingredient.food_name || 'Food',
      undefined,
      [
        { text: 'Edit', onPress: () => editIngredient(ingredient, ingredientIndex) },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removeIngredient(ingredientIndex),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
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
      navigation.goBack();
    } catch {
      // Error toast is handled in the mutation hook.
    }
  };

  return (
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
            <FormInput
              placeholder="e.g. Chicken Rice Bowl"
              value={mealName}
              onChangeText={setMealName}
              returnKeyType="done"
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">Description (optional)</Text>
            <FormInput
              placeholder="Notes about this meal"
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">Makes *</Text>
            <View className="flex-row gap-3">
              <FormInput
                placeholder="1"
                value={servingSizeText}
                onChangeText={updateServingSize}
                keyboardType="decimal-pad"
                returnKeyType="done"
                style={{ width: 96 }}
              />
              <View className="flex-1">
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
                      <Icon name="chevron-down" size={12} color={textMuted} weight="medium" />
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
          </View>
        </View>

        <View className="bg-surface rounded-xl p-4 gap-3 shadow-sm">
          <Text className="text-text-primary text-lg font-semibold">Foods in Meal</Text>

          {ingredients.length > 0 ? (
            <View>
              {ingredients.map((ingredient, index) => {
                const scale =
                  ingredient.serving_size > 0 ? ingredient.quantity / ingredient.serving_size : 0;
                const ingredientCalories = Math.round(ingredient.calories * scale);
                const ingredientProtein = Math.round(ingredient.protein * scale);
                const ingredientCarbs = Math.round(ingredient.carbs * scale);
                const ingredientFat = Math.round(ingredient.fat * scale);
                const isFirst = index === 0;
                const ingredientKey = `${ingredient.food_id}-${ingredient.variant_id}-${index}`;

                return (
                  <ReanimatedSwipeable
                    key={ingredientKey}
                    overshootRight={false}
                    rightThreshold={40}
                    renderRightActions={() => (
                      <View className="pl-3 py-1" style={{ width: 84 }}>
                        <TouchableOpacity
                          className="bg-bg-danger rounded-lg flex-1 justify-center items-center"
                          onPress={() => removeIngredient(index)}
                          activeOpacity={0.7}
                          accessibilityLabel={`Remove ${ingredient.food_name || 'ingredient'}`}
                          accessibilityRole="button"
                        >
                          <Text className="text-text-danger font-semibold text-sm">Delete</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  >
                    <GHTouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => editIngredient(ingredient, index)}
                      onLongPress={() => showIngredientMenu(ingredient, index)}
                      accessibilityLabel={`Edit ${ingredient.food_name || 'ingredient'}`}
                      accessibilityRole="button"
                      className="bg-surface"
                    >
                      <View
                        className={`flex-row items-start justify-between gap-3 py-3 ${
                          isFirst ? '' : 'border-t border-border-subtle'
                        }`}
                      >
                        <View className="flex-1">
                          <Text
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            className="text-text-primary text-base font-semibold"
                          >
                            {ingredient.food_name || 'Food'}
                            {ingredient.brand ? (
                              <Text className="text-text-secondary font-normal">
                                {' \u00b7 '}
                                {ingredient.brand}
                              </Text>
                            ) : null}
                          </Text>
                          <Text className="text-text-muted text-sm mt-1">
                            {ingredientProtein}g protein{' \u00b7 '}{ingredientCarbs}g carbs{' \u00b7 '}{ingredientFat}g fat
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-text-primary text-base font-semibold">
                            {ingredientCalories} cal
                          </Text>
                          <Text className="text-text-muted text-sm mt-1">
                            {ingredient.quantity} {ingredient.unit}
                          </Text>
                        </View>
                      </View>
                    </GHTouchableOpacity>
                  </ReanimatedSwipeable>
                );
              })}
            </View>
          ) : null}

          <View className="items-center pt-1">
            <Button
              variant="ghost"
              onPress={openIngredientPicker}
              className="min-h-11 flex-row items-center gap-1.5 rounded-xl px-3 py-2"
              accessibilityLabel="Add Food"
            >
              <Icon name="add" size={16} color={accentColor} />
              <Text className="text-accent-primary text-sm font-semibold">Add Food</Text>
            </Button>
          </View>

          {ingredients.length > 0 ? (
            <View className="bg-raised rounded-lg p-4 gap-4">
              <View className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-text-secondary text-base font-medium">Meal total</Text>
                  <Text className="text-text-primary text-base font-semibold text-right">
                    {Math.round(totals.calories)} cal
                  </Text>
                </View>
                <View className="flex-row items-start gap-2 mt-1">
                  <MacroStat color={proteinColor} value={Math.round(totals.protein)} label="g protein" />
                  <MacroStat color={carbsColor} value={Math.round(totals.carbs)} label="g carbs" />
                  <MacroStat color={fatColor} value={Math.round(totals.fat)} label="g fat" />
                </View>
              </View>
              {showPerServing ? (
                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-text-secondary text-base font-medium">Per serving</Text>
                    <Text className="text-text-primary text-base font-semibold text-right">
                      {Math.round(totals.calories / servingsCount)} cal
                    </Text>
                  </View>
                  <View className="flex-row items-start gap-2 mt-1">
                    <MacroStat
                      color={proteinColor}
                      value={Math.round(totals.protein / servingsCount)}
                      label="g protein"
                    />
                    <MacroStat
                      color={carbsColor}
                      value={Math.round(totals.carbs / servingsCount)}
                      label="g carbs"
                    />
                    <MacroStat
                      color={fatColor}
                      value={Math.round(totals.fat / servingsCount)}
                      label="g fat"
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
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
  );
};

export default MealAddScreen;
