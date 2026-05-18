import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import StepperInput from '../components/StepperInput';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useAddFoodEntry } from '../hooks/useAddFoodEntry';
import { useMealTypes } from '../hooks/useMealTypes';
import { fireSuccessHaptic } from '../services/haptics';
import { getMealTypeLabel } from '../constants/meals';
import { formatDateLabel, getTodayDate } from '../utils/dateUtils';
import { parseDecimalInput, DECIMAL_INPUT_REGEX } from '../utils/numericInput';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FoodPhotoFlowScreenProps, RootStackParamList } from '../types/navigation';

type Props = FoodPhotoFlowScreenProps<'LogEntry'>;

const FoodPhotoLogEntryScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const textPrimary = String(useCSSVariable('--color-text-primary'));

  const { saveFoodPayload } = route.params;

  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealTypeId, setSelectedMealTypeId] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState<string>(route.params.date ?? getTodayDate());
  const [quantity, setQuantity] = useState<string>('1');

  const calendarRef = useRef<CalendarSheetRef>(null);

  useEffect(() => {
    if (!selectedMealTypeId && defaultMealTypeId) {
      setSelectedMealTypeId(defaultMealTypeId);
    }
  }, [defaultMealTypeId, selectedMealTypeId]);

  const { addEntryAsync, isPending, invalidateCache } = useAddFoodEntry({
    onSuccess: () => {
      fireSuccessHaptic();
      Toast.show({ type: 'success', text1: 'Estimate saved' });
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
        label: getMealTypeLabel(mt.name),
        value: mt.id,
      })),
    [mealTypes],
  );
  const selectedMealLabel = useMemo(() => {
    const found = mealTypes.find((mt) => mt.id === selectedMealTypeId);
    return found ? getMealTypeLabel(found.name) : 'Select meal';
  }, [mealTypes, selectedMealTypeId]);

  const handleSave = async () => {
    if (isPending) return;

    if (!selectedMealTypeId) {
      Toast.show({ type: 'error', text1: 'Select a meal type' });
      return;
    }

    const servingsValue = parseDecimalInput(quantity);
    if (!Number.isFinite(servingsValue) || servingsValue <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Invalid servings',
        text2: 'Servings must be a positive number.',
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
          accessibilityLabel="Back"
        >
          <Icon name="chevron-back" size={22} color={accentPrimary} />
        </Button>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Log entry
        </Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerClassName="px-4 py-4"
        bottomOffset={80}
        keyboardShouldPersistTaps="handled"
      >
        {/* Recap card */}
        <View className="rounded-lg bg-raised p-3 mb-4">
          <Text
            className="text-text-primary text-base font-semibold mb-1"
            numberOfLines={2}
          >
            {saveFoodPayload.name}
          </Text>
          <Text className="text-text-secondary text-sm">
            {Math.round(saveFoodPayload.calories)} kcal · {saveFoodPayload.serving_size}{' '}
            {saveFoodPayload.serving_unit} per serving
          </Text>
        </View>

        {/* Meal row */}
        <View className="flex-row items-center mb-4">
          <Text className="text-text-secondary text-base mr-2">Meal</Text>
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

        {/* Date row */}
        <View className="flex-row items-center mb-4">
          <Text className="text-text-secondary text-base mr-2">Date</Text>
          <TouchableOpacity
            onPress={() => calendarRef.current?.present()}
            activeOpacity={0.7}
            className="flex-row items-center"
          >
            <Text className="text-text-primary text-base font-medium">
              {formatDateLabel(entryDate)}
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

        {/* Servings row */}
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-text-secondary text-base">Servings</Text>
          <StepperInput
            value={quantity}
            onChangeText={handleQuantityChange}
            onIncrement={() => adjustQuantity(1)}
            onDecrement={() => adjustQuantity(-1)}
            keyboardType="decimal-pad"
          />
        </View>
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
            'Save'
          )}
        </Button>
      </View>

      <CalendarSheet
        ref={calendarRef}
        selectedDate={entryDate}
        onSelectDate={(date) => setEntryDate(date)}
      />
    </View>
  );
};

export default FoodPhotoLogEntryScreen;
