import React, { useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import {
  CALORIE_CYCLING_MAX_OFFSET,
  cycleWeekTargets,
  trainingRestFromOffsets,
  trainingRestOffsets,
  type CalorieCyclingMode,
  type EnergyUnit,
} from '@workspace/shared';
import SegmentedControl from './SegmentedControl';
import FormInput from './FormInput';
import Icon from './Icon';
import CalorieCyclingChart, {
  clampCyclingOffset,
  formatCyclingPercent,
  signedCyclingAmount,
} from './CalorieCyclingChart';
import { getAppLocale } from '../localization/i18n';
import { localizedWeekdayLabels } from '../utils/medicationScheduleLocalization';
import { energyUnitLabel, formatEnergyNumber } from '../utils/energyUnit';

/** Mon, Wed and Fri at +15%: where training vs rest starts. */
const DEFAULT_TRAINING_DAYS = [1, 3, 5];
const DEFAULT_TRAINING_PERCENT = 15;

function areOffsetsEqual(a: number[] | null, b: number[] | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

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
  /** Today's weekday in the profile zone, 0 = Sunday. */
  todayWeekday: number;
  energyUnit: EnergyUnit;
  /** The summary carries the server's cycling base and floor for today. */
  previewReady: boolean;
}

/**
 * Whether the app locale writes the percent sign first (e.g. Turkish "%15").
 * Reads the formatted string rather than `formatToParts`, which Hermes does
 * not implement for `Intl.NumberFormat` on iOS.
 */
export const percentSignFirst = (locale: string = getAppLocale()) => {
  const text = new Intl.NumberFormat(locale, { style: 'percent' }).format(0.15);
  const sign = text.search(/[%٪﹪％]/);
  const number = text.search(/\p{Nd}/u);
  return sign !== -1 && number !== -1 && sign < number;
};

/** A whole percentage with − and + buttons and a box to type it. */
const PercentField = ({
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
}) => {
  const { t } = useTranslation();
  const iconColor = String(useCSSVariable('--color-text-primary'));
  const percentFirst = percentSignFirst();
  const [text, setText] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setText(String(value));
  }
  const commit = (next: number) => {
    const clamped = Math.max(min, clampCyclingOffset(next));
    // An out-of-range entry that clamps to the current value would not
    // change `value`, so the box is put right here too.
    setText(String(clamped));
    onChange(clamped);
  };
  const percentSign = (
    <Text
      className={`text-text-secondary text-sm ${percentFirst ? 'ml-1.5' : 'mr-1.5'}`}
    >
      %
    </Text>
  );
  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        onPress={() => commit(value - 1)}
        disabled={value <= min}
        accessibilityRole="button"
        accessibilityLabel={t('calorieSettings.cycling.decrease', {
          defaultValue: 'Lower by 1%',
        })}
        hitSlop={8}
        className="w-9 h-9 rounded-full bg-raised items-center justify-center"
        style={{ opacity: value <= min ? 0.4 : 1 }}
        testID={`${testID}-down`}
      >
        <Icon name="remove" size={16} color={iconColor} />
      </Pressable>
      {percentFirst && percentSign}
      <View className="w-16 mx-1.5">
        <FormInput
          value={text}
          onChangeText={setText}
          onEndEditing={() => {
            const parsed = Number.parseInt(text, 10);
            if (Number.isFinite(parsed)) commit(parsed);
            else setText(String(value));
          }}
          keyboardType={
            Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'
          }
          returnKeyType="done"
          maxLength={3}
          textAlign="center"
          accessibilityLabel={label}
          testID={`${testID}-input`}
        />
      </View>
      {!percentFirst && percentSign}
      <Pressable
        onPress={() => commit(value + 1)}
        disabled={value >= CALORIE_CYCLING_MAX_OFFSET}
        accessibilityRole="button"
        accessibilityLabel={t('calorieSettings.cycling.increase', {
          defaultValue: 'Raise by 1%',
        })}
        hitSlop={8}
        className="w-9 h-9 rounded-full bg-raised items-center justify-center"
        style={{ opacity: value >= CALORIE_CYCLING_MAX_OFFSET ? 0.4 : 1 }}
        testID={`${testID}-up`}
      >
        <Icon name="add" size={16} color={iconColor} />
      </Pressable>
    </View>
  );
};

