import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { CartesianChart, Line, Scatter } from 'victory-native';
import { Rect } from '@shopify/react-native-skia';
import { useCSSVariable } from 'uniwind';

import Icon from '../Icon';
import ReportSummaryCard, { type ReportSummaryRow } from './ReportSummaryCard';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  formatTooltipDate,
  computeNiceYAxisScale,
} from '../charts/chartFormatting';
import { useHeartRateDayTimeline } from '../../hooks/useHeartRateTimelines';
import { usePreferences } from '../../hooks/usePreferences';
import { addDays, getTodayDate } from '../../utils/dateUtils';
import { formatHourLabel, formatTimeLabel } from '../../utils/entryTimeDisplay';
import { formatLocalizedNumber } from '../../localization';

const X_TICKS = [0, 360, 720, 1080, 1440];

const hourMinute = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

interface Props {
  day: string;
  /** First and last day the arrows may reach (the report window) */
  minDay: string;
  maxDay: string;
  onChangeDay: (day: string) => void;
}

/** One day of heart rate on a 24 hour axis, with sleep and workout shading. */
const HeartRateDayTimelineCard: React.FC<Props> = ({
  day,
  minDay,
  maxDay,
  onChangeDay,
}) => {
  const { t } = useTranslation();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const { preferences } = usePreferences();
  const timeFormat = preferences?.time_format;
  const [lineColor, sleepColor, workoutColor, textMuted] = useCSSVariable([
    '--color-heart-rate',
    '--color-cat-violet',
    '--color-cat-orange',
    '--color-text-muted',
  ]) as [string, string, string, string];
  const { timeline, workouts, isLoading, isError } = useHeartRateDayTimeline(
    day,
    t('reports.heartRateWorkoutFallback', { defaultValue: 'Workout' })
  );
  const isFirst = day <= minDay;
  const isLast = day >= maxDay || day >= getTodayDate();
  const clock = useCallback(
    (minutes: number): string =>
      formatTimeLabel(hourMinute(minutes), timeFormat) ?? hourMinute(minutes),
    [timeFormat]
  );

  const hasData = timeline.points.length > 0;
  const yScale = useMemo(() => {
    if (timeline.minBpm === null || timeline.maxBpm === null) return undefined;
    return computeNiceYAxisScale(
      Math.max(30, timeline.minBpm - 5),
      timeline.maxBpm + 5
    );
  }, [timeline.minBpm, timeline.maxBpm]);

  const sleepBands = useMemo(() => {
    const bands: { from: number; to: number }[] = [];
    let start: number | null = null;
    for (const p of timeline.points) {
      if (p.isSleep && start === null) start = p.minutes;
      if (!p.isSleep && start !== null) {
        bands.push({ from: start, to: p.minutes });
        start = null;
      }
    }
    if (start !== null) bands.push({ from: start, to: 1440 });
    return bands;
  }, [timeline.points]);

  // Drawn from the workouts themselves, so one shorter than the 5 minute grid
  // still shows
  const workoutBands = useMemo(
    () => workouts.map((w) => ({ from: w.startMinutes, to: w.endMinutes })),
    [workouts]
  );

  // Readings with no recorded neighbour form a one-point segment the line
  // cannot draw, so they get a dot instead
  const isolated = useMemo(
    () =>
      timeline.points.map(
        (p, i) =>
          p.bpm !== null &&
          (timeline.points[i - 1]?.bpm ?? null) === null &&
          (timeline.points[i + 1]?.bpm ?? null) === null
      ),
    [timeline.points]
  );

  const rows = useMemo<ReportSummaryRow[]>(() => {
    const out: ReportSummaryRow[] = [];
    const bpm = (v: number) => `${formatLocalizedNumber(v)} bpm`;
    if (timeline.daytimeAvg !== null) {
      out.push({
        label: t('reports.heartRateDaytimeAvg', {
          defaultValue: 'Daytime average',
        }),
        value: bpm(timeline.daytimeAvg),
      });
    }
    if (timeline.sleepingAvg !== null) {
      out.push({
        label: t('reports.heartRateSleepingAvg', {
          defaultValue: 'Sleeping average',
        }),
        value: bpm(timeline.sleepingAvg),
        hint:
          timeline.sleepDipPct !== null
            ? t('reports.heartRateSleepDip', {
                defaultValue: '{{percent}}% against daytime',
                percent: formatLocalizedNumber(timeline.sleepDipPct),
              })
            : undefined,
      });
    }
    if (timeline.minBpm !== null && timeline.minMinutes !== null) {
      out.push({
        label: t('reports.heartRateLowest', { defaultValue: 'Lowest' }),
        value: bpm(timeline.minBpm),
        hint: clock(timeline.minMinutes),
      });
    }
    if (timeline.maxBpm !== null && timeline.maxMinutes !== null) {
      out.push({
        label: t('reports.heartRateHighest', { defaultValue: 'Highest' }),
        value: bpm(timeline.maxBpm),
        hint: clock(timeline.maxMinutes),
      });
    }
    return out;
  }, [timeline, t, clock]);

  return (
    <>
      <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
        <Text className="text-text-primary text-lg font-semibold mb-2">
          {t('reports.heartRateDayTimeline', {
            defaultValue: 'Heart Rate Through the Day',
          })}
        </Text>
        <View className="flex-row items-center justify-between mb-2">
          <Pressable
            testID="heart-rate-day-prev"
            accessibilityRole="button"
            accessibilityLabel={t('reports.heartRatePreviousDay', {
              defaultValue: 'Previous day',
            })}
            accessibilityState={{ disabled: isFirst }}
            disabled={isFirst}
            hitSlop={12}
            onPress={() => onChangeDay(addDays(day, -1))}
            style={{ opacity: isFirst ? 0.3 : 1 }}
          >
            <Icon name="chevron-back" size={20} color={textMuted} />
          </Pressable>
          <Text className="text-text-secondary text-sm">
            {formatTooltipDate(day)}
          </Text>
          <Pressable
            testID="heart-rate-day-next"
            accessibilityRole="button"
            accessibilityLabel={t('reports.heartRateNextDay', {
              defaultValue: 'Next day',
            })}
            accessibilityState={{ disabled: isLast }}
            disabled={isLast}
            hitSlop={12}
            onPress={() => onChangeDay(addDays(day, 1))}
            style={{ opacity: isLast ? 0.3 : 1 }}
          >
            <Icon name="chevron-forward" size={20} color={textMuted} />
          </Pressable>
        </View>

        {isLoading ? null : isError ? (
          <Text className="text-text-secondary text-sm text-center py-6">
            {t('reports.heartRateLoadFailed', {
              defaultValue: 'Failed to load heart rate data',
            })}
          </Text>
        ) : !hasData ? (
          <Text
            testID="heart-rate-day-empty"
            className="text-text-secondary text-sm text-center py-6"
          >
            {t('reports.heartRateDayEmpty', {
              defaultValue: 'No heart rate readings for this day',
            })}
          </Text>
        ) : (
          <>
            <View style={{ height: 185 }}>
              <CartesianChart
                data={timeline.points}
                xKey="minutes"
                yKeys={['bpm']}
                domain={{
                  x: [0, 1440],
                  y: yScale ? [yScale.min, yScale.max] : undefined,
                }}
                xAxis={{
                  font,
                  tickValues: X_TICKS,
                  labelColor: textMuted,
                  formatXLabel: (m) =>
                    formatHourLabel(
                      Math.round(Number(m) / 60) % 24,
                      timeFormat
                    ),
                }}
                yAxis={[
                  {
                    font,
                    tickCount: yScale?.tickValues.length ?? 5,
                    labelColor: textMuted,
                    tickValues: yScale?.tickValues,
                  },
                ]}
              >
                {({ points, chartBounds }) => {
                  const width = chartBounds.right - chartBounds.left;
                  const x = (m: number) =>
                    chartBounds.left + (m / 1440) * width;
                  const height = chartBounds.bottom - chartBounds.top;
                  return (
                    <>
                      {sleepBands.map((b) => (
                        <Rect
                          key={`s${b.from}`}
                          x={x(b.from)}
                          y={chartBounds.top}
                          width={x(b.to) - x(b.from)}
                          height={height}
                          color={sleepColor}
                          opacity={0.14}
                        />
                      ))}
                      {workoutBands.map((b) => (
                        <Rect
                          key={`w${b.from}-${b.to}`}
                          x={x(b.from)}
                          y={chartBounds.top}
                          width={Math.max(2, x(b.to) - x(b.from))}
                          height={height}
                          color={workoutColor}
                          opacity={0.2}
                        />
                      ))}
                      <Line
                        points={points.bpm}
                        color={lineColor}
                        strokeWidth={1.8}
                        curveType="linear"
                      />
                      <Scatter
                        points={points.bpm.filter((_, i) => isolated[i])}
                        color={lineColor}
                        radius={2}
                        shape="circle"
                      />
                    </>
                  );
                }}
              </CartesianChart>
            </View>
            <View className="flex-row justify-center mt-2" style={{ gap: 16 }}>
              {sleepBands.length > 0 && (
                <LegendDot
                  color={sleepColor}
                  label={t('reports.heartRateLegendSleep', {
                    defaultValue: 'Asleep',
                  })}
                />
              )}
              {workoutBands.length > 0 && (
                <LegendDot
                  color={workoutColor}
                  label={t('reports.heartRateLegendWorkout', {
                    defaultValue: 'Workout',
                  })}
                />
              )}
            </View>
          </>
        )}
      </View>
      {!isLoading && !isError && hasData && rows.length > 0 && (
        <ReportSummaryCard
          title={t('reports.heartRateDayFigures', {
            defaultValue: 'Day Figures',
          })}
          rows={rows}
        />
      )}
    </>
  );
};

const LegendDot: React.FC<{ color: string; label: string }> = ({
  color,
  label,
}) => (
  <View className="flex-row items-center" style={{ gap: 6 }}>
    <View
      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }}
    />
    <Text className="text-text-secondary text-xs">{label}</Text>
  </View>
);

export default HeartRateDayTimelineCard;
