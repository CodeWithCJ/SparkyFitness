import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import StatusView from '../components/StatusView';
import Icon from '../components/Icon';
import { useCreateMeal, useMeal, useUpdateMeal } from '../hooks';
import { consumePendingMealIngredientSelection } from '../services/mealBuilderSelection';
import { mealIngredientDraftToFoodInfo } from '../types/foodInfo';
import type { MealFoodPayload, MealIngredientDraft } from '../types/meals';
import type { FoodUnitVariant } from '../types/foodUnitVariants';
import type { RootStackScreenProps } from '../types/navigation';
import { buildMealIngredientDraftFromMealFood } from '../utils/mealBuilderDraft';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  formatMobileNumber,
  formatMobilePreciseCalories,
  localizeNutrient,
  localizeServingUnit,
  mobileT,
} from '../localization';

type MealAddScreenProps = RootStackScreenProps<'MealAdd'>;

const MEAL_SERVING_PRECISION = 6;

const SERVING_UNIT_OPTIONS = [
  'serving', 'g', 'ml', 'oz', 'cup', 'tbsp', 'tsp', 'piece',
].map((unit) => ({ label: localizeServingUnit(unit), value: unit }));

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
      {value}{' '}
      {label}
    </Text>
  </View>
);

function formatMealInputNumber(value: number): string {
  return formatMobileNumber(value, {
    maximumFractionDigits: MEAL_SERVING_PRECISION,
    useGrouping: false,
  });
}

