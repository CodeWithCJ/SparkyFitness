import {
  Canvas,
  DashPathEffect,
  Line as SkiaLine,
  Rect,
} from '@shopify/react-native-skia';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { getNutrientLabel } from '../constants/nutrients';
import { formatLocalizedNumber } from '../localization/i18n';
import type {
  CaloriesDataPoint,
  HealthTrendDateRange,
} from '../types/healthTrends';
import ChartTouchOverlay, {
  EMPTY_CHART_TOUCH_LAYOUT,
  type ChartTouchLayout,
} from './ChartTouchOverlay';
import {
  CHART_LABEL_FONT_SIZE,
  computeNiceYAxisScale,
  formatChartYLabel,
  formatTooltipDate,
  formatXLabel30d90d,
  formatXLabel7d,
  useChartFont,
  measureLabelColumnWidth,
} from './charts/chartFormatting';
import {
  buildCaloriesBarLayout,
  buildCaloriesGoalSegments,
  buildCaloriesStackDays,
  resolveEffectiveMaxCalories,
  type CaloriesMacroKey,
  type CaloriesStackDay,
  type CaloriesStackSegment,
} from './charts/caloriesStackLayout';
import { StatTile, type StatLabel } from './charts/StatTile';

type CaloriesBarChartProps = {
  data: CaloriesDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: HealthTrendDateRange;
  /** Mean calories across every day in the window (#1587's "average to date"), zero-fill
   * days included since they're real zeros, not missing data. Shown as a headline tile the
   * same way Sleep shows its averages. */
  averageCalories: number | null;
  /** The resolved calorie goal for each day in `data`, same order. A day omitted or
   * `<= 0` draws no segment for that day; the whole line is omitted when none resolve. */
  goals?: (number | null)[];
};

const PLOT_HEIGHT = 150;

/**
 * Fallback label column width, used only before the real one is measured (never in practice,
 * since `computeNiceYAxisScale` always resolves at least one tick). The real width is measured
 * against the axis font every render, matching `SleepTimelineChart`'s y-axis column, so a
 * narrow value like "500" isn't padded out to the width a flat guess sized for "2,500" would
 * leave to its left.
 */
const FALLBACK_LABEL_COLUMN_WIDTH = 44;

/** Wide enough for `formatXLabel30d90d`'s "Aug 28" without truncating. */
const X_LABEL_WIDTH = 56;

const INNER_PADDING: Record<HealthTrendDateRange, number> = {
  '7d': 0.3,
  '30d': 0.2,
  '90d': 0.1,
};

const X_TICK_COUNT: Record<HealthTrendDateRange, number> = {
  '7d': 7,
  '30d': 6,
  '90d': 5,
};

/** Matches `TrendGoalLine`'s look, the dashed reference line Weight/Hydration draw. */
const GOAL_LINE_STROKE_WIDTH = 1.5;
const GOAL_LINE_DASH_INTERVALS = [6, 4];

const MACRO_COLOR_VARIABLES: Record<CaloriesMacroKey, string> = {
  protein: '--color-macro-protein',
  carbs: '--color-macro-carbs',
  fat: '--color-macro-fat',
  // Reuses the general calories color rather than a dedicated macro one: `other` isn't a
  // macro, it's "logged calories with nothing to break down" (e.g. a calories-only quick
  // add or alcohol).
  other: '--color-calories',
};

/** Matches the fixed stacking order in `caloriesStackLayout.ts`'s `MACRO_SEGMENT_ORDER`,
 * with `other` last for whatever leftover calories the macros don't account for. */
const MACRO_ORDER: CaloriesMacroKey[] = ['carbs', 'fat', 'protein', 'other'];

const DEFAULT_TOOLTIP = '';

/** `getNutrientLabel` covers the three real macros; `other` is chart-specific, not a
 * nutrient, so it isn't a case there. */
const getCaloriesSegmentLabel = (
  t: ReturnType<typeof useTranslation>['t'],
  macro: CaloriesMacroKey
): string =>
  macro === 'other'
    ? t('charts.calories.otherMacro', { defaultValue: 'Other' })
    : getNutrientLabel(t, macro);

