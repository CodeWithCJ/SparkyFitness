import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { CartesianChart } from 'victory-native';
import { formatLocalizedNumber } from '../localization/i18n';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  formatXLabel7d,
  formatXLabel30d90d,
  formatTooltipDate,
  computeNiceYAxisScale,
} from './charts/chartFormatting';
import LineSeriesMark from './charts/LineSeriesMark';
import { StatTile } from './charts/StatTile';
import type {
  HealthTrendDateRange,
  HeartRateDataPoint,
} from '../types/healthTrends';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from './ChartTouchOverlay';

type HeartRateLineChartProps = {
  data: HeartRateDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: HealthTrendDateRange;
  averageRestingHr?: number | null;
  minRestingHr?: number | null;
  maxRestingHr?: number | null;
};

const X_TICK_COUNT: Record<HealthTrendDateRange, number> = {
  '7d': 7,
  '30d': 6,
  '90d': 5,
};

const DEFAULT_TOOLTIP = '';

const HeartRateTooltip: React.FC<{ text: string }> = ({ text }) => (
  <View className="h-6 justify-center mt-3 mb-1">
    <Text className="text-text-secondary text-sm text-center">{text}</Text>
  </View>
);

export const buildHeartRateTooltipText = (
  point: { restingHr: number; day: string } | undefined
): string => {
  if (!point) return DEFAULT_TOOLTIP;
  const formatted = formatLocalizedNumber(point.restingHr);
  return `${formatted} bpm · ${formatTooltipDate(point.day)}`;
};

const HeartRateLineChart: React.FC<HeartRateLineChartProps> = ({
  data,
  isLoading,
  isError,
  range,
  averageRestingHr,
  minRestingHr,
  maxRestingHr,
}) => {
  const { t } = useTranslation();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const textMuted = '#9ca3af';
  const heartRateColor = '#f43f5e';
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT
  );

  const hasData = useMemo(() => data.length > 0, [data]);

  const yAxisScale = useMemo(() => {
    if (data.length === 0) return undefined;
    const values = data.map((point) => point.restingHr);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return computeNiceYAxisScale(Math.max(30, min - 5), max + 5);
  }, [data]);

  const domain = useMemo(
    () =>
      yAxisScale
        ? { y: [yAxisScale.min, yAxisScale.max] as [number, number] }
        : undefined,
    [yAxisScale]
  );

  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;

  const selectedPoint =
    selectedIndex !== null ? data[selectedIndex] : undefined;

  const tooltipText = useMemo(() => {
    return buildHeartRateTooltipText(selectedPoint);
  }, [selectedPoint]);

  const handleTouchLayoutChange = useCallback(
    (nextLayout: ChartTouchLayout) => {
      setTouchLayout((currentLayout) => {
        if (
          createChartTouchLayoutSignature(currentLayout) ===
          createChartTouchLayoutSignature(nextLayout)
        ) {
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
      if (!point) return;
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
        {t('charts.heartRate.title', { defaultValue: 'Resting Heart Rate' })}
      </Text>

      {/* Average Stat Tile */}
      {averageRestingHr ? (
        <View className="flex-row items-center gap-4 mb-1">
          <StatTile
            label={{
              title: t('charts.heartRate.avgLabel', { defaultValue: 'AVG' }),
              value: `${formatLocalizedNumber(averageRestingHr)} bpm`,
            }}
            testID="heart-rate-stat-avg"
          />
          {minRestingHr && maxRestingHr ? (
            <StatTile
              label={{
                title: t('charts.heartRate.rangeLabel', {
                  defaultValue: 'RANGE',
                }),
                value: `${formatLocalizedNumber(minRestingHr)} - ${formatLocalizedNumber(maxRestingHr)} bpm`,
              }}
              testID="heart-rate-stat-range"
            />
          ) : null}
        </View>
      ) : null}

      <HeartRateTooltip text={tooltipText} />

      {isLoading ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('common.loading', { defaultValue: 'Loading...' })}
          </Text>
        </View>
      ) : isError ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('charts.heartRate.loadFailed', {
              defaultValue: 'Failed to load heart rate data',
            })}
          </Text>
        </View>
      ) : !hasData ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('charts.heartRate.empty', {
              defaultValue: 'No heart rate data for this period',
            })}
          </Text>
        </View>
      ) : (
        <View style={{ height: 175 }}>
          <CartesianChart
            data={data}
            xKey="day"
            yKeys={['restingHr']}
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
                tickCount: yAxisScale?.tickValues.length ?? 5,
                labelColor: textMuted,
                tickValues: yAxisScale?.tickValues,
              },
            ]}
          >
            {({ points, chartBounds }) => (
              <>
                <ChartLayoutReporter
                  chartBounds={chartBounds}
                  points={points.restingHr}
                  onChange={handleTouchLayoutChange}
                />
                <LineSeriesMark
                  points={points.restingHr}
                  color={heartRateColor}
                  strokeWidth={2.2}
                  animate={{ type: 'timing', duration: 300 }}
                  curveType="cardinal"
                  connectMissingData
                />
              </>
            )}
          </CartesianChart>
          <ChartTouchOverlay
            layout={touchLayout}
            onSelect={handleSelectPoint}
            onClear={handleClearSelection}
            testIDPrefix="heart-rate-touch-overlay"
          />
        </View>
      )}
    </View>
  );
};

export default HeartRateLineChart;
