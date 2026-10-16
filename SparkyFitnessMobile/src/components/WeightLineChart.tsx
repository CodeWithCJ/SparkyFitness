import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import { formatLocalizedNumber } from '../localization/i18n';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  formatXLabel7d,
  formatXLabel30d90d,
  formatTooltipDate,
  formatDateWithYear,
  computeNiceYAxisScale,
} from './charts/chartFormatting';
import LineSeriesMark from './charts/LineSeriesMark';
import TrendGoalLine from './charts/TrendGoalLine';
import type { WeightDataPoint } from '../hooks/useMeasurementsRange';
import {
  assessGoalForecast,
  computeWeightTrend,
  summarizeWeightTrend,
} from '@workspace/shared';
import type { HealthTrendDateRange } from '../types/healthTrends';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from './ChartTouchOverlay';

type WeightLineChartProps = {
  data: WeightDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: HealthTrendDateRange;
  unit: string;
  /** The user's target weight, already converted to `unit`. */
  goal?: number | null;
};

const X_TICK_COUNT: Record<HealthTrendDateRange, number> = {
  '7d': 7,
  '30d': 6,
  '90d': 5,
};

const DEFAULT_TOOLTIP = '';

const WeightTooltip: React.FC<{ text: string }> = ({ text }) => (
  <View className="h-6 justify-center mt-3 mb-1">
    <Text className="text-text-secondary text-sm text-center">{text}</Text>
  </View>
);

/**
 * Builds the tooltip copy from the semantically selected data point. The weight
 * value, unit, and date are derived from the current application locale on
 * every render, so an already-visible tooltip can never retain stale copy after
 * a language switch.
 */
