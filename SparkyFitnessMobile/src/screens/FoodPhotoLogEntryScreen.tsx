import React, { useMemo, useRef, useState } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import FoodNutritionSummary from '../components/FoodNutritionSummary';
import Icon from '../components/Icon';
import StepperInput from '../components/StepperInput';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { FooterSaveBar } from '../components/FormScreenChrome';
import { useAddFoodEntry } from '../hooks/useAddFoodEntry';
import { useCreatePhotoLoggedMeal } from '../hooks/useCreatePhotoLoggedMeal';
import { useMealTypes } from '../hooks/useMealTypes';
import { usePreferences } from '../hooks';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
import { getNetCarbsValue } from '../utils/nutrientUtils';
import { goalsQueryKey } from '../hooks/queryKeys';
import { fetchDailyGoals } from '../services/api/goalsApi';
import { fireSuccessHaptic } from '../services/haptics';
import { getMealTypeDisplayLabel } from '../utils/mealNutrition';
import { formatDateLabel, getTodayDate } from '../utils/dateUtils';
import type { FoodDisplayValues } from '../utils/foodDetails';
import { parseDecimalInput, DECIMAL_INPUT_REGEX } from '../utils/numericInput';
import type { SaveFoodPayload } from '../services/api/foodsApi';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FoodPhotoFlowScreenProps, RootStackParamList } from '../types/navigation';

function saveFoodPayloadToDisplayValues(p: SaveFoodPayload): FoodDisplayValues {
  return {
    servingSize: p.serving_size,
    servingUnit: p.serving_unit,
    calories: p.calories,
    protein: p.protein,
    carbs: p.carbs,
    fat: p.fat,
    fiber: p.dietary_fiber,
    saturatedFat: p.saturated_fat,
    sodium: p.sodium,
    sugars: p.sugars,
    transFat: p.trans_fat,
    potassium: p.potassium,
    calcium: p.calcium,
    iron: p.iron,
    cholesterol: p.cholesterol,
    vitaminA: p.vitamin_a,
    vitaminC: p.vitamin_c,
  };
}

type Props = FoodPhotoFlowScreenProps<'LogEntry'>;

const FoodPhotoLogEntryScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t , i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const insets = useSafeAreaInsets();
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  const { backColor } = useHeaderActionColors();

  const params = route.params;
  const initialMealTypeId = params.mealTypeId;
  const isGrouped = params.mode === 'grouped';

  // Grouped mode has no single food to show, so the recap is built by summing
  // the reviewed ingredient rows. Both modes then render the same chrome.
  const displayName = isGrouped ? params.mealName : params.saveFoodPayload.name;
  const displayBrand = isGrouped ? null : params.saveFoodPayload.brand;

  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealTypeId, setSelectedMealTypeId] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState<string>(route.params.date ?? getTodayDate());
  const [quantity, setQuantity] = useState<string>('1');

  const calendarRef = useRef<CalendarSheetRef>(null);

  const { data: goals, isLoading: isGoalsLoading } = useQuery({
    queryKey: goalsQueryKey(entryDate),
    queryFn: () => fetchDailyGoals(entryDate),
    staleTime: 1000 * 60 * 5,
  });

  const displayValues = useMemo(() => {
    if (params.mode === 'combined') {
      return saveFoodPayloadToDisplayValues(params.saveFoodPayload);
    }
    // Use the nutrition the user reviewed. Summing `ingredients` would drop
    // every item matched to a saved food, since those carry no nutrition of
    // their own, and the recap would under-report the meal.
    const n = params.nutrition;
    return {
      servingSize: n.grams || 1,
      servingUnit: 'g',
      calories: n.calories,
      protein: n.protein,
      carbs: n.carbs,
      fat: n.fat,
      fiber: n.fiber,
      sugars: n.sugars,
    } as FoodDisplayValues;
  }, [params]);

  const { preferences } = usePreferences();
  const showNetCarbs = preferences?.show_net_carbs === true;

  const servingsNumber = useMemo(() => {
    // A grouped log has no meal-level multiplier: every ingredient already
    // carries the exact grams the user reviewed.
    if (isGrouped) return 1;
    const parsed = parseDecimalInput(quantity);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [quantity, isGrouped]);

  const goalPercent = (value: number, goalValue: number | undefined) => {
    if (!goalValue || goalValue === 0) return null;
    return Math.round((value / goalValue) * 100);
  };
  const carbsForGoal =
    showNetCarbs && displayValues.fiber !== undefined
      ? getNetCarbsValue(displayValues.carbs, displayValues.fiber)
      : displayValues.carbs;
  const goalPercentages = {
    calories: goalPercent(displayValues.calories * servingsNumber, goals?.calories),
    protein: goalPercent(displayValues.protein * servingsNumber, goals?.protein),
    carbs: goalPercent(carbsForGoal * servingsNumber, goals?.carbs),
    fat: goalPercent(displayValues.fat * servingsNumber, goals?.fat),
  };

  // Preselect the originating meal type (MealTypeDetail → search → photo flow)
  // ONLY when it still exists in the selectable list — a stale/hidden/deleted
  // id must never be submitted for a new entry. Otherwise default once the
  // default arrives. Done during render (instead of in an effect); the
  // `!selectedMealTypeId` guard makes it self-limiting.
  const originatingTypeExists =
    initialMealTypeId != null && mealTypes.some((mt) => mt.id === initialMealTypeId);
  if (!selectedMealTypeId && originatingTypeExists) {
    setSelectedMealTypeId(initialMealTypeId);
  } else if (!selectedMealTypeId && defaultMealTypeId) {
    setSelectedMealTypeId(defaultMealTypeId);
  }

  const {
    logEstimateAsync,
    isPending: isLoggingEstimate,
    invalidateCache: invalidatePhotoLogCache,
  } = useCreatePhotoLoggedMeal({
    onSuccess: () => {
      fireSuccessHaptic();
      Toast.show({
        type: 'success',
        text1: t('foodPhotoLogEntry.estimateSaved', { defaultValue: 'Estimate saved' }),
      });
      navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.popToTop();
    },
  });

  const { addEntryAsync, isPending: isAddingFood, invalidateCache } = useAddFoodEntry({
    onSuccess: () => {
      fireSuccessHaptic();
      Toast.show({ type: 'success', text1: t('foodPhotoLogEntry.estimateSaved', { defaultValue: 'Estimate saved' }) });
      navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.popToTop();
    },
  });

  const handleQuantityChange = (text: string) => {
    if (text === '' || DECIMAL_INPUT_REGEX.test(text)) setQuantity(text);
  };

  const adjustQuantity = (delta: number) => {
    const current = parseDecimalInput(quantity);
    const base = Number.isFinite(current) && current > 0 ? current : 0;
    const next = Math.max(0, Math.round((base + delta) * 100) / 100);
    setQuantity(String(next));
  };

  const mealPickerOptions = useMemo(
    () =>
      mealTypes.map((mt) => ({
        label: getMealTypeDisplayLabel(mt, t),
        value: mt.id,
      })),
    [mealTypes, t],
  );
  const selectedMealLabel = useMemo(() => {
    const found = mealTypes.find((mt) => mt.id === selectedMealTypeId);
    return found ? getMealTypeDisplayLabel(found, t) : t('foodPhotoLogEntry.selectMeal', { defaultValue: 'Select Meal' });
  }, [mealTypes, selectedMealTypeId, t]);

  const isPending = isAddingFood || isLoggingEstimate;

  const handleSave = async () => {
    if (isPending) return;

    if (!selectedMealTypeId) {
      Toast.show({ type: 'error', text1: t('foodPhotoLogEntry.selectMealType', { defaultValue: 'Select a meal type' }) });
      return;
    }

    if (params.mode === 'grouped') {
      // No servings multiplier here: each ingredient already carries the exact
      // grams the user reviewed, and an ad-hoc parent meal does not scale its
      // components anyway.
      const selectedMealType = mealTypes.find((mt) => mt.id === selectedMealTypeId);
      try {
        await logEstimateAsync({
          mode: 'grouped',
          entry_date: entryDate,
          entry_time: null,
          meal_type: selectedMealType?.name ?? '',
          meal_type_id: selectedMealTypeId,
          name: params.mealName,
          description: params.description ?? null,
          items: params.ingredients,
          // Only set when the user picked "Ingredients + reusable meal"; the
          // server rejects it outside grouped mode.
          ...(params.saveAsMeal
            ? { save_as_meal: { name: params.mealName } }
            : {}),
        });
        invalidatePhotoLogCache(entryDate);
      } catch {
        // useCreatePhotoLoggedMeal shows its own toast on error.
      }
      return;
    }

    const { saveFoodPayload } = params;
    const servingsValue = parseDecimalInput(quantity);
    if (!Number.isFinite(servingsValue) || servingsValue <= 0) {
      Toast.show({
        type: 'error',
        text1: t('foodPhotoLogEntry.invalidServings', { defaultValue: 'Invalid servings' }),
        text2: t('foodPhotoLogEntry.positiveServings', { defaultValue: 'Servings must be a positive number.' }),
      });
      return;
    }

    const entryQuantity =
      Math.round(servingsValue * saveFoodPayload.serving_size * 1000) / 1000;

    try {
      await addEntryAsync({
        saveFoodPayload,
        createEntryPayload: {
          quantity: entryQuantity,
          unit: saveFoodPayload.serving_unit,
          meal_type_id: selectedMealTypeId,
          entry_date: entryDate,
        },
      });
      invalidateCache(entryDate);
    } catch {
      // useAddFoodEntry shows its own toast on error.
    }
  };

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-subtle">
        <Button
          variant="ghost"
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10 p-0"
          accessibilityLabel={t('foodPhotoLogEntry.back', { defaultValue: 'Back' })}
        >
          <Icon name="chevron-back" size={22} color={backColor} />
        </Button>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          {t('foodPhotoLogEntry.title', { defaultValue: 'Log entry' })}
        </Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerClassName="px-4 py-4"
        bottomOffset={80}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-4">
          <FoodNutritionSummary
            name={displayName}
            brand={displayBrand}
            values={displayValues}
            servings={servingsNumber}
            goalPercentages={goalPercentages}
            goalsLoading={isGoalsLoading}
            showNetCarbs={showNetCarbs}
          />
        </View>

        {/* Meal row */}
        <View className="flex-row items-center mb-4">
          <Text className="text-text-secondary text-base mr-2">{t('foodPhotoLogEntry.meal', { defaultValue: 'Meal' })}</Text>
          <BottomSheetPicker
            value={selectedMealTypeId ?? ''}
            options={mealPickerOptions}
            onSelect={(value) => setSelectedMealTypeId(value)}
            title={t('foodPhotoLogEntry.selectMeal', { defaultValue: 'Select Meal' })}
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

        {/* Date row */}
        <View className="flex-row items-center mb-4">
          <Text className="text-text-secondary text-base mr-2">{t('foodPhotoLogEntry.date', { defaultValue: 'Date' })}</Text>
          <TouchableOpacity
            onPress={() => calendarRef.current?.present()}
            activeOpacity={0.7}
            className="flex-row items-center"
          >
            <Text className="text-text-primary text-base font-medium">
              {formatDateLabel(entryDate, t, dateLocale)}
            </Text>
            <Icon
              name="chevron-down"
              size={12}
              color={textPrimary}
              style={{ marginLeft: 6 }}
              weight="medium"
            />
          </TouchableOpacity>
        </View>

        {/* Servings row — hidden for a grouped log, where the amounts live on
            each ingredient and a meal-level multiplier would be misleading. */}
        {isGrouped ? (
          <Text className="text-text-secondary text-sm mb-4">
            {t('foodPhotoLogEntry.groupedSummary', {
              defaultValue: '{{count}} ingredients will be logged as one meal.',
              count: params.mode === 'grouped' ? params.ingredients.length : 0,
            })}
          </Text>
        ) : (
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-text-secondary text-base">{t('foodPhotoLogEntry.servings', { defaultValue: 'Servings' })}</Text>
            <StepperInput
              value={quantity}
              onChangeText={handleQuantityChange}
              onIncrement={() => adjustQuantity(1)}
              onDecrement={() => adjustQuantity(-1)}
              keyboardType="decimal-pad"
            />
          </View>
        )}
      </KeyboardAwareScrollView>

      <FooterSaveBar
        onPress={() => {
          void handleSave();
        }}
        disabled={isPending}
        busy={isPending}
      />

      <CalendarSheet
        ref={calendarRef}
        selectedDate={entryDate}
        onSelectDate={(date) => setEntryDate(date)}
      />
    </View>
  );
};

export default FoodPhotoLogEntryScreen;
