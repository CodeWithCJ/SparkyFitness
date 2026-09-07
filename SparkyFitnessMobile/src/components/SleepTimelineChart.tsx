import { Canvas, Rect } from '@shopify/react-native-skia';
import type { TFunction } from 'i18next';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { usePreferences } from '../hooks/usePreferences';
import type {
  HealthTrendDateRange,
  HealthTrendSeries,
} from '../types/healthTrends';
import {
  SLEEP_STAGE_LANES,
  type SleepStageLane,
  type SleepTimelineDay,
  type SleepTimelineSummary,
} from '../types/sleep';
import {
  formatHourLabel,
  type EntryTimeFormat,
} from '../utils/entryTimeDisplay';
import { formatClockTime, formatSleepDuration } from '../utils/sleepDay';
import { localizeSleepStage } from '../utils/sleepLocalization';
import ChartTouchOverlay, {
  EMPTY_CHART_TOUCH_LAYOUT,
  type ChartTouchLayout,
} from './ChartTouchOverlay';
import {
  CHART_LABEL_FONT_SIZE,
  formatTooltipDate,
  formatXLabel30d90d,
  formatXLabel7d,
} from './charts/chartFormatting';
import {
  buildSleepTimelineLayout,
  chooseSleepClockAnchorMinutes,
  MINUTES_PER_DAY,
} from './charts/sleepTimelineLayout';

type SleepTimelineAggregates = Omit<SleepTimelineSummary, 'days'>;

type SleepTimelineChartProps = SleepTimelineAggregates &
  HealthTrendSeries<SleepTimelineDay> & {
    range: HealthTrendDateRange;
  };

const PLOT_HEIGHT = 150;

/**
 * Wide enough for the longest label the axis can produce, "12 AM". Dropping the ":00"
 * from the hour labels is what let this shrink from 72px — the difference goes to the
 * plot, which is the part worth the horizontal space.
 */
const TICK_LABEL_WIDTH = 44;

/** Wide enough for `formatXLabel30d90d`'s "Aug 28" without truncating. */
const X_LABEL_WIDTH = 56;

const MINUTES_PER_HOUR = 60;

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

/**
 * Stage colours, matched to the Sleep Details hypnogram's lanes so a stage is the same
 * colour everywhere in the app — see `LANE_COLOR_VARIABLES` in `Hypnogram.tsx` for why
 * these reuse the tuned `--color-cat-*` palette instead of new `--color-sleep-*` tokens.
 *
 * `other` is the one divergence: the hypnogram draws it muted grey, because there it means
 * a single unrecognized stage mid-night. Here it is overwhelmingly the "this source
 * reported no stages at all" fallback, which fills whole columns — muted grey would hand
 * those users a wall of dead grey where the old chart gave them accent-coloured bars.
 */
const STAGE_COLOR_VARIABLES: Record<SleepStageLane, string> = {
  awake: '--color-cat-orange',
  rem: '--color-cat-violet',
  light: '--color-cat-blue',
  deep: '--color-cat-teal',
  other: '--color-accent-primary',
};

export interface SleepStatLabel {
  title: string;
  value: string;
}

export interface SelectedNightLabels {
  stats: [SleepStatLabel, SleepStatLabel];
  clockRange: string | null;
}

/**
 * The two headline tiles.
 *
 * Derived from `t` on every render rather than memoised, so a language switch is reflected
 * in already-visible copy immediately.
 */
export const buildSleepAverageLabels = (
  aggregates: SleepTimelineAggregates,
  t: TFunction
): [SleepStatLabel, SleepStatLabel] => [
  {
    title: t('charts.sleep.avgTimeInBed', { defaultValue: 'Avg time in bed' }),
    value: formatSleepDuration(aggregates.averageTimeInBedSeconds, t),
  },
  {
    title: t('charts.sleep.avgTimeAsleep', { defaultValue: 'Avg time asleep' }),
    value: formatSleepDuration(aggregates.averageTimeAsleepSeconds, t),
  },
];

/** The same two tiles, showing one selected night instead of the window's averages. */
export const buildSelectedNightLabels = (
  day: SleepTimelineDay,
  t: TFunction,
  timeFormat?: EntryTimeFormat | null
): SelectedNightLabels => {
  const stats: [SleepStatLabel, SleepStatLabel] = [
    {
      title: t('sleep.timeInBed', { defaultValue: 'Time in bed' }),
      value: formatSleepDuration(day.timeInBedSeconds, t),
    },
    {
      title: t('sleep.timeAsleep', { defaultValue: 'Time asleep' }),
      value: formatSleepDuration(day.timeAsleepSeconds, t),
    },
  ];

  if (day.segments.length === 0) return { stats, clockRange: null };

  const bedtimeMs = day.segments[0].startMs;
  const wakeTimeMs = Math.max(...day.segments.map((segment) => segment.endMs));

  return {
    stats,
    clockRange: t('sleep.bedtimeToWake', {
      bedtime: formatClockTime(
        new Date(bedtimeMs).toISOString(),
        timeFormat,
        day.zone
      ),
      wakeTime: formatClockTime(
        new Date(wakeTimeMs).toISOString(),
        timeFormat,
        day.zone
      ),
      defaultValue: '{{bedtime}} – {{wakeTime}}',
    }),
  };
};

