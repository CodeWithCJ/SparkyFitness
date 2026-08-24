import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import { makeChartFont, formatTooltipDate } from '../charts/chartFormatting';
import { formatLocalizedNumber, getAppLocale } from '../../localization';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  type ChartTouchLayout,
} from '../ChartTouchOverlay';

type BBTDataPoint = {
  date: string;
  bbt: number;
};

type BBTLineChartProps = {
  data: BBTDataPoint[];
  isLoading: boolean;
};

const font = makeChartFont(11);

// X-axis label: render the same calendar day in the active application locale
// (e.g. "6/3" in en-US, "3.06" in pl-PL) instead of a hard-coded MM/DD.
const formatXLabel = (day: string): string => {
  if (typeof day !== 'string') return '';
  const parts = day.split('-');
  if (parts.length < 3) return day;
  const [, month, d] = parts.map(Number);
  const date = new Date(1970, (month || 1) - 1, d || 1);
  return date.toLocaleDateString(getAppLocale(), { month: 'numeric', day: 'numeric' });
};

/**
 * Builds the tooltip copy from the semantically selected data point using the
 * current translator and application locale on every render, so an
 * already-visible tooltip (including the fallback) can never retain stale copy
 * after a language switch.
 */
export const buildBBTTooltipText = (
  point: BBTDataPoint | undefined,
  t: ReturnType<typeof useTranslation>['t'],
): string => {
  const fallback = t('charts.bbt.tooltip', { defaultValue: 'Press the line for details' });
  if (!point) return fallback;
  const formatted = formatLocalizedNumber(point.bbt, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatTooltipDate(point.date)}: ${formatted}°C`;
};

const BBTLineChart: React.FC<BBTLineChartProps> = ({ data, isLoading }) => {
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

  // Reset a lingering selection when data changes
  const [tooltipResetKey, setTooltipResetKey] = useState({ data });
  if (tooltipResetKey.data !== data) {
    setTooltipResetKey({ data });
    setSelectedIndex(null);
  }

  // Derive the presentation text from the selected point on every render, so
  // an already-visible tooltip (including the fallback) reflects the current
  // app language immediately.
  const selectedPoint = selectedIndex != null ? data[selectedIndex] : undefined;
  const tooltipText = buildBBTTooltipText(selectedPoint, t);

  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      // CartesianChart needs numeric index or date
      xValue: d.date,
      yValue: d.bbt,
    }));
  }, [data]);

  const onTouch = useCallback((index: number) => {
    if (data[index]) {
      setSelectedIndex(index);
    } else {
      setSelectedIndex(null);
    }
  }, [data]);

  const onTouchEnd = useCallback(() => {
    setSelectedIndex(null);
  }, []);



  if (isLoading) {
    return (
      <View className="h-44 justify-center items-center">
        <Text className="text-text-secondary text-sm">{t('charts.loading', { defaultValue: 'Loading chart...' })}</Text>
      </View>
    );
  }

  if (!hasData) {
    return (
      <View className="h-44 justify-center items-center bg-raised rounded-2xl border border-dashed border-border-subtle p-4">
        <Text className="text-text-secondary text-xs text-center italic">
          {t('charts.bbt.empty', { defaultValue: 'Log daily temperature logs to view your BBT chart.' })}
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 border-0 shadow-sm gap-2">
      <View className="h-6 justify-center mt-1 mb-2">
        <Text className="text-text-secondary text-xs text-center">{tooltipText}</Text>
      </View>

      <View className="h-44 w-full relative">
        <CartesianChart
          data={chartData}
          xKey="xValue"
          yKeys={['yValue']}
          axisOptions={{
            font,
            lineColor: 'rgba(150,150,150,0.1)',
            labelColor: textMuted,
            formatXLabel,
            tickCount: 5,
          }}
        >
          {({ points, chartBounds }) => (
            <>
              <Line
                points={points.yValue}
                color={accentColor || '#3B82F6'}
                strokeWidth={2}
              />
              <ChartLayoutReporter
                chartBounds={chartBounds}
                points={points.yValue}
                onChange={setTouchLayout}
              />
            </>
          )}
        </CartesianChart>

        <ChartTouchOverlay
          layout={touchLayout}
          onSelect={onTouch}
          onClear={onTouchEnd}
        />
      </View>
    </View>
  );
};

export default BBTLineChart;
