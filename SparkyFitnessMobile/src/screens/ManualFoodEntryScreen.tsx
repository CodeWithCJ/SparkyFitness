import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, Platform, Text, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import FoodForm, { type FoodFormData } from '../components/FoodForm';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useMealTypes } from '../hooks';
import { getMealTypeLabel } from '../constants/meals';
import { getTodayDate, formatDateLabel } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type ManualFoodEntryScreenProps = RootStackScreenProps<'ManualFoodEntry'>;

const ManualFoodEntryScreen: React.FC<ManualFoodEntryScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const [accentColor, textPrimary] = useCSSVariable(['--color-accent-primary', '--color-text-primary']) as [string, string];

  const [selectedDate, setSelectedDate] = useState(route.params?.date ?? getTodayDate());
  const calendarRef = useRef<CalendarSheetRef>(null);
  const { mealTypes, defaultMealTypeId } = useMealTypes();
  const [selectedMealId, setSelectedMealId] = useState<string | undefined>();
  const effectiveMealId = selectedMealId ?? defaultMealTypeId;
  const selectedMealType = mealTypes.find((mt) => mt.id === effectiveMealId);

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

  const handleSubmit = (_data: FoodFormData) => {
    // Placeholder: API integration will be added later
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

      <FoodForm onSubmit={handleSubmit}>
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
        </View>
      </FoodForm>

      <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
    </View>
  );
};

export default ManualFoodEntryScreen;
