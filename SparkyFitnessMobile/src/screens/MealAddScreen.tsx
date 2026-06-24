import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import { createNativeHeaderTextButtonItem } from '../utils/nativeHeaderItems';
import BottomSheetPicker from '../components/BottomSheetPicker';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import StatusView from '../components/StatusView';
import Icon from '../components/Icon';
import { useCreateMeal, useMeal, useUpdateMeal } from '../hooks';
import { consumePendingMealIngredientSelection } from '../services/mealBuilderSelection';
import { mealIngredientDraftToFoodInfo } from '../types/foodInfo';
import type { MealFoodPayload, MealIngredientDraft } from '../types/meals';
import type { FoodUnitVariant } from '../types/foodUnitVariants';
import type { RootStackScreenProps } from '../types/navigation';
import {
  formatCaloriesDisplay,
  formatMacroDisplay,
  formatServingSizeDisplay,
} from '../utils/foodDetails';
import { buildMealIngredientDraftFromMealFood } from '../utils/mealBuilderDraft';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';

type MealAddScreenProps = RootStackScreenProps<'MealAdd'>;

const MEAL_SERVING_PRECISION = 6;

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
  value: string;
  label: string;
}

function toFiniteNumber(value: unknown): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue : 0;
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
      const servingSize = toFiniteNumber(ingredient.serving_size);
      const quantity = toFiniteNumber(ingredient.quantity);
      const scale = servingSize > 0 ? quantity / servingSize : 0;

      totals.calories += toFiniteNumber(ingredient.calories) * scale;
      totals.protein += toFiniteNumber(ingredient.protein) * scale;
      totals.carbs += toFiniteNumber(ingredient.carbs) * scale;
      totals.fat += toFiniteNumber(ingredient.fat) * scale;
      return totals;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

const mealIngredientToPayload = ({
  brand: _brand,
  ...ingredient
}: MealIngredientDraft): MealFoodPayload => ingredient;

