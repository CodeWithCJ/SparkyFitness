import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import {
  makeChartFont,
  CHART_LABEL_FONT_SIZE,
  formatXLabel7d,
  formatXLabel30d90d,
} from '../charts/chartFormatting';
import LineSeriesMark from '../charts/LineSeriesMark';
import type { MoodDataPoint } from '../../hooks/useMood';
import type { HealthTrendDateRange } from '../../types/healthTrends';

type MoodLineChartProps = {
  data: MoodDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: HealthTrendDateRange;
};

const X_TICK_COUNT: Record<HealthTrendDateRange, number> = {
  '7d': 7,
  '30d': 6,
  '90d': 5,
};

// Mood is stored on a fixed 0-100 scale, so the axis does not auto-fit.
const Y_TICKS = [0, 25, 50, 75, 100];

const font = makeChartFont(CHART_LABEL_FONT_SIZE);

const MoodLineChart: React.FC<MoodLineChartProps> = ({
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

  const domain = useMemo(() => ({ y: [0, 100] as [number, number] }), []);
  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;

  const message = isLoading
    ? t('common.loading', { defaultValue: 'Loading...' })
    : isError
      ? t('mood.chartLoadFailed', { defaultValue: 'Failed to load mood data' })
      : data.length === 0
        ? t('mood.chartEmpty', {
            defaultValue: 'No mood logged for this period',
          })
        : null;

  if (message) {
    return (
      <View className="h-50 justify-center items-center">
        <Text className="text-text-muted text-sm">{message}</Text>
      </View>
    );
  }

  return (
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
        {({ points }) => (
          <LineSeriesMark
            points={points.mood}
            color={accentColor}
            strokeWidth={2}
            animate={{ type: 'timing', duration: 300 }}
            curveType="cardinal"
            connectMissingData
          />
        )}
      </CartesianChart>
    </View>
  );
};

export default MoodLineChart;
