import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
import { buildNutrientDisplayList, type NutrientDisplayItem } from '../types/foodInfo';
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
  const scale = (value: number) => value * servings;

  const renderRow = (nutrient: NutrientDisplayItem, showBorder: boolean) => (
    <View
      key={nutrient.label}
      className={`flex-row justify-between py-1 ${showBorder ? 'border-b border-border-subtle' : ''}`}
    >
      <Text className="text-text-secondary text-sm">{nutrient.label}</Text>
      <Text className="text-text-primary text-sm">
        {Math.round(scale(nutrient.value))}
        {nutrient.unit}
      </Text>
    </View>
  );

  const hasAdditional = additionalNutrients.length > 0;
  const showAdditionalRows = showMoreNutrients && hasAdditional;
  const layoutTransition = LinearTransition.duration(250);

  return (
    <Animated.View className="gap-4" layout={layoutTransition}>
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

      {primaryNutrients.length > 0 ? (
        <Animated.View className="rounded-xl" layout={layoutTransition}>
          {primaryNutrients.map((nutrient, index) => {
            const isLastVisible =
              index === primaryNutrients.length - 1 && !showAdditionalRows;
            return renderRow(nutrient, !isLastVisible);
          })}
          {showAdditionalRows ? (
            <Animated.View
              entering={FadeIn.duration(250)}
              exiting={FadeOut.duration(150)}
              layout={layoutTransition}
            >
              {additionalNutrients.map((nutrient, index) =>
                renderRow(nutrient, index < additionalNutrients.length - 1),
              )}
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}

      {hasAdditional ? (
        <Animated.View layout={layoutTransition}>
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
        </Animated.View>
      ) : null}
    </Animated.View>
  );
};

export default FoodNutritionSummary;