function formatMealMacro(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return formatMobileNumber(safeValue, {
    maximumFractionDigits: Math.abs(safeValue) >= 1 ? 1 : 4,
  });
}

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
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentColor, textMuted, proteinColor, carbsColor, fatColor, borderSubtle] =
    useCSSVariable([
      '--color-accent-primary',
      '--color-text-muted',
      '--color-macro-protein',
      '--color-macro-carbs',
      '--color-macro-fat',
      '--color-border-subtle',
    ]) as [string, string, string, string, string, string];

  const [mealName, setMealName] = useState('');
  const [description, setDescription] = useState('');
  // serving_size = quantity of ONE serving in serving_unit (e.g. 250 for 250 ml,
  // or 1 when unit is 'serving'). total_servings = yield count.
  const [servingSizeText, setServingSizeText] = useState(() =>
    formatMealInputNumber(1),
  );
  const [servingUnit, setServingUnit] = useState('serving');
  const [totalServingsText, setTotalServingsText] = useState(() =>
    formatMealInputNumber(1),
  );
  // For non-serving units we ask the user for the BATCH amount and derive
  // total_servings = totalAmount / servingSize on save.
  const [totalAmountText, setTotalAmountText] = useState(() =>
    formatMealInputNumber(1),
  );
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

    // One-time form initialization from the async-loaded meal, guarded by its id.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMealName(editMeal.name);
    setDescription(editMeal.description ?? '');
    const loadedServingSize = editMeal.serving_size ?? 1;
    const loadedTotalServings = editMeal.total_servings ?? 1;
    setServingSizeText(formatMealInputNumber(loadedServingSize));
    setServingUnit(editMeal.serving_unit);
    setTotalServingsText(formatMealInputNumber(loadedTotalServings));
    // toPrecision(15) strips IEEE 754 artifacts (e.g. 1000 * 4.015 →
    // 4014.99999…) without losing real precision.
    setTotalAmountText(
      formatMealInputNumber(
        Number((loadedServingSize * loadedTotalServings).toPrecision(15)),
      ),
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
          setTotalServingsText(formatMealInputNumber(parsedAmount / parsedSize));
        }
      }
      setServingSizeText(formatMealInputNumber(1));
    } else if (previousUnit === 'serving') {
      // Switching OUT of serving-unit: seed Total Amount from total_servings × 1.
      setServingSizeText(formatMealInputNumber(1));
      setTotalAmountText(totalServingsText || formatMealInputNumber(1));
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
    // Linked sub-meal ingredients aren't editable in the mobile builder yet
    // (quantity editing for a linked meal needs a meal-serving picker, not the
    // food/variant editor below) — remove and re-add via the web app instead.
    if (ingredient.item_type === 'meal') {
      Toast.show({
        type: 'info',
        text1: mobileT('mealAdd.linkedMeal'),
        text2: mobileT('mealAdd.editLinkedMealWeb'),
      });
      return;
    }
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
      ingredient.food_name || mobileT('mealAdd.foodFallback'),
      undefined,
      [
        { text: mobileT('common.edit'), onPress: () => editIngredient(ingredient, ingredientIndex) },
        {
          text: mobileT('common.delete'),
          style: 'destructive',
          onPress: () => removeIngredient(ingredientIndex),
        },
        { text: mobileT('common.cancel'), style: 'cancel' },
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
        text1: mobileT('mealAdd.missingMealName'),
        text2: mobileT('mealAdd.enterMealName'),
      });
      return;
    }

    if (!parsedServingSize || parsedServingSize <= 0) {
      Toast.show({
        type: 'error',
        text1: mobileT('mealAdd.invalidServingSize'),
        text2: mobileT('mealAdd.servingSizePositive'),
      });
      return;
    }

    if (!parsedTotalServings || parsedTotalServings <= 0) {
      Toast.show({
        type: 'error',
        text1:
          servingUnit === 'serving'
            ? mobileT('mealAdd.invalidTotalServings')
            : mobileT('mealAdd.invalidTotalAmount'),
        text2:
          servingUnit === 'serving'
            ? mobileT('mealAdd.totalServingsPositive')
            : mobileT('mealAdd.totalAmountPositive'),
      });
      return;
    }

    if (!ingredients.length) {
      Toast.show({
        type: 'error',
        text1: mobileT('mealAdd.noIngredients'),
        text2: mobileT('mealAdd.addIngredientFirst'),
      });
      return;
    }

    if (ingredients.some((ingredient) => !ingredient.variant_id)) {
      Toast.show({
        type: 'error',
        text1: mobileT('mealAdd.missingIngredientData'),
        text2: mobileT('mealAdd.readdIngredient'),
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

  const header = useScreenHeader({
    title: isEditMode
      ? mobileT('mealAdd.editMeal')
      : mobileT('mealAdd.createMeal'),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      disabled: isSaving,
      identifier: isEditMode ? 'meal-edit-cancel' : 'meal-create-cancel',
    },
    right: {
      kind: 'primary',
      label: mobileT('common.save'),
      busyLabel: mobileT('common.saving'),
      busy: isSaving,
      disabled: isSaving,
      placement: 'native-only',
      onPress: () => void handleSaveMeal(),
      identifier: isEditMode ? 'meal-edit-save' : 'meal-create-save',
    },
  });

  if (isEditMode && isEditMealLoading && !editMeal) {
    return (
      <View
        className="flex-1 bg-background"
        style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
      >
        {header}
        <StatusView loading title={mobileT('mealDetail.loading')} />
      </View>
    );
  }

  if (isEditMode && (isEditMealError || !editMeal)) {
    return (
      <View
        className="flex-1 bg-background"
        style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
      >
        {header}
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title={mobileT('mealDetail.loadFailed')}
          subtitle={mobileT('mealDetail.loadFailedDescription')}
          action={{
            label: mobileT('common.retry'),
            onPress: () => void refetch(),
            variant: 'primary',
          }}
        />
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-8 gap-4"
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-surface rounded-xl p-4 gap-4 shadow-sm">
          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {mobileT('mealAdd.mealName')}
            </Text>
            <FormInput
              placeholder={mobileT('mealAdd.mealNamePlaceholder')}
              value={mealName}
              onChangeText={setMealName}
              returnKeyType="done"
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {mobileT('mealAdd.description')}
            </Text>
            <FormInput
              placeholder={mobileT('mealAdd.descriptionPlaceholder')}
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
                    {mobileT('mealAdd.totalServings')}
                  </Text>
                  <FormInput
                    placeholder={formatMealInputNumber(1)}
                    value={totalServingsText}
                    onChangeText={updateTotalServings}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                </>
              ) : (
                <>
                  <Text className="text-text-secondary text-sm font-medium">
                    {mobileT('mealAdd.totalAmount', {
                      unit: localizeServingUnit(servingUnit),
                    })}
                  </Text>
                  <FormInput
                    placeholder={formatMealInputNumber(1)}
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
                {mobileT('mealAdd.unit')}
              </Text>
              <BottomSheetPicker
                value={servingUnit}
                options={SERVING_UNIT_OPTIONS}
                onSelect={handleServingUnitChange}
                title={mobileT('mealAdd.selectUnit')}
                renderTrigger={({ onPress, selectedOption }) => (
                  <TouchableOpacity
                    onPress={onPress}
                    activeOpacity={0.7}
                    className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
                    style={{ minHeight: 44 }}
                  >
                    <Text className="text-text-primary" style={{ fontSize: 16 }}>
                      {selectedOption?.label ?? localizeServingUnit(servingUnit)}
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
                  {mobileT('mealAdd.servingSize', {
                    unit: localizeServingUnit(servingUnit),
                  })}
                </Text>
                <FormInput
                  placeholder={formatMealInputNumber(1)}
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
          <Text className="text-text-primary text-lg font-semibold">
            {mobileT('mealAdd.foods')}
          </Text>

          {ingredients.length > 0 ? (
            <View>
              {ingredients.map((ingredient, index) => {
                const servingSize = toFiniteNumber(ingredient.serving_size);
                const quantity = toFiniteNumber(ingredient.quantity);
                const scale = servingSize > 0 ? quantity / servingSize : 0;
                const ingredientCalories = formatMobilePreciseCalories(
                  toFiniteNumber(ingredient.calories) * scale,
                );
                const ingredientProtein = formatMealMacro(
                  toFiniteNumber(ingredient.protein) * scale,
                );
                const ingredientCarbs = formatMealMacro(
                  toFiniteNumber(ingredient.carbs) * scale,
                );
                const ingredientFat = formatMealMacro(
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
                          accessibilityLabel={mobileT('mealAdd.removeIngredient', {
                            name:
                              ingredient.food_name ||
                              mobileT('mealAdd.foodFallback'),
                          })}
                          accessibilityRole="button"
                        >
                          <Text className="text-text-danger font-semibold text-sm">
                            {mobileT('common.delete')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  >
                    <GHTouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => editIngredient(ingredient, index)}
                      onLongPress={() => showIngredientMenu(ingredient, index)}
                      accessibilityLabel={mobileT('mealAdd.editIngredient', {
                        name:
                          ingredient.food_name || mobileT('mealAdd.foodFallback'),
                      })}
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
                            {ingredient.food_name || mobileT('mealAdd.foodFallback')}
                            {ingredient.brand ? (
                              <Text className="text-text-secondary font-normal">
                                {' \u00b7 '}
                                {ingredient.brand}
                              </Text>
                            ) : null}
                          </Text>
                          {ingredient.item_type === 'meal' ? (
                            <View
                              className="self-start rounded-full px-2 py-0.5 mt-1"
                              style={{ backgroundColor: `${textMuted}1A` }}
                            >
                              <Text className="text-xs font-medium" style={{ color: textMuted }}>
                                {mobileT('mealAdd.linkedMeal')}
                              </Text>
                            </View>
                          ) : null}
                          <Text className="text-text-muted text-sm mt-1">
                            {mobileT('mealAdd.macros', {
                              protein: `${ingredientProtein} ${mobileT('units.g')}`,
                              carbs: `${ingredientCarbs} ${mobileT('units.g')}`,
                              fat: `${ingredientFat} ${mobileT('units.g')}`,
                            })}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-text-primary text-base font-semibold">
                            {ingredientCalories}
                          </Text>
                          <Text className="text-text-muted text-sm mt-1">
                            {formatMobileNumber(quantity, {
                              maximumFractionDigits: 4,
                            })}{' '}
                            {localizeServingUnit(
                              ingredient.unit ||
                                ingredient.serving_unit ||
                                'serving',
                            )}
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
              accessibilityLabel={mobileT('mealAdd.addFood')}
            >
              <Icon name="add" size={16} color={accentColor} />
              <Text className="text-accent-primary text-sm font-semibold">
                {mobileT('mealAdd.addFood')}
              </Text>
            </Button>
          </View>

          {ingredients.length > 0 ? (
            <View className="bg-raised rounded-lg p-4 gap-4">
              <View className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-text-secondary text-base font-medium">
                    {mobileT('mealAdd.mealTotal')}
                  </Text>
                    <Text className="text-text-primary text-base font-semibold text-right">
                    {formatMobilePreciseCalories(totals.calories)}
                  </Text>
                </View>
                <View className="flex-row items-start gap-2 mt-1">
                  <MacroStat
                    color={proteinColor}
                    value={formatMealMacro(totals.protein)}
                    label={`${mobileT('units.g')} ${localizeNutrient('protein')}`}
                  />
                  <MacroStat
                    color={carbsColor}
                    value={formatMealMacro(totals.carbs)}
                    label={`${mobileT('units.g')} ${localizeNutrient('carbs')}`}
                  />
                  <MacroStat
                    color={fatColor}
                    value={formatMealMacro(totals.fat)}
                    label={`${mobileT('units.g')} ${localizeNutrient('fat')}`}
                  />
                </View>
              </View>
              {showPerServing ? (
                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-text-secondary text-base font-medium">
                      {mobileT('mealDetail.perServing')}
                    </Text>
                    <Text className="text-text-primary text-base font-semibold text-right">
                      {formatMobilePreciseCalories(
                        totals.calories / totalServingsCount,
                      )}
                    </Text>
                  </View>
                  <View className="flex-row items-start gap-2 mt-1">
                    <MacroStat
                      color={proteinColor}
                      value={formatMealMacro(totals.protein / totalServingsCount)}
                      label={`${mobileT('units.g')} ${localizeNutrient('protein')}`}
                    />
                    <MacroStat
                      color={carbsColor}
                      value={formatMealMacro(totals.carbs / totalServingsCount)}
                      label={`${mobileT('units.g')} ${localizeNutrient('carbs')}`}
                    />
                    <MacroStat
                      color={fatColor}
                      value={formatMealMacro(totals.fat / totalServingsCount)}
                      label={`${mobileT('units.g')} ${localizeNutrient('fat')}`}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

      </ScrollView>

      {!usesNativeHeader && (
        /* Sticky footer */
        <View
          className="px-4 py-3"
          style={{
            paddingBottom: Math.max(insets.bottom, 12),
            borderTopWidth: 1,
            borderTopColor: borderSubtle,
          }}
        >
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
                {mobileT('common.save')}
              </Text>
            )}
          </Button>
        </View>
      )}
    </View>
  );
};

export default MealAddScreen;
