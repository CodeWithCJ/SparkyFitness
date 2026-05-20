import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import type { FoodPhotoEstimateItem } from '@workspace/shared';
import Button from '../components/ui/Button';
import FoodForm, { type FoodFormData } from '../components/FoodForm';
import Icon from '../components/Icon';
import { parseDecimalInput } from '../utils/numericInput';
import {
  confidenceTone,
  mapItemConfidence,
  mapOverallConfidence,
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

const FoodPhotoEstimateReviewScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const textPrimary = String(useCSSVariable('--color-text-primary'));

  const dismissFlow = () =>
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.popToTop();

  const { date, estimate, request } = route.params;

  const initialFormValues = useMemo<Partial<FoodFormData>>(
    () => ({
      name: estimate.meal_summary || 'Photo estimate',
      brand: '',
      servingSize:
        request?.totalWeight !== undefined
          ? toFieldString(request.totalWeight)
          : String(Math.round(estimate.totals.total_grams)),
      servingUnit:
        request?.totalWeight !== undefined ? request.weightUnit ?? 'g' : 'g',
      calories: toFieldString(estimate.totals.calories_kcal),
      protein: toFieldString(estimate.totals.protein_g),
      carbs: toFieldString(estimate.totals.carbs_g),
      fat: toFieldString(estimate.totals.fat_g),
      fiber: toFieldString(estimate.totals.fiber_g),
      sugars: toFieldString(estimate.totals.sugar_g),
    }),
    [estimate, request],
  );

  const [showConfidenceReason, setShowConfidenceReason] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);

  const overallTone = confidenceTone(estimate.overall_confidence);
  const overallLabel = mapOverallConfidence(estimate.overall_confidence);

  const totalWeightLabel = useMemo(
    () => `${Math.round(estimate.totals.total_grams)} g`,
    [estimate.totals.total_grams],
  );

  const handleSubmit = (data: FoodFormData) => {
    if (!data.name.trim()) {
      Toast.show({ type: 'error', text1: 'Name required', text2: 'Give this food a name.' });
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
        text1: 'Invalid nutrition',
        text2: 'Calories, protein, carbs, and fat must be non-negative numbers.',
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
        text1: 'Invalid nutrition',
        text2: 'All nutrition values must be non-negative numbers.',
      });
      return;
    }

    const servingSizeValue = parseDecimalInput(data.servingSize);
    if (!Number.isFinite(servingSizeValue) || servingSizeValue <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Invalid serving size',
        text2: 'Serving size must be a positive number.',
      });
      return;
    }

    navigation.navigate('LogEntry', {
      date,
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

  const renderItem = (item: FoodPhotoEstimateItem, idx: number) => {
    const itemLabel = mapItemConfidence(item.item_confidence);
    const itemTone = confidenceTone(item.item_confidence);
    const grams = Math.round(item.estimated_grams);
    const prepLabel = item.preparation?.trim() ?? '';
    const portion = item.portion_description?.trim() ?? '';
    return (
      <View
        key={`${item.name}-${idx}`}
        className="rounded-lg bg-raised p-3 mb-2"
      >
        <View className="flex-row items-center justify-between mb-1">
          <Text
            className="text-text-primary text-base font-medium flex-1 pr-2"
            numberOfLines={2}
          >
            {item.name}
            {prepLabel ? (
              <Text className="text-text-secondary font-normal"> · {prepLabel}</Text>
            ) : null}
          </Text>
          <View className={`px-2 py-0.5 rounded-full ${TONE_BG_CLASS[itemTone]}`}>
            <Text className={`text-xs font-semibold ${TONE_TEXT_CLASS[itemTone]}`}>
              {itemLabel}
            </Text>
          </View>
        </View>
        <Text className="text-text-secondary text-sm">
          {portion ? `${portion} · ` : ''}
          {grams} g
        </Text>
      </View>
    );
  };

  const headerChildren = (
    <View>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setShowConfidenceReason((v) => !v)}
        className={`flex-row items-center justify-between rounded-lg p-3 ${TONE_BG_CLASS[overallTone]}`}
      >
        <Text className={`text-sm font-semibold ${TONE_TEXT_CLASS[overallTone]}`}>
          {overallLabel} estimate
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
    estimate.items.length > 0 ? (
      <View>
        <Text className="text-text-secondary text-xs mb-3">
          Total estimated weight: {totalWeightLabel}
        </Text>
        <Button
          variant="ghost"
          onPress={() => setShowIngredients((prev) => !prev)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="self-start py-0 px-0 mb-3"
          textClassName="text-sm"
        >
          <Text style={{ color: accentPrimary }} className="text-sm font-medium">
            {showIngredients
              ? 'Hide detected ingredients ▴'
              : 'Show detected ingredients ▾'}
          </Text>
        </Button>
        {showIngredients ? estimate.items.map(renderItem) : null}
      </View>
    ) : (
      <Text className="text-text-secondary text-xs">
        Total estimated weight: {totalWeightLabel}
      </Text>
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
          accessibilityLabel="Cancel"
        >
          <Icon name="close" size={22} color={accentPrimary} />
        </Button>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Review estimate
        </Text>
      </View>

      <FoodForm
        initialValues={initialFormValues}
        onSubmit={handleSubmit}
        submitLabel="Next"
        convertServingSizeOnUnitChange
        headerChildren={headerChildren}
      >
        {ingredientsSection}
      </FoodForm>
    </View>
  );
};

export default FoodPhotoEstimateReviewScreen;