const CalorieCyclingCard: React.FC<CalorieCyclingCardProps> = ({
  mode,
  offsets,
  onSave,
  available,
  pausedByWeeklyPlan,
  baseTarget,
  floor,
  firstDayOfWeek,
  todayWeekday,
  energyUnit,
  previewReady,
}) => {
  const { t } = useTranslation();
  // Today until a day is picked, so a profile day that loads later still
  // moves the default selection.
  const [pickedDay, setSelectedDay] = useState<number | null>(null);
  const selectedDay = pickedDay ?? todayWeekday;
  // Offsets while a bar is being dragged; saved once the finger lifts.
  const [draftOffsets, setDraftOffsets] = useState<number[] | null>(null);
  const shownOffsets = draftOffsets ?? offsets;
  // The last custom pattern this visit, so Custom days can bring it back.
  const [lastCustomOffsets, setLastCustomOffsets] = useState<number[] | null>(
    null
  );
  const [lastSeenOffsets, setLastSeenOffsets] = useState(offsets);
  if (!areOffsetsEqual(lastSeenOffsets, offsets)) {
    setLastSeenOffsets(offsets);
    // If newer saved offsets arrive while not in training_rest, discard the
    // cached pattern so it does not overwrite them.
    if (mode !== 'training_rest') {
      setLastCustomOffsets(null);
    }
  }
  const weekdayNames = localizedWeekdayLabels(t);
  // A stored first day outside 0-6 would drop a weekday from the chart.
  const weekStart =
    Number.isInteger(firstDayOfWeek) &&
    firstDayOfWeek >= 0 &&
    firstDayOfWeek <= 6
      ? firstDayOfWeek
      : 0;
  const weekOrder = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);
  const { trainingDays, percent } = trainingRestFromOffsets(offsets);
  const unit = energyUnitLabel(energyUnit, t);
  const week = cycleWeekTargets({
    baseTarget,
    offsets: mode === 'off' ? null : shownOffsets,
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

  // The week's numbers wait for a cycling-aware summary (an older cached
  // one has no floor); the day controls below do not.
  const showResults =
    mode !== 'off' &&
    useful &&
    previewReady &&
    baseTarget > 0 &&
    !atOrBelowFloor;
  // The chart stays up while a pattern is edited, even when it changes
  // nothing yet or the target sits on the floor, so days can still be set.
  const showChart = mode !== 'off' && baseTarget > 0;
  const selectedCycled = week[selectedDay];
  const selectedIsTraining =
    mode === 'training_rest'
      ? trainingDays.includes(selectedDay)
      : (selectedCycled?.delta ?? 0) > 0;
  const setDayOffset = (day: number, value: number) =>
    onSave({
      mode,
      offsets: offsets.map((offset, index) =>
        index === day ? clampCyclingOffset(value) : offset
      ),
    });

  const applyMode = (next: CalorieCyclingMode) => {
    // Leaving Custom (for Off too, since Training / rest may follow) keeps
    // the latest custom pattern so switching back restores it.
    if (mode === 'custom') setLastCustomOffsets(offsets);
    if (next === 'off') {
      onSave({ mode: next, offsets });
      return;
    }
    if (next === 'custom' && lastCustomOffsets) {
      onSave({ mode: next, offsets: lastCustomOffsets });
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

  const selectMode = (next: CalorieCyclingMode) => {
    if (next === mode) return;
    // Training / rest rewrites the offsets; a custom pattern it can't express
    // would be lost once this screen closes, so ask first.
    // Off keeps the stored offsets, so a custom pattern can sit under it.
    const replacesCustom =
      (mode === 'custom' || mode === 'off') &&
      next === 'training_rest' &&
      offsets.some((offset) => offset !== 0) &&
      trainingRestOffsets(trainingDays, percent).some(
        (offset, index) => offset !== offsets[index]
      );
    if (!replacesCustom) {
      applyMode(next);
      return;
    }
    Alert.alert(
      t('calorieSettings.cycling.replaceCustomTitle', {
        defaultValue: 'Replace your custom days?',
      }),
      t('calorieSettings.cycling.replaceCustomMessage', {
        defaultValue:
          'Training / rest sets every day from the training days and one percentage, so your custom percentages are replaced.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('calorieSettings.cycling.replaceCustomConfirm', {
            defaultValue: 'Replace',
          }),
          style: 'destructive',
          onPress: () => applyMode(next),
        },
      ]
    );
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
                label: t('calorieSettings.cycling.trainingRestShort', {
                  defaultValue: 'Training / rest',
                }),
              },
              {
                key: 'custom',
                label: t('calorieSettings.cycling.customShort', {
                  defaultValue: 'Custom',
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

          {mode !== 'off' && !(baseTarget > 0) && (
            <Text
              className="text-text-secondary text-sm mt-3"
              testID="calorie-cycling-waiting"
            >
              {t('calorieSettings.cycling.waitingForTarget', {
                defaultValue:
                  "Your days show here once today's calorie target has loaded.",
              })}
            </Text>
          )}
          {showChart && (
            <CalorieCyclingChart
              mode={mode}
              week={week}
              offsets={shownOffsets}
              trainingDays={trainingDays}
              weekOrder={weekOrder}
              baseTarget={baseTarget}
              floor={floor}
              selectedDay={selectedDay}
              todayWeekday={todayWeekday}
              energyUnit={energyUnit}
              dayName={(day) => weekdayNames[day] ?? ''}
              onSelectDay={setSelectedDay}
              onToggleTraining={toggleTrainingDay}
              onDraftOffsets={setDraftOffsets}
              onCommitOffset={setDayOffset}
            />
          )}

          {showChart && selectedCycled && (
            <View className="mt-4 rounded-xl bg-raised p-3">
              {mode === 'custom' ? (
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-text-primary flex-1 mr-2">
                    {weekdayNames[selectedDay]}
                  </Text>
                  <PercentField
                    // One field per day: a draft typed for one day is
                    // dropped, never saved to another, when the day changes.
                    key={selectedDay}
                    value={offsets[selectedDay] ?? 0}
                    min={-CALORIE_CYCLING_MAX_OFFSET}
                    label={t('calorieSettings.cycling.dayPercent', {
                      defaultValue:
                        '{{day}}: percentage before balancing the week',
                      day: weekdayNames[selectedDay] ?? '',
                    })}
                    onChange={(value) => setDayOffset(selectedDay, value)}
                    testID="calorie-cycling-day-percent"
                  />
                </View>
              ) : (
                <>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-text-primary flex-1 mr-2">
                      {weekdayNames[selectedDay]}
                    </Text>
                    <View className="w-44">
                      <SegmentedControl
                        segments={[
                          {
                            key: 'training',
                            label: t('calorieSettings.cycling.trainingDay', {
                              defaultValue: 'Training',
                            }),
                          },
                          {
                            key: 'rest',
                            label: t('calorieSettings.cycling.restDay', {
                              defaultValue: 'Rest',
                            }),
                          },
                        ]}
                        activeKey={selectedIsTraining ? 'training' : 'rest'}
                        onSelect={(key) => {
                          if ((key === 'training') !== selectedIsTraining) {
                            toggleTrainingDay(selectedDay);
                          }
                        }}
                      />
                    </View>
                  </View>
                  <View className="flex-row items-center justify-between mt-3">
                    <Text className="text-sm text-text-primary flex-1 mr-2">
                      {t('calorieSettings.cycling.trainingPercent', {
                        defaultValue: 'Extra on training days',
                      })}
                    </Text>
                    <PercentField
                      value={percent}
                      min={1}
                      label={t('calorieSettings.cycling.trainingPercent', {
                        defaultValue: 'Extra on training days',
                      })}
                      onChange={(value) =>
                        onSave({
                          mode,
                          // At least 1%, or the training days would be lost.
                          offsets: trainingRestOffsets(
                            trainingDays,
                            Math.max(1, value)
                          ),
                        })
                      }
                      testID="calorie-cycling-percent"
                    />
                  </View>
                </>
              )}
            </View>
          )}

          {showChart && selectedCycled && (
            <View
              className="mt-3 rounded-xl bg-raised p-4"
              testID="calorie-cycling-day-card"
            >
              <Text className="text-text-secondary text-xs font-semibold uppercase">
                {selectedDay === todayWeekday
                  ? t('calorieSettings.cycling.today', {
                      defaultValue: 'Today',
                    })
                  : weekdayNames[selectedDay]}
                {' · '}
                {selectedIsTraining
                  ? t('calorieSettings.cycling.trainingDay', {
                      defaultValue: 'Training',
                    })
                  : t('calorieSettings.cycling.restDay', {
                      defaultValue: 'Rest',
                    })}
              </Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                className="text-accent-primary text-3xl font-bold mt-1"
              >
                {formatEnergyNumber(selectedCycled.target, energyUnit)}{' '}
                <Text className="text-base font-medium text-text-secondary">
                  {unit}
                </Text>
              </Text>
              <Text
                className={`text-sm ${
                  selectedCycled.delta > 0
                    ? 'text-text-success'
                    : selectedCycled.delta < 0
                      ? 'text-text-warning'
                      : 'text-text-secondary'
                }`}
              >
                {t('calorieSettings.cycling.vsTargetWithUnit', {
                  defaultValue:
                    '{{change}} {{unit}} ({{percent}}) vs your daily target',
                  change: signedCyclingAmount(
                    selectedCycled.delta,
                    formatEnergyNumber(
                      Math.abs(selectedCycled.delta),
                      energyUnit
                    )
                  ),
                  unit,
                  percent: formatCyclingPercent(
                    Math.round((selectedCycled.delta / baseTarget) * 100)
                  ),
                })}
              </Text>
              {selectedCycled.clampedToFloor && (
                <Text className="text-text-danger-subtle text-xs font-semibold mt-1">
                  {t('calorieSettings.cycling.atFloor', {
                    defaultValue: 'safety floor',
                  })}
                </Text>
              )}
            </View>
          )}

          {mode !== 'off' && !useful && (
            <Text className="text-sm mt-3 text-text-danger-subtle">
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
                    "Based on today's target. Carbs take the change and protein stays the same.",
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
