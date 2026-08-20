import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import { formatLocalizedNumber } from '../localization/i18n';
import { makeChartFont, formatXLabel7d, formatXLabel30d90d, formatTooltipDate } from './charts/chartFormatting';
import type {
  WeightDataPoint,
  StepsRange,
} from '../hooks/useMeasurementsRange';
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
  range: StepsRange;
  unit: string;
};

const X_TICK_COUNT: Record<StepsRange, number> = {
  '7d': 7,
  '30d': 6,
  '90d': 5,
};

const font = makeChartFont(12);

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
  unit: string,
): string => {
  if (!point) return DEFAULT_TOOLTIP;
  const formattedWeight = formatLocalizedNumber(point.weight, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formattedWeight} ${unit} · ${formatTooltipDate(point.day)}`;
};

const WeightLineChart: React.FC<WeightLineChartProps> = ({
  data,
  isLoading,
  isError,
  range,
  unit,
}) => {
  const { t } = useTranslation();
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT,
  );

  const hasData = useMemo(() => data.length > 0, [data]);

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
      setTouchLayout(currentLayout => {
        const currentSignature = createChartTouchLayoutSignature(currentLayout);
        const nextSignature = createChartTouchLayoutSignature(nextLayout);

        if (currentSignature === nextSignature) {
          return currentLayout;
        }

        return nextLayout;
      });
    },
    [],
  );

  const handleSelectPoint = useCallback(
    (index: number) => {
      const point = data[index];

      if (!point) {
        return;
      }

      setSelectedIndex(index);
    },
    [data],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  if (!hasData && !isLoading && !isError) {
    return null;
  }

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">
        {t('charts.weight.title', { defaultValue: 'Weight' })}
      </Text>

      <WeightTooltip text={tooltipText} />

      {isLoading ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">{t('common.loading', { defaultValue: 'Loading...' })}</Text>
        </View>
      ) : isError ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('charts.weight.loadFailed', { defaultValue: 'Failed to load weight data' })}
          </Text>
        </View>
      ) : (
        <View style={{ height: 175 }}>
          <CartesianChart
            data={data}
            xKey="day"
            yKeys={['weight']}
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
              },
            ]}
          >
            {({ points, chartBounds }) => (
              <>
                <ChartLayoutReporter
                  chartBounds={chartBounds}
                  points={points.weight}
                  onChange={handleTouchLayoutChange}
                />
                <Line
                  points={points.weight}
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
            testIDPrefix="weight-touch-overlay"
          />
        </View>
      )}
    </View>
  );
};

export default WeightLineChart;
