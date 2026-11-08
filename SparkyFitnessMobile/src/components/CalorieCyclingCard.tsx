import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  CALORIE_CYCLING_MAX_OFFSET,
  cycleWeekTargets,
  trainingRestFromOffsets,
  trainingRestOffsets,
  type CalorieCyclingMode,
  type EnergyUnit,
} from '@workspace/shared';
import SegmentedControl from './SegmentedControl';
import { localizedWeekdayLabels } from '../utils/medicationScheduleLocalization';
import { energyUnitLabel, formatEnergyNumber } from '../utils/energyUnit';

/** Mon, Wed and Fri at +15%: where training vs rest starts. */
const DEFAULT_TRAINING_DAYS = [1, 3, 5];
const DEFAULT_TRAINING_PERCENT = 15;
const STEP = 5;

interface CalorieCyclingCardProps {
  mode: CalorieCyclingMode;
  offsets: number[];
  onSave: (next: { mode: CalorieCyclingMode; offsets: number[] }) => void;
  /** False while exercise calories are added back to the goal. */
  available: boolean;
  /** True when a weekly goal plan sets today's goal. */
  pausedByWeeklyPlan: boolean;
  /** Today's target before cycling, in kcal; 0 while unknown. */
  baseTarget: number;
  floor: number | null;
  firstDayOfWeek: number;
  energyUnit: EnergyUnit;
}

const clampOffset = (value: number) =>
  Math.max(
    -CALORIE_CYCLING_MAX_OFFSET,
    Math.min(CALORIE_CYCLING_MAX_OFFSET, value)
  );

const Stepper = ({
  value,
  min,
  onChange,
  label,
  testID,
}: {
  value: number;
  min: number;
  onChange: (value: number) => void;
  label: string;
  testID: string;
}) => (
  <View className="flex-row items-center">
    <Pressable
      onPress={() => onChange(Math.max(min, value - STEP))}
      accessibilityRole="button"
      accessibilityLabel={`${label} −${STEP}%`}
      className="w-9 h-9 rounded-full bg-raised items-center justify-center"
      testID={`${testID}-down`}
    >
      <Text className="text-text-primary text-lg">−</Text>
    </Pressable>
    <Text
      className="w-14 text-center text-text-primary font-semibold"
      testID={`${testID}-value`}
    >
      {value > 0 ? `+${value}` : value}%
    </Text>
    <Pressable
      onPress={() =>
        onChange(Math.min(CALORIE_CYCLING_MAX_OFFSET, value + STEP))
      }
      accessibilityRole="button"
      accessibilityLabel={`${label} +${STEP}%`}
      className="w-9 h-9 rounded-full bg-raised items-center justify-center"
      testID={`${testID}-up`}
    >
      <Text className="text-text-primary text-lg">+</Text>
    </Pressable>
  </View>
);