/**
 * Turns an offset past the anchor back into a wall-clock label.
 *
 * Both the anchor and every tick step are whole hours, so truncating to the hour drops
 * nothing — see `formatHourLabel` for why the minutes are not printed.
 */
const formatAxisClockLabel = (
  offsetMinutes: number,
  anchorMinutes: number,
  timeFormat?: EntryTimeFormat | null
): string => {
  const clockMinutes = (anchorMinutes + offsetMinutes) % MINUTES_PER_DAY;

  return formatHourLabel(
    Math.floor(clockMinutes / MINUTES_PER_HOUR),
    timeFormat
  );
};

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

const SleepStatTile: React.FC<{ label: SleepStatLabel; testID: string }> = ({
  label,
  testID,
}) => (
  <View className="flex-1" testID={testID}>
    <Text className="text-text-muted text-xs uppercase">{label.title}</Text>
    <Text className="text-text-primary text-xl font-semibold">
      {label.value}
    </Text>
  </View>
);

const SleepStageLegend: React.FC<{
  colors: string[];
  visibleStages: SleepStageLane[];
}> = ({ colors, visibleStages }) => {
  const { t } = useTranslation();

  return (
    <View
      className="flex-row justify-center items-center mt-1"
      testID="sleep-stage-legend"
    >
      {visibleStages.map((stage) => (
        <View key={stage} className="flex-row items-center mx-2">
          <View
            className="w-2 h-2 rounded-full mr-1"
            style={{
              backgroundColor: colors[SLEEP_STAGE_LANES.indexOf(stage)],
            }}
          />
          <Text className="text-text-muted text-xs">
            {localizeSleepStage(t, stage)}
          </Text>
        </View>
      ))}
    </View>
  );
};

/**
 * The Dashboard sleep trend: a clock axis down the right, one column per day, and the
 * night's stages drawn as blocks at the times they happened.
 *
 * A thin shell over `buildSleepTimelineLayout` — this component measures width, picks
 * theme colours, and draws. It holds no layout arithmetic.
 */
