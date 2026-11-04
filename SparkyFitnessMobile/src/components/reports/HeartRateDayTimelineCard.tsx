import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { Rect } from '@shopify/react-native-skia';

import Icon from '../Icon';
import ReportSummaryCard, { type ReportSummaryRow } from './ReportSummaryCard';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  formatTooltipDate,
  computeNiceYAxisScale,
} from '../charts/chartFormatting';
import { useHeartRateDayTimeline } from '../../hooks/useHeartRateTimelines';
import { addDays, getTodayDate } from '../../utils/dateUtils';
import { formatLocalizedNumber } from '../../localization';

const SLEEP_COLOR = '#6366f1';
const WORKOUT_COLOR = '#f59e0b';
const LINE_COLOR = '#f43f5e';
const TEXT_MUTED = '#9ca3af';
const X_TICKS = [0, 360, 720, 1080, 1440];

const clock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

interface Props {
  day: string;
  onChangeDay: (day: string) => void;
}

/** One day of heart rate on a 24 hour axis, with sleep and workout shading. */
const HeartRateDayTimelineCard: React.FC<Props> = ({ day, onChangeDay }) => {
  const { t } = useTranslation();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const { timeline, isLoading, isError } = useHeartRateDayTimeline(
    day,
    t('reports.heartRateWorkoutFallback', { defaultValue: 'Workout' })
  );
  const isToday = day >= getTodayDate();

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

  const workoutBands = useMemo(() => {
    const bands: { from: number; to: number }[] = [];
    let start: number | null = null;
    for (const p of timeline.points) {
      const inWorkout = p.workoutName !== null;
      if (inWorkout && start === null) start = p.minutes;
      if (!inWorkout && start !== null) {
        bands.push({ from: start, to: p.minutes });
        start = null;
      }
    }
    if (start !== null) bands.push({ from: start, to: 1440 });
    return bands;
  }, [timeline.points]);

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
  }, [timeline, t]);

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
            hitSlop={12}
            onPress={() => onChangeDay(addDays(day, -1))}
          >
            <Icon name="chevron-back" size={20} color={TEXT_MUTED} />
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
            accessibilityState={{ disabled: isToday }}
            disabled={isToday}
            hitSlop={12}
            onPress={() => onChangeDay(addDays(day, 1))}
            style={{ opacity: isToday ? 0.3 : 1 }}
          >
            <Icon name="chevron-forward" size={20} color={TEXT_MUTED} />
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
                  labelColor: TEXT_MUTED,
                  formatXLabel: (m) =>
                    `${String(Math.round(Number(m) / 60)).padStart(2, '0')}:00`,
                }}
                yAxis={[
                  {
                    font,
                    tickCount: yScale?.tickValues.length ?? 5,
                    labelColor: TEXT_MUTED,
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
                          color={SLEEP_COLOR}
                          opacity={0.14}
                        />
                      ))}
                      {workoutBands.map((b) => (
                        <Rect
                          key={`w${b.from}`}
                          x={x(b.from)}
                          y={chartBounds.top}
                          width={x(b.to) - x(b.from)}
                          height={height}
                          color={WORKOUT_COLOR}
                          opacity={0.2}
                        />
                      ))}
                      <Line
                        points={points.bpm}
                        color={LINE_COLOR}
                        strokeWidth={1.8}
                        curveType="linear"
                      />
                    </>
                  );
                }}
              </CartesianChart>
            </View>
            <View className="flex-row justify-center mt-2" style={{ gap: 16 }}>
              {sleepBands.length > 0 && (
                <LegendDot
                  color={SLEEP_COLOR}
                  label={t('reports.heartRateLegendSleep', {
                    defaultValue: 'Asleep',
                  })}
                />
              )}
              {workoutBands.length > 0 && (
                <LegendDot
                  color={WORKOUT_COLOR}
                  label={t('reports.heartRateLegendWorkout', {
                    defaultValue: 'Workout',
                  })}
                />
              )}
            </View>
          </>
        )}
      </View>
      {hasData && rows.length > 0 && (
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
