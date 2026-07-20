import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import MacroCompositionRing from './MacroCompositionRing';
import ProgressRing from './ProgressRing';
import { getNetCarbsValue } from '../utils/nutrientUtils';

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
  // When true, render the goal-bars layout even if percentages aren't computed
  // yet — avoids a ring→bars flash while the goals query is in flight.
  goalsLoading?: boolean;
  // When showNetCarbs is true and fiber is provided, the carbs row swaps to
  // "Net Carbs" with value max(0, carbs - fiber). Goal percentage and ring
  // share are computed against this net value too, mirroring the web behavior.
  showNetCarbs?: boolean;
  fiber?: number;
  calorieGoal?: number;
  proteinGoal?: number;
  carbsGoal?: number;
  fatGoal?: number;
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
  goalsLoading,
  showNetCarbs = false,
  fiber,
  calorieGoal,
  proteinGoal,
  carbsGoal,
  fatGoal,
}) => {
  const [proteinColor, carbsColor, fatColor, trackColor, accentColor] = useCSSVariable([
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
    '--color-progress-track',
    '--color-accent-primary',
  ]) as [string, string, string, string, string];

  const useNetCarbs = showNetCarbs && fiber !== undefined;
  const displayCarbs = useNetCarbs ? getNetCarbsValue(carbs, fiber) : carbs;
  const carbsLabel = useNetCarbs ? 'Net Carbs' : 'Carbs';

  const proteinCals = protein * 4;
  const carbsCals = displayCarbs * 4;
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
      goal: proteinGoal,
    },
    {
      key: 'Carbs',
      label: carbsLabel,
      value: displayCarbs,
      color: carbsColor,
      goalPercent: goalPercentages?.carbs,
      goal: carbsGoal,
    },
    {
      key: 'Fat',
      label: 'Fat',
      value: fat,
      color: fatColor,
      goalPercent: goalPercentages?.fat,
      goal: fatGoal,
    },
  ];

  const showGoalProgress =
    goalsLoading === true ||
    (goalPercentages != null &&
      (goalPercentages.calories != null ||
        goalPercentages.protein != null ||
        goalPercentages.carbs != null ||
        goalPercentages.fat != null));

  return (
    <View className="bg-surface rounded-xl p-4 gap-4">
      {heading ? (
        <Text className="text-text-secondary text-sm font-medium">{heading}</Text>
      ) : null}

      {showGoalProgress ? (
        <View className="flex-row items-center">
          <View className="flex-1 items-center pr-2 justify-center">
            <View className="items-center justify-center relative" style={{ width: 110, height: 110 }}>
              <ProgressRing
                progress={calories / (calorieGoal || 1)}
                size={100}
                strokeWidth={8}
                color={accentColor}
                backgroundColor={trackColor}
              />
              <View className="absolute items-center justify-center">
                <Text className="text-text-primary text-xl font-bold">
                  {calorieGoal && calorieGoal > 0 ? Math.max(0, Math.round(calorieGoal - calories)).toLocaleString() : Math.round(calories).toLocaleString()}
                </Text>
                <Text className="text-text-muted text-[10px] uppercase font-semibold mt-0.5">
                  {calorieGoal && calorieGoal > 0 ? 'left' : 'kcal'}
                </Text>
              </View>
            </View>
            {calorieGoal && calorieGoal > 0 ? (
              <Text className="text-text-muted text-xs mt-2 text-center">
                {Math.round(calories).toLocaleString()} / {Math.round(calorieGoal).toLocaleString()} kcal ({goalPercentages?.calories}%)
              </Text>
            ) : (
              <Text className="text-text-muted text-xs mt-2 text-center">
                {Math.round(calories).toLocaleString()} kcal
              </Text>
            )}
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
                      {macro.goal && macro.goal > 0 ? ` / ${Math.round(macro.goal)}g` : ''}
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
                  {goalPct != null ? (() => {
                    const diff = macro.goal ? macro.goal - macro.value : 0;
                    const remainingText = diff > 0 ? `${Math.round(diff)}g left` : diff < 0 ? `${Math.round(Math.abs(diff))}g over` : 'met';
                    return (
                      <Text className="text-text-muted text-xs mt-1">
                        {goalPct}%{macro.goal && macro.goal > 0 ? ` · ${remainingText}` : ''}
                      </Text>
                    );
                  })() : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View className="flex-row items-center gap-x-5">
          <View className="items-center">
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
                  {calorieGoal && calorieGoal > 0
                    ? Math.max(0, Math.round(calorieGoal - calories)).toLocaleString()
                    : Math.round(calories)}
                </Text>
                <Text className="text-text-secondary text-xs mt-0.5">
                  {calorieGoal && calorieGoal > 0 ? 'left' : 'calories'}
                </Text>
              </View>
            </View>
            {calorieGoal && calorieGoal > 0 ? (
              <Text className="text-text-secondary text-xs font-medium mt-2 text-center">
                {Math.round(calories).toLocaleString()} / {Math.round(calorieGoal).toLocaleString()} Cal
              </Text>
            ) : null}
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
