import React, { useMemo, useState } from 'react';
import { View, Text, Platform } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { matchFont } from '@shopify/react-native-skia';
import { useCSSVariable } from 'uniwind';
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

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const font = matchFont({ fontFamily, fontSize: 11 });

const formatXLabel = (day: string): string => {
  if (typeof day !== 'string') return '';
  const parts = day.split('-');
  if (parts.length < 3) return day;
  return `${parts[1]}/${parts[2]}`;
};

const formatTooltipDate = (day: string): string => {
  const parts = day.split('-');
  if (parts.length < 3) return day;
  const [year, month, d] = parts.map(Number);
  const date = new Date(year, (month || 1) - 1, d || 1);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const DEFAULT_TOOLTIP = 'Press the line for details';

const BBTLineChart: React.FC<BBTLineChartProps> = ({ data, isLoading }) => {
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [tooltipText, setTooltipText] = useState(DEFAULT_TOOLTIP);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT,
  );

  const hasData = useMemo(() => data.length > 0, [data]);

  // Clear a lingering tooltip when data changes
  const [tooltipResetKey, setTooltipResetKey] = useState({ data });
  if (tooltipResetKey.data !== data) {
    setTooltipResetKey({ data });
    setTooltipText(DEFAULT_TOOLTIP);
  }

  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      // CartesianChart needs numeric index or date
      xValue: d.date,
      yValue: d.bbt,
    }));
  }, [data]);

  const onTouch = (index: number) => {
    const point = data[index];
    if (point) {
      setTooltipText(`${formatTooltipDate(point.date)}: ${point.bbt.toFixed(2)}°C`);
    } else {
      setTooltipText(DEFAULT_TOOLTIP);
    }
  };

  const onTouchEnd = () => {
    setTooltipText(DEFAULT_TOOLTIP);
  };



  if (isLoading) {
    return (
      <View className="h-44 justify-center items-center">
        <Text className="text-text-secondary text-sm">Loading chart...</Text>
      </View>
    );
  }

  if (!hasData) {
    return (
      <View className="h-44 justify-center items-center bg-raised rounded-2xl border border-dashed border-border-subtle p-4">
        <Text className="text-text-secondary text-xs text-center italic">
          Log daily temperature logs to view your BBT chart.
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-2">
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
