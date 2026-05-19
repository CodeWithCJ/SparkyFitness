import React, { useMemo, useState } from 'react';
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
import type { FoodPhotoEstimateItem } from '@workspace/shared';
import BottomSheetPicker from '../components/BottomSheetPicker';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import { parseDecimalInput, DECIMAL_INPUT_REGEX } from '../utils/numericInput';
import {
  FOOD_FORM_UNIT_GROUPS,
  getConversionFactor,
} from '../utils/servingSizeConversions';
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

const SERVING_UNIT_SECTIONS = FOOD_FORM_UNIT_GROUPS.map((group) => ({
  title: group.label,
  options: group.units.map((unit) => ({ label: unit, value: unit })),
}));

const FoodPhotoEstimateReviewScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const textPrimary = String(useCSSVariable('--color-text-primary'));
  const textMuted = String(useCSSVariable('--color-text-muted'));

  const dismissFlow = () =>
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.popToTop();

  const { date, estimate, request } = route.params;

  const [name, setName] = useState<string>(estimate.meal_summary || 'Photo estimate');
  const [calories, setCalories] = useState<string>(toFieldString(estimate.totals.calories_kcal));
  const [protein, setProtein] = useState<string>(toFieldString(estimate.totals.protein_g));
  const [carbs, setCarbs] = useState<string>(toFieldString(estimate.totals.carbs_g));
  const [fat, setFat] = useState<string>(toFieldString(estimate.totals.fat_g));
  const [fiber, setFiber] = useState<string>(toFieldString(estimate.totals.fiber_g));
  const [sugar, setSugar] = useState<string>(toFieldString(estimate.totals.sugar_g));
  const [saturatedFat, setSaturatedFat] = useState<string>('');
  const [transFat, setTransFat] = useState<string>('');
  const [cholesterol, setCholesterol] = useState<string>('');
  const [sodium, setSodium] = useState<string>('');
  const [potassium, setPotassium] = useState<string>('');
  const [calcium, setCalcium] = useState<string>('');
  const [iron, setIron] = useState<string>('');
  const [vitaminA, setVitaminA] = useState<string>('');
  const [vitaminC, setVitaminC] = useState<string>('');
  const [servingSize, setServingSize] = useState<string>(() =>
    request?.totalWeight !== undefined
      ? toFieldString(request.totalWeight)
      : String(Math.round(estimate.totals.total_grams)),
  );
  const [servingUnit, setServingUnit] = useState<string>(
    request?.totalWeight !== undefined ? request.weightUnit ?? 'g' : 'g',
  );
  const [showConfidenceReason, setShowConfidenceReason] = useState(false);
  const [showMoreNutrients, setShowMoreNutrients] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);

  const handleDecimalChange = (setter: (v: string) => void) => (text: string) => {
    if (text === '' || DECIMAL_INPUT_REGEX.test(text)) setter(text);
  };

  const handleUnitChange = (nextUnit: string) => {
    if (nextUnit === servingUnit) return;
    const current = parseDecimalInput(servingSize);
    if (Number.isFinite(current) && current > 0) {
      // getConversionFactor(base, target) returns "1 target = X base units",
      // so to convert from `servingUnit` to `nextUnit` we divide. Returns null
      // for incompatible units (e.g. g -> cup) — leave the size value alone in
      // that case; the user is relabeling the portion rather than converting.
      const factor = getConversionFactor(servingUnit, nextUnit);
      if (factor !== null && factor !== 0) {
        const converted = current / factor;
        const rounded = Math.round(converted * 10) / 10;
        setServingSize(String(rounded));
      }
    }
    setServingUnit(nextUnit);
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

  const handleNext = () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Name required', text2: 'Give this food a name.' });
      return;
    }

    const caloriesValue = parsedRequiredMacro(calories);
    const proteinValue = parsedRequiredMacro(protein);
    const carbsValue = parsedRequiredMacro(carbs);
    const fatValue = parsedRequiredMacro(fat);
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
      dietary_fiber: parsedOptional(fiber),
      sugars: parsedOptional(sugar),
      saturated_fat: parsedOptional(saturatedFat),
      trans_fat: parsedOptional(transFat),
      cholesterol: parsedOptional(cholesterol),
      sodium: parsedOptional(sodium),
      potassium: parsedOptional(potassium),
      calcium: parsedOptional(calcium),
      iron: parsedOptional(iron),
      vitamin_a: parsedOptional(vitaminA),
      vitamin_c: parsedOptional(vitaminC),
    };
    if (Object.values(optionalNutrients).some((v) => v === null)) {
      Toast.show({
        type: 'error',
        text1: 'Invalid nutrition',
        text2: 'All nutrition values must be non-negative numbers.',
      });
      return;
    }

    const servingSizeValue = parseDecimalInput(servingSize);
    if (!Number.isFinite(servingSizeValue) || servingSizeValue <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Invalid serving size',
        text2: 'Serving size must be a positive number.',
      });
      return;
    }

    const positiveOrUndefined = (v: number | undefined | null) =>
      v !== undefined && v !== null && v > 0 ? v : undefined;

    navigation.navigate('LogEntry', {
      date,
      saveFoodPayload: {
        name: name.trim(),
        brand: null,
        serving_size: servingSizeValue,
        serving_unit: servingUnit,
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

  const overallTone = confidenceTone(estimate.overall_confidence);
  const overallLabel = mapOverallConfidence(estimate.overall_confidence);

  const totalWeightLabel = useMemo(
    () => `${Math.round(estimate.totals.total_grams)} g`,
    [estimate.totals.total_grams],
  );

  const renderNutrientField = (
    label: string,
    value: string,
    setter: (v: string) => void,
  ) => (
    <View className="flex-1">
      <Text className="text-text-secondary text-xs mb-1">{label}</Text>
      <FormInput
        keyboardType="decimal-pad"
        value={value}
        onChangeText={handleDecimalChange(setter)}
      />
    </View>
  );

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

      <KeyboardAwareScrollView
        contentContainerClassName="px-4 py-4"
        bottomOffset={80}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name */}
        <Text className="text-text-secondary text-sm mb-1">Name</Text>
        <FormInput value={name} onChangeText={setName} className="mb-4" />

        {/* Confidence pill */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowConfidenceReason((v) => !v)}
          className={`flex-row items-center justify-between rounded-lg p-3 mb-2 ${TONE_BG_CLASS[overallTone]}`}
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
          <Text className="text-text-secondary text-sm mb-3 px-1">
            {estimate.confidence_reason}
          </Text>
        ) : null}
        {estimate.user_weight_reconciliation ? (
          <Text className="text-text-secondary text-xs italic mb-3 px-1">
            {estimate.user_weight_reconciliation}
          </Text>
        ) : null}

        {/* Serving size */}
        <View className="flex-row gap-3 mt-2 mb-2">
          <View className="gap-1.5 flex-1">
            <Text className="text-text-secondary text-sm font-medium">
              Serving Size
            </Text>
            <FormInput
              keyboardType="decimal-pad"
              value={servingSize}
              onChangeText={handleDecimalChange(setServingSize)}
              returnKeyType="done"
            />
          </View>
          <View className="gap-1.5 flex-1">
            <Text className="text-text-secondary text-sm font-medium">
              Serving Unit
            </Text>
            <BottomSheetPicker
              value={servingUnit}
              sections={SERVING_UNIT_SECTIONS}
              onSelect={handleUnitChange}
              title="Select Unit"
              placeholder="unit"
              renderTrigger={({ onPress, selectedOption }) => (
                <TouchableOpacity
                  onPress={onPress}
                  activeOpacity={0.7}
                  className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
                  style={{ height: 44 }}
                >
                  <Text
                    className={selectedOption ? 'text-text-primary' : 'text-text-muted'}
                    style={{ fontSize: 16 }}
                  >
                    {selectedOption?.label ?? 'unit'}
                  </Text>
                  <Icon
                    name="chevron-down"
                    size={12}
                    color={textMuted}
                    weight="medium"
                  />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
        <Text className="text-text-secondary text-xs mb-4">
          Total estimated weight: {totalWeightLabel}
        </Text>

        {/* Nutrition */}
        <Text className="text-text-primary text-base font-semibold mb-2">
          Nutrition (per serving)
        </Text>

        <View className="flex-row gap-3 mb-3">
          {renderNutrientField('Calories (kcal)', calories, setCalories)}
          {renderNutrientField('Protein (g)', protein, setProtein)}
        </View>
        <View className="flex-row gap-3 mb-3">
          {renderNutrientField('Carbs (g)', carbs, setCarbs)}
          {renderNutrientField('Fat (g)', fat, setFat)}
        </View>
        <View className="flex-row gap-3 mb-3">
          {renderNutrientField('Fiber (g)', fiber, setFiber)}
          {renderNutrientField('Sugar (g)', sugar, setSugar)}
        </View>

        <Button
          variant="ghost"
          onPress={() => setShowMoreNutrients((prev) => !prev)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="self-start py-0 px-0 mb-3"
          textClassName="text-sm"
        >
          <Text style={{ color: accentPrimary }} className="text-sm font-medium">
            {showMoreNutrients ? 'Hide extra nutrients ▴' : 'Show more nutrients ▾'}
          </Text>
        </Button>

        {showMoreNutrients ? (
          <>
            <View className="flex-row gap-3 mb-3">
              {renderNutrientField('Saturated Fat (g)', saturatedFat, setSaturatedFat)}
              {renderNutrientField('Trans Fat (g)', transFat, setTransFat)}
            </View>
            <View className="flex-row gap-3 mb-3">
              {renderNutrientField('Cholesterol (mg)', cholesterol, setCholesterol)}
              {renderNutrientField('Sodium (mg)', sodium, setSodium)}
            </View>
            <View className="flex-row gap-3 mb-3">
              {renderNutrientField('Potassium (mg)', potassium, setPotassium)}
              {renderNutrientField('Calcium (mg)', calcium, setCalcium)}
            </View>
            <View className="flex-row gap-3 mb-3">
              {renderNutrientField('Iron (mg)', iron, setIron)}
              {renderNutrientField('Vitamin A (mcg)', vitaminA, setVitaminA)}
            </View>
            <View className="flex-row gap-3 mb-3">
              {renderNutrientField('Vitamin C (mg)', vitaminC, setVitaminC)}
              <View className="flex-1" />
            </View>
          </>
        ) : null}

        <View className="mb-3" />

        {/* Ingredients */}
        {estimate.items.length > 0 ? (
          <>
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
          </>
        ) : null}
      </KeyboardAwareScrollView>

      <View
        className="px-4 gap-3 border-t border-border-subtle pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Button variant="primary" onPress={handleNext}>
          Next
        </Button>
        <TouchableOpacity
          onPress={() => dismissFlow()}
          className="items-center py-2"
        >
          <Text className="text-accent-primary text-base font-semibold">Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default FoodPhotoEstimateReviewScreen;
