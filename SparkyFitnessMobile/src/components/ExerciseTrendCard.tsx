import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity } from 'react-native';
import { CartesianChart, Scatter } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import {
  exerciseTrendChangePercent,
  type ExerciseTrendMetric,
  type ExerciseTrendPeriod,
} from '@workspace/shared';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  computeNiceYAxisScale,
} from './charts/chartFormatting';
import LineSeriesMark from './charts/LineSeriesMark';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from './ChartTouchOverlay';
import SegmentedControl, { type Segment } from './SegmentedControl';
import Button from './ui/Button';
import { useExerciseTrend } from '../hooks/useExerciseTrend';
import { weightFromKg } from '../utils/unitConversions';

type ExerciseTrendCardProps = {
  exerciseId: string;
  weightUnit: 'kg' | 'lbs';
};

const METRICS: ExerciseTrendMetric[] = ['estimated1RM', 'maxLoad', 'volume'];

const X_TICK_COUNT: Record<ExerciseTrendPeriod, number> = {
  week: 4,
  month: 4,
  year: 5,
};

const dateOf = (day: string): Date => {
  const [year, month, d] = day.split('-').map(Number);
  return new Date(year, (month || 1) - 1, d || 1);
};

/** Axis label for a period's first day: "Nov 16", "Nov" or "2026". */
export const formatPeriodAxisLabel = (
  day: string,
  period: ExerciseTrendPeriod
): string => {
  if (typeof day !== 'string') return '';
  if (period === 'year') return day.slice(0, 4);
  return dateOf(day).toLocaleDateString(
    getAppLocale(),
    period === 'month' ? { month: 'short' } : { month: 'short', day: 'numeric' }
  );
};