const CalorieCyclingCard: React.FC<CalorieCyclingCardProps> = ({
  mode,
  offsets,
  onSave,
  available,
  pausedByWeeklyPlan,
  baseTarget,
  floor,
  firstDayOfWeek,
  energyUnit,
}) => {
  const { t } = useTranslation();
  const weekdayNames = localizedWeekdayLabels(t);
  const weekOrder = Array.from(
    { length: 7 },
    (_, i) => (firstDayOfWeek + i) % 7
  );
  const { trainingDays, percent } = trainingRestFromOffsets(offsets);
  const unit = energyUnitLabel(energyUnit, t);
  const week = cycleWeekTargets({
    baseTarget,
    offsets: mode === 'off' ? null : offsets,
    floor,
  });
  const weekTotal = week.reduce((sum, day) => sum + day.target, 0);
  // Cycling never lowers a day below the floor, so a target already at it
  // leaves every day the same; say so instead of showing a flat week.
  const atOrBelowFloor =
    floor !== null && baseTarget > 0 && baseTarget <= floor;
  const usefulTrainingPattern =
    percent > 0 && trainingDays.length > 0 && trainingDays.length < 7;
  const useful =
    mode === 'off' ||
    (mode === 'training_rest'
      ? usefulTrainingPattern
      : offsets.some((offset) => offset !== offsets[0]));

  const showResults =
    mode !== 'off' && useful && baseTarget > 0 && !atOrBelowFloor;
  const changeClass = (delta: number) =>
    delta > 0
      ? 'text-text-success'
      : delta < 0
        ? 'text-text-warning'
        : 'text-text-secondary';
  const signOf = (delta: number) => (delta > 0 ? '+' : delta < 0 ? '−' : '±');

  /** A day's cycled change, with its share of the base, beside its control. */
  const changeText = (day: number) => {
    const cycled = week[day];
    if (!cycled) return '';
    return t('calorieSettings.cycling.dayChangeWithUnit', {
      defaultValue: '{{sign}}{{amount}} {{unit}} ({{sign}}{{percent}}%)',
      sign: signOf(cycled.delta),
      amount: formatEnergyNumber(Math.abs(cycled.delta), energyUnit),
      unit,
      percent: Math.round((Math.abs(cycled.delta) / baseTarget) * 100),
    });
  };

  const selectMode = (next: CalorieCyclingMode) => {
    if (next === mode) return;
    if (next === 'off') {
      onSave({ mode: next, offsets });
      return;
    }
    if (next === 'training_rest' || offsets.every((o) => o === 0)) {
      const days = trainingDays.length ? trainingDays : DEFAULT_TRAINING_DAYS;
      const pct = percent > 0 ? percent : DEFAULT_TRAINING_PERCENT;
      onSave({ mode: next, offsets: trainingRestOffsets(days, pct) });
      return;
    }
    onSave({ mode: next, offsets });
  };

  const toggleTrainingDay = (day: number) => {
    const days = trainingDays.includes(day)
      ? trainingDays.filter((d) => d !== day)
      : [...trainingDays, day];
    onSave({
      mode,
      offsets: trainingRestOffsets(days, percent || DEFAULT_TRAINING_PERCENT),
    });
  };

  return (
    <View testID="calorie-cycling-card">
      <Text className="text-base font-semibold text-text-primary">
        {t('calorieSettings.cycling.title', {
          defaultValue: 'Calorie Cycling',
        })}
      </Text>
      <Text className="text-text-secondary text-sm mt-1 mb-3">
        {t('calorieSettings.cycling.description', {
          defaultValue:
            'Eat more on training days and less on rest days. Your weekly total stays the same: your daily target x 7.',
        })}
      </Text>

      {!available ? (
        <Text
          className="text-text-secondary text-sm"
          testID="calorie-cycling-unavailable"
        >
          {t('calorieSettings.cycling.unavailable', {
            defaultValue:
              'Not available while exercise calories are added back to your goal: your target already rises on the days you log a workout. Choose Adaptive or Fixed, or use full-day adaptive targets, to cycle calories.',
          })}
        </Text>
      ) : (
        <>
          <SegmentedControl
            segments={[
              {
                key: 'off',
                label: t('calorieSettings.cycling.off', {
                  defaultValue: 'Off',
                }),
              },
              {
                key: 'training_rest',
                label: t('calorieSettings.cycling.trainingRest', {
                  defaultValue: 'Training vs rest',
                }),
              },
              {
                key: 'custom',
                label: t('calorieSettings.cycling.customDays', {
                  defaultValue: 'Custom days',
                }),
              },
            ]}
            activeKey={mode}
            onSelect={selectMode}
          />

          {pausedByWeeklyPlan && mode !== 'off' && (
            <Text className="text-text-secondary text-sm mt-3">
              {t('calorieSettings.cycling.pausedByWeeklyPlan', {
                defaultValue:
                  'A weekly goal plan is active, so calorie cycling is paused on the days the plan sets.',
              })}
            </Text>
          )}

          {showResults && (
            <Text
              className="text-text-secondary text-sm mt-3"
              testID="calorie-cycling-base"
            >
              {t('calorieSettings.cycling.baseLineWithUnit', {
                defaultValue:
                  "Today's target before cycling: {{target}} {{unit}}. Your percentages are balanced against each other, so a day only gets more if it is above the week's average. The change under each day is what that day actually gets.",
                target: formatEnergyNumber(baseTarget, energyUnit),
                unit,
              })}
            </Text>
          )}

          {mode === 'training_rest' && (
            <View className="mt-4">
              <Text className="text-sm font-semibold text-text-primary mb-2">
                {t('calorieSettings.cycling.trainingDays', {
                  defaultValue: 'Training days',
                })}
              </Text>
              <View className="flex-row flex-wrap">
                {weekOrder.map((day) => {
                  const selected = trainingDays.includes(day);
                  const name = weekdayNames[day] ?? '';
                  const cycled = showResults ? week[day] : undefined;
                  return (
                    <View key={day} className="items-center mr-1 mb-1 w-11">
                      <Pressable
                        onPress={() => toggleTrainingDay(day)}
                        accessibilityRole="button"
                        accessibilityLabel={name}
                        accessibilityState={{ selected }}
                        className={`w-10 h-10 rounded-full items-center justify-center ${
                          selected ? 'bg-accent-primary' : 'bg-raised'
                        }`}
                        testID={`calorie-cycling-day-${day}`}
                      >
                        <Text
                          className={
                            selected ? 'text-white' : 'text-text-primary'
                          }
                        >
                          {name.slice(0, 1)}
                        </Text>
                      </Pressable>
                      {cycled && (
                        <View
                          className="items-center mt-1"
                          testID={`calorie-cycling-result-${day}`}
                        >
                          <Text className="text-xs font-semibold text-text-primary">
                            {formatEnergyNumber(cycled.target, energyUnit)}
                          </Text>
                          <Text
                            className={`text-[10px] ${changeClass(cycled.delta)}`}
                          >
                            {signOf(cycled.delta)}
                            {formatEnergyNumber(
                              Math.abs(cycled.delta),
                              energyUnit
                            )}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
              <View className="flex-row items-center justify-between mt-3">
                <Text className="text-sm text-text-primary flex-1 mr-2">
                  {t('calorieSettings.cycling.trainingPercent', {
                    defaultValue: 'Extra on training days',
                  })}
                </Text>
                <Stepper
                  value={percent}
                  min={0}
                  label={t('calorieSettings.cycling.trainingPercent', {
                    defaultValue: 'Extra on training days',
                  })}
                  onChange={(value) =>
                    onSave({
                      mode,
                      offsets: trainingRestOffsets(trainingDays, value),
                    })
                  }
                  testID="calorie-cycling-percent"
                />
              </View>
            </View>
          )}

          {mode === 'custom' && (
            <View className="mt-4">
              {weekOrder.map((day) => (
                <View
                  key={day}
                  className="flex-row items-center justify-between py-1"
                >
                  <View className="flex-1 mr-2">
                    <Text className="text-sm text-text-primary">
                      {weekdayNames[day]}
                    </Text>
                    {showResults && week[day] && (
                      <View testID={`calorie-cycling-result-${day}`}>
                        <Text className="text-xs font-semibold text-text-primary">
                          {formatEnergyNumber(week[day].target, energyUnit)}{' '}
                          {unit}
                          {week[day].clampedToFloor
                            ? ` · ${t('calorieSettings.cycling.atFloor', {
                                defaultValue: 'safety floor',
                              })}`
                            : ''}
                        </Text>
                        <Text
                          className={`text-xs ${changeClass(week[day].delta)}`}
                        >
                          {changeText(day)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Stepper
                    value={offsets[day] ?? 0}
                    min={-CALORIE_CYCLING_MAX_OFFSET}
                    label={weekdayNames[day] ?? ''}
                    onChange={(value) =>
                      onSave({
                        mode,
                        offsets: offsets.map((offset, index) =>
                          index === day ? clampOffset(value) : offset
                        ),
                      })
                    }
                    testID={`calorie-cycling-custom-${day}`}
                  />
                </View>
              ))}
            </View>
          )}

          {mode !== 'off' && !useful && (
            <Text className="text-sm mt-3" style={{ color: '#dc2626' }}>
              {mode === 'training_rest'
                ? t('calorieSettings.cycling.needTrainingDays', {
                    defaultValue:
                      'Choose between 1 and 6 training days and a percentage above 0, or every day stays the same.',
                  })
                : t('calorieSettings.cycling.needDifferentDays', {
                    defaultValue:
                      'Give at least two days different percentages, or every day stays the same.',
                  })}
            </Text>
          )}

          {mode !== 'off' && useful && atOrBelowFloor && (
            <Text
              className="text-text-secondary text-sm mt-3"
              testID="calorie-cycling-at-floor"
            >
              {t('calorieSettings.cycling.baseAtFloorWithUnit', {
                defaultValue:
                  'Your daily target ({{target}} {{unit}}) is at or below your safety floor ({{floor}} {{unit}}), so no day can go lower and every day stays the same. Cycling starts working once your target is above the floor, or with a lower custom floor.',
                target: formatEnergyNumber(baseTarget, energyUnit),
                floor: formatEnergyNumber(floor ?? 0, energyUnit),
                unit,
              })}
            </Text>
          )}

          {showResults && (
            <View className="mt-3" testID="calorie-cycling-preview">
              <Text
                className="text-sm text-text-primary font-semibold"
                testID="calorie-cycling-week-total"
              >
                {t('calorieSettings.cycling.weekTotalWithBase', {
                  defaultValue:
                    'Week: {{total}} of {{budget}} {{unit}} (your daily target {{target}} × 7)',
                  total: formatEnergyNumber(weekTotal, energyUnit),
                  budget: formatEnergyNumber(baseTarget * 7, energyUnit),
                  target: formatEnergyNumber(baseTarget, energyUnit),
                  unit,
                })}
              </Text>
              <Text className="text-text-secondary text-xs mt-1">
                {t('calorieSettings.cycling.previewNote', {
                  defaultValue:
                    "Based on today's target. Carbs take the change; protein and fat stay the same.",
                })}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
};

export default CalorieCyclingCard;
