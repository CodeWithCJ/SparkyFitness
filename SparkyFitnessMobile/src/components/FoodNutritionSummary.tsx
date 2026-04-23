import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { buildNutrientDisplayList } from '../types/foodInfo';
import type { FoodDisplayValues } from '../utils/foodDetails';

interface GoalPercentages {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
}

interface FoodNutritionSummaryProps {
  name: string;
  brand?: string | null;
  values: FoodDisplayValues;
  servings?: number;
  goalPercentages?: GoalPercentages;
}

const FoodNutritionSummary: React.FC<FoodNutritionSummaryProps> = ({
  name,
  brand,
  values,
  servings = 1,
  goalPercentages,
}) => {
  const [proteinColor, carbsColor, fatColor] = useCSSVariable([
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
  ]) as [string, string, string];

  const proteinCals = values.protein * 4;
  const carbsCals = values.carbs * 4;
  const fatCals = values.fat * 9;
  const totalMacroCals = proteinCals + carbsCals + fatCals;
  const otherNutrients = useMemo(() => buildNutrientDisplayList(values), [values]);
  const scale = (value: number) => value * servings;

  return (
    <View className="gap-4">
      <View>
        <Text className="text-text-primary text-3xl font-bold">{name}</Text>
        {brand ? (
          <Text className="text-text-secondary text-base mt-1">{brand}</Text>
        ) : null}
      </View>

      <View className="bg-surface rounded-xl p-4 flex-row items-center">
        <View className="flex-1 items-center pr-10">
          <Text className="text-text-primary text-3xl font-medium">
            {Math.round(scale(values.calories))}
          </Text>
          <Text className="text-text-secondary text-base mt-2">calories</Text>
          {goalPercentages?.calories != null ? (
            <Text className="text-text-muted text-sm mt-1">
              {goalPercentages.calories}% of goal
            </Text>
          ) : null}
        </View>

        <View className="flex-1 gap-3">
          {[
            {
              key: 'Protein',
              label: 'Protein',
              value: values.protein,
              calories: proteinCals,
              color: proteinColor,
              goalPercent: goalPercentages?.protein,
            },
            {
              key: 'Carbs',
              label: 'Carbs',
              value: values.carbs,
              calories: carbsCals,
              color: carbsColor,
              goalPercent: goalPercentages?.carbs,
            },
            {
              key: 'Fat',
              label: 'Fat',
              value: values.fat,
              calories: fatCals,
              color: fatColor,
              goalPercent: goalPercentages?.fat,
            },
          ].map((macro) => (
            <View key={macro.key}>
              <View className="flex-row justify-between mb-1">
                <Text className="text-text-secondary text-sm">{macro.label}</Text>
                <Text className="text-text-primary text-sm font-medium">
                  {Math.round(scale(macro.value))}g
                </Text>
              </View>
              <View className="h-2 rounded-full bg-progress-track overflow-hidden">
                {totalMacroCals > 0 ? (
                  <View
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: macro.color,
                      width: `${Math.round((macro.calories / totalMacroCals) * 100)}%`,
                    }}
                  />
                ) : null}
              </View>
              {macro.goalPercent != null ? (
                <Text className="text-text-muted text-xs mt-1">
                  {macro.goalPercent}% of goal
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </View>

      {otherNutrients.length > 0 ? (
        <View className="rounded-xl">
          {otherNutrients.map((nutrient, index) => (
            <View
              key={nutrient.label}
              className={`flex-row justify-between py-1 ${index < otherNutrients.length - 1 ? 'border-b border-border-subtle' : ''}`}
            >
              <Text className="text-text-secondary text-sm">{nutrient.label}</Text>
              <Text className="text-text-primary text-sm">
                {Math.round(scale(nutrient.value))}
                {nutrient.unit}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

export default FoodNutritionSummary;
