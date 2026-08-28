import React, { useMemo, useState } from 'react';
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
import {
  toPer100g,
  unbrandMacros,
  roundMacros,
  type FoodPhotoLogItem,
} from '@workspace/shared';
import Button from '../components/ui/Button';
import FoodForm, { type FoodFormData } from '../components/FoodForm';
import Icon from '../components/Icon';
import SegmentedControl from '../components/SegmentedControl';
import { FooterSaveBar } from '../components/FormScreenChrome';
import FoodPhotoIngredientRow from '../components/FoodPhotoIngredientRow';
import { useFoodPhotoIngredientDraft } from '../hooks/useFoodPhotoIngredientDraft';
import { parseDecimalInput } from '../utils/numericInput';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
import {
  confidenceTones,
  overallConfidenceLabels,
  type ConfidenceTone,
} from '../utils/foodPhotoEstimate';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FoodPhotoFlowScreenProps, RootStackParamList } from '../types/navigation';

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
  const [mode, setMode] = useState<'grouped' | 'combined'>('grouped');
  const { rows, isEdited, expandedId, totals, totalGrams, matchedCount, dispatch } =
    useFoodPhotoIngredientDraft(estimate.items);

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
      const rounded = unbrandMacros(roundMacros(per100g));
      items.push({
        source: 'new',
        food: {
          name: row.name.trim() || row.canonicalName,
          brand: row.matchApplied ? (row.match?.brand ?? null) : null,
          serving_size: 100,
          serving_unit: 'g',
          calories: rounded.calories_kcal,
          protein: rounded.protein_g,
          carbs: rounded.carbs_g,
          fat: rounded.fat_g,
          dietary_fiber: rounded.fiber_g,
          sugars: rounded.sugar_g,
        },
        quantity: row.grams,
        unit: 'g',
      });
    }
    return items;
  };

  const handleGroupedNext = () => {
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
      mealName: estimate.meal_summary || 'Photo estimate',
      description: estimate.confidence_reason || undefined,
      ingredients: items,
      nutrition: {
        grams: totalGrams,
        calories: totals.calories_kcal,
        protein: totals.protein_g,
        carbs: totals.carbs_g,
        fat: totals.fat_g,
        fiber: totals.fiber_g,
        sugars: totals.sugar_g,
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
        <View className="flex-row justify-between mt-2 px-1">
          <Text className="text-text-primary text-sm font-semibold">
            {t('foodPhotoEstimate.ingredients.totals', { defaultValue: 'Total' })}
          </Text>
          <Text className="text-text-primary text-sm font-semibold">
            {t('foodPhotoEstimate.ingredients.macroSummary', {
              defaultValue: '{{calories}} kcal · {{protein}}P · {{carbs}}C · {{fat}}F',
              calories: Math.round(totals.calories_kcal),
              protein: Math.round(totals.protein_g),
              carbs: Math.round(totals.carbs_g),
              fat: Math.round(totals.fat_g),
            })}
          </Text>
        </View>
      </View>
    ) : (
      <Text className="text-text-secondary text-sm">
        {t('foodPhotoEstimate.ingredients.empty', {
          defaultValue:
            'Every ingredient was removed. Add one back, or switch to One food.',
        })}
      </Text>
    );

  const modeControl = (
    <View className="mb-4">
      <SegmentedControl
        segments={[
          {
            key: 'grouped',
            label: t('foodPhotoEstimate.mode.ingredients', {
              defaultValue: 'Ingredients',
            }),
          },
          {
            key: 'combined',
            label: t('foodPhotoEstimate.mode.combined', {
              defaultValue: 'One food',
            }),
          },
        ]}
        activeKey={mode}
        onSelect={setMode}
      />
      <Text className="text-text-secondary text-xs mt-2 px-1">
        {mode === 'grouped'
          ? t('foodPhotoEstimate.mode.explainerIngredients', {
              defaultValue: 'Logs one meal you can expand to each ingredient.',
            })
          : t('foodPhotoEstimate.mode.explainerCombined', {
              defaultValue: 'Logs the whole plate as a single food.',
            })}
      </Text>
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
