import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import { CartesianChart, Bar, useChartPressState, type ChartPressState } from 'victory-native';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { matchFont } from '@shopify/react-native-skia';
import { useCSSVariable } from 'uniwind';
import type { StepsDataPoint, StepsRange } from '../hooks/useMeasurementsRange';

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

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const font = matchFont({ fontFamily, fontSize: 11 });

const formatYLabel = (value: number) => {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
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
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

type StepsPressInit = { x: string; y: { steps: number } };

const StepsTooltip: React.FC<{ state: ChartPressState<StepsPressInit> }> = ({ state }) => {
  const [tooltipText, setTooltipText] = useState('Press a bar for details');

  const updateTooltip = useCallback((active: boolean, day: string, steps: number) => {
    if (!active || !day) {
      setTooltipText('Press a bar for details');
    } else {
      setTooltipText(`${steps.toLocaleString()} steps — ${formatTooltipDate(day)}`);
    }
  }, []);

  useAnimatedReaction(
    () => ({
      active: state.isActive.value,
      day: state.x.value.value,
      steps: state.y.steps.value.value,
    }),
    (current) => {
      runOnJS(updateTooltip)(current.active, current.day as string, current.steps);
    },
  );

  return (
    <View className="h-6 justify-center mt-3 mb-1">
      <Text className="text-text-secondary text-sm text-center">{tooltipText}</Text>
    </View>
  );
};

const StepsBarChart: React.FC<StepsBarChartProps> = ({
  data,
  isLoading,
  isError,
  range,
}) => {
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const { state } = useChartPressState({ x: '' as string, y: { steps: 0 } });

  const hasData = useMemo(() => data.some((d) => d.steps > 0), [data]);

  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">Steps</Text>

      <StepsTooltip state={state} />

      {isLoading ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">Loading...</Text>
        </View>
      ) : isError ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">Failed to load step data</Text>
        </View>
      ) : !hasData ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">No step data for this period</Text>
        </View>
      ) : (
        <View style={{ height: 175 }}>
          <CartesianChart
            data={data}
            xKey="day"
            yKeys={['steps']}
            domain={{ y: [0] }}
            domainPadding={{ left: 25, right: 25}}
            chartPressState={state}
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
              <Bar
                points={points.steps}
                chartBounds={chartBounds}
                color={accentColor}
                innerPadding={INNER_PADDING[range]}
                animate={{ type: 'timing', duration: 300 }}
                roundedCorners={{ topLeft: 6, topRight: 6 }}
              />
            )}
          </CartesianChart>
        </View>
      )}
    </View>
  );
};

export default StepsBarChart;