/**
 * Builds the tooltip copy from the selected day's total and date, plus the pressed macro's
 * share of that total when the long press landed on a specific stacked segment. Derived
 * from the current `t` translator on every render so an already-visible tooltip cannot
 * retain stale copy after a language switch.
 */
export const buildCaloriesTooltipText = (
  day: CaloriesStackDay | undefined,
  selectedSegment: CaloriesStackSegment | undefined,
  t: ReturnType<typeof useTranslation>['t']
): string => {
  if (!day) return DEFAULT_TOOLTIP;
  const formattedCount = formatLocalizedNumber(Math.round(day.totalCalories));
  const totalPart = t('charts.calories.tooltip', {
    formattedCount,
    defaultValue: '{{formattedCount}} kcal consumed',
  });
  const datePart = formatTooltipDate(day.day);

  if (!selectedSegment || day.totalCalories <= 0) {
    return `${totalPart} · ${datePart}`;
  }

  const percent = Math.round(
    (selectedSegment.calories / day.totalCalories) * 100
  );
  const macroPart = t('charts.calories.tooltipMacro', {
    percent,
    macroLabel: getCaloriesSegmentLabel(t, selectedSegment.macro),
    defaultValue: '{{percent}}% {{macroLabel}}',
  });

  return `${totalPart} · ${macroPart} · ${datePart}`;
};

/**
 * The headline tile: the window's average to date, matching Sleep's always-on averages
 * rather than the #1587 request's literal extra bar -- selecting a day already gets its own
 * figure in the tooltip below, so a second place for the same number would be redundant.
 *
 * Derived from `t` on every render rather than memoised, so a language switch is reflected
 * in already-visible copy immediately.
 */
export const buildCaloriesAverageLabel = (
  averageCalories: number | null,
  t: ReturnType<typeof useTranslation>['t']
): StatLabel => ({
  // Just "Avg", not "Avg calories": Sleep's two tiles need "time in bed" vs. "time asleep"
  // to tell them apart, but this card only ever has the one stat.
  title: t('charts.calories.avgCalories', { defaultValue: 'Avg' }),
  value:
    averageCalories == null
      ? t('charts.calories.noAverage', { defaultValue: '—' })
      : t('charts.calories.avgCaloriesValue', {
          formattedCount: formatLocalizedNumber(Math.round(averageCalories)),
          defaultValue: '{{formattedCount}} kcal',
        }),
});

/** Evenly spaced day indices, so 90 columns do not print 90 overlapping labels. */
const buildXLabelIndices = (dayCount: number, tickCount: number): number[] => {
  if (dayCount <= tickCount) {
    return Array.from({ length: dayCount }, (_, index) => index);
  }

  const step = (dayCount - 1) / (tickCount - 1);
  return Array.from({ length: tickCount }, (_, index) =>
    Math.round(index * step)
  );
};

/**
 * The Dashboard calories trend: one stacked bar per day, carbs/fat/protein segments in that
 * fixed order from the bottom up, plus a reference line at the user's daily calorie goal.
 *
 * Structurally modeled on `SleepTimelineChart.tsx` rather than the Victory-based
 * `TrendBarChart` the other bar trends use -- Skia draws its own stacked columns here.
 */
