import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import { CartesianChart, Bar } from 'victory-native';
import { matchFont, Line as SkiaLine } from '@shopify/react-native-skia';
import { useCSSVariable } from 'uniwind';
import type { TrendRange } from '../hooks/useNutritionTrends';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from './ChartTouchOverlay';

export type NutrientChartDataPoint = {
  day: string;
  value: number;
};

type NutrientBarChartProps = {
  data: NutrientChartDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: TrendRange;
  nutrientLabel: string;
  unit: string;
  goal?: number;
};

const INNER_PADDING: Record<TrendRange, number> = {
  '7d': 0.3,
  '30d': 0.2,
  '90d': 0.1,
};

const X_TICK_COUNT: Record<TrendRange, number> = {
  '7d': 7,
  '30d': 6,
  '90d': 5,
};

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const font = matchFont({ fontFamily, fontSize: 11 });

const formatYLabel = (value: number) => {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (value % 1 !== 0) return value.toFixed(1);
  return String(value);
};

const formatXLabel7d = (day: string): string => {
  if (typeof day !== 'string') return '';
  const [year, month, d] = day.split('-').map(Number);
  const date = new Date(year, month - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

const formatXLabel30d90d = (day: string): string => {
  if (typeof day !== 'string') return '';
  const [year, month, d] = day.split('-').map(Number);
  const date = new Date(year, month - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatTooltipDate = (day: string): string => {
  const [year, month, d] = day.split('-').map(Number);
  const date = new Date(year, month - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const DEFAULT_TOOLTIP = 'Press a bar for details';

const NutrientTooltip: React.FC<{ text: string }> = ({ text }) => (
  <View className="h-6 justify-center mt-3 mb-1">
    <Text className="text-text-secondary text-sm text-center">{text}</Text>
  </View>
);

const NutrientBarChart: React.FC<NutrientBarChartProps> = ({
  data,
  isLoading,
  isError,
  range,
  nutrientLabel,
  unit,
  goal,
}) => {
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [tooltipText, setTooltipText] = useState(DEFAULT_TOOLTIP);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT,
  );

  const hasData = useMemo(() => data.some(d => d.value > 0), [data]);

  const maxVal = useMemo(() => {
    const dataMax = Math.max(...data.map((d) => d.value), 0);
    if (goal && goal > 0) {
      return Math.max(dataMax, goal) * 1.1;
    }
    return undefined;
  }, [data, goal]);

  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;

  const [tooltipResetKey, setTooltipResetKey] = useState({ data, range });
  if (tooltipResetKey.data !== data || tooltipResetKey.range !== range) {
    setTooltipResetKey({ data, range });
    setTooltipText(DEFAULT_TOOLTIP);
  }

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

      const formattedVal = point.value % 1 !== 0 ? point.value.toFixed(1) : point.value;
      setTooltipText(
        `${formattedVal}${unit} consumed · ${formatTooltipDate(
          point.day,
        )}`,
      );
    },
    [data, unit],
  );

  const handleClearSelection = useCallback(() => {
    setTooltipText(DEFAULT_TOOLTIP);
  }, []);

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">
        {nutrientLabel} ({unit})
      </Text>

      <NutrientTooltip text={tooltipText} />

      {isLoading ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">Loading...</Text>
        </View>
      ) : isError ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            Failed to load trend data
          </Text>
        </View>
      ) : !hasData ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            No logged intake for this period
          </Text>
        </View>
      ) : (
        <View style={{ height: 175 }}>
          <CartesianChart
            data={data}
            xKey="day"
            yKeys={['value']}
            domain={maxVal ? { y: [0, maxVal] } : { y: [0] }}
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
            {({ points, chartBounds }) => {
              let goalY: number | null = null;
              if (goal && goal > 0 && maxVal && maxVal > 0) {
                const height = chartBounds.bottom - chartBounds.top;
                const calculatedY = chartBounds.bottom - (goal / maxVal) * height;
                // Only render if it lies within the chart's visible drawing area
                if (calculatedY >= chartBounds.top && calculatedY <= chartBounds.bottom) {
                  goalY = calculatedY;
                }
              }

              return (
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
                  {goalY !== null && (
                    <SkiaLine
                      p1={{ x: chartBounds.left, y: goalY }}
                      p2={{ x: chartBounds.right, y: goalY }}
                      color="#10B981"
                      strokeWidth={1.5}
                    />
                  )}
                </>
              );
            }}
          </CartesianChart>
          <ChartTouchOverlay
            layout={touchLayout}
            onSelect={handleSelectBar}
            onClear={handleClearSelection}
            testIDPrefix="nutrient-touch-overlay"
          />
        </View>
      )}
    </View>
  );
};

export default NutrientBarChart;
