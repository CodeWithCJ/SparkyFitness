import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import MacroCompositionRing from './MacroCompositionRing';
import { getNetCarbsValue } from '../utils/nutrientUtils';
import {
  formatMobileNumber,
  localizeNutrient,
  localizeServingUnit,
  mobileT,
} from '../localization';

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
}

const RING_SIZE = 130;
const RING_STROKE = 12;

function formatRoundedNumber(value: number): string {
  return formatMobileNumber(Math.round(value), {
    maximumFractionDigits: 0,
  });
}

function formatMacroAmount(value: number): string {
  return `${formatRoundedNumber(value)} ${localizeServingUnit('g')}`;
}

function formatGoalPercent(value: number): string {
  return mobileT('nutrition.goalPercent', {
    percent: formatMobileNumber(value, { maximumFractionDigits: 1 }),
  });
}

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
}) => {
  const [proteinColor, carbsColor, fatColor, trackColor] = useCSSVariable([
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
    '--color-progress-track',
  ]) as [string, string, string, string];

  const useNetCarbs = showNetCarbs && fiber !== undefined;
  const displayCarbs = useNetCarbs ? getNetCarbsValue(carbs, fiber) : carbs;
  const carbsLabel = localizeNutrient(useNetCarbs ? 'netCarbs' : 'carbs');

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
      label: localizeNutrient('protein'),
      value: protein,
      color: proteinColor,
      goalPercent: goalPercentages?.protein,
    },
    {
      key: 'Carbs',
      label: carbsLabel,
      value: displayCarbs,
      color: carbsColor,
      goalPercent: goalPercentages?.carbs,
    },
    {
      key: 'Fat',
      label: localizeNutrient('fat'),
      value: fat,
      color: fatColor,
      goalPercent: goalPercentages?.fat,
    },
  ] as const;

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
          <View className="flex-1 items-center" style={{ paddingEnd: 40 }}>
            <Text className="text-text-primary text-3xl font-medium">
              {formatRoundedNumber(calories)}
            </Text>
            <Text className="text-text-secondary text-base mt-2">
              {mobileT('nutrition.calories')}
            </Text>
            {goalPercentages?.calories != null ? (
              <Text className="text-text-muted text-sm mt-1">
                {formatGoalPercent(goalPercentages.calories)}
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
                      {formatMacroAmount(macro.value)}
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
                      {formatGoalPercent(goalPct)}
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
                {formatRoundedNumber(calories)}
              </Text>
              <Text className="text-text-secondary text-xs mt-0.5">
                {mobileT('nutrition.calories')}
              </Text>
            </View>
          </View>

          <View className="flex-1 gap-3" style={{ paddingStart: 20 }}>
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
                  {formatMacroAmount(macro.value)}
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
