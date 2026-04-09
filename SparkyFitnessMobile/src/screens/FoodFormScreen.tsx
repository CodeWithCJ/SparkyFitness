import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, Platform, Text, Switch } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { CommonActions, StackActions } from '@react-navigation/native';
import Icon from '../components/Icon';
import StepperInput from '../components/StepperInput';
import FoodForm, { type FoodFormData } from '../components/FoodForm';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useMealTypes } from '../hooks';
import { useAddFoodEntry } from '../hooks/useAddFoodEntry';
import { getMealTypeLabel } from '../constants/meals';
import { getTodayDate, normalizeDate, formatDateLabel } from '../utils/dateUtils';
import { parseOptional } from '../types/foodInfo';
import type { RootStackScreenProps } from '../types/navigation';

type FoodFormScreenProps = RootStackScreenProps<'FoodForm'>;

type CreateFoodParams = Extract<FoodFormScreenProps['route']['params'], { mode: 'create-food' }>;
type AdjustNutritionParams = Extract<FoodFormScreenProps['route']['params'], { mode: 'adjust-entry-nutrition' }>;

function CreateFoodMode({ params, navigation }: { params: CreateFoodParams; navigation: FoodFormScreenProps['navigation'] }) {
  const insets = useSafeAreaInsets();
  const [accentColor, textPrimary, formEnabled, formDisabled] = useCSSVariable(['--color-accent-primary', '--color-text-primary', '--color-form-enabled', '--color-form-disabled']) as [string, string, string, string];

  const initialFood = params.initialFood;
  const barcode = params.barcode;
  const providerType = params.providerType;

  const [selectedDate, setSelectedDate] = useState(params.date ?? getTodayDate());
  const calendarRef = useRef<CalendarSheetRef>(null);
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>();
  const effectiveMealId = selectedMealId ?? defaultMealTypeId;
  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);

  const [saveToDatabase, setSaveToDatabase] = useState(true);
  const initialServingSize = parseFloat(initialFood?.servingSize ?? '') || 100;
  const [formServingSize, setFormServingSize] = useState(initialServingSize);
  const [formServingUnit, setFormServingUnit] = useState(initialFood?.servingUnit ?? 'g');
  const [quantityText, setQuantityText] = useState(String(initialServingSize));
  const quantity = parseFloat(quantityText) || 0;
  const servings = formServingSize > 0 ? quantity / formServingSize : 0;

  const handleServingChange = (sizeStr: string, unit: string) => {
    const size = parseFloat(sizeStr) || 0;
    setFormServingSize(size);
    setFormServingUnit(unit);
    if (size > 0) setQuantityText(String(size));
  };

  const updateQuantityText = (text: string) => {
    if (/^\d*\.?\d*$/.test(text)) setQuantityText(text);
  };

  const clampQuantity = () => {
    const step = formServingSize > 0 ? formServingSize : 1;
    const fallbackQuantity = step * 0.5;
    if (quantity <= 0) {
      setQuantityText(String(fallbackQuantity));
    }
  };

  const adjustQuantity = (delta: number) => {
    const step = formServingSize > 0 ? formServingSize : 1;
    const increment = step * 0.5;
    const minQuantity = increment;
    if (quantity < minQuantity) {
      if (delta > 0) setQuantityText(String(minQuantity));
      return;
    }
    const boundary =
      delta > 0
        ? Math.ceil(quantity / increment) * increment
        : Math.floor(quantity / increment) * increment;
    const next = boundary !== quantity ? boundary : quantity + delta * increment;
    setQuantityText(String(Math.max(minQuantity, next)));
  };

  const mealPickerOptions = mealTypes.map((mt) => ({ label: getMealTypeLabel(mt.name), value: mt.id }));

  const { addEntry, isPending: isSubmitting, invalidateCache } = useAddFoodEntry({
    onSuccess: (entry) => {
      invalidateCache(normalizeDate(entry.entry_date));
      navigation.dispatch(StackActions.popToTop());
    },
  });

  const handleSubmit = (data: FoodFormData) => {
    if (!data.name.trim()) {
      Toast.show({ type: 'error', text1: 'Missing name', text2: 'Please enter a food name.' });
      return;
    }
    if (!parseFloat(data.servingSize)) {
      Toast.show({ type: 'error', text1: 'Invalid serving size', text2: 'Serving size must be greater than zero.' });
      return;
    }
    if (!quantity) {
      Toast.show({ type: 'error', text1: 'Invalid amount', text2: 'Amount must be greater than zero.' });
      return;
    }
    if (!effectiveMealId) {
      Toast.show({ type: 'error', text1: 'No meal type', text2: 'No meal types are available. Please check your account settings.' });
      return;
    }

    addEntry({
      saveFoodPayload: {
        name: data.name,
        brand: data.brand || null,
        serving_size: parseFloat(data.servingSize) || 0,
        serving_unit: data.servingUnit || 'serving',
        calories: parseFloat(data.calories) || 0,
        protein: parseFloat(data.protein) || 0,
        carbs: parseFloat(data.carbs) || 0,
        fat: parseFloat(data.fat) || 0,
        dietary_fiber: parseOptional(data.fiber),
        saturated_fat: parseOptional(data.saturatedFat),
        sodium: parseOptional(data.sodium),
        sugars: parseOptional(data.sugars),
        trans_fat: parseOptional(data.transFat),
        potassium: parseOptional(data.potassium),
        calcium: parseOptional(data.calcium),
        iron: parseOptional(data.iron),
        cholesterol: parseOptional(data.cholesterol),
        vitamin_a: parseOptional(data.vitaminA),
        vitamin_c: parseOptional(data.vitaminC),
        is_custom: true,
        is_quick_food: !saveToDatabase,
        is_default: true,
        barcode: barcode ?? null,
        provider_type: providerType ?? null,
      },
      createEntryPayload: {
        meal_type_id: effectiveMealId,
        quantity,
        unit: data.servingUnit || 'serving',
        entry_date: selectedDate,
      },
    });
  };

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          New Food
        </Text>
      </View>

      <FoodForm onSubmit={handleSubmit} onServingChange={handleServingChange} isSubmitting={isSubmitting} initialValues={initialFood}>
        {/* Logging */}
        <View className="gap-4 bg-surface rounded-xl p-4 shadow-sm">

          <View className="flex-row items-start">
            {/* Date */}
            <TouchableOpacity
              onPress={() => calendarRef.current?.present()}
              activeOpacity={0.7}
              className="flex-1 flex-row items-center"
            >
              <Text className="text-text-secondary text-base mr-3">Date</Text>
              <Text className="text-text-primary text-base font-medium mx-1.5">
                {formatDateLabel(selectedDate)}
              </Text>
              <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
            </TouchableOpacity>

            {/* Meal */}
            {selectedMealType && (
              <View className="flex-1 flex-row items-center">
                <Text className="text-text-secondary text-base mx-3">Meal</Text>
                <BottomSheetPicker
                  value={effectiveMealId!}
                  options={mealPickerOptions}
                  onSelect={setSelectedMealId}
                  title="Select Meal"
                  renderTrigger={({ onPress }) => (
                    <TouchableOpacity
                      onPress={onPress}
                      activeOpacity={0.7}
                      className="flex-row items-center"
                    >
                      <Text className="text-text-primary text-base font-medium mx-1.5">
                        {getMealTypeLabel(selectedMealType.name)}
                      </Text>
                      <Icon name="chevron-down" size={12} color={textPrimary} weight="medium" />
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}
          </View>
          {/* Amount */}
          <View>
            <View className="flex-row items-center">
              <StepperInput
                value={quantityText}
                onChangeText={updateQuantityText}
                onBlur={clampQuantity}
                onDecrement={() => adjustQuantity(-1)}
                onIncrement={() => adjustQuantity(1)}
              />
              <Text className="text-text-primary text-base font-medium ml-2">
                {formServingUnit}
              </Text>
            </View>
            <Text className="text-text-secondary text-sm mt-2">
              {servings % 1 === 0 ? servings : servings.toFixed(1)} {servings === 1 ? 'serving' : 'servings'}
              {' · '}{formServingSize} {formServingUnit} per serving
            </Text>
          </View>
          {/* Save to Database */}
          <View className="flex-row items-center justify-between">
            <Text className="text-text-secondary text-base">Save to Database</Text>
            <Switch
              value={saveToDatabase}
              onValueChange={setSaveToDatabase}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          {barcode && (
            <Text className="text-text-secondary text-base font-medium">Barcode will be saved.</Text>
          )}
        </View>
      </FoodForm>

      <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
    </View>
  );
}

function AdjustNutritionMode({ params, navigation }: { params: AdjustNutritionParams; navigation: FoodFormScreenProps['navigation'] }) {
  const { initialValues, returnKey } = params;
  const insets = useSafeAreaInsets();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const handleSubmit = (data: FoodFormData) => {
    if (!data.name.trim()) {
      Toast.show({ type: 'error', text1: 'Missing name', text2: 'Please enter a food name.' });
      return;
    }
    if (!parseFloat(data.servingSize)) {
      Toast.show({ type: 'error', text1: 'Invalid serving size', text2: 'Serving size must be greater than zero.' });
      return;
    }
    navigation.dispatch({
      ...CommonActions.setParams({ adjustedValues: data }),
      source: returnKey,
    });
    navigation.goBack();
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Adjust Nutrition
        </Text>
      </View>

      <FoodForm
        onSubmit={handleSubmit}
        initialValues={initialValues}
        submitLabel="Update Values"
      />
    </View>
  );
}

const FoodFormScreen: React.FC<FoodFormScreenProps> = ({ route, navigation }) => {
  if (route.params.mode === 'adjust-entry-nutrition') {
    return <AdjustNutritionMode params={route.params} navigation={navigation} />;
  }
  return <CreateFoodMode params={route.params} navigation={navigation} />;
};

export default FoodFormScreen;
