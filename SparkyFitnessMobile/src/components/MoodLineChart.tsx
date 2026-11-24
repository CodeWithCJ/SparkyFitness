import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  formatXLabel7d,
  formatXLabel30d90d,
} from './charts/chartFormatting';
import LineSeriesMark from './charts/LineSeriesMark';
import { formatMoodTooltip } from '../utils/moodReport';
import type { MoodDataPoint } from '../hooks/useMood';
import type { HealthTrendDateRange } from '../types/healthTrends';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from './ChartTouchOverlay';

type MoodLineChartProps = {
  data: MoodDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: HealthTrendDateRange;
  /**
   * When provided, renders the Health Trends pager's card chrome (title, card
   * background, tap-to-reveal tooltip) around the same plot. Omitted by
   * `MoodHistoryCard`, which already supplies its own title and background.
   */
  title?: string;
};

const X_TICK_COUNT: Record<HealthTrendDateRange, number> = {
  '7d': 7,
  '30d': 6,
  '90d': 5,
};

// Mood is stored on a fixed 0-100 scale, so the axis does not auto-fit.
const Y_TICKS = [0, 25, 50, 75, 100];

const DEFAULT_TOOLTIP = '';

const MoodTooltip: React.FC<{ text: string }> = ({ text }) => (
  <View className="h-6 justify-center mt-3 mb-1">
    <Text className="text-text-secondary text-sm text-center">{text}</Text>
  </View>
);

const MoodLineChart: React.FC<MoodLineChartProps> = ({
  data,
  isLoading,
  isError,
  range,
  title,
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

  const domain = useMemo(() => ({ y: [0, 100] as [number, number] }), []);
  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;

  // Reset a lingering selection when the dataset or range changes. Done during
  // render (instead of in an effect) so the tooltip is already cleared on the
  // first render after the data changes.
  const [tooltipResetKey, setTooltipResetKey] = useState({ data, range });
  if (tooltipResetKey.data !== data || tooltipResetKey.range !== range) {
    setTooltipResetKey({ data, range });
    setSelectedIndex(null);
  }

  const selectedPoint = selectedIndex != null ? data[selectedIndex] : undefined;
  const tooltipText = selectedPoint
    ? formatMoodTooltip(
        { value: selectedPoint.mood, day: selectedPoint.day },
        t
      )
    : DEFAULT_TOOLTIP;

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
      if (!data[index]) {
        return;
      }

      setSelectedIndex(index);
    },
    [data]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  const message = isLoading
    ? t('common.loading', { defaultValue: 'Loading...' })
    : isError
      ? title
        ? t('charts.mood.loadFailed', {
            defaultValue: 'Failed to load mood data',
          })
        : t('mood.chartLoadFailed', {
            defaultValue: 'Failed to load mood data',
          })
      : data.length === 0
        ? title
          ? t('charts.mood.empty', {
              defaultValue: 'No mood logged for this period',
            })
          : t('mood.chartEmpty', {
              defaultValue: 'No mood logged for this period',
            })
        : null;

  const plot = message ? (
    <View className="h-50 justify-center items-center">
      <Text className="text-text-muted text-sm">{message}</Text>
    </View>
  ) : (
    <View style={{ height: 175 }}>
      <CartesianChart
        data={data}
        xKey="day"
        yKeys={['mood']}
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
            tickCount: Y_TICKS.length,
            labelColor: textMuted,
            tickValues: Y_TICKS,
          },
        ]}
      >
        {({ points, chartBounds }) => (
          <>
            {title && (
              <ChartLayoutReporter
                chartBounds={chartBounds}
                points={points.mood}
                onChange={handleTouchLayoutChange}
              />
            )}
            <LineSeriesMark
              points={points.mood}
              color={accentColor}
              strokeWidth={2}
              animate={{ type: 'timing', duration: 300 }}
              curveType="cardinal"
              connectMissingData
            />
          </>
        )}
      </CartesianChart>
      {title && (
        <ChartTouchOverlay
          layout={touchLayout}
          onSelect={handleSelectPoint}
          onClear={handleClearSelection}
          testIDPrefix="mood-touch-overlay"
        />
      )}
    </View>
  );

  if (!title) {
    return plot;
  }

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">
        {title}
      </Text>
      <MoodTooltip text={tooltipText} />
      {plot}
    </View>
  );
};

export default MoodLineChart;
