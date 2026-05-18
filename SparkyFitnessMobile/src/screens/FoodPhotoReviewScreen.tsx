import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import type { FoodPhotoEstimateItem } from '@workspace/shared';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import { useAddFoodEntry } from '../hooks/useAddFoodEntry';
import { useMealTypes } from '../hooks/useMealTypes';
import { fireSuccessHaptic } from '../services/haptics';
import { getMealTypeLabel } from '../constants/meals';
import { getTodayDate } from '../utils/dateUtils';
import { parseDecimalInput, DECIMAL_INPUT_REGEX } from '../utils/numericInput';
import {
  confidenceTone,
  mapItemConfidence,
  mapOverallConfidence,
  type ConfidenceTone,
} from '../utils/foodPhotoEstimate';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'FoodPhotoReview'>;

const toFieldString = (n: number | undefined | null): string => {
  if (n === undefined || n === null || !Number.isFinite(n)) return '';
  // Avoid trailing zeros on integers.
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

const FoodPhotoReviewScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const textPrimary = String(useCSSVariable('--color-text-primary'));

  const { date, estimate } = route.params;

  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealTypeId, setSelectedMealTypeId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedMealTypeId && defaultMealTypeId) {
      setSelectedMealTypeId(defaultMealTypeId);
    }
  }, [defaultMealTypeId, selectedMealTypeId]);

  const [name, setName] = useState<string>(estimate.meal_summary || 'Photo estimate');
  const [calories, setCalories] = useState<string>(toFieldString(estimate.totals.calories_kcal));
  const [protein, setProtein] = useState<string>(toFieldString(estimate.totals.protein_g));
  const [carbs, setCarbs] = useState<string>(toFieldString(estimate.totals.carbs_g));
  const [fat, setFat] = useState<string>(toFieldString(estimate.totals.fat_g));
  const [fiber, setFiber] = useState<string>(toFieldString(estimate.totals.fiber_g));
  const [sugar, setSugar] = useState<string>(toFieldString(estimate.totals.sugar_g));
  const [showConfidenceReason, setShowConfidenceReason] = useState(false);

  const { addEntryAsync, isPending, invalidateCache } = useAddFoodEntry({
    onSuccess: () => {
      fireSuccessHaptic();
      Toast.show({ type: 'success', text1: 'Estimate saved' });
      navigation.popToTop();
    },
  });

  const handleDecimalChange = (setter: (v: string) => void) => (text: string) => {
    if (text === '' || DECIMAL_INPUT_REGEX.test(text)) setter(text);
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

  const handleSave = async () => {
    if (isPending) return;

    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Name required', text2: 'Give this food a name.' });
      return;
    }
    if (!selectedMealTypeId) {
      Toast.show({ type: 'error', text1: 'Select a meal type' });
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

    const fiberValue = parsedOptional(fiber);
    const sugarValue = parsedOptional(sugar);
    if (fiberValue === null || sugarValue === null) {
      Toast.show({
        type: 'error',
        text1: 'Invalid nutrition',
        text2: 'Fiber and sugar must be non-negative numbers.',
      });
      return;
    }

    const entryDate = date ?? getTodayDate();

    try {
      await addEntryAsync({
        saveFoodPayload: {
          name: name.trim(),
          brand: null,
          serving_size: 1,
          serving_unit: 'serving',
          calories: caloriesValue,
          protein: proteinValue,
          carbs: carbsValue,
          fat: fatValue,
          dietary_fiber: fiberValue !== undefined && fiberValue > 0 ? fiberValue : undefined,
          sugars: sugarValue !== undefined && sugarValue > 0 ? sugarValue : undefined,
          provider_type: 'food_photo_estimate',
        },
        createEntryPayload: {
          quantity: 1,
          unit: 'serving',
          meal_type_id: selectedMealTypeId,
          entry_date: entryDate,
        },
      });
      invalidateCache(entryDate);
    } catch {
      // useAddFoodEntry shows its own toast on error.
    }
  };

  const overallTone = confidenceTone(estimate.overall_confidence);
  const overallLabel = mapOverallConfidence(estimate.overall_confidence);

  const mealPickerOptions = useMemo(
    () =>
      mealTypes.map((mt) => ({
        label: getMealTypeLabel(mt.name),
        value: mt.id,
      })),
    [mealTypes],
  );
  const selectedMealLabel = useMemo(() => {
    const found = mealTypes.find((mt) => mt.id === selectedMealTypeId);
    return found ? getMealTypeLabel(found.name) : 'Select meal';
  }, [mealTypes, selectedMealTypeId]);

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
        {item.assumptions && item.assumptions.length > 0 ? (
          <Text className="text-text-muted text-xs mt-1 italic">
            Assumed: {item.assumptions.join('; ')}
          </Text>
        ) : null}
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
          onPress={() => navigation.popToTop()}
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

        {/* Meal type */}
        <View className="flex-row items-center mb-4">
          <Text className="text-text-secondary text-base">Meal</Text>
          <BottomSheetPicker
            value={selectedMealTypeId ?? ''}
            options={mealPickerOptions}
            onSelect={(value) => setSelectedMealTypeId(value)}
            title="Select Meal"
            renderTrigger={({ onPress }) => (
              <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.7}
                className="flex-row items-center"
              >
                <Text className="text-text-primary text-base font-medium mx-1.5">
                  {selectedMealLabel}
                </Text>
                <Icon
                  name="chevron-down"
                  size={12}
                  color={textPrimary}
                  weight="medium"
                />
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Nutrition */}
        <Text className="text-text-primary text-base font-semibold mb-2">
          Nutrition (per serving)
        </Text>
        <Text className="text-text-secondary text-xs mb-3">
          Saved as a single serving of this food. Total estimated weight:
          {' '}
          {Math.round(estimate.totals.total_grams)} g.
        </Text>

        <View className="flex-row gap-3 mb-3">
          <View className="flex-1">
            <Text className="text-text-secondary text-xs mb-1">Calories (kcal)</Text>
            <FormInput
              keyboardType="decimal-pad"
              value={calories}
              onChangeText={handleDecimalChange(setCalories)}
            />
          </View>
          <View className="flex-1">
            <Text className="text-text-secondary text-xs mb-1">Protein (g)</Text>
            <FormInput
              keyboardType="decimal-pad"
              value={protein}
              onChangeText={handleDecimalChange(setProtein)}
            />
          </View>
        </View>
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1">
            <Text className="text-text-secondary text-xs mb-1">Carbs (g)</Text>
            <FormInput
              keyboardType="decimal-pad"
              value={carbs}
              onChangeText={handleDecimalChange(setCarbs)}
            />
          </View>
          <View className="flex-1">
            <Text className="text-text-secondary text-xs mb-1">Fat (g)</Text>
            <FormInput
              keyboardType="decimal-pad"
              value={fat}
              onChangeText={handleDecimalChange(setFat)}
            />
          </View>
        </View>
        <View className="flex-row gap-3 mb-6">
          <View className="flex-1">
            <Text className="text-text-secondary text-xs mb-1">Fiber (g)</Text>
            <FormInput
              keyboardType="decimal-pad"
              value={fiber}
              onChangeText={handleDecimalChange(setFiber)}
            />
          </View>
          <View className="flex-1">
            <Text className="text-text-secondary text-xs mb-1">Sugar (g)</Text>
            <FormInput
              keyboardType="decimal-pad"
              value={sugar}
              onChangeText={handleDecimalChange(setSugar)}
            />
          </View>
        </View>

        {/* Ingredients */}
        {estimate.items.length > 0 ? (
          <>
            <Text className="text-text-primary text-base font-semibold mb-2">
              Detected ingredients
            </Text>
            <Text className="text-text-secondary text-xs mb-3">
              Reference only — adjust totals above if anything looks off.
            </Text>
            {estimate.items.map(renderItem)}
          </>
        ) : null}

        {/* Clarifying questions */}
        {estimate.clarifying_questions && estimate.clarifying_questions.length > 0 ? (
          <View className="rounded-lg bg-raised p-3 mt-3">
            <Text className="text-text-primary text-sm font-semibold mb-1">
              For a sharper estimate
            </Text>
            {estimate.clarifying_questions.map((q, i) => (
              <Text key={i} className="text-text-secondary text-sm">
                · {q}
              </Text>
            ))}
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <View
        className="px-4 gap-3 border-t border-border-subtle pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Button
          variant="primary"
          disabled={isPending}
          onPress={() => {
            void handleSave();
          }}
        >
          {isPending ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#fff" />
              <Text className="text-white font-semibold">Saving…</Text>
            </View>
          ) : (
            'Save estimate'
          )}
        </Button>
        <TouchableOpacity
          disabled={isPending}
          onPress={() => navigation.popToTop()}
          className="items-center py-2"
        >
          <Text className="text-accent-primary text-base font-semibold">Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default FoodPhotoReviewScreen;