const SleepTimelineChart: React.FC<SleepTimelineChartProps> = ({
  data,
  averageTimeInBedSeconds,
  averageTimeAsleepSeconds,
  nightsWithData,
  isLoading,
  isError,
  range,
}) => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const [plotWidth, setPlotWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const stageColors = useCSSVariable(
    SLEEP_STAGE_LANES.map((stage) => STAGE_COLOR_VARIABLES[stage])
  ) as string[];

  const anchorMinutes = useMemo(
    () => chooseSleepClockAnchorMinutes(data),
    [data]
  );

  const layout = useMemo(
    () =>
      buildSleepTimelineLayout(data, {
        width: plotWidth,
        height: PLOT_HEIGHT,
        anchorMinutes,
        innerPadding: INNER_PADDING[range],
      }),
    [data, plotWidth, anchorMinutes, range]
  );

  const legendStages = useMemo(
    () =>
      SLEEP_STAGE_LANES.filter(
        (stage) =>
          stage !== 'other' &&
          data.some((day) =>
            day.segments.some((segment) => segment.stage === stage)
          )
      ),
    [data]
  );

  // Clear a lingering selection when the dataset or range changes. Done during render so
  // the tiles are already back to averages on the first render after the data moves.
  const [selectionResetKey, setSelectionResetKey] = useState({ data, range });
  if (selectionResetKey.data !== data || selectionResetKey.range !== range) {
    setSelectionResetKey({ data, range });
    setSelectedIndex(null);
  }

  const touchLayout: ChartTouchLayout = useMemo(() => {
    if (plotWidth <= 0 || layout.columns.length === 0)
      return EMPTY_CHART_TOUCH_LAYOUT;

    return {
      chartBounds: { left: 0, right: plotWidth, top: 0, bottom: PLOT_HEIGHT },
      points: layout.columns.map((column) => ({
        x: column.x + column.width / 2,
        xValue: data[column.dayIndex].day,
        y: 0,
        yValue: 0,
      })),
    };
  }, [layout.columns, plotWidth, data]);

  const handleSelectColumn = useCallback(
    (index: number) => {
      const day = data[index];
      // An empty column has nothing to report, so leave the averages up rather than
      // swapping in a tile full of placeholders.
      if (!day || day.segments.length === 0) return;

      setSelectedIndex(index);
    },
    [data]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  const selectedDay = selectedIndex !== null ? data[selectedIndex] : undefined;
  const selectedLabels = selectedDay
    ? buildSelectedNightLabels(selectedDay, t, preferences?.time_format)
    : null;
  const statLabels =
    selectedLabels?.stats ??
    buildSleepAverageLabels(
      { averageTimeInBedSeconds, averageTimeAsleepSeconds, nightsWithData },
      t
    );

  const rangeLabel =
    data.length > 0
      ? t('charts.sleep.rangeLabel', {
          startDate: formatTooltipDate(data[0].day),
          endDate: formatTooltipDate(data[data.length - 1].day),
          defaultValue: '{{startDate}} – {{endDate}}',
        })
      : '';

  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;
  const xLabelIndices = buildXLabelIndices(data.length, X_TICK_COUNT[range]);

  const renderPlaceholder = (message: string) => (
    <View className="h-50 justify-center items-center">
      <Text className="text-text-muted text-sm">{message}</Text>
    </View>
  );

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">
        {t('charts.sleep.title', { defaultValue: 'Sleep' })}
      </Text>

      <View className="flex-row mb-1">
        <SleepStatTile label={statLabels[0]} testID="sleep-stat-time-in-bed" />
        <SleepStatTile label={statLabels[1]} testID="sleep-stat-time-asleep" />
      </View>

      {/* Fixed height so selecting a night swaps the copy without reflowing the plot. */}
      <View className="h-5 justify-center mb-1">
        <Text
          className="text-text-muted text-xs"
          testID="sleep-timeline-subtitle"
        >
          {selectedLabels?.clockRange ?? rangeLabel}
        </Text>
      </View>

      {isLoading ? (
        renderPlaceholder(t('common.loading', { defaultValue: 'Loading...' }))
      ) : isError ? (
        renderPlaceholder(
          t('charts.sleep.loadFailed', {
            defaultValue: 'Failed to load sleep data',
          })
        )
      ) : nightsWithData === 0 ? (
        renderPlaceholder(
          t('charts.sleep.empty', {
            defaultValue: 'No sleep data for this period',
          })
        )
      ) : (
        <>
          <View className="flex-row">
            <View
              className="flex-1"
              style={{ height: PLOT_HEIGHT }}
              onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
            >
              {/*
                Square corners, unlike the Sleep Details hypnogram: there each segment is a
                lone bar on its own lane, but here consecutive stages stack flush within one
                column, and rounding every block notches the joins into gaps that did not
                happen. At 90d the columns are a few pixels wide, where a radius would eat
                most of the block outright.
              */}
              <Canvas style={{ flex: 1 }}>
                {layout.columns.flatMap((column) =>
                  column.blocks.map((block, blockIndex) => (
                    <Rect
                      key={`${column.dayIndex}-${blockIndex}`}
                      x={column.x}
                      y={block.y}
                      width={column.width}
                      height={block.height}
                      color={
                        stageColors[SLEEP_STAGE_LANES.indexOf(block.stage)]
                      }
                    />
                  ))
                )}
              </Canvas>

              <ChartTouchOverlay
                layout={touchLayout}
                onSelect={handleSelectColumn}
                onClear={handleClearSelection}
                testIDPrefix="sleep-timeline-touch-overlay"
              />
            </View>

            <View style={{ width: TICK_LABEL_WIDTH, height: PLOT_HEIGHT }}>
              {layout.ticks.map((tick) => (
                <Text
                  key={tick.minutes}
                  className="text-text-muted absolute right-0"
                  numberOfLines={1}
                  allowFontScaling={false}
                  // Nudged up by half a line so the label reads as centred on its gridline.
                  style={{ top: tick.y - 7, fontSize: CHART_LABEL_FONT_SIZE }}
                >
                  {formatAxisClockLabel(
                    tick.minutes,
                    anchorMinutes,
                    preferences?.time_format
                  )}
                </Text>
              ))}
            </View>
          </View>

          <View
            className="flex-row"
            style={{ marginRight: TICK_LABEL_WIDTH, height: 16 }}
          >
            {xLabelIndices.map((dayIndex) => {
              const column = layout.columns[dayIndex];
              if (!column) return null;

              return (
                <Text
                  key={data[dayIndex].day}
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
                  {formatXLabel(data[dayIndex].day)}
                </Text>
              );
            })}
          </View>

          {legendStages.length > 0 ? (
            <SleepStageLegend
              colors={stageColors}
              visibleStages={legendStages}
            />
          ) : null}
        </>
      )}
    </View>
  );
};

export default SleepTimelineChart;
