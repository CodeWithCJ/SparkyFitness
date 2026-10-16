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
  computeNiceYAxisScale,
} from './charts/chartFormatting';
import LineSeriesMark from './charts/LineSeriesMark';
import type {
  HealthTrendDateRange,
  Vo2MaxDataPoint,
} from '../types/healthTrends';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from './ChartTouchOverlay';

type Vo2MaxLineChartProps = {
  data: Vo2MaxDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: HealthTrendDateRange;
};

const UNIT = 'ml/kg/min';

const X_TICK_COUNT: Record<HealthTrendDateRange, number> = {
  '7d': 7,
  '30d': 6,
  '90d': 5,
};

const DEFAULT_TOOLTIP = '';

const Vo2MaxTooltip: React.FC<{ text: string }> = ({ text }) => (
  <View className="h-6 justify-center mt-3 mb-1">
    <Text className="text-text-secondary text-sm text-center">{text}</Text>
  </View>
);

/**
 * Builds the tooltip copy from the semantically selected data point. The VO2 max
 * value, unit, and date are derived from the current application locale on
 * every render, so an already-visible tooltip can never retain stale copy after
 * a language switch.
 */
export const buildVo2MaxTooltipText = (
  point: { vo2max: number; day: string } | undefined
): string => {
  if (!point) return DEFAULT_TOOLTIP;
  const formatted = formatLocalizedNumber(point.vo2max, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${formatted} ${UNIT} · ${formatTooltipDate(point.day)}`;
};

const Vo2MaxLineChart: React.FC<Vo2MaxLineChartProps> = ({
  data,
  isLoading,
  isError,
  range,
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

  const yAxisScale = useMemo(() => {
    if (data.length === 0) return undefined;
    const values = data.map((point) => point.vo2max);
    return computeNiceYAxisScale(Math.min(...values), Math.max(...values));
  }, [data]);

  const domain = useMemo(
    () =>
      yAxisScale
        ? { y: [yAxisScale.min, yAxisScale.max] as [number, number] }
        : undefined,
    [yAxisScale]
  );

  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;

  // Reset a lingering selection when the dataset, or range changes. Done
  // during render (instead of in an effect) so the tooltip is already cleared on
  // the first render after the data changes.
  const [tooltipResetKey, setTooltipResetKey] = useState({ data, range });
  if (tooltipResetKey.data !== data || tooltipResetKey.range !== range) {
    setTooltipResetKey({ data, range });
    setSelectedIndex(null);
  }

  // Derive the presentation text from the selected point on every render, so
  // an already-visible tooltip reflects the current app language immediately.
  const selectedPoint = selectedIndex != null ? data[selectedIndex] : undefined;
  const tooltipText = buildVo2MaxTooltipText(selectedPoint);

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
        {t('charts.vo2max.title', { defaultValue: 'VO2 max' })}
      </Text>

      <Vo2MaxTooltip text={tooltipText} />

      {isLoading ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('common.loading', { defaultValue: 'Loading...' })}
          </Text>
        </View>
      ) : isError ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('charts.vo2max.loadFailed', {
              defaultValue: 'Failed to load VO2 max data',
            })}
          </Text>
        </View>
      ) : !hasData ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('charts.vo2max.empty', {
              defaultValue: 'No VO2 max data for this period',
            })}
          </Text>
        </View>
      ) : (
        <View style={{ height: 175 }}>
          <CartesianChart
            data={data}
            xKey="day"
            yKeys={['vo2max']}
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
            {({ points, chartBounds }) => (
              <>
                <ChartLayoutReporter
                  chartBounds={chartBounds}
                  points={points.vo2max}
                  onChange={handleTouchLayoutChange}
                />
                <LineSeriesMark
                  points={points.vo2max}
                  color={accentColor}
                  strokeWidth={2}
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
            testIDPrefix="vo2max-touch-overlay"
          />
        </View>
      )}
    </View>
  );
};

export default Vo2MaxLineChart;
