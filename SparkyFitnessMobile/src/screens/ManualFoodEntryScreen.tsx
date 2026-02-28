import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, Platform, Text, TextInput, Switch, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { StackActions } from '@react-navigation/native';
import Icon from '../components/Icon';
import FoodForm, { type FoodFormData } from '../components/FoodForm';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useMealTypes } from '../hooks';
import { getMealTypeLabel } from '../constants/meals';
import { getTodayDate, formatDateLabel } from '../utils/dateUtils';
import { saveFood } from '../services/api/foodsApi';
import { createFoodEntry } from '../services/api/foodEntriesApi';
import { foodsQueryKey, dailySummaryQueryKey } from '../hooks/queryKeys';
import type { RootStackScreenProps } from '../types/navigation';

const parseOptional = (s: string): number | undefined =>
  s === '' ? undefined : (parseFloat(s) || 0);

type ManualFoodEntryScreenProps = RootStackScreenProps<'ManualFoodEntry'>;

const ManualFoodEntryScreen: React.FC<ManualFoodEntryScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [accentColor, textPrimary, formEnabled, formDisabled] = useCSSVariable(['--color-accent-primary', '--color-text-primary', '--color-form-enabled', '--color-form-disabled']) as [string, string, string, string];

  const [selectedDate, setSelectedDate] = useState(route.params?.date ?? getTodayDate());
  const calendarRef = useRef<CalendarSheetRef>(null);
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>();
  const effectiveMealId = selectedMealId ?? defaultMealTypeId;
  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);

  const [saveToDatabase, setSaveToDatabase] = useState(true);
  const [servingsText, setServingsText] = useState('1');
  const servings = parseFloat(servingsText) || 0;

  const updateServingsText = (text: string) => {
    if (/^\d*\.?\d*$/.test(text)) setServingsText(text);
  };

  const clampServings = () => {
    const clamped = Math.max(0.5, servings);
    setServingsText(String(clamped));
  };

  const adjustServings = (delta: number) => {
    const next = Math.max(0.5, servings + delta);
    setServingsText(String(next));
  };

  const mealPickerOptions = mealTypes.map((mt) => ({ label: getMealTypeLabel(mt.name), value: mt.id }));

  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: async (data: FoodFormData) => {
      if (!effectiveMealId) throw new Error('No meal type selected');
      const servingSize = parseFloat(data.servingSize) || 0;
      const quantity = servingSize * servings;

      const saved = await saveFood({
        name: data.name,
        brand: data.brand || null,
        serving_size: servingSize,
        serving_unit: data.servingUnit || 'serving',
        calories: parseFloat(data.calories) || 0,
        protein: parseFloat(data.protein) || 0,
        carbs: parseFloat(data.carbs) || 0,
        fat: parseFloat(data.fat) || 0,
        dietary_fiber: parseOptional(data.fiber),
        saturated_fat: parseOptional(data.saturatedFat),
        sodium: parseOptional(data.sodium),
        sugars: parseOptional(data.sugars),
        is_custom: true,
        is_quick_food: !saveToDatabase,
        is_default: true,
      });

      return createFoodEntry({
        meal_type_id: effectiveMealId,
        quantity,
        unit: data.servingUnit || 'serving',
        entry_date: selectedDate,
        food_id: saved.id,
        variant_id: saved.default_variant.id!,
      });
    },
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(entry.entry_date.split('T')[0]) });
      queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });
      navigation.dispatch(StackActions.popToTop());
    },
    onError: () => {
      Alert.alert('Failed to save food', 'Please try again.');
    },
  });

  const handleSubmit = (data: FoodFormData) => {
    if (!data.name.trim()) {
      Alert.alert('Missing name', 'Please enter a food name.');
      return;
    }
    if (!parseFloat(data.servingSize)) {
      Alert.alert('Invalid serving size', 'Serving size must be greater than zero.');
      return;
    }
    if (!servings) {
      Alert.alert('Invalid amount', 'Amount must be greater than zero.');
      return;
    }
    submitMutation.mutate(data);
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

      <FoodForm onSubmit={handleSubmit} isSubmitting={submitMutation.isPending}>
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
          <View className="flex-row items-center">
            <Text className="text-text-secondary text-base mr-3">Amount</Text>
            <View className="flex-row items-center bg-raised border border-border-subtle rounded-lg overflow-hidden">
              <TouchableOpacity
                onPress={() => adjustServings(-0.5)}
                className="w-10 h-10 items-center justify-center border-r border-border-subtle"
                activeOpacity={0.7}
              >
                <Icon name="remove" size={20} color={accentColor} />
              </TouchableOpacity>
              <TextInput
                value={servingsText}
                onChangeText={updateServingsText}
                onBlur={clampServings}
                keyboardType="decimal-pad"
                selectTextOnFocus
                className="text-text-primary text-base text-center w-14 h-10"
                style={{ fontSize: 20, lineHeight: 22 }}
              />
              <TouchableOpacity
                onPress={() => adjustServings(0.5)}
                className="w-10 h-10 items-center justify-center border-l border-border-subtle"
                activeOpacity={0.7}
              >
                <Icon name="add" size={20} color={accentColor} />
              </TouchableOpacity>
            </View>
            {/* <Text className="text-text-secondary text-base ml-3">serving</Text> */}
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
        </View>
      </FoodForm>

      <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
    </View>
  );
};

export default ManualFoodEntryScreen;
