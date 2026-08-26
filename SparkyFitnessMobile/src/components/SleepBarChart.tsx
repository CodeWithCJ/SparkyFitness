import React, { useMemo, useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatLocalizedNumber } from '../localization/i18n';
import { CartesianChart, Bar } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import { makeChartFont, formatXLabel7d, formatXLabel30d90d, formatTooltipDate } from './charts/chartFormatting';
import type { HealthTrendDateRange } from '../types/healthTrends';
import type { SleepDataPoint } from '../types/sleep';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from './ChartTouchOverlay';

type SleepBarChartProps = {
  data: SleepDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: HealthTrendDateRange;
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

const font = makeChartFont(12);

const DEFAULT_TOOLTIP = '';

/**
 * Nightly sleep tops out around 12 hours, so the compact/thousands handling in the
 * shared `formatChartYLabel` never applies here. One decimal keeps a 7.5h tick readable
 * without printing the full float tail.
 */
const formatHours = (value: number): string =>
  formatLocalizedNumber(value, { maximumFractionDigits: 1 });

const SleepTooltip: React.FC<{ text: string }> = ({ text }) => (
  <View className="h-6 justify-center mt-3 mb-1">
    <Text className="text-text-secondary text-sm text-center">{text}</Text>
  </View>
);

/**
 * Builds the tooltip copy from the semantically selected data point. The text is derived
 * from the current `t` translator and the current application locale on every render, so
 * an already-visible tooltip can never retain stale copy after a language switch.
 *
 * The hours unit is a plain (non-plural) key on purpose: a `count`-based key would make
 * this a plural family, which the i18n audit then requires every catalog to complete.
 */
export const buildSleepTooltipText = (
  point: SleepDataPoint | undefined,
  t: ReturnType<typeof useTranslation>['t'],
): string => {
  if (!point) return DEFAULT_TOOLTIP;
  const formattedHours = formatHours(point.hours);
  return `${t('charts.sleep.tooltip', {
    formattedHours,
    defaultValue: '{{formattedHours}} h',
  })} · ${formatTooltipDate(point.day)}`;
};

const SleepBarChart: React.FC<SleepBarChartProps> = ({
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

  const hasData = useMemo(() => data.some(d => d.hours > 0), [data]);

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
  const tooltipText = buildSleepTooltipText(selectedPoint, t);

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
        {t('charts.sleep.title', { defaultValue: 'Sleep' })}
      </Text>

      <SleepTooltip text={tooltipText} />

      {isLoading ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">{t('common.loading', { defaultValue: 'Loading...' })}</Text>
        </View>
      ) : isError ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('charts.sleep.loadFailed', { defaultValue: 'Failed to load sleep data' })}
          </Text>
        </View>
      ) : !hasData ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {t('charts.sleep.empty', { defaultValue: 'No sleep data for this period' })}
          </Text>
        </View>
      ) : (
        <View style={{ height: 175 }}>
          <CartesianChart
            data={data}
            xKey="day"
            yKeys={['hours']}
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
                formatYLabel: formatHours,
              },
            ]}
          >
            {({ points, chartBounds }) => (
              <>
                <ChartLayoutReporter
                  chartBounds={chartBounds}
                  points={points.hours}
                  onChange={handleTouchLayoutChange}
                />
                <Bar
                  points={points.hours}
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
            testIDPrefix="sleep-touch-overlay"
          />
        </View>
      )}
    </View>
  );
};

export default SleepBarChart;
