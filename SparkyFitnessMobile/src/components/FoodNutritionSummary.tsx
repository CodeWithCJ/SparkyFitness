import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { buildNutrientDisplayList } from '../types/foodInfo';
import type { FoodDisplayValues } from '../utils/foodDetails';
import NutritionMacroCard, { type NutritionGoalPercentages } from './NutritionMacroCard';

interface FoodNutritionSummaryProps {
  name: string;
  brand?: string | null;
  values: FoodDisplayValues;
  servings?: number;
  goalPercentages?: NutritionGoalPercentages;
}

const FoodNutritionSummary: React.FC<FoodNutritionSummaryProps> = ({
  name,
  brand,
  values,
  servings = 1,
  goalPercentages,
}) => {
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

      <NutritionMacroCard
        calories={scale(values.calories)}
        protein={scale(values.protein)}
        carbs={scale(values.carbs)}
        fat={scale(values.fat)}
        goalPercentages={goalPercentages}
      />

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
