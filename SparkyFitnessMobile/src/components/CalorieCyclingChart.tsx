import React, { useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import {
  CALORIE_CYCLING_MAX_OFFSET,
  type CalorieCyclingMode,
  type CycledDay,
  type EnergyUnit,
} from '@workspace/shared';
import Icon from './Icon';
import { formatEnergyNumber } from '../utils/energyUnit';
import { fireSelectionHaptic } from '../services/haptics';
import { getAppLocale } from '../localization/i18n';

/** Dragging the full chart height moves a day this many percentage points. */
const DRAG_RANGE_POINTS = CALORIE_CYCLING_MAX_OFFSET * 2;
const PLOT_HEIGHT = 190;

export const clampCyclingOffset = (value: number) =>
  Math.max(
    -CALORIE_CYCLING_MAX_OFFSET,
    Math.min(CALORIE_CYCLING_MAX_OFFSET, Math.round(value))
  );

const cyclingChangeClass = (delta: number) =>
  delta > 0
    ? 'text-text-success'
    : delta < 0
      ? 'text-text-warning'
      : 'text-text-secondary';

/** Bar fills: the same green and amber as the web chart, in every theme. */
const barFillClass = (delta: number) =>
  delta > 0 ? 'bg-emerald-500/70' : delta < 0 ? 'bg-amber-400/70' : 'bg-border';

/** A signed whole percent in the app locale, e.g. "+15%" or "+%15". */
export const formatCyclingPercent = (percent: number) =>
  new Intl.NumberFormat(getAppLocale(), {
    style: 'percent',
    signDisplay: 'exceptZero',
    maximumFractionDigits: 0,
  }).format(percent / 100);

export const signedCyclingAmount = (delta: number, amount: string) =>
  `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${amount}`;

interface CalorieCyclingChartProps {
  mode: CalorieCyclingMode;
  week: CycledDay[];
  offsets: number[];
  trainingDays: number[];
  weekOrder: number[];
  baseTarget: number;
  floor: number | null;
  selectedDay: number;
  todayWeekday: number;
  energyUnit: EnergyUnit;
  dayName: (day: number) => string;
  onSelectDay: (day: number) => void;
  onToggleTraining: (day: number) => void;
  /** While a bar is dragged; null when the drag ends. */
  onDraftOffsets: (offsets: number[] | null) => void;
  /** Saves a day's percentage (a finished drag or an accessibility action). */
  onCommitOffset: (day: number, value: number) => void;
}

/**
 * The week as bars around the daily target. Tapping a bar selects that day.
 * In Custom each bar has a grab handle on top: dragging it changes the day
 * (relative to where the drag began) and saves once the finger lifts, while
 * the rest of the bar only selects, so the screen still scrolls. In Training
 * vs rest the day under a bar switches it.
 */
// Baseline offsets captured per day when a drag begins, so multi-touch Android
// drags stay independent and draft re-renders do not compound translation.
const dragBaselines = new Map<number, number>();

const CalorieCyclingChart: React.FC<CalorieCyclingChartProps> = ({
  mode,
  week,
  offsets,
  trainingDays,
  weekOrder,
  baseTarget,
  floor,
  selectedDay,
  todayWeekday,
  energyUnit,
  dayName,
  onSelectDay,
  onToggleTraining,
  onDraftOffsets,
  onCommitOffset,
}) => {
  const { t } = useTranslation();
  const [accent, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
  ]) as [string, string];
  const [plotHeight, setPlotHeight] = useState(PLOT_HEIGHT);
  const [draggingDay, setDraggingDay] = useState<number | null>(null);

  const values = [
    baseTarget,
    ...week.map((day) => day.target),
    ...(floor !== null ? [floor] : []),
  ];
  const high = Math.max(...values) * 1.05;
  const low = Math.max(0, Math.min(...values) * 0.75);
  const heightOf = (value: number) =>
    Math.max(8, ((value - low) / (high - low || 1)) * 100);
  const floorShown = floor !== null && floor > low && floor < high;

  const handleGesture = (day: number) => {
    // The offsets here follow the draft while dragging, so each day's start
    // is captured per gesture; reading it from props would add the cumulative
    // translation onto an already moved value.
    const valueAt = (translationY: number) => {
      const baseline = dragBaselines.get(day) ?? offsets[day] ?? 0;
      return clampCyclingOffset(
        baseline + (-translationY / plotHeight) * DRAG_RANGE_POINTS
      );
    };
    return Gesture.Pan()
      .runOnJS(true)
      .activeOffsetY([-3, 3])
      .onStart(() => {
        dragBaselines.set(day, offsets[day] ?? 0);
        onSelectDay(day);
        setDraggingDay(day);
      })
      .onUpdate((event) => {
        const next = valueAt(event.translationY);
        if (next !== offsets[day]) {
          fireSelectionHaptic();
          onDraftOffsets(
            offsets.map((offset, index) => (index === day ? next : offset))
          );
        }
      })
      .onEnd((event) => {
        const baseline = dragBaselines.get(day) ?? offsets[day] ?? 0;
        const value = valueAt(event.translationY);
        if (value !== baseline) onCommitOffset(day, value);
        dragBaselines.delete(day);
      })
      .onFinalize(() => {
        dragBaselines.delete(day);
        setDraggingDay(null);
        onDraftOffsets(null);
      });
  };

  return (
    <View testID="calorie-cycling-chart" className="mt-4">
      <View className="flex-row flex-wrap items-center justify-end mb-1">
        <View className="flex-row items-center">
          <View className="w-4 border-t border-dashed border-text-secondary mr-1" />
          <Text className="text-[11px] text-text-secondary">
            {t('calorieSettings.cycling.chartTarget', {
              defaultValue: 'Daily target {{value}}',
              value: formatEnergyNumber(baseTarget, energyUnit),
            })}
          </Text>
        </View>
        {floorShown && floor !== null && (
          <View className="flex-row items-center ml-3">
            <View className="w-4 border-t border-dotted border-text-danger-subtle mr-1" />
            <Text className="text-[11px] text-text-danger-subtle">
              {t('calorieSettings.cycling.chartFloor', {
                defaultValue: 'Safety floor {{value}}',
                value: formatEnergyNumber(floor, energyUnit),
              })}
            </Text>
          </View>
        )}
      </View>

      <View
        style={{ height: PLOT_HEIGHT }}
        onLayout={(event: LayoutChangeEvent) =>
          setPlotHeight(event.nativeEvent.layout.height || PLOT_HEIGHT)
        }
      >
        <View
          pointerEvents="none"
          className="absolute left-0 right-0 border-t border-dashed border-text-secondary"
          style={{ bottom: `${heightOf(baseTarget)}%`, opacity: 0.5 }}
        />
        {floorShown && floor !== null && (
          <View
            pointerEvents="none"
            className="absolute left-0 right-0 border-t border-dotted border-text-danger-subtle"
            style={{ bottom: `${heightOf(floor)}%`, opacity: 0.6 }}
          />
        )}
        <View className="absolute inset-0 flex-row items-end">
          {weekOrder.map((day) => {
            const cycled = week[day];
            if (!cycled) return <View key={day} className="flex-1" />;
            const selected = day === selectedDay;
            const dragging = day === draggingDay;
            const change = signedCyclingAmount(
              cycled.delta,
              formatEnergyNumber(Math.abs(cycled.delta), energyUnit)
            );
            const offset = offsets[day] ?? 0;
            return (
              <Pressable
                key={day}
                onPress={() => onSelectDay(day)}
                className="flex-1 h-full justify-end px-0.5"
                accessibilityRole={mode === 'custom' ? 'adjustable' : 'button'}
                accessibilityLabel={t('calorieSettings.cycling.chartBarLabel', {
                  defaultValue: '{{day}}: {{target}}, {{change}}',
                  day: dayName(day),
                  target: formatEnergyNumber(cycled.target, energyUnit),
                  change,
                })}
                accessibilityState={{ selected }}
                accessibilityActions={
                  mode === 'custom'
                    ? [{ name: 'increment' }, { name: 'decrement' }]
                    : undefined
                }
                onAccessibilityAction={(event) => {
                  const step =
                    event.nativeEvent.actionName === 'increment' ? 1 : -1;
                  onSelectDay(day);
                  onCommitOffset(day, clampCyclingOffset(offset + step));
                }}
                testID={`calorie-cycling-bar-${day}`}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  className={`text-center text-[11px] font-semibold mb-0.5 ${
                    dragging
                      ? 'text-text-primary'
                      : cyclingChangeClass(cycled.delta)
                  }`}
                >
                  {dragging ? formatCyclingPercent(offset) : change}
                </Text>
                <View
                  className="rounded-t-xl p-[2px]"
                  style={{
                    height: `${heightOf(cycled.target)}%`,
                    borderWidth: 2,
                    borderBottomWidth: 0,
                    borderColor: selected ? accent : 'transparent',
                  }}
                >
                  <View
                    className={`flex-1 rounded-t-lg items-center justify-between pb-1 ${barFillClass(cycled.delta)}`}
                  >
                    {mode === 'custom' ? (
                      <GestureDetector gesture={handleGesture(day)}>
                        <View
                          className="w-full items-center pt-1.5 pb-2"
                          hitSlop={{ top: 12, left: 4, right: 4 }}
                          testID={`calorie-cycling-handle-${day}`}
                        >
                          <View className="w-5 h-1 rounded-full bg-text-primary/40" />
                        </View>
                      </GestureDetector>
                    ) : (
                      <View />
                    )}
                    <View className="items-center w-full px-0.5">
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                        className="text-[11px] font-semibold text-text-primary"
                      >
                        {formatEnergyNumber(cycled.target, energyUnit)}
                      </Text>
                      {cycled.clampedToFloor && (
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          className="text-[9px] text-text-danger-subtle"
                        >
                          {t('calorieSettings.cycling.atFloorShort', {
                            defaultValue: 'floor',
                          })}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="flex-row mt-1.5">
        {weekOrder.map((day) => {
          const training =
            mode === 'training_rest'
              ? trainingDays.includes(day)
              : (week[day]?.delta ?? 0) > 0;
          const name = dayName(day);
          const isSelected = day === selectedDay;
          const content = (
            <>
              <Icon
                name={training ? 'cycling-training' : 'cycling-rest'}
                size={15}
                color={isSelected ? accent : textSecondary}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                className={`text-xs mt-0.5 ${
                  isSelected
                    ? 'text-text-primary font-semibold'
                    : 'text-text-secondary'
                }`}
              >
                {name.slice(0, 3)}
              </Text>
              <View
                className="w-1 h-1 rounded-full mt-0.5"
                style={{
                  backgroundColor:
                    day === todayWeekday ? accent : 'transparent',
                }}
              />
            </>
          );
          return mode === 'training_rest' ? (
            <Pressable
              key={day}
              className={`flex-1 items-center py-1 mx-0.5 rounded-lg ${
                training ? 'bg-emerald-500/15' : ''
              }`}
              onPress={() => {
                onSelectDay(day);
                onToggleTraining(day);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: training }}
              accessibilityLabel={
                training
                  ? t('calorieSettings.cycling.markRest', {
                      defaultValue: 'Make {{day}} a rest day',
                      day: name,
                    })
                  : t('calorieSettings.cycling.markTraining', {
                      defaultValue: 'Make {{day}} a training day',
                      day: name,
                    })
              }
              testID={`calorie-cycling-toggle-${day}`}
            >
              {content}
            </Pressable>
          ) : (
            <View key={day} className="flex-1 items-center py-1">
              {content}
            </View>
          );
        })}
      </View>
      <Text className="text-text-secondary text-xs text-center mt-1">
        {mode === 'training_rest'
          ? t('calorieSettings.cycling.chartHintTrainingShort', {
              defaultValue:
                'Tap a bar to see that day. Tap a day below to switch training and rest.',
            })
          : t('calorieSettings.cycling.chartHintCustomHandle', {
              defaultValue:
                'Tap a bar to see that day. Drag the handle on top of a bar to change it.',
            })}
      </Text>
    </View>
  );
};

export default CalorieCyclingChart;