/** Tooltip label for a period: "Week of Nov 16, 2026", "Nov 2026" or "2026". */
const formatPeriodTooltipLabel = (
  day: string,
  period: ExerciseTrendPeriod,
  weekOf: (date: string) => string
): string => {
  if (period === 'year') return day.slice(0, 4);
  const date = dateOf(day);
  if (period === 'month') {
    return date.toLocaleDateString(getAppLocale(), {
      month: 'short',
      year: 'numeric',
    });
  }
  return weekOf(
    date.toLocaleDateString(getAppLocale(), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  );
};

const formatValue = (value: number, metric?: ExerciseTrendMetric): string =>
  formatLocalizedNumber(value, {
    // Volume runs to thousands; a tenth of a pound × rep says nothing there.
    maximumFractionDigits: metric === 'volume' ? 0 : 1,
  });

/**
 * The exercise detail Summary tab's trend: best estimated 1RM, heaviest weight
 * or total volume per week, month or year, with new highs marked in PR gold.
 * The screen shows it once the exercise has two sessions; see `hidden`.
 */
const ExerciseTrendCard: React.FC<ExerciseTrendCardProps> = ({
  exerciseId,
  weightUnit,
}) => {
  const { t } = useTranslation();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [accentColor, textMuted, recordColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-pr',
  ]) as [string, string, string];
  const [period, setPeriod] = useState<ExerciseTrendPeriod>('month');
  const [metric, setMetric] = useState<ExerciseTrendMetric>('estimated1RM');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT
  );

  const {
    points,
    sessionCount,
    period: shownPeriod,
    currentPeriodStart,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useExerciseTrend(exerciseId, period, metric);
  // Until the person picks a period: with fewer than two done sessions in
  // the last 12 months, open on Years; with fewer than two there, stay hidden.
  const [periodPicked, setPeriodPicked] = useState(false);
  const settled = !isLoading && !isError && shownPeriod === period;
  if (!periodPicked && settled && sessionCount < 2 && period === 'month') {
    setPeriod('year');
  }
  const hidden =
    !periodPicked && settled && sessionCount < 2 && period === 'year';

  const chartData = useMemo(
    () =>
      points.map((point) => {
        const value = weightFromKg(point.valueKg, weightUnit);
        return {
          periodStart: point.periodStart,
          value,
          record: point.isRecord ? value : null,
        };
      }),
    [points, weightUnit]
  );

  const yAxisScale = useMemo(() => {
    if (chartData.length === 0) return undefined;
    const values = chartData.map((point) => point.value);
    return computeNiceYAxisScale(Math.min(...values), Math.max(...values));
  }, [chartData]);

  // Clear a lingering selection when the series changes, during render so the
  // tooltip is already gone on the first render with the new data.
  const [resetKey, setResetKey] = useState(chartData);
  if (resetKey !== chartData) {
    setResetKey(chartData);
    setSelectedIndex(null);
  }

  const handleTouchLayoutChange = useCallback((next: ChartTouchLayout) => {
    setTouchLayout((current) =>
      createChartTouchLayoutSignature(current) ===
      createChartTouchLayoutSignature(next)
        ? current
        : next
    );
  }, []);

  const periodSegments: Segment<ExerciseTrendPeriod>[] = [
    {
      key: 'week',
      label: t('exerciseDetail.progress.weeks', { defaultValue: 'Weeks' }),
    },
    {
      key: 'month',
      label: t('exerciseDetail.progress.months', { defaultValue: 'Months' }),
    },
    {
      key: 'year',
      label: t('exerciseDetail.progress.years', { defaultValue: 'Years' }),
    },
  ];

  const metricLabel = (key: ExerciseTrendMetric): string =>
    key === 'estimated1RM'
      ? t('exerciseDetail.progress.estimated1RM', {
          defaultValue: 'Est. 1RM',
        })
      : key === 'maxLoad'
        ? t('exerciseDetail.progress.heaviest', {
            defaultValue: 'Heaviest weight',
          })
        : t('exerciseDetail.progress.volume', { defaultValue: 'Volume' });

  if (hidden) return null;

  const latest = chartData[chartData.length - 1];
  const selected = selectedIndex != null ? chartData[selectedIndex] : undefined;
  const shown = selected ?? latest;
  // Volume is a sum, so the period still under way would read as a drop.
  const change = exerciseTrendChangePercent(
    metric === 'volume'
      ? points.filter((point) => point.periodStart !== currentPeriodStart)
      : points
  );
  const valueUnit =
    metric === 'volume'
      ? t('exerciseDetail.progress.volumeUnit', {
          defaultValue: '{{unit}} × reps',
          unit: weightUnit,
        })
      : weightUnit;

  return (
    <View className="bg-surface rounded-xl p-4" testID="exercise-trend-card">
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="text-text-secondary text-xs">
            {selected
              ? formatPeriodTooltipLabel(
                  selected.periodStart,
                  shownPeriod,
                  (date) =>
                    t('exerciseDetail.progress.weekOf', {
                      defaultValue: 'Week of {{date}}',
                      date,
                    })
                )
              : t('exerciseDetail.progress.title', {
                  defaultValue: 'Progress',
                })}
          </Text>
          <Text
            className="text-text-primary text-2xl font-bold mt-0.5"
            testID="exercise-trend-value"
          >
            {shown ? `${formatValue(shown.value, metric)} ${valueUnit}` : '—'}
          </Text>
        </View>
        {change != null && !selected ? (
          <Text
            className={`text-sm font-semibold ${
              change >= 0 ? 'text-text-success' : 'text-text-danger-subtle'
            }`}
            testID="exercise-trend-change"
          >
            {`${change >= 0 ? '▲' : '▼'} ${formatLocalizedNumber(Math.abs(change))}%`}
          </Text>
        ) : null}
      </View>

      <View
        className="flex-row flex-wrap gap-2 mt-3"
        accessibilityRole="tablist"
      >
        {METRICS.map((key) => (
          <TouchableOpacity
            key={key}
            onPress={() => setMetric(key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: metric === key }}
            testID={`exercise-trend-metric-${key}`}
            activeOpacity={0.7}
            className={`px-3 py-1.5 rounded-full border ${
              metric === key
                ? 'bg-accent-primary border-accent-primary'
                : 'bg-raised border-border-subtle'
            }`}
          >
            <Text
              className={`text-xs font-medium ${
                metric === key ? 'text-white' : 'text-text-primary'
              }`}
            >
              {metricLabel(key)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading || (isError && isFetching) ? (
        <View className="h-44 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('common.loading', { defaultValue: 'Loading...' })}
          </Text>
        </View>
      ) : isError ? (
        <View className="h-44 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('exerciseDetail.progress.loadFailed', {
              defaultValue: 'Could not load progress',
            })}
          </Text>
          <Button variant="ghost" onPress={() => refetch()}>
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
        </View>
      ) : chartData.length === 0 ? (
        <View className="h-44 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('exerciseDetail.progress.empty', {
              defaultValue: 'Nothing logged in this period',
            })}
          </Text>
        </View>
      ) : (
        <View style={{ height: 176 }} className="mt-2">
          <CartesianChart
            data={chartData}
            xKey="periodStart"
            yKeys={['value', 'record']}
            domain={
              yAxisScale
                ? { y: [yAxisScale.min, yAxisScale.max] as [number, number] }
                : undefined
            }
            domainPadding={{ left: 16, right: 16, top: 12, bottom: 12 }}
            xAxis={{
              font,
              tickCount: Math.min(X_TICK_COUNT[shownPeriod], chartData.length),
              labelColor: textMuted,
              formatXLabel: (day: string) =>
                formatPeriodAxisLabel(day, shownPeriod),
            }}
            yAxis={[
              {
                font,
                tickCount: yAxisScale?.tickValues.length ?? 5,
                labelColor: textMuted,
                tickValues: yAxisScale?.tickValues,
                formatYLabel: (value: number | null) =>
                  value == null ? '' : formatValue(value),
              },
            ]}
          >
            {({ points: chartPoints, chartBounds }) => (
              <>
                <ChartLayoutReporter
                  chartBounds={chartBounds}
                  points={chartPoints.value}
                  onChange={handleTouchLayoutChange}
                />
                <LineSeriesMark
                  points={chartPoints.value}
                  color={accentColor}
                  strokeWidth={2.5}
                  animate={{ type: 'timing', duration: 300 }}
                  curveType="linear"
                  connectMissingData
                />
                <Scatter
                  points={chartPoints.record}
                  color={recordColor}
                  radius={4}
                  shape="circle"
                />
              </>
            )}
          </CartesianChart>
          <ChartTouchOverlay
            layout={touchLayout}
            onSelect={(index) => setSelectedIndex(index)}
            onClear={() => setSelectedIndex(null)}
            testIDPrefix="exercise-trend-touch"
          />
        </View>
      )}

      <View className="mt-3">
        <SegmentedControl
          segments={periodSegments}
          activeKey={period}
          onSelect={(key) => {
            setPeriodPicked(true);
            setPeriod(key);
          }}
        />
      </View>
      <Text className="text-text-muted text-xs mt-2">
        {t('exerciseDetail.progress.footnote', {
          defaultValue: 'Best per period. Dots mark new highs.',
        })}
      </Text>
    </View>
  );
};

export default ExerciseTrendCard;