const MealAddScreen: React.FC<MealAddScreenProps> = ({ navigation, route }) => {
  const isEditMode = route.params?.mode === 'edit';
  const editMealId = isEditMode ? route.params.mealId : undefined;
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
  // serving_size = quantity of ONE serving in serving_unit (e.g. 250 for 250 ml,
  // or 1 when unit is 'serving'). total_servings = yield count.
  const [servingSizeText, setServingSizeText] = useState('1');
  const [servingUnit, setServingUnit] = useState('serving');
  const [totalServingsText, setTotalServingsText] = useState('1');
  // For non-serving units we ask the user for the BATCH amount and derive
  // total_servings = totalAmount / servingSize on save.
  const [totalAmountText, setTotalAmountText] = useState('1');
  const [ingredients, setIngredients] = useState<MealIngredientDraft[]>([]);
  const [initializedMealId, setInitializedMealId] = useState<string | null>(null);

  const { createMealAsync, isPending } = useCreateMeal();
  const { meal: editMeal, isLoading: isEditMealLoading, isError: isEditMealError, refetch } = useMeal(editMealId, {
    enabled: isEditMode,
  });
  const { updateMealAsync, isPending: isUpdatePending } = useUpdateMeal({
    mealId: editMealId,
  });

  useEffect(() => {
    if (!isEditMode || !editMeal || initializedMealId === editMeal.id) return;

    setMealName(editMeal.name);
    setDescription(editMeal.description ?? '');
    const loadedServingSize = editMeal.serving_size ?? 1;
    const loadedTotalServings = editMeal.total_servings ?? 1;
    setServingSizeText(String(loadedServingSize));
    setServingUnit(editMeal.serving_unit);
    setTotalServingsText(String(loadedTotalServings));
    // toPrecision(15) strips IEEE 754 artifacts (e.g. 1000 * 4.015 →
    // 4014.99999…) without losing real precision.
    setTotalAmountText(
      String(
        Number((loadedServingSize * loadedTotalServings).toPrecision(15))
      )
    );
    setIngredients(editMeal.foods.map(buildMealIngredientDraftFromMealFood));
    setInitializedMealId(editMeal.id);
  }, [editMeal, initializedMealId, isEditMode]);

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
  const totalServingsCount = parseDecimalInput(totalServingsText) ?? 0;
  const showPerServing = totalServingsCount > 1;

  const updateServingSize = (value: string) => {
    if (DECIMAL_INPUT_REGEX.test(value)) {
      setServingSizeText(value);
    }
  };

  const updateTotalServings = (value: string) => {
    if (DECIMAL_INPUT_REGEX.test(value)) {
      setTotalServingsText(value);
    }
  };

  const updateTotalAmount = (value: string) => {
    if (DECIMAL_INPUT_REGEX.test(value)) {
      setTotalAmountText(value);
    }
  };

  const handleServingUnitChange = (value: string) => {
    const previousUnit = servingUnit;
    setServingUnit(value);
    if (value === 'serving') {
      // Switching INTO serving-unit.
      // If coming from a quantity-based unit, derive total_servings from the
      // current Total Amount / Default Serving Size so the user's recipe
      // definition isn't silently lost when serving_size collapses to 1.
      if (previousUnit !== 'serving') {
        const parsedAmount = parseDecimalInput(totalAmountText);
        const parsedSize = parseDecimalInput(servingSizeText);
        if (
          parsedAmount &&
          parsedSize &&
          parsedAmount > 0 &&
          parsedSize > 0
        ) {
          setTotalServingsText(String(parsedAmount / parsedSize));
        }
      }
      setServingSizeText('1');
    } else if (previousUnit === 'serving') {
      // Switching OUT of serving-unit: seed Total Amount from total_servings × 1.
      setServingSizeText('1');
      setTotalAmountText(totalServingsText || '1');
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
    // Pass the ingredient's stored unit snapshot as a selectedVariantOverride so
    // FoodEntryAdd opens with the actual unit/nutrition rather than the default variant.
    const variantOverride: FoodUnitVariant = {
      id: ingredient.variant_id || undefined,
      serving_size: ingredient.serving_size,
      serving_unit: ingredient.serving_unit,
      calories: ingredient.calories,
      protein: ingredient.protein,
      carbs: ingredient.carbs,
      fat: ingredient.fat,
      dietary_fiber: ingredient.dietary_fiber,
      saturated_fat: ingredient.saturated_fat,
      sodium: ingredient.sodium,
      sugars: ingredient.sugars,
      trans_fat: ingredient.trans_fat,
      potassium: ingredient.potassium,
      calcium: ingredient.calcium,
      iron: ingredient.iron,
      cholesterol: ingredient.cholesterol,
      vitamin_a: ingredient.vitamin_a,
      vitamin_c: ingredient.vitamin_c,
    };
    navigation.navigate('FoodEntryAdd', {
      item: mealIngredientDraftToFoodInfo(ingredient),
      pickerMode: 'meal-builder',
      ingredientIndex,
      returnDepth: 1,
      selectedVariantOverride: variantOverride,
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

    // Derive the persisted fields based on the unit:
    //   - 'serving': user typed Total Servings directly; serving_size = 1.
    //   - other:    user typed Total Amount + Default Serving Size; derive
    //               total_servings = totalAmount / servingSize.
    let parsedServingSize: number | null;
    let parsedTotalServings: number | null;
    if (servingUnit === 'serving') {
      parsedServingSize = 1;
      parsedTotalServings = parseDecimalInput(totalServingsText);
    } else {
      parsedServingSize = parseDecimalInput(servingSizeText);
      const parsedTotalAmount = parseDecimalInput(totalAmountText);
      parsedTotalServings =
        parsedServingSize && parsedTotalAmount && parsedServingSize > 0
          ? Number(
              (parsedTotalAmount / parsedServingSize).toFixed(
                MEAL_SERVING_PRECISION
              )
            )
          : null;
    }

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
        text2: 'Default serving size must be greater than zero.',
      });
      return;
    }

    if (!parsedTotalServings || parsedTotalServings <= 0) {
      Toast.show({
        type: 'error',
        text1:
          servingUnit === 'serving'
            ? 'Invalid total servings'
            : 'Invalid total amount',
        text2:
          servingUnit === 'serving'
            ? 'Total servings must be greater than zero.'
            : 'Total amount must be greater than zero.',
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
      const payload = {
        name: trimmedMealName,
        description: description.trim() || null,
        serving_size: parsedServingSize,
        serving_unit: servingUnit,
        total_servings: parsedTotalServings,
        foods: ingredients.map(mealIngredientToPayload),
      };

      if (isEditMode) {
        await updateMealAsync(payload);
      } else {
        await createMealAsync({
          ...payload,
          is_public: false,
        });
      }
      navigation.goBack();
    } catch {
      // Error toast is handled in the mutation hook.
    }
  };

  const isSaving = isPending || isUpdatePending;

  const headerTintColor = String(useCSSVariable('--color-accent-primary'));
  const saveLabel = isEditMode ? 'Save Changes' : 'Save Meal';

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;
    navigation.setOptions({
      unstable_headerLeftItems: () => [
        createNativeHeaderTextButtonItem({
          label: 'Cancel',
          identifier: isEditMode ? 'meal-edit-cancel' : 'meal-create-cancel',
          tintColor: headerTintColor,
          onPress: () => navigation.goBack(),
          disabled: isSaving,
        }),
      ],
      unstable_headerRightItems: () => [
        createNativeHeaderTextButtonItem({
          label: saveLabel,
          identifier: isEditMode ? 'meal-edit-save' : 'meal-create-save',
          tintColor: headerTintColor,
          onPress: () => void handleSaveMeal(),
          disabled: isSaving,
          fontWeight: '600',
        }),
      ],
    });
  }, [navigation, headerTintColor, isSaving, isEditMode, saveLabel, handleSaveMeal]);

  const renderHeader = () => Platform.OS === 'ios' ? null : (
    <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className="z-10"
        accessibilityLabel="Back"
        accessibilityRole="button"
      >
        <Icon name="chevron-back" size={22} color={accentColor} />
      </TouchableOpacity>
      <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
        {isEditMode ? 'Edit Meal' : 'Create Meal'}
      </Text>
    </View>
  );

  if (isEditMode && isEditMealLoading && !editMeal) {
    return (
      <View
        className="flex-1 bg-background"
        style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
      >
        {renderHeader()}
        <StatusView loading title="Loading meal..." />
      </View>
    );
  }

  if (isEditMode && (isEditMealError || !editMeal)) {
    return (
      <View
        className="flex-1 bg-background"
        style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
      >
        {renderHeader()}
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title="Failed to load meal"
          subtitle="Please check your connection and try again."
          action={{ label: 'Retry', onPress: () => void refetch(), variant: 'primary' }}
        />
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {renderHeader()}

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-safe-or-8 gap-4"
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

          {/* Top row: count-or-amount + unit selector */}
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1.5">
              {servingUnit === 'serving' ? (
                <>
                  <Text className="text-text-secondary text-sm font-medium">
                    Total Servings *
                  </Text>
                  <FormInput
                    placeholder="1"
                    value={totalServingsText}
                    onChangeText={updateTotalServings}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </>
              ) : (
                <>
                  <Text className="text-text-secondary text-sm font-medium">
                    {`Total Amount (${servingUnit}) *`}
                  </Text>
                  <FormInput
                    placeholder="1"
                    value={totalAmountText}
                    onChangeText={updateTotalAmount}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </>
              )}
            </View>
            <View className="flex-1 gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                Unit
              </Text>
              <BottomSheetPicker
                value={servingUnit}
                options={SERVING_UNIT_OPTIONS}
                onSelect={handleServingUnitChange}
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

          {/* Bottom row: Serving Size — only for non-serving units. Short
              label "Serving Size (unit) *" fits the half-width column, so we
              use the same layout as Total Amount / Unit above. */}
          {servingUnit !== 'serving' && (
            <View className="flex-row gap-3">
              <View className="flex-1 gap-1.5">
                <Text className="text-text-secondary text-sm font-medium">
                  {`Serving Size (${servingUnit}) *`}
                </Text>
                <FormInput
                  placeholder="1"
                  value={servingSizeText}
                  onChangeText={updateServingSize}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              <View className="flex-1" />
            </View>
          )}
        </View>

        <View className="bg-surface rounded-xl p-4 gap-3 shadow-sm">
          <Text className="text-text-primary text-lg font-semibold">Foods in Meal</Text>

          {ingredients.length > 0 ? (
            <View>
              {ingredients.map((ingredient, index) => {
                const servingSize = toFiniteNumber(ingredient.serving_size);
                const quantity = toFiniteNumber(ingredient.quantity);
                const scale = servingSize > 0 ? quantity / servingSize : 0;
                const ingredientCalories = formatCaloriesDisplay(
                  toFiniteNumber(ingredient.calories) * scale,
                );
                const ingredientProtein = formatMacroDisplay(
                  toFiniteNumber(ingredient.protein) * scale,
                );
                const ingredientCarbs = formatMacroDisplay(
                  toFiniteNumber(ingredient.carbs) * scale,
                );
                const ingredientFat = formatMacroDisplay(
                  toFiniteNumber(ingredient.fat) * scale,
                );
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
                            {formatServingSizeDisplay(quantity)}{' '}
                            {ingredient.unit || ingredient.serving_unit || 'serving'}
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
                    {formatCaloriesDisplay(totals.calories)} cal
                  </Text>
                </View>
                <View className="flex-row items-start gap-2 mt-1">
                  <MacroStat color={proteinColor} value={formatMacroDisplay(totals.protein)} label="g protein" />
                  <MacroStat color={carbsColor} value={formatMacroDisplay(totals.carbs)} label="g carbs" />
                  <MacroStat color={fatColor} value={formatMacroDisplay(totals.fat)} label="g fat" />
                </View>
              </View>
              {showPerServing ? (
                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-text-secondary text-base font-medium">Per serving</Text>
                    <Text className="text-text-primary text-base font-semibold text-right">
                      {formatCaloriesDisplay(totals.calories / totalServingsCount)} cal
                    </Text>
                  </View>
                  <View className="flex-row items-start gap-2 mt-1">
                    <MacroStat
                      color={proteinColor}
                      value={formatMacroDisplay(totals.protein / totalServingsCount)}
                      label="g protein"
                    />
                    <MacroStat
                      color={carbsColor}
                      value={formatMacroDisplay(totals.carbs / totalServingsCount)}
                      label="g carbs"
                    />
                    <MacroStat
                      color={fatColor}
                      value={formatMacroDisplay(totals.fat / totalServingsCount)}
                      label="g fat"
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {Platform.OS !== 'ios' && (
        <Button
          variant="primary"
          onPress={() => {
            void handleSaveMeal();
          }}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text className="text-white text-base font-semibold">
              {isEditMode ? 'Save Changes' : 'Save Meal'}
            </Text>
          )}
        </Button>
        )}
      </ScrollView>
    </View>
  );
};

export default MealAddScreen;
