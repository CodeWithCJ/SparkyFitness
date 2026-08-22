import React, { useMemo, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatLocalizedNumber } from '../localization/i18n';
import { CartesianChart, Bar } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import { makeChartFont, formatXLabel7d, formatXLabel30d90d, formatTooltipDate, formatChartYLabel } from './charts/chartFormatting';
import type { StepsDataPoint, StepsRange } from '../hooks/useMeasurementsRange';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from './ChartTouchOverlay';

type StepsBarChartProps = {
  data: StepsDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: StepsRange;
};

const INNER_PADDING: Record<StepsRange, number> = {
  '7d': 0.3,
  '30d': 0.2,
  '90d': 0.1,
};

const X_TICK_COUNT: Record<StepsRange, number> = {
  '7d': 7,
  '30d': 6,
  '90d': 5,
};

const font = makeChartFont(12);

const formatYLabel = (value: number) => formatChartYLabel(value);

const DEFAULT_TOOLTIP = '';

const StepsTooltip: React.FC<{ text: string }> = ({ text }) => (
  <View className="h-6 justify-center mt-3 mb-1">
    <Text className="text-text-secondary text-sm text-center">{text}</Text>
  </View>
);

/**
 * Builds the tooltip copy from the semantically selected data point. The text
 * is derived from the current `t` translator and the current application
 * locale on every render, so an already-visible tooltip can never retain stale
 * copy after a language switch.
 */
export const buildTooltipText = (
  point: StepsDataPoint | undefined,
  t: ReturnType<typeof useTranslation>['t'],
): string => {
  if (!point) return DEFAULT_TOOLTIP;
  const formattedCount = formatLocalizedNumber(point.steps);
  return `${t('charts.steps.tooltip', {
    count: point.steps,
    formattedCount,
    defaultValue: '{{formattedCount}} steps',
    defaultValue_one: '{{formattedCount}} step',
    defaultValue_other: '{{formattedCount}} steps',
  })} · ${formatTooltipDate(point.day)}`;
};

const StepsBarChart: React.FC<StepsBarChartProps> = ({
  data,
  isLoading,
  isError,
  range,
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

  const hasData = useMemo(() => data.some(d => d.steps > 0), [data]);

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
  const tooltipText = buildTooltipText(selectedPoint, t);

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

  const handleSelectBar = useCallback(
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

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">
        {t('charts.steps.title', { defaultValue: 'Steps' })}
      </Text>

      <StepsTooltip text={tooltipText} />

      {isLoading ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">{t('common.loading', { defaultValue: 'Loading...' })}</Text>
        </View>
      ) : isError ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('charts.steps.loadFailed', { defaultValue: 'Failed to load step data' })}
          </Text>
        </View>
      ) : !hasData ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('charts.steps.empty', { defaultValue: 'No step data for this period' })}
          </Text>
        </View>
      ) : (
        <View style={{ height: 175 }}>
          <CartesianChart
            data={data}
            xKey="day"
            yKeys={['steps']}
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
                  points={points.steps}
                  onChange={handleTouchLayoutChange}
                />
                <Bar
                  points={points.steps}
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
            testIDPrefix="steps-touch-overlay"
          />
        </View>
      )}
    </View>
  );
};

export default StepsBarChart;
