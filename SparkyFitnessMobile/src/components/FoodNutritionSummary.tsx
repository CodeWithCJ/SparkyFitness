import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
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
  const accentColor = useCSSVariable('--color-accent-primary') as string;

  const [showMoreNutrients, setShowMoreNutrients] = useState(false);

  const { primary: primaryNutrients, additional: additionalNutrients } = useMemo(
    () => buildNutrientDisplayList(values),
    [values],
  );
  const visibleNutrients = showMoreNutrients
    ? [...primaryNutrients, ...additionalNutrients]
    : primaryNutrients;
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

      {visibleNutrients.length > 0 ? (
        <View className="rounded-xl">
          {visibleNutrients.map((nutrient, index) => (
            <View
              key={nutrient.label}
              className={`flex-row justify-between py-1 ${index < visibleNutrients.length - 1 ? 'border-b border-border-subtle' : ''}`}
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

      {additionalNutrients.length > 0 ? (
        <Button
          variant="ghost"
          onPress={() => setShowMoreNutrients((prev) => !prev)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="self-start py-0 px-0"
        >
          <Text style={{ color: accentColor }} className="text-sm font-medium">
            {showMoreNutrients ? 'Hide extra nutrients ▴' : 'Show more nutrients ▾'}
          </Text>
        </Button>
      ) : null}
    </View>
  );
};

export default FoodNutritionSummary;
