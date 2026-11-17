import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import MacroCompositionRing from './MacroCompositionRing';
import ProgressRing from './ProgressRing';
import { getNetCarbsValue } from '../utils/nutrientUtils';
import { localizeNutrientKey } from '../utils/nutrientLocalization';
import { formatLocalizedNumber } from '../localization';
import { energyFromKcal } from '@workspace/shared';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { energyUnitLabel } from '../utils/energyUnit';

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
  // When provided, each macro row in the goal-bars layout is tappable and shows
  // a chevron. Not offered for the net carbs row, whose value has no trend series.
  onMacroPress?: (macro: {
    key: 'protein' | 'carbs' | 'fat';
    label: string;
    goal?: number;
  }) => void;
}

const RING_SIZE = 130;
const RING_STROKE = 12;

const NutritionMacroCard: React.FC<NutritionMacroCardProps> = ({
  calories: caloriesKcal,
  protein,
  carbs,
  fat,
  heading,
  goalPercentages,
  goalsLoading,
  showNetCarbs = false,
  fiber,
  calorieGoal: calorieGoalKcal,
  proteinGoal,
  carbsGoal,
  fatGoal,
  onMacroPress,
}) => {
  const energyUnit = useEnergyUnit();
  // Values arrive in kcal; everything below shows them in the account's unit.
  const calories = energyFromKcal(caloriesKcal, energyUnit);
  const calorieGoal =
    calorieGoalKcal == null
      ? calorieGoalKcal
      : energyFromKcal(calorieGoalKcal, energyUnit);
  const [proteinColor, carbsColor, fatColor, trackColor, accentColor] =
    useCSSVariable([
      '--color-macro-protein',
      '--color-macro-carbs',
      '--color-macro-fat',
      '--color-progress-track',
      '--color-accent-primary',
    ]) as [string, string, string, string, string];

  const { t } = useTranslation();
  const useNetCarbs = showNetCarbs && fiber !== undefined;
  const displayCarbs = useNetCarbs ? getNetCarbsValue(carbs, fiber) : carbs;
  const carbsLabel = useNetCarbs
    ? localizeNutrientKey(t, 'netCarbs')
    : localizeNutrientKey(t, 'carbs');

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
      key: 'protein',
      label: localizeNutrientKey(t, 'protein'),
      value: protein,
      color: proteinColor,
      goalPercent: goalPercentages?.protein,
      goal: proteinGoal,
    },
    {
      key: 'carbs',
      label: carbsLabel,
      value: displayCarbs,
      color: carbsColor,
      goalPercent: goalPercentages?.carbs,
      goal: carbsGoal,
    },
    {
      key: 'fat',
      label: localizeNutrientKey(t, 'fat'),
      value: fat,
      color: fatColor,
      goalPercent: goalPercentages?.fat,
      goal: fatGoal,
    },
  ];

  const hasCalorieGoal = calorieGoal != null && calorieGoal > 0;

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
        <Text className="text-text-secondary text-sm font-medium">
          {heading}
        </Text>
      ) : null}

      {showGoalProgress ? (
        <View className="flex-row items-center">
          <View className="flex-1 items-center pr-2 justify-center">
            <View
              className="items-center justify-center relative"
              style={{ width: 110, height: 110 }}
            >
              {hasCalorieGoal ? (
                <ProgressRing
                  progress={calories / calorieGoal}
                  size={100}
                  strokeWidth={8}
                  color={accentColor}
                  backgroundColor={trackColor}
                />
              ) : (
                // No calorie goal to measure against (e.g. per-food screens):
                // show the macro composition breakdown instead of a goal ring.
                <MacroCompositionRing
                  size={100}
                  strokeWidth={8}
                  shares={shares}
                  colors={{
                    protein: proteinColor,
                    carbs: carbsColor,
                    fat: fatColor,
                  }}
                  trackColor={trackColor}
                />
              )}
              <View className="absolute items-center justify-center">
                <Text className="text-text-primary text-xl font-bold">
                  {hasCalorieGoal
                    ? formatLocalizedNumber(
                        Math.max(0, Math.round(calorieGoal - calories))
                      )
                    : formatLocalizedNumber(Math.round(calories))}
                </Text>
                <Text className="text-text-muted text-[10px] uppercase font-semibold mt-0.5">
                  {hasCalorieGoal
                    ? t('nutrition.left', { defaultValue: 'left' })
                    : energyUnitLabel(energyUnit, t)}
                </Text>
              </View>
            </View>
            {hasCalorieGoal ? (
              <Text className="text-text-muted text-xs mt-2 text-center">
                {formatLocalizedNumber(Math.round(calories))} /{' '}
                {formatLocalizedNumber(Math.round(calorieGoal))}{' '}
                {energyUnitLabel(energyUnit, t)} ({goalPercentages?.calories}%)
              </Text>
            ) : (
              <Text className="text-text-muted text-xs mt-2 text-center">
                {formatLocalizedNumber(Math.round(calories))}{' '}
                {energyUnitLabel(energyUnit, t)}
              </Text>
            )}
          </View>

          <View className="flex-2 gap-3">
            {macros.map((macro) => {
              const goalPct = macro.goalPercent;
              const fillPct =
                goalPct != null ? Math.max(0, Math.min(goalPct, 100)) : 0;
              const pressable =
                onMacroPress != null && !(useNetCarbs && macro.key === 'carbs');
              const Row = pressable ? TouchableOpacity : View;
              return (
                <Row
                  key={macro.key}
                  {...(pressable
                    ? {
                        activeOpacity: 0.7,
                        accessibilityRole: 'button' as const,
                        testID: `macro-row-${macro.key}`,
                        onPress: () =>
                          onMacroPress({
                            key: macro.key as 'protein' | 'carbs' | 'fat',
                            label: macro.label,
                            goal: macro.goal,
                          }),
                      }
                    : {})}
                >
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-text-secondary text-sm">
                      {macro.label}
                    </Text>
                    <View className="flex-row items-center gap-1">
                      <Text className="text-text-primary text-sm font-medium">
                        {formatLocalizedNumber(Math.round(macro.value))}g
                        {macro.goal && macro.goal > 0
                          ? ` / ${formatLocalizedNumber(Math.round(macro.goal))}g`
                          : ''}
                      </Text>
                      {pressable ? (
                        <Icon
                          name="chevron-forward"
                          size={14}
                          color={trackColor}
                        />
                      ) : null}
                    </View>
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
                  {goalPct != null
                    ? (() => {
                        const diff = macro.goal ? macro.goal - macro.value : 0;
                        const remainingText =
                          diff > 0
                            ? t('nutrition.remaining', {
                                defaultValue: '{{value}}g left',
                                value: formatLocalizedNumber(Math.round(diff)),
                              })
                            : diff < 0
                              ? t('nutrition.over', {
                                  defaultValue: '{{value}}g over',
                                  value: formatLocalizedNumber(
                                    Math.round(Math.abs(diff))
                                  ),
                                })
                              : t('nutrition.met', { defaultValue: 'met' });
                        return (
                          <Text className="text-text-muted text-xs mt-1">
                            {goalPct}%
                            {macro.goal && macro.goal > 0
                              ? ` · ${remainingText}`
                              : ''}
                          </Text>
                        );
                      })()
                    : null}
                </Row>
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
                colors={{
                  protein: proteinColor,
                  carbs: carbsColor,
                  fat: fatColor,
                }}
                trackColor={trackColor}
              />
              <View className="absolute items-center justify-center">
                <Text className="text-text-primary text-3xl font-medium">
                  {hasCalorieGoal
                    ? formatLocalizedNumber(
                        Math.max(0, Math.round(calorieGoal - calories))
                      )
                    : formatLocalizedNumber(Math.round(calories))}
                </Text>
                <Text className="text-text-secondary text-xs mt-0.5">
                  {hasCalorieGoal
                    ? t('nutrition.left', { defaultValue: 'left' })
                    : energyUnit === 'kJ'
                      ? energyUnitLabel(energyUnit, t)
                      : t('nutrition.calories', { defaultValue: 'calories' })}
                </Text>
              </View>
            </View>
            {hasCalorieGoal ? (
              <Text className="text-text-secondary text-xs font-medium mt-2 text-center">
                {formatLocalizedNumber(Math.round(calories))} /{' '}
                {formatLocalizedNumber(Math.round(calorieGoal))}{' '}
                {energyUnitLabel(energyUnit, t)}
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
                <Text className="text-text-secondary text-sm flex-1">
                  {macro.label}
                </Text>
                <Text className="text-text-primary text-sm font-medium">
                  {formatLocalizedNumber(Math.round(macro.value))}g
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