export const buildWeightTooltipText = (
  point: { weight: number; day: string } | undefined,
  unit: string
): string => {
  if (!point) return DEFAULT_TOOLTIP;
  const formattedWeight = formatLocalizedNumber(point.weight, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formattedWeight} ${unit} · ${formatTooltipDate(point.day)}`;
};

const formatWeightValue = (value: number): string =>
  formatLocalizedNumber(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

const SummaryTile: React.FC<{
  label: string;
  value: string;
  testID: string;
}> = ({ label, value, testID }) => (
  <View className="flex-1 items-center" testID={testID}>
    <Text className="text-text-primary text-base font-semibold">{value}</Text>
    <Text className="text-text-muted text-xs mt-0.5 text-center">{label}</Text>
  </View>
);

const WeightLineChart: React.FC<WeightLineChartProps> = ({
  data,
  isLoading,
  isError,
  range,
  unit,
  goal,
}) => {
  const { t } = useTranslation();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT
  );

  const hasData = useMemo(() => data.length > 0, [data]);

  // The smoothed trend rides along each weigh-in so both series share one x axis.
  // Same smoothing and forecast as the web Reports chart (`@workspace/shared`),
  // so a given set of weigh-ins reads the same on both.
  const trendPoints = useMemo(
    () =>
      computeWeightTrend(
        data.map((point) => ({ date: point.day, weight: point.weight }))
      ),
    [data]
  );
  const chartData = useMemo(() => {
    const trendByDay = new Map(trendPoints.map((p) => [p.date, p.trend]));
    return data.map((point) => ({
      ...point,
      trend: trendByDay.get(point.day) ?? point.weight,
    }));
  }, [data, trendPoints]);
  const summary = useMemo(
    () => summarizeWeightTrend(trendPoints),
    [trendPoints]
  );
  const goalForecast = useMemo(
    () => assessGoalForecast(trendPoints, goal),
    [trendPoints, goal]
  );

  // A nice round scale, not just an auto-fit one, so the axis labels in whole units instead
  // of whatever decimal fraction a narrow week-over-week weight range happens to fall on.
  const yAxisScale = useMemo(() => {
    if (data.length === 0) {
      return undefined;
    }
    const weightValues = data.map((point) => point.weight);
    const hasGoal = goal != null && goal > 0;
    const min = hasGoal
      ? Math.min(...weightValues, goal)
      : Math.min(...weightValues);
    const max = hasGoal
      ? Math.max(...weightValues, goal)
      : Math.max(...weightValues);
    return computeNiceYAxisScale(min, max);
  }, [data, goal]);

  const domain = useMemo(
    () =>
      yAxisScale
        ? { y: [yAxisScale.min, yAxisScale.max] as [number, number] }
        : undefined,
    [yAxisScale]
  );

  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;

  // Reset a lingering selection when the dataset, range, or unit changes. Done
  // during render (instead of in an effect) so the tooltip is already cleared on
  // the first render after the data changes.
  const [tooltipResetKey, setTooltipResetKey] = useState({ data, range, unit });
  if (
    tooltipResetKey.data !== data ||
    tooltipResetKey.range !== range ||
    tooltipResetKey.unit !== unit
  ) {
    setTooltipResetKey({ data, range, unit });
    setSelectedIndex(null);
  }

  // Derive the presentation text from the selected point on every render, so
  // an already-visible tooltip reflects the current app language immediately.
  const selectedPoint = selectedIndex != null ? data[selectedIndex] : undefined;
  const tooltipText = buildWeightTooltipText(selectedPoint, unit);

  const handleTouchLayoutChange = useCallback(
    (nextLayout: ChartTouchLayout) => {
      setTouchLayout((currentLayout) => {
        const currentSignature = createChartTouchLayoutSignature(currentLayout);
        const nextSignature = createChartTouchLayoutSignature(nextLayout);

        if (currentSignature === nextSignature) {
          return currentLayout;
        }

        return nextLayout;
      });
    },
    []
  );

  const handleSelectPoint = useCallback(
    (index: number) => {
      const point = data[index];

      if (!point) {
        return;
      }

      setSelectedIndex(index);
    },
    [data]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">
        {t('charts.weight.title', { defaultValue: 'Weight' })}
      </Text>

      <WeightTooltip text={tooltipText} />

      {isLoading ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('common.loading', { defaultValue: 'Loading...' })}
          </Text>
        </View>
      ) : isError ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('charts.weight.loadFailed', {
              defaultValue: 'Failed to load weight data',
            })}
          </Text>
        </View>
      ) : !hasData ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('charts.weight.empty', {
              defaultValue: 'No weight data for this period',
            })}
          </Text>
        </View>
      ) : (
        <View style={{ height: 175 }}>
          <CartesianChart
            data={chartData}
            xKey="day"
            yKeys={['weight', 'trend']}
            domain={domain}
            domainPadding={{ left: 25, right: 25, top: 12, bottom: 12 }}
            xAxis={{
              font,
              tickCount: X_TICK_COUNT[range],
              labelColor: textMuted,
              formatXLabel,
            }}
            yAxis={[
              {
                font,
                // Must match tickValues.length exactly: a smaller tickCount makes
                // victory-native re-sample the array by index and can silently skip a
                // value in the middle.
                tickCount: yAxisScale?.tickValues.length ?? 5,
                labelColor: textMuted,
                tickValues: yAxisScale?.tickValues,
              },
            ]}
          >
            {({ points, chartBounds, yScale }) => (
              <>
                <ChartLayoutReporter
                  chartBounds={chartBounds}
                  points={points.weight}
                  onChange={handleTouchLayoutChange}
                />
                <LineSeriesMark
                  points={points.weight}
                  color={textMuted}
                  strokeWidth={1}
                  animate={{ type: 'timing', duration: 300 }}
                  curveType="cardinal"
                  connectMissingData
                />
                <LineSeriesMark
                  points={points.trend}
                  color={accentColor}
                  strokeWidth={2.5}
                  animate={{ type: 'timing', duration: 300 }}
                  curveType="natural"
                  connectMissingData
                />
                <TrendGoalLine
                  points={points.weight}
                  chartBounds={chartBounds}
                  yScale={yScale}
                  goals={data.map(() => goal)}
                  color={textMuted}
                />
              </>
            )}
          </CartesianChart>
          <ChartTouchOverlay
            layout={touchLayout}
            onSelect={handleSelectPoint}
            onClear={handleClearSelection}
            testIDPrefix="weight-touch-overlay"
          />
        </View>
      )}

      {!isLoading && !isError && hasData && summary != null && (
        <View className="flex-row mt-3" testID="weight-forecast-summary">
          <SummaryTile
            testID="weight-forecast-trend"
            label={t('charts.weight.trend', { defaultValue: 'Trend' })}
            value={`${formatWeightValue(summary.currentTrend)} ${unit}`}
          />
          <SummaryTile
            testID="weight-forecast-rate"
            label={t('charts.weight.perWeek', { defaultValue: 'Per week' })}
            value={
              summary.weeklyRate == null
                ? '—'
                : `${summary.weeklyRate > 0 ? '+' : ''}${formatWeightValue(summary.weeklyRate)} ${unit}`
            }
          />
          {goal != null && goal > 0 && (
            <SummaryTile
              testID="weight-forecast-goal"
              label={t('charts.weight.goalDate', { defaultValue: 'Goal date' })}
              value={
                goalForecast.status === 'toward-goal' && goalForecast.forecast
                  ? formatDateWithYear(goalForecast.forecast.date)
                  : goalForecast.status === 'steady'
                    ? t('charts.weight.steady', {
                        defaultValue: 'Holding steady',
                      })
                    : goalForecast.status === 'away-from-goal'
                      ? t('charts.weight.awayFromGoal', {
                          defaultValue: 'Moving away',
                        })
                      : goalForecast.status === 'too-far'
                        ? t('charts.weight.tooFar', {
                            defaultValue: 'Over 2 years',
                          })
                        : '—'
              }
            />
          )}
        </View>
      )}
    </View>
  );
};

export default WeightLineChart;
