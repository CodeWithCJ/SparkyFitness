import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import { useFocusEffect } from '@react-navigation/native';
import {
  toPer100g,
  toFoodNutritionFields,
  getConversionFactor,
  ingredientRowFromPickedFood,
  MEAL_SERVING_UNITS,
  MEAL_SERVING_UNIT_DEFAULT,
  type FoodPhotoLogItem,
} from '@workspace/shared';
import Button from '../components/ui/Button';
import FoodForm, { type FoodFormData } from '../components/FoodForm';
import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import { FooterSaveBar } from '../components/FormScreenChrome';
import FoodPhotoIngredientRow from '../components/FoodPhotoIngredientRow';
import { useFoodPhotoIngredientDraft } from '../hooks/useFoodPhotoIngredientDraft';
import { consumePendingMealIngredientSelection } from '../services/mealBuilderSelection';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
import {
  confidenceTones,
  overallConfidenceLabels,
  type ConfidenceTone,
} from '../utils/foodPhotoEstimate';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type {
  FoodPhotoFlowScreenProps,
  RootStackParamList,
  SaveMode,
} from '../types/navigation';

type Props = FoodPhotoFlowScreenProps<'EstimateReview'>;

const toFieldString = (n: number | undefined | null): string => {
  if (n === undefined || n === null || !Number.isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
};

const TONE_BG_CLASS: Record<ConfidenceTone, string> = {
  success: 'bg-bg-success',
  warning: 'bg-bg-warning',
  error: 'bg-bg-danger-subtle',
};

const TONE_TEXT_CLASS: Record<ConfidenceTone, string> = {
  success: 'text-text-success',
  warning: 'text-text-warning',
  error: 'text-text-danger-subtle',
};

const parsedRequiredMacro = (raw: string): number | null => {
  if (raw.trim() === '') return 0;
  const v = parseDecimalInput(raw);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
};

const parsedOptional = (raw: string): number | null | undefined => {
  if (raw.trim() === '') return undefined;
  const v = parseDecimalInput(raw);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
};

const positiveOrUndefined = (v: number | undefined | null) =>
  v !== undefined && v !== null && v > 0 ? v : undefined;

function confidenceLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  confidence: keyof typeof overallConfidenceLabels,
  scope: 'overall' | 'item',
): string {
  if (scope === 'overall') {
    switch (confidence) {
      case 'high': return t('foodPhotoEstimate.confidence.good', { defaultValue: 'Good' });
      case 'medium': return t('foodPhotoEstimate.confidence.fair', { defaultValue: 'Fair' });
      case 'low': return t('foodPhotoEstimate.confidence.rough', { defaultValue: 'Rough' });
    }
  }
  switch (confidence) {
    case 'high': return t('foodPhotoEstimate.confidence.likely', { defaultValue: 'Likely' });
    case 'medium': return t('foodPhotoEstimate.confidence.possible', { defaultValue: 'Possible' });
    case 'low': return t('foodPhotoEstimate.confidence.uncertain', { defaultValue: 'Uncertain' });
  }
}

const FoodPhotoEstimateReviewScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  const { backColor } = useHeaderActionColors();

  const dismissFlow = () =>
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.popToTop();

  const { date, estimate, request } = route.params;

  // Grouped is the default: it is strictly more informative than a single
  // opaque food, and the diary still collapses it to one row.
  /**
   * How the plate is saved. The two ingredient options produce an identical
   * diary row; they differ only in whether a reusable meal template is created,
   * which is what makes the plate re-loggable later without another photo.
   */
  const [saveMode, setSaveMode] = useState<SaveMode>('ingredients_and_meal');
  const [mealName, setMealName] = useState(
    estimate.meal_summary || 'Photo estimate',
  );
  const isCombined = saveMode === 'one_food';
  const mode: 'grouped' | 'combined' = isCombined ? 'combined' : 'grouped';
  const {
    rows,
    isEdited,
    expandedId,
    totals,
    totalGrams,
    matchedCount,
    hasCompleteGrams,
    dispatch,
  } = useFoodPhotoIngredientDraft(estimate.items);

  // How the dish divides into portions, and how much of it is being logged.
  // Same serving model as any other meal: 'serving' means the user states the
  // yield directly, any other unit means they state a total amount and a
  // serving size and the yield is derived from the two.
  //
  // These describe the DISH, not its nutrition. The ingredient rows carry the
  // nutrition, and the amount only decides how it is divided — saying a soup
  // makes 2000 ml adds portions, never calories.
  const [servingUnit, setServingUnit] = useState<string>(
    MEAL_SERVING_UNIT_DEFAULT,
  );
  const isServingUnit = servingUnit === MEAL_SERVING_UNIT_DEFAULT;
  const [totalServingsText, setTotalServingsText] = useState('1');
  const [totalAmountText, setTotalAmountText] = useState('');
  const [servingSizeText, setServingSizeText] = useState('1');
  const [consumedText, setConsumedText] = useState('1');
  // Once the user edits the amount, stop seeding it: what they typed is the
  // dish, and a later ingredient edit must not overwrite it.
  const [amountTouched, setAmountTouched] = useState(false);

  // Best guess at the dish's weight, in grams: what was typed on the Improve
  // screen for the AI, else the ingredients' own sum. Only ever a starting
  // point — water added and weight lost or gained in cooking make the real
  // total something only the user knows.
  const prefillGrams = useMemo(() => {
    const requested = request?.totalWeight;
    if (requested && requested > 0) {
      const factor = getConversionFactor('g', request?.weightUnit ?? 'g');
      if (factor) return requested * factor;
    }
    return hasCompleteGrams ? totalGrams : 0;
  }, [request, hasCompleteGrams, totalGrams]);

  /** The prefill expressed in `unit`, or '' when it cannot be converted. */
  const prefillAmountFor = (unit: string): string => {
    if (prefillGrams <= 0) return '';
    // Null across families: there is no density to turn grams into millilitres,
    // so a volume dish starts blank rather than with a fabricated number.
    const factor = getConversionFactor('g', unit);
    if (!factor) return '';
    return String(Math.round(prefillGrams / factor));
  };

  const servingSize = isServingUnit ? 1 : parseDecimalInput(servingSizeText) || 0;
  const totalAmount = parseDecimalInput(totalAmountText) || 0;
  const totalServings = isServingUnit
    ? parseDecimalInput(totalServingsText) || 0
    : servingSize > 0
      ? totalAmount / servingSize
      : 0;
  const consumedQuantity = parseDecimalInput(consumedText) || 0;
  const servingsAreValid =
    servingSize > 0 && totalServings > 0 && consumedQuantity > 0;
  const showPerServing = servingsAreValid && totalServings > 1;
  // Falls back to logging the plate as it stands while a field is mid-edit or
  // blank, so a half-typed number never silently scales the diary.
  const portionFactor = servingsAreValid
    ? consumedQuantity / (servingSize * totalServings)
    : 1;

  const updateTotalServings = (value: string) => {
    if (DECIMAL_INPUT_REGEX.test(value)) setTotalServingsText(value);
  };

  const updateTotalAmount = (value: string) => {
    if (!DECIMAL_INPUT_REGEX.test(value)) return;
    setAmountTouched(true);
    setTotalAmountText(value);
  };

  const updateServingSize = (value: string) => {
    if (DECIMAL_INPUT_REGEX.test(value)) setServingSizeText(value);
  };

  const updateConsumed = (value: string) => {
    if (DECIMAL_INPUT_REGEX.test(value)) setConsumedText(value);
  };

  // Switching unit carries the dish over instead of resetting it, matching
  // MealAddScreen: the yield the user already described survives the change.
  const handleServingUnitChange = (nextUnit: string) => {
    const previousUnit = servingUnit;
    if (nextUnit === previousUnit) return;
    setServingUnit(nextUnit);
    if (nextUnit === MEAL_SERVING_UNIT_DEFAULT) {
      // Into 'serving': keep the yield the amount and serving size implied.
      if (totalServings > 0) setTotalServingsText(String(totalServings));
      setServingSizeText('1');
      setConsumedText('1');
      return;
    }
    // Out of 'serving' (or between measured units): seed the amount from the
    // dish weight where the units allow, and start from one serving eaten.
    const seeded = amountTouched ? '' : prefillAmountFor(nextUnit);
    if (seeded) setTotalAmountText(seeded);
    if (previousUnit === MEAL_SERVING_UNIT_DEFAULT) setServingSizeText('');
    setConsumedText('');
  };

  // A food added from the picker comes back through the same module-level
  // handshake the meal builder uses: the picker screen stashes it and pops, and
  // whichever screen regains focus claims it.
  useFocusEffect(
    useCallback(() => {
      const selection = consumePendingMealIngredientSelection();
      if (!selection) return;
      const { ingredient } = selection;
      if (!ingredient.food_id || !ingredient.variant_id) return;
      dispatch({
        type: 'ADD_ROW',
        row: ingredientRowFromPickedFood({
          foodId: ingredient.food_id,
          variantId: ingredient.variant_id,
          // food_name is optional on the payload type; the picker always sets
          // it, so this only guards the shape.
          name:
            ingredient.food_name ||
            t('foodPhotoEstimate.ingredients.addedFood', {
              defaultValue: 'Food',
            }),
          quantity: ingredient.quantity,
          unit:
            ingredient.unit ||
            ingredient.serving_unit ||
            MEAL_SERVING_UNIT_DEFAULT,
          servingSize: ingredient.serving_size,
          macrosPerServing: {
            calories_kcal: ingredient.calories,
            protein_g: ingredient.protein,
            carbs_g: ingredient.carbs,
            fat_g: ingredient.fat,
            fiber_g: ingredient.dietary_fiber,
            sugar_g: ingredient.sugars,
          },
        }),
      });
    }, [dispatch, t]),
  );

  const openFoodPicker = () => {
    navigation
      .getParent<NativeStackNavigationProp<RootStackParamList>>()
      ?.navigate('FoodSearch', { pickerMode: 'meal-builder', date });
  };

  // Seeded from the CURRENT draft, not the original estimate, so switching to
  // "One food" after editing or removing ingredients carries those edits over
  // instead of silently reverting to the AI's first answer. With no rows left
  // (everything removed) it falls back to the estimate totals.
  const initialFormValues = useMemo<Partial<FoodFormData>>(() => {
    // Only override the model's plate total once the user has edited.
    const hasDraft = isEdited && rows.length > 0;
    const grams = hasDraft ? totalGrams : estimate.totals.total_grams;
    const macros = hasDraft ? totals : estimate.totals;
    const useRequestWeight = !hasDraft && request?.totalWeight !== undefined;
    return {
      name: estimate.meal_summary || 'Photo estimate',
      brand: '',
      servingSize: useRequestWeight
        ? toFieldString(request?.totalWeight)
        : String(Math.round(grams)),
      servingUnit: useRequestWeight ? (request?.weightUnit ?? 'g') : 'g',
      calories: toFieldString(macros.calories_kcal),
      protein: toFieldString(macros.protein_g),
      carbs: toFieldString(macros.carbs_g),
      fat: toFieldString(macros.fat_g),
      fiber: toFieldString(macros.fiber_g),
      sugars: toFieldString(macros.sugar_g),
    };
  }, [estimate, request, isEdited, rows, totals, totalGrams]);

  const [showConfidenceReason, setShowConfidenceReason] = useState(false);

  const overallTone = confidenceTones[estimate.overall_confidence];
  const overallLabel = confidenceLabel(t, estimate.overall_confidence, 'overall');


  /**
   * Turn the edited rows into the log payload.
   *
   * Nutrition on the rows is per-portion (it describes `grams`); a created food
   * stores per-100 g. `toPer100g` is the only bridge, and its branded return
   * type makes shipping per-portion numbers as per-100 g a compile error. A row
   * whose weight is zero has no meaningful per-100 g form, so it is dropped.
   */
  const buildGroupedItems = (): FoodPhotoLogItem[] => {
    const items: FoodPhotoLogItem[] = [];
    for (const row of rows) {
      // A row the user added from the food picker already names a real food and
      // a real amount, in that food's own unit. It is logged verbatim — going
      // through grams would be impossible for a food measured in cups.
      if (row.logAs) {
        if (row.logAs.quantity <= 0) continue;
        items.push({
          source: 'existing',
          food_id: row.logAs.foodId,
          variant_id: row.logAs.variantId,
          quantity: row.logAs.quantity,
          unit: row.logAs.unit,
        });
        continue;
      }

      if (row.grams <= 0) continue;

      // Only a match against a food that already exists locally can be logged
      // by id. A provider match has no food_id — the food is created below
      // from the provider's nutrition, which `row.macros` already holds.
      if (row.matchApplied && row.match?.food_id && row.match.variant_id) {
        items.push({
          source: 'existing',
          food_id: row.match.food_id,
          variant_id: row.match.variant_id,
          quantity: row.grams,
          unit: 'g',
        });
        continue;
      }

      const per100g = toPer100g(row.macros, row.grams);
      if (!per100g) continue;
      items.push({
        source: 'new',
        food: {
          name: row.name.trim() || row.canonicalName,
          brand: row.matchApplied ? (row.match?.brand ?? null) : null,
          serving_size: 100,
          serving_unit: 'g',
          ...toFoodNutritionFields(per100g),
          // Marks the stored food as an AI estimate so it is not mistaken for
          // verified data later. A row showing a matched provider food is not
          // a guess, so it carries no confidence.
          ...(row.matchApplied ? {} : { ai_confidence: row.confidence }),
        },
        quantity: row.grams,
        unit: 'g',
      });
    }
    return items;
  };

  const handleGroupedNext = () => {
    if (!servingsAreValid) {
      Toast.show({
        type: 'error',
        text1: t('foodPhotoEstimate.errors.invalidServings', {
          defaultValue: 'Invalid servings',
        }),
        text2: t('foodPhotoEstimate.errors.positiveServings', {
          defaultValue:
            'The dish total, the serving size and the amount eaten must all be greater than zero.',
        }),
      });
      return;
    }

    const items = buildGroupedItems();
    if (items.length === 0) {
      Toast.show({
        type: 'error',
        text1: t('foodPhotoEstimate.errors.invalidNutrition', {
          defaultValue: 'Invalid nutrition',
        }),
        text2: t('foodPhotoEstimate.errors.noIngredients', {
          defaultValue: 'Keep at least one ingredient, or switch to One food.',
        }),
      });
      return;
    }
    navigation.navigate('LogEntry', {
      date,
      mealTypeId: route.params.mealTypeId ?? undefined,
      mode: 'grouped',
      mealName: mealName.trim() || estimate.meal_summary || 'Photo estimate',
      description: estimate.confidence_reason || undefined,
      ingredients: items,
      saveAsMeal: saveMode === 'ingredients_and_meal',
      servingSize,
      servingUnit,
      totalServings,
      consumedQuantity,
      // The portion being logged, not the whole dish: the next screen only
      // previews these numbers, and the server does the same scaling itself
      // from the two serving counts.
      nutrition: {
        grams: totalGrams * portionFactor,
        calories: totals.calories_kcal * portionFactor,
        protein: totals.protein_g * portionFactor,
        carbs: totals.carbs_g * portionFactor,
        fat: totals.fat_g * portionFactor,
        fiber: totals.fiber_g * portionFactor,
        sugars: totals.sugar_g * portionFactor,
      },
    });
  };

  const handleSubmit = (data: FoodFormData) => {
    if (!data.name.trim()) {
      Toast.show({ type: 'error', text1: t('foodPhotoEstimate.errors.nameRequired', { defaultValue: 'Name required' }), text2: t('foodPhotoEstimate.errors.nameRequiredMessage', { defaultValue: 'Give this food a name.' }) });
      return;
    }

    const caloriesValue = parsedRequiredMacro(data.calories);
    const proteinValue = parsedRequiredMacro(data.protein);
    const carbsValue = parsedRequiredMacro(data.carbs);
    const fatValue = parsedRequiredMacro(data.fat);
    if (
      caloriesValue === null ||
      proteinValue === null ||
      carbsValue === null ||
      fatValue === null
    ) {
      Toast.show({
        type: 'error',
        text1: t('foodPhotoEstimate.errors.invalidNutrition', { defaultValue: 'Invalid nutrition' }),
        text2: t('foodPhotoEstimate.errors.invalidRequiredNutrition', { defaultValue: 'Calories, protein, carbs, and fat must be non-negative numbers.' }),
      });
      return;
    }

    const optionalNutrients = {
      dietary_fiber: parsedOptional(data.fiber),
      sugars: parsedOptional(data.sugars),
      saturated_fat: parsedOptional(data.saturatedFat),
      trans_fat: parsedOptional(data.transFat),
      cholesterol: parsedOptional(data.cholesterol),
      sodium: parsedOptional(data.sodium),
      potassium: parsedOptional(data.potassium),
      calcium: parsedOptional(data.calcium),
      iron: parsedOptional(data.iron),
      vitamin_a: parsedOptional(data.vitaminA),
      vitamin_c: parsedOptional(data.vitaminC),
    };
    if (Object.values(optionalNutrients).some((v) => v === null)) {
      Toast.show({
        type: 'error',
        text1: t('foodPhotoEstimate.errors.invalidNutrition', { defaultValue: 'Invalid nutrition' }),
        text2: t('foodPhotoEstimate.errors.invalidOptionalNutrition', { defaultValue: 'All nutrition values must be non-negative numbers.' }),
      });
      return;
    }

    const servingSizeValue = parseDecimalInput(data.servingSize);
    if (!Number.isFinite(servingSizeValue) || servingSizeValue <= 0) {
      Toast.show({
        type: 'error',
        text1: t('foodPhotoEstimate.errors.invalidServingSize', { defaultValue: 'Invalid serving size' }),
        text2: t('foodPhotoEstimate.errors.invalidServingSizeMessage', { defaultValue: 'Serving size must be a positive number.' }),
      });
      return;
    }

    navigation.navigate('LogEntry', {
      date,
      mealTypeId: route.params.mealTypeId ?? undefined,
      mode: 'combined',
      saveFoodPayload: {
        name: data.name.trim(),
        brand: data.brand.trim() ? data.brand.trim() : null,
        serving_size: servingSizeValue,
        serving_unit: data.servingUnit || 'g',
        calories: caloriesValue,
        protein: proteinValue,
        carbs: carbsValue,
        fat: fatValue,
        dietary_fiber: positiveOrUndefined(optionalNutrients.dietary_fiber),
        sugars: positiveOrUndefined(optionalNutrients.sugars),
        saturated_fat: positiveOrUndefined(optionalNutrients.saturated_fat),
        trans_fat: positiveOrUndefined(optionalNutrients.trans_fat),
        cholesterol: positiveOrUndefined(optionalNutrients.cholesterol),
        sodium: positiveOrUndefined(optionalNutrients.sodium),
        potassium: positiveOrUndefined(optionalNutrients.potassium),
        calcium: positiveOrUndefined(optionalNutrients.calcium),
        iron: positiveOrUndefined(optionalNutrients.iron),
        vitamin_a: positiveOrUndefined(optionalNutrients.vitamin_a),
        vitamin_c: positiveOrUndefined(optionalNutrients.vitamin_c),
        provider_type: 'food_photo_estimate',
      },
    });
  };

  const headerChildren = (
    <View>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setShowConfidenceReason((v) => !v)}
        className={`flex-row items-center justify-between rounded-lg p-3 ${TONE_BG_CLASS[overallTone]}`}
      >
        <Text className={`text-sm font-semibold ${TONE_TEXT_CLASS[overallTone]}`}>
          {t('foodPhotoEstimate.labels.overallEstimate', { defaultValue: '{{confidence}} estimate', confidence: overallLabel })}
        </Text>
        <Icon
          name={showConfidenceReason ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={textPrimary}
        />
      </TouchableOpacity>
      {showConfidenceReason && estimate.confidence_reason ? (
        <Text className="text-text-secondary text-sm mt-2 px-1">
          {estimate.confidence_reason}
        </Text>
      ) : null}
      {estimate.user_weight_reconciliation ? (
        <Text className="text-text-secondary text-xs italic mt-2 px-1">
          {estimate.user_weight_reconciliation}
        </Text>
      ) : null}
    </View>
  );

  /** The one-line "kcal · P · C · F" summary, optionally scaled. */
  const macroSummary = (factor = 1) =>
    t('foodPhotoEstimate.ingredients.macroSummary', {
      defaultValue: '{{calories}} kcal · {{protein}}P · {{carbs}}C · {{fat}}F',
      calories: Math.round(totals.calories_kcal * factor),
      protein: Math.round(totals.protein_g * factor),
      carbs: Math.round(totals.carbs_g * factor),
      fat: Math.round(totals.fat_g * factor),
    });

  const servingsBlock = (
    <View className="mt-4 gap-3">
      <View className="flex-row gap-3">
        <View className="flex-1 gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('foodPhotoEstimate.servings.unit', { defaultValue: 'Unit' })}
          </Text>
          <BottomSheetPicker
            value={servingUnit}
            options={MEAL_SERVING_UNITS.map((unit) => ({
              label: unit,
              value: unit,
            }))}
            onSelect={handleServingUnitChange}
            title={t('foodPhotoEstimate.servings.unit', {
              defaultValue: 'Unit',
            })}
            renderTrigger={({ onPress }) => (
              <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.7}
                className="flex-row items-center justify-between rounded-lg bg-raised p-3"
                accessibilityRole="button"
                accessibilityLabel={t('foodPhotoEstimate.servings.unit', {
                  defaultValue: 'Unit',
                })}
              >
                <Text className="text-text-primary text-base font-medium flex-1 pr-2">
                  {servingUnit}
                </Text>
                <Icon name="chevron-down" size={12} color={textPrimary} />
              </TouchableOpacity>
            )}
          />
        </View>
        <View className="flex-1 gap-1.5">
          {isServingUnit ? (
            <>
              <Text className="text-text-secondary text-sm font-medium">
                {t('foodPhotoEstimate.servings.total', {
                  defaultValue: 'Total servings',
                })}
              </Text>
              <FormInput
                placeholder="1"
                value={totalServingsText}
                onChangeText={updateTotalServings}
                keyboardType="decimal-pad"
                returnKeyType="done"
                accessibilityLabel={t('foodPhotoEstimate.servings.total', {
                  defaultValue: 'Total servings',
                })}
              />
            </>
          ) : (
            <>
              <Text className="text-text-secondary text-sm font-medium">
                {t('foodPhotoEstimate.servings.totalAmount', {
                  defaultValue: 'Total amount ({{unit}})',
                  unit: servingUnit,
                })}
              </Text>
              <FormInput
                placeholder={prefillAmountFor(servingUnit) || '0'}
                value={totalAmountText}
                onChangeText={updateTotalAmount}
                keyboardType="decimal-pad"
                returnKeyType="done"
                accessibilityLabel={t('foodPhotoEstimate.servings.totalAmount', {
                  defaultValue: 'Total amount ({{unit}})',
                  unit: servingUnit,
                })}
              />
            </>
          )}
        </View>
      </View>

      <View className="flex-row gap-3">
        {isServingUnit ? null : (
          <View className="flex-1 gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {t('foodPhotoEstimate.servings.servingSize', {
                defaultValue: 'One serving is ({{unit}})',
                unit: servingUnit,
              })}
            </Text>
            <FormInput
              placeholder="0"
              value={servingSizeText}
              onChangeText={updateServingSize}
              keyboardType="decimal-pad"
              returnKeyType="done"
              accessibilityLabel={t('foodPhotoEstimate.servings.servingSize', {
                defaultValue: 'One serving is ({{unit}})',
                unit: servingUnit,
              })}
            />
          </View>
        )}
        <View className="flex-1 gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {isServingUnit
              ? t('foodPhotoEstimate.servings.eatenServings', {
                  defaultValue: 'Servings eaten',
                })
              : t('foodPhotoEstimate.servings.eatenAmount', {
                  defaultValue: 'You ate ({{unit}})',
                  unit: servingUnit,
                })}
          </Text>
          <FormInput
            placeholder="1"
            value={consumedText}
            onChangeText={updateConsumed}
            keyboardType="decimal-pad"
            returnKeyType="done"
            accessibilityLabel={
              isServingUnit
                ? t('foodPhotoEstimate.servings.eatenServings', {
                    defaultValue: 'Servings eaten',
                  })
                : t('foodPhotoEstimate.servings.eatenAmount', {
                    defaultValue: 'You ate ({{unit}})',
                    unit: servingUnit,
                  })
            }
          />
        </View>
      </View>

      <Text className="text-text-secondary text-xs px-1">
        {t('foodPhotoEstimate.servings.hint', {
          defaultValue:
            'The ingredients above are the whole dish — say how it divides, and only what you ate goes in your diary.',
        })}
      </Text>
      {!isServingUnit && totalServings > 0 ? (
        <Text className="text-text-secondary text-xs px-1">
          {t('foodPhotoEstimate.servings.derivedYield', {
            defaultValue: 'Makes about {{count}} servings',
            count: Math.round(totalServings * 10) / 10,
          })}
        </Text>
      ) : null}
    </View>
  );

  const ingredientsSection =
    rows.length > 0 ? (
      <View>
        <Text className="text-text-secondary text-xs mb-3">
          {t('foodPhotoEstimate.labels.totalEstimatedWeight', {
            defaultValue: 'Total estimated weight: {{weight}}',
            weight: `${Math.round(totalGrams)} g`,
          })}
        </Text>
        {matchedCount > 0 ? (
          <Text className="text-text-secondary text-xs mb-3">
            {t('foodPhotoEstimate.match.matchedCount', {
              defaultValue: '{{count}} ingredients matched to your foods',
              count: matchedCount,
            })}
          </Text>
        ) : null}
        {rows.map((row) => (
          <FoodPhotoIngredientRow
            key={row.id}
            row={row}
            expanded={expandedId === row.id}
            onToggle={() => dispatch({ type: 'TOGGLE_EXPANDED', id: row.id })}
            onRemove={() => dispatch({ type: 'REMOVE_ROW', id: row.id })}
            onChangeGrams={(grams) =>
              dispatch({ type: 'SET_GRAMS', id: row.id, grams })
            }
            onChangeName={(name) => dispatch({ type: 'SET_NAME', id: row.id, name })}
            onChangeMacro={(key, value) =>
              dispatch({ type: 'SET_MACRO', id: row.id, key, value })
            }
            onApplyMatch={() => dispatch({ type: 'APPLY_MATCH', id: row.id })}
            onClearMatch={() => dispatch({ type: 'CLEAR_MATCH', id: row.id })}
            onRecalcFromGrams={() =>
              dispatch({ type: 'RECALC_FROM_GRAMS', id: row.id })
            }
          />
        ))}
        <Button
          variant="ghost"
          onPress={openFoodPicker}
          className="mt-2 self-start p-0"
          accessibilityLabel={t('foodPhotoEstimate.ingredients.addFood', {
            defaultValue: 'Add Food',
          })}
        >
          <Text className="text-accent-primary text-sm font-semibold">
            {t('foodPhotoEstimate.ingredients.addFood', {
              defaultValue: 'Add Food',
            })}
          </Text>
        </Button>
        <View className="flex-row justify-between mt-2 px-1">
          <Text className="text-text-primary text-sm font-semibold">
            {t('foodPhotoEstimate.ingredients.totals', { defaultValue: 'Total' })}
          </Text>
          <Text className="text-text-primary text-sm font-semibold">
            {macroSummary()}
          </Text>
        </View>
        {showPerServing ? (
          <>
            <View className="flex-row justify-between mt-1 px-1">
              <Text className="text-text-secondary text-sm">
                {t('foodPhotoEstimate.servings.perServing', {
                  defaultValue: 'Per serving',
                })}
              </Text>
              <Text className="text-text-secondary text-sm">
                {macroSummary(1 / totalServings)}
              </Text>
            </View>
            <View className="flex-row justify-between mt-1 px-1">
              <Text className="text-text-primary text-sm font-semibold">
                {t('foodPhotoEstimate.servings.logging', {
                  defaultValue: 'Logging',
                })}
              </Text>
              <Text className="text-text-primary text-sm font-semibold">
                {macroSummary(portionFactor)}
              </Text>
            </View>
          </>
        ) : null}
        {servingsBlock}
      </View>
    ) : (
      <Text className="text-text-secondary text-sm">
        {t('foodPhotoEstimate.ingredients.empty', {
          defaultValue:
            'Every ingredient was removed. Add one back, or switch to One food.',
        })}
      </Text>
    );

  const SAVE_MODE_OPTIONS: { value: SaveMode; label: string; hint: string }[] = [
    {
      value: 'ingredients_and_meal',
      label: t('foodPhotoEstimate.mode.ingredientsAndMeal', {
        defaultValue: 'Ingredients + reusable meal',
      }),
      hint: t('foodPhotoEstimate.mode.hintIngredientsAndMeal', {
        defaultValue:
          'Each ingredient becomes its own food, and the meal is saved so you can log it again without a photo.',
      }),
    },
    {
      value: 'ingredients_only',
      label: t('foodPhotoEstimate.mode.ingredientsOnly', {
        defaultValue: 'Ingredients only',
      }),
      hint: t('foodPhotoEstimate.mode.hintIngredientsOnly', {
        defaultValue:
          'Each ingredient becomes its own food. No reusable meal is saved.',
      }),
    },
    {
      value: 'one_food',
      label: t('foodPhotoEstimate.mode.oneFood', {
        defaultValue: 'One food',
      }),
      hint: t('foodPhotoEstimate.mode.hintOneFood', {
        defaultValue: 'Saves the whole plate as a single food, with no breakdown.',
      }),
    },
  ];

  const activeOption =
    SAVE_MODE_OPTIONS.find((option) => option.value === saveMode) ??
    SAVE_MODE_OPTIONS[0];

  const modeControl = (
    <View className="mb-4">
      <Text className="text-text-secondary text-xs mb-1">
        {t('foodPhotoEstimate.mode.label', { defaultValue: 'Save as' })}
      </Text>
      <BottomSheetPicker
        value={saveMode}
        options={SAVE_MODE_OPTIONS.map((option) => ({
          label: option.label,
          value: option.value,
        }))}
        onSelect={(value) => setSaveMode(value as SaveMode)}
        title={t('foodPhotoEstimate.mode.label', { defaultValue: 'Save as' })}
        renderTrigger={({ onPress }) => (
          <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            className="flex-row items-center justify-between rounded-lg bg-raised p-3"
            accessibilityRole="button"
            accessibilityLabel={t('foodPhotoEstimate.mode.label', {
              defaultValue: 'Save as',
            })}
          >
            <Text className="text-text-primary text-base font-medium flex-1 pr-2">
              {activeOption.label}
            </Text>
            <Icon name="chevron-down" size={12} color={textPrimary} />
          </TouchableOpacity>
        )}
      />
      <Text className="text-text-secondary text-xs mt-2 px-1">
        {activeOption.hint}
      </Text>
      {saveMode === 'ingredients_and_meal' ? (
        <View className="mt-3">
          <Text className="text-text-secondary text-xs mb-1">
            {t('foodPhotoEstimate.mode.mealName', { defaultValue: 'Meal name' })}
          </Text>
          <FormInput value={mealName} onChangeText={setMealName} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-subtle">
        <Button
          variant="ghost"
          onPress={() => dismissFlow()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10 p-0"
          accessibilityLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        >
          <Icon name="close" size={22} color={backColor} />
        </Button>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          {t('foodPhotoEstimate.title', { defaultValue: 'Review estimate' })}
        </Text>
      </View>

      {mode === 'combined' ? (
        // Combined mode is the original screen, untouched: one FoodForm
        // prefilled from the estimate totals.
        <FoodForm
          initialValues={initialFormValues}
          onSubmit={handleSubmit}
          submitLabel={t('common.next', { defaultValue: 'Next' })}
          convertServingSizeOnUnitChange
          headerChildren={
            <View>
              {modeControl}
              {headerChildren}
            </View>
          }
        />
      ) : (
        <>
          <KeyboardAwareScrollView
            contentContainerClassName="px-4 py-4"
            bottomOffset={80}
            keyboardShouldPersistTaps="handled"
          >
            {modeControl}
            <View className="mb-4">{headerChildren}</View>
            {ingredientsSection}
          </KeyboardAwareScrollView>
          <FooterSaveBar
            onPress={handleGroupedNext}
            label={t('common.next', { defaultValue: 'Next' })}
            disabled={rows.length === 0}
          />
        </>
      )}
    </View>
  );
};

export default FoodPhotoEstimateReviewScreen;
