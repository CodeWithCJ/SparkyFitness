import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useQuery } from '@tanstack/react-query';
import Icon from '../components/Icon';
import { fetchDailyGoals } from '../services/api/goalsApi';
import { getTodayDate } from '../utils/dateUtils';
import type { FoodInfoItem } from '../types/foodInfo';

interface FoodItemInfoScreenProps {
  navigation: { goBack: () => void };
  route: { params: { item: FoodInfoItem; mealTypeLabel: string } };
}

const FoodItemInfoScreen: React.FC<FoodItemInfoScreenProps> = ({ navigation, route }) => {
  const { item, mealTypeLabel } = route.params;
  const insets = useSafeAreaInsets();
  const [accentColor, proteinColor, carbsColor, fatColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
  ]) as [string, string, string, string];

  const { data: goals, isLoading: isGoalsLoading } = useQuery({
    queryKey: ['goals', getTodayDate()],
    queryFn: () => fetchDailyGoals(getTodayDate()),
  });

  const goalPercent = (value: number, goalValue: number | undefined) => {
    if (!goalValue || goalValue === 0) return null;
    return Math.round((value / goalValue) * 100);
  };

  const calorieGoalPct = goalPercent(item.calories, goals?.calories);
  const proteinGoalPct = goalPercent(item.protein, goals?.protein);
  const carbsGoalPct = goalPercent(item.carbs, goals?.carbs);
  const fatGoalPct = goalPercent(item.fat, goals?.fat);

  // Macro bar proportions by calorie contribution
  const proteinCals = item.protein * 4;
  const carbsCals = item.carbs * 4;
  const fatCals = item.fat * 9;
  const totalMacroCals = proteinCals + carbsCals + fatCals;

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
          Food Info
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4 gap-4">
        {/* Food name & brand */}
        <View className="bg-surface rounded-xl p-4">
          <Text className="text-text-primary text-xl font-semibold">{item.name}</Text>
          {item.brand && (
            <Text className="text-text-secondary text-base mt-1">{item.brand}</Text>
          )}
          <Text className="text-text-muted text-sm mt-1">
            {item.servingSize} {item.servingUnit}
          </Text>
        </View>

        {/* Calories */}
        <View className="bg-surface rounded-xl p-4 items-center">
          <Text className="text-text-primary text-4xl font-bold">{item.calories}</Text>
          <Text className="text-text-secondary text-base mt-1">calories</Text>
          {isGoalsLoading ? (
            <ActivityIndicator size="small" color={accentColor} className="mt-2" />
          ) : calorieGoalPct !== null ? (
            <Text className="text-text-muted text-sm mt-1">
              {calorieGoalPct}% of daily goal
            </Text>
          ) : null}
        </View>

        {/* Macro bar + grid */}
        <View className="bg-surface rounded-xl p-4">
          {/* Proportional macro bar */}
          {totalMacroCals > 0 && (
            <View className="flex-row h-2.5 rounded-full overflow-hidden mb-4">
              <View style={{ flex: proteinCals, backgroundColor: proteinColor }} />
              <View style={{ flex: carbsCals, backgroundColor: carbsColor }} />
              <View style={{ flex: fatCals, backgroundColor: fatColor }} />
            </View>
          )}

          {/* Macro grid */}
          <View className="flex-row">
            <View className="flex-1 items-center">
              <View className="w-3 h-3 rounded-full mb-1" style={{ backgroundColor: proteinColor }} />
              <Text className="text-text-primary text-lg font-semibold">{item.protein}g</Text>
              <Text className="text-text-secondary text-sm">Protein</Text>
              {proteinGoalPct !== null && (
                <Text className="text-text-muted text-xs mt-0.5">{proteinGoalPct}% of goal</Text>
              )}
            </View>
            <View className="flex-1 items-center">
              <View className="w-3 h-3 rounded-full mb-1" style={{ backgroundColor: carbsColor }} />
              <Text className="text-text-primary text-lg font-semibold">{item.carbs}g</Text>
              <Text className="text-text-secondary text-sm">Carbs</Text>
              {carbsGoalPct !== null && (
                <Text className="text-text-muted text-xs mt-0.5">{carbsGoalPct}% of goal</Text>
              )}
            </View>
            <View className="flex-1 items-center">
              <View className="w-3 h-3 rounded-full mb-1" style={{ backgroundColor: fatColor }} />
              <Text className="text-text-primary text-lg font-semibold">{item.fat}g</Text>
              <Text className="text-text-secondary text-sm">Fat</Text>
              {fatGoalPct !== null && (
                <Text className="text-text-muted text-xs mt-0.5">{fatGoalPct}% of goal</Text>
              )}
            </View>
          </View>
        </View>

        {/* Action buttons */}
        <View className="flex-row gap-3 mt-2">
          <TouchableOpacity
            className="flex-1 border-2 border-border-subtle rounded-[10px] py-3.5 items-center"
            activeOpacity={0.6}
            onPress={() => {
              // TODO: Implement edit flow
              console.log('TODO: Edit food item');
            }}
          >
            <Text className="text-accent-primary text-base font-semibold">Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-accent-primary rounded-[10px] py-3.5 items-center"
            activeOpacity={0.8}
            onPress={() => {
              // TODO: Implement add flow
              console.log('TODO: Add food entry');
            }}
          >
            <Text className="text-white text-base font-semibold">Add to {mealTypeLabel}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

export default FoodItemInfoScreen;
