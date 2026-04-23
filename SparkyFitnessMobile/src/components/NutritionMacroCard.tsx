import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';

export interface NutritionGoalPercentages {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
}

interface NutritionMacroCardProps {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  heading?: string;
  goalPercentages?: NutritionGoalPercentages;
}

const NutritionMacroCard: React.FC<NutritionMacroCardProps> = ({
  calories,
  protein,
  carbs,
  fat,
  heading,
  goalPercentages,
}) => {
  const [proteinColor, carbsColor, fatColor] = useCSSVariable([
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
  ]) as [string, string, string];

  const macros = [
    {
      key: 'Protein',
      label: 'Protein',
      value: protein,
      calories: protein * 4,
      color: proteinColor,
      goalPercent: goalPercentages?.protein,
    },
    {
      key: 'Carbs',
      label: 'Carbs',
      value: carbs,
      calories: carbs * 4,
      color: carbsColor,
      goalPercent: goalPercentages?.carbs,
    },
    {
      key: 'Fat',
      label: 'Fat',
      value: fat,
      calories: fat * 9,
      color: fatColor,
      goalPercent: goalPercentages?.fat,
    },
  ] as const;

  const totalMacroCals = macros.reduce((sum, macro) => sum + macro.calories, 0);

  return (
    <View className="bg-surface rounded-xl p-4 gap-4">
      {heading ? (
        <Text className="text-text-secondary text-sm font-medium">{heading}</Text>
      ) : null}

      <View className="flex-row items-center">
        <View className="flex-1 items-center pr-10">
          <Text className="text-text-primary text-3xl font-medium">
            {Math.round(calories)}
          </Text>
          <Text className="text-text-secondary text-base mt-2">calories</Text>
          {goalPercentages?.calories != null ? (
            <Text className="text-text-muted text-sm mt-1">
              {goalPercentages.calories}% of goal
            </Text>
          ) : null}
        </View>

        <View className="flex-1 gap-3">
          {macros.map((macro) => (
            <View key={macro.key}>
              <View className="flex-row justify-between mb-1">
                <Text className="text-text-secondary text-sm">{macro.label}</Text>
                <Text className="text-text-primary text-sm font-medium">
                  {Math.round(macro.value)}g
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
    </View>
  );
};

export default NutritionMacroCard;
