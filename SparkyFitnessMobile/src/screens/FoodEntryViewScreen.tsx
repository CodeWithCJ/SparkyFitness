import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import { formatDateLabel } from '../utils/dateUtils';
import { getMealTypeLabel } from '../constants/meals';
import { useDeleteFoodEntry } from '../hooks/useDeleteFoodEntry';
import type { FoodEntry } from '../types/foodEntries';
import type { RootStackScreenProps } from '../types/navigation';

type FoodEntryViewScreenProps = RootStackScreenProps<'FoodEntryView'>;

const scaledValue = (value: number | undefined, entry: FoodEntry): number => {
  if (value === undefined || !entry.serving_size) return 0;
  return (value * entry.quantity) / entry.serving_size;
};

const FoodEntryViewScreen: React.FC<FoodEntryViewScreenProps> = ({ navigation, route }) => {
  const { entry } = route.params;
  const insets = useSafeAreaInsets();

  const { confirmAndDelete, isPending, invalidateCache } = useDeleteFoodEntry({
    entryId: entry.id,
    entryDate: entry.entry_date,
    onSuccess: () => {
      invalidateCache();
      navigation.goBack();
    },
  });

  const [accentColor, proteinColor, carbsColor, fatColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
  ]) as [string, string, string, string];

  const calories = Math.round(scaledValue(entry.calories, entry));
  const protein = Math.round(scaledValue(entry.protein, entry));
  const carbs = Math.round(scaledValue(entry.carbs, entry));
  const fat = Math.round(scaledValue(entry.fat, entry));

  const proteinCals = protein * 4;
  const carbsCals = carbs * 4;
  const fatCals = fat * 9;
  const totalMacroCals = proteinCals + carbsCals + fatCals;

  const servings = entry.serving_size ? entry.quantity / entry.serving_size : entry.quantity;
  const servingsDisplay = servings === 1
    ? `1 serving · ${entry.serving_size}${entry.unit} per serving`
    : `${servings % 1 === 0 ? servings : servings.toFixed(1)} servings · ${entry.serving_size}${entry.unit} per serving`;

  const otherNutrients = [
    { label: 'Fiber', value: entry.dietary_fiber, unit: 'g' },
    { label: 'Sugars', value: entry.sugars, unit: 'g' },
    { label: 'Saturated Fat', value: entry.saturated_fat, unit: 'g' },
    { label: 'Sodium', value: entry.sodium, unit: 'mg' },
  ].filter((n) => n.value != null);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4">
        {/* Food name & brand */}
        <View className="pb-4">
          <Text className="text-text-primary text-3xl font-bold">{entry.food_name || 'Unknown food'}</Text>
          {entry.brand_name && (
            <Text className="text-text-muted mt-1 font-semibold">{entry.brand_name}</Text>
          )}
          <Text className="text-text-secondary text-sm mt-3">{servingsDisplay}</Text>
        </View>

        {/* Calories & Macros */}
        <View className="bg-surface rounded-xl p-4 flex-row items-center">
          {/* Calories — left half */}
          <View className="flex-1 items-center pr-10">
            <Text className="text-text-primary text-3xl font-medium">{calories}</Text>
            <Text className="text-text-secondary text-base mt-1">calories</Text>
          </View>

          {/* Macro bars — right half */}
          <View className="flex-1 gap-3">
            {[
              { label: 'Protein', value: protein, color: proteinColor, calFactor: 4 },
              { label: 'Carbs', value: carbs, color: carbsColor, calFactor: 4 },
              { label: 'Fat', value: fat, color: fatColor, calFactor: 9 },
            ].map((macro) => (
              <View key={macro.label}>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-text-secondary text-sm">{macro.label}</Text>
                  <Text className="text-text-primary text-sm font-medium">{macro.value}g</Text>
                </View>
                <View className="h-2 rounded-full bg-progress-track overflow-hidden">
                  {totalMacroCals > 0 && (
                    <View
                      className="h-full rounded-full"
                      style={{
                        backgroundColor: macro.color,
                        width: `${Math.round((macro.value * macro.calFactor / totalMacroCals) * 100)}%`,
                      }}
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Other Nutrients */}
        {otherNutrients.length > 0 && (
          <View className="rounded-xl my-2">
            <Text className="text-text-secondary text-sm font-medium mb-2">Other Nutrients</Text>
            {otherNutrients.map((n, i) => (
              <View key={n.label} className={`flex-row justify-between py-1 ${i < otherNutrients.length - 1 ? 'border-b border-border-subtle' : ''}`}>
                <Text className="text-text-secondary text-sm">{n.label}</Text>
                <Text className="text-text-primary text-sm">
                  {Math.round(scaledValue(n.value!, entry))}{n.unit}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Date & Meal type */}
        <View className="mt-2 gap-2">
          <View className="flex-row items-center">
            <Text className="text-text-secondary text-sm">Date</Text>
            <Text className="text-text-primary text-sm font-medium mx-1.5">
              {formatDateLabel(entry.entry_date.split('T')[0])}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Text className="text-text-secondary text-sm">Meal</Text>
            <Text className="text-text-primary text-sm font-medium mx-1.5">
              {getMealTypeLabel(entry.meal_type)}
            </Text>
          </View>
        </View>

        {/* Delete button */}
        <TouchableOpacity
          onPress={confirmAndDelete}
          disabled={isPending}
          className="items-center py-3 mt-2 "
          activeOpacity={0.6}
        >
          <Text className="text-bg-danger text-base font-medium">
            {isPending ? 'Deleting...' : 'Delete Entry'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default FoodEntryViewScreen;