const CaloriesBarChart: React.FC<CaloriesBarChartProps> = ({
  data,
  isLoading,
  isError,
  range,
  averageCalories,
  goals,
}) => {
  const { t } = useTranslation();
  const axisFont = useChartFont(CHART_LABEL_FONT_SIZE);
  const averageLabel = buildCaloriesAverageLabel(averageCalories, t);
  const [plotWidth, setPlotWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedPointY, setSelectedPointY] = useState<number | null>(null);

  const [proteinColor, carbsColor, fatColor, otherColor, textMuted] =
    useCSSVariable([
      MACRO_COLOR_VARIABLES.protein,
      MACRO_COLOR_VARIABLES.carbs,
      MACRO_COLOR_VARIABLES.fat,
      MACRO_COLOR_VARIABLES.other,
      '--color-text-muted',
    ]) as [string, string, string, string, string];

  const macroColors: Record<CaloriesMacroKey, string> = {
    protein: proteinColor,
    carbs: carbsColor,
    fat: fatColor,
    other: otherColor,
  };

  const days = useMemo(() => buildCaloriesStackDays(data), [data]);

  const hasData = useMemo(
    () => days.some((day) => day.totalCalories > 0),
    [days]
  );

  // A nice round scale, not just an auto-fit one, so the axis reads in whole steps instead
  // of whatever fraction the data or the goal happens to fall on -- the same y-axis math
  // `TrendBarChart` uses for Steps/Hydration.
  const yAxisScale = useMemo(() => {
    const dataMax = Math.max(0, ...days.map((day) => day.totalCalories));
    const effectiveMax = resolveEffectiveMaxCalories(dataMax, goals ?? []);
    return computeNiceYAxisScale(0, effectiveMax);
  }, [days, goals]);
  const maxCalories = yAxisScale.max;

  const yAxisLabelWidth = useMemo(
    () =>
      measureLabelColumnWidth(
        yAxisScale.tickValues.map(formatChartYLabel),
        (text) => axisFont.getTextWidth(text),
        FALLBACK_LABEL_COLUMN_WIDTH
      ),
    [yAxisScale.tickValues, axisFont]
  );

  const columns = useMemo(
    () =>
      buildCaloriesBarLayout(days, {
        width: plotWidth,
        height: PLOT_HEIGHT,
        innerPadding: INNER_PADDING[range],
        maxCalories,
      }),
    [days, plotWidth, range, maxCalories]
  );

  const xLabelIndices = useMemo(
    () => buildXLabelIndices(days.length, X_TICK_COUNT[range]),
    [days.length, range]
  );

  const legendMacros = useMemo(
    () =>
      MACRO_ORDER.filter((macro) =>
        days.some((day) =>
          day.segments.some((segment) => segment.macro === macro)
        )
      ),
    [days]
  );

  // Reset a lingering selection when the dataset or range changes. Done during render
  // (instead of in an effect) so the tooltip is already cleared on the first render after
  // the data changes.
  const [selectionResetKey, setSelectionResetKey] = useState({ data, range });
  if (selectionResetKey.data !== data || selectionResetKey.range !== range) {
    setSelectionResetKey({ data, range });
    setSelectedIndex(null);
    setSelectedPointY(null);
  }

  const selectedDay = selectedIndex != null ? days[selectedIndex] : undefined;

  // Which stacked segment the long press landed on, by matching the touch's y position
  // against that day's blocks -- `blocks` and `segments` share index order, both built
  // from the same day in `buildCaloriesBarLayout`/`buildCaloriesStackDays`.
  const selectedSegment = useMemo(() => {
    if (selectedIndex == null || selectedPointY == null) return undefined;
    const column = columns[selectedIndex];
    if (!column) return undefined;
    const blockIndex = column.blocks.findIndex(
      (block) =>
        selectedPointY >= block.y && selectedPointY <= block.y + block.height
    );
    if (blockIndex < 0) return undefined;
    return days[selectedIndex]?.segments[blockIndex];
  }, [selectedIndex, selectedPointY, columns, days]);

  const tooltipText = buildCaloriesTooltipText(selectedDay, selectedSegment, t);

  const touchLayout: ChartTouchLayout = useMemo(() => {
    if (plotWidth <= 0 || columns.length === 0) return EMPTY_CHART_TOUCH_LAYOUT;

    return {
      chartBounds: { left: 0, right: plotWidth, top: 0, bottom: PLOT_HEIGHT },
      points: columns.map((column) => ({
        x: column.x + column.width / 2,
        xValue: days[column.dayIndex].day,
        y: 0,
        yValue: 0,
      })),
    };
  }, [columns, plotWidth, days]);

  const handleSelectColumn = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const handlePointMove = useCallback((point: { y: number }) => {
    setSelectedPointY(point.y);
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIndex(null);
    setSelectedPointY(null);
  }, []);

  const goalSegments = useMemo(
    () =>
      buildCaloriesGoalSegments(
        columns,
        goals ?? [],
        maxCalories,
        plotWidth,
        PLOT_HEIGHT
      ),
    [columns, goals, maxCalories, plotWidth]
  );

  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;

  const renderPlaceholder = (message: string) => (
    <View className="h-50 justify-center items-center">
      <Text className="text-text-muted text-sm">{message}</Text>
    </View>
  );

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">
        {t('charts.calories.title', { defaultValue: 'Calories' })}
      </Text>

      <View className="flex-row mb-1">
        <StatTile label={averageLabel} testID="calories-stat-average" />
      </View>

      <View className="h-6 justify-center mt-3 mb-1">
        <Text className="text-text-secondary text-sm text-center">
          {tooltipText}
        </Text>
      </View>

      {isLoading ? (
        renderPlaceholder(t('common.loading', { defaultValue: 'Loading...' }))
      ) : isError ? (
        renderPlaceholder(
          t('charts.calories.loadFailed', {
            defaultValue: 'Failed to load calorie data',
          })
        )
      ) : !hasData ? (
        renderPlaceholder(
          t('charts.calories.empty', {
            defaultValue: 'No calorie data for this period',
          })
        )
      ) : (
        <>
          <View className="flex-row">
            <View style={{ width: yAxisLabelWidth, height: PLOT_HEIGHT }}>
              {yAxisScale.tickValues.map((tick) => (
                <Text
                  key={tick}
                  className="text-text-muted absolute right-0"
                  numberOfLines={1}
                  allowFontScaling={false}
                  style={{
                    top: PLOT_HEIGHT - (tick / maxCalories) * PLOT_HEIGHT - 7,
                    fontSize: CHART_LABEL_FONT_SIZE,
                  }}
                >
                  {formatChartYLabel(tick)}
                </Text>
              ))}
            </View>

            <View
              className="flex-1"
              style={{ height: PLOT_HEIGHT }}
              onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
            >
              <Canvas style={{ flex: 1 }}>
                {columns.flatMap((column) =>
                  column.blocks.map((block, blockIndex) => (
                    <Rect
                      key={`${column.dayIndex}-${blockIndex}`}
                      x={column.x}
                      y={block.y}
                      width={column.width}
                      height={block.height}
                      color={macroColors[block.macro]}
                    />
                  ))
                )}
                {goalSegments?.map((segment, index) => (
                  <SkiaLine
                    key={index}
                    p1={segment.p1}
                    p2={segment.p2}
                    color={textMuted}
                    strokeWidth={GOAL_LINE_STROKE_WIDTH}
                  >
                    <DashPathEffect intervals={GOAL_LINE_DASH_INTERVALS} />
                  </SkiaLine>
                ))}
              </Canvas>

              <ChartTouchOverlay
                layout={touchLayout}
                onSelect={handleSelectColumn}
                onClear={handleClearSelection}
                onPointMove={handlePointMove}
                testIDPrefix="calories-touch-overlay"
              />
            </View>
          </View>

          <View
            className="flex-row"
            style={{ marginLeft: yAxisLabelWidth, height: 16 }}
          >
            {xLabelIndices.map((dayIndex) => {
              const column = columns[dayIndex];
              if (!column) return null;

              return (
                <Text
                  key={days[dayIndex].day}
                  className="text-text-muted absolute"
                  numberOfLines={1}
                  allowFontScaling={false}
                  style={{
                    left: column.x + column.width / 2 - X_LABEL_WIDTH / 2,
                    width: X_LABEL_WIDTH,
                    textAlign: 'center',
                    fontSize: CHART_LABEL_FONT_SIZE,
                  }}
                >
                  {formatXLabel(days[dayIndex].day)}
                </Text>
              );
            })}
          </View>

          {legendMacros.length > 0 ? (
            <View
              className="flex-row flex-wrap justify-center items-center mt-1"
              testID="calories-macro-legend"
            >
              {legendMacros.map((macro) => (
                <View key={macro} className="flex-row items-center mx-2">
                  <View
                    className="w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: macroColors[macro] }}
                  />
                  <Text className="text-text-muted text-xs">
                    {getCaloriesSegmentLabel(t, macro)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
};

export default CaloriesBarChart;
