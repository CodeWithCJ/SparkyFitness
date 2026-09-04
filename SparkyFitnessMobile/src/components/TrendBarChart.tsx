import React, { useCallback, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CartesianChart, Bar } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import {
  makeChartFont,
  CHART_LABEL_FONT_SIZE,
  formatXLabel7d,
  formatXLabel30d90d,
  formatChartYLabel,
} from './charts/chartFormatting';
import type { HealthTrendDateRange } from '../types/healthTrends';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from './ChartTouchOverlay';

/** Every point a bar trend plots, once its own shape has been projected onto a value. */
type TrendBarPoint = {
  day: string;
  value: number;
};

type TrendBarChartProps<TPoint extends { day: string }> = {
  data: TPoint[];
  isLoading: boolean;
  isError: boolean;
  range: HealthTrendDateRange;
  title: string;
  /**
   * The point's y-value. Every bar trend plots one number per day. Pass a stable
   * reference (a module-level function or a memoized closure) — the plotted series is
   * rebuilt whenever this changes.
   */
  getValue: (point: TPoint) => number;
  /**
   * Tooltip copy for the selected point. Called on every render so an already-visible
   * tooltip re-derives its copy immediately after a language switch.
   */
  formatTooltip: (point: TPoint) => string;
  formatYLabel?: (value: number) => string;
  errorText: string;
  emptyText: string;
  testIDPrefix: string;
};

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

const font = makeChartFont(CHART_LABEL_FONT_SIZE);

const TrendTooltip: React.FC<{ text: string }> = ({ text }) => (
  <View className="h-6 justify-center mt-3 mb-1">
    <Text className="text-text-secondary text-sm text-center">{text}</Text>
  </View>
);

/**
 * The shared daily bar-trend card: title, tooltip line, state branches and plot.
 *
 * Each trend wraps this with its own copy and a `getValue` projection rather than
 * repeating the chart wiring — the concrete charts differ only in words and units.
 */
function TrendBarChart<TPoint extends { day: string }>({
  data,
  isLoading,
  isError,
  range,
  title,
  getValue,
  formatTooltip,
  formatYLabel = formatChartYLabel,
  errorText,
  emptyText,
  testIDPrefix,
}: TrendBarChartProps<TPoint>) {
  const { t } = useTranslation();
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT
  );

  const chartData = useMemo<TrendBarPoint[]>(
    () => data.map((point) => ({ day: point.day, value: getValue(point) })),
    [data, getValue]
  );

  const hasData = useMemo(
    () => chartData.some((point) => point.value > 0),
    [chartData]
  );

  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;

  // Reset a lingering selection when the dataset or range changes. Done during
  // render (instead of in an effect) so the tooltip is already cleared on the
  // first render after the data changes.
  const [tooltipResetKey, setTooltipResetKey] = useState({ data, range });
  if (tooltipResetKey.data !== data || tooltipResetKey.range !== range) {
    setTooltipResetKey({ data, range });
    setSelectedIndex(null);
  }

  // Derive the presentation text from the selected point on every render, so
  // an already-visible tooltip reflects the current app language immediately.
  const selectedPoint = selectedIndex != null ? data[selectedIndex] : undefined;
  const tooltipText = selectedPoint ? formatTooltip(selectedPoint) : '';

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

  const handleSelectBar = useCallback(
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
        {title}
      </Text>

      <TrendTooltip text={tooltipText} />

      {isLoading ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('common.loading', { defaultValue: 'Loading...' })}
          </Text>
        </View>
      ) : isError ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">{errorText}</Text>
        </View>
      ) : !hasData ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">{emptyText}</Text>
        </View>
      ) : (
        <View style={{ height: 175 }}>
          <CartesianChart
            data={chartData}
            xKey="day"
            yKeys={['value']}
            domain={{ y: [0] }}
            domainPadding={{ left: 25, right: 25 }}
            xAxis={{
              font,
              tickCount: X_TICK_COUNT[range],
              labelColor: textMuted,
              formatXLabel,
            }}
            yAxis={[
              {
                font,
                tickCount: 5,
                labelColor: textMuted,
                formatYLabel,
              },
            ]}
          >
            {({ points, chartBounds }) => (
              <>
                <ChartLayoutReporter
                  chartBounds={chartBounds}
                  points={points.value}
                  onChange={handleTouchLayoutChange}
                />
                <Bar
                  points={points.value}
                  chartBounds={chartBounds}
                  color={accentColor}
                  innerPadding={INNER_PADDING[range]}
                  animate={{ type: 'timing', duration: 300 }}
                  roundedCorners={{ topLeft: 6, topRight: 6 }}
                />
              </>
            )}
          </CartesianChart>
          <ChartTouchOverlay
            layout={touchLayout}
            onSelect={handleSelectBar}
            onClear={handleClearSelection}
            testIDPrefix={testIDPrefix}
          />
        </View>
      )}
    </View>
  );
}

export default TrendBarChart;
