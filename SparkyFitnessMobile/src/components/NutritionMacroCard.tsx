import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import MacroCompositionRing from './MacroCompositionRing';

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

const RING_SIZE = 130;
const RING_STROKE = 12;

const NutritionMacroCard: React.FC<NutritionMacroCardProps> = ({
  calories,
  protein,
  carbs,
  fat,
  heading,
  goalPercentages,
}) => {
  const [proteinColor, carbsColor, fatColor, trackColor] = useCSSVariable([
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
    '--color-progress-track',
  ]) as [string, string, string, string];

  const proteinCals = protein * 4;
  const carbsCals = carbs * 4;
  const fatCals = fat * 9;
  const totalMacroCals = proteinCals + carbsCals + fatCals;

  const shares =
    totalMacroCals > 0
      ? {
          protein: proteinCals / totalMacroCals,
          carbs: carbsCals / totalMacroCals,
          fat: fatCals / totalMacroCals,
        }
      : { protein: 0, carbs: 0, fat: 0 };

  const macros = [
    {
      key: 'Protein',
      label: 'Protein',
      value: protein,
      color: proteinColor,
      goalPercent: goalPercentages?.protein,
    },
    {
      key: 'Carbs',
      label: 'Carbs',
      value: carbs,
      color: carbsColor,
      goalPercent: goalPercentages?.carbs,
    },
    {
      key: 'Fat',
      label: 'Fat',
      value: fat,
      color: fatColor,
      goalPercent: goalPercentages?.fat,
    },
  ] as const;

  const showGoalProgress =
    goalPercentages != null &&
    (goalPercentages.calories != null ||
      goalPercentages.protein != null ||
      goalPercentages.carbs != null ||
      goalPercentages.fat != null);

  return (
    <View className="bg-surface rounded-xl p-4 gap-4">
      {heading ? (
        <Text className="text-text-secondary text-sm font-medium">{heading}</Text>
      ) : null}

      {showGoalProgress ? (
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

          <View className="flex-2 gap-3">
            {macros.map((macro) => {
              const goalPct = macro.goalPercent;
              const fillPct = goalPct != null ? Math.max(0, Math.min(goalPct, 100)) : 0;
              return (
                <View key={macro.key}>
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-text-secondary text-sm">{macro.label}</Text>
                    <Text className="text-text-primary text-sm font-medium">
                      {Math.round(macro.value)}g
                    </Text>
                  </View>
                  <View className="h-2 rounded-full bg-progress-track overflow-hidden">
                    {goalPct != null && goalPct > 0 ? (
                      <View
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: macro.color,
                          width: `${fillPct}%`,
                        }}
                      />
                    ) : null}
                  </View>
                  {goalPct != null ? (
                    <Text className="text-text-muted text-xs mt-1">
                      {goalPct}% of goal
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View className="flex-row items-center gap-x-5">
          <View
            className="items-center justify-center"
            style={{ width: RING_SIZE, height: RING_SIZE }}
          >
            <MacroCompositionRing
              size={RING_SIZE}
              strokeWidth={RING_STROKE}
              shares={shares}
              colors={{ protein: proteinColor, carbs: carbsColor, fat: fatColor }}
              trackColor={trackColor}
            />
            <View className="absolute items-center justify-center">
              <Text className="text-text-primary text-3xl font-medium">
                {Math.round(calories)}
              </Text>
              <Text className="text-text-secondary text-xs mt-0.5">calories</Text>
            </View>
          </View>

          <View className="flex-1 gap-3 pl-5">
            {macros.map((macro) => (
              <View key={macro.key} className="flex-row items-center gap-2">
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: macro.color,
                  }}
                />
                <Text className="text-text-secondary text-sm flex-1">{macro.label}</Text>
                <Text className="text-text-primary text-sm font-medium">
                  {Math.round(macro.value)}g
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

export default NutritionMacroCard;
