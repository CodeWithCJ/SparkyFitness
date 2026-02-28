import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import { CartesianChart, Line, useChartPressState, type ChartPressState } from 'victory-native';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { matchFont } from '@shopify/react-native-skia';
import { useCSSVariable } from 'uniwind';
import type { WeightDataPoint, StepsRange } from '../hooks/useMeasurementsRange';

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

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const font = matchFont({ fontFamily, fontSize: 11 });

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

type WeightPressInit = { x: string; y: { weight: number } };

const WeightTooltip: React.FC<{ state: ChartPressState<WeightPressInit>; unit: string }> = ({ state, unit }) => {
  const [tooltipText, setTooltipText] = useState('Press the line for details');

  const updateTooltip = useCallback((active: boolean, day: string, weight: number) => {
    if (!active || !day) {
      setTooltipText('Press the line for details');
    } else {
      setTooltipText(`${weight} ${unit} — ${formatTooltipDate(day)}`);
    }
  }, [unit]);

  useAnimatedReaction(
    () => ({
      active: state.isActive.value,
      day: state.x.value.value,
      weight: state.y.weight.value.value,
    }),
    (current) => {
      runOnJS(updateTooltip)(current.active, current.day as string, current.weight);
    },
  );

  return (
    <View className="h-6 justify-center mt-3 mb-1">
      <Text className="text-text-secondary text-sm text-center">{tooltipText}</Text>
    </View>
  );
};

const WeightLineChart: React.FC<WeightLineChartProps> = ({
  data,
  isLoading,
  isError,
  range,
  unit,
}) => {
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const { state } = useChartPressState({ x: '' as string, y: { weight: 0 } });

  const hasData = useMemo(() => data.length > 0, [data]);

  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;

  if (!hasData && !isLoading && !isError) {
    return null;
  }

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">Weight</Text>

      <WeightTooltip state={state} unit={unit} />

      {isLoading ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">Loading...</Text>
        </View>
      ) : isError ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">Failed to load weight data</Text>
        </View>
      ) : (
        <View style={{ height: 175 }}>
          <CartesianChart
            data={data}
            xKey="day"
            yKeys={['weight']}
            domainPadding={{ left: 25, right: 25 }}
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
              },
            ]}
          >
            {({ points }) => (
              <Line
                points={points.weight}
                color={accentColor}
                strokeWidth={2}
                animate={{ type: 'timing', duration: 300 }}
                curveType='cardinal'
                connectMissingData
              />
            )}
          </CartesianChart>
        </View>
      )}
    </View>
  );
};

export default WeightLineChart;
