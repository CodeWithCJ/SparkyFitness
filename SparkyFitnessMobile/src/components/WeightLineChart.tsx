import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { matchFont } from '@shopify/react-native-skia';
import { useCSSVariable } from 'uniwind';
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
import {
  formatDate,
  formatMonthDayShort,
  formatWeekdayShort,
} from '../utils/dateUtils';
import {
  formatMobileNumber,
  localizeServingUnit,
  mobileT,
} from '../localization';

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
  return formatWeekdayShort(day);
};

const formatXLabel30d90d = (day: string): string => {
  if (typeof day !== 'string') return '';
  return formatMonthDayShort(day);
};

const formatTooltipDate = (day: string): string => {
  return formatDate(day);
};

const formatTooltipWeight = (weight: number): string =>
  formatMobileNumber(weight, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const DEFAULT_TOOLTIP = mobileT('charts.pressWeight');

const WeightTooltip: React.FC<{ text: string }> = ({ text }) => (
  <View className="h-6 justify-center mt-3 mb-1">
    <Text className="text-text-secondary text-sm text-center">{text}</Text>
  </View>
);

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
  const [tooltipText, setTooltipText] = useState(DEFAULT_TOOLTIP);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT,
  );

  const hasData = useMemo(() => data.length > 0, [data]);

  const formatXLabel = range === '7d' ? formatXLabel7d : formatXLabel30d90d;

  // Clear a lingering tooltip when the dataset, range, or unit changes. Done
  // during render (instead of in an effect) so the tooltip is already reset on
  // the first render after the data changes.
  const [tooltipResetKey, setTooltipResetKey] = useState({ data, range, unit });
  if (
    tooltipResetKey.data !== data ||
    tooltipResetKey.range !== range ||
    tooltipResetKey.unit !== unit
  ) {
    setTooltipResetKey({ data, range, unit });
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

  const handleSelectPoint = useCallback(
    (index: number) => {
      const point = data[index];

      if (!point) {
        return;
      }

      setTooltipText(
        mobileT('charts.weightTooltip', {
          weight: `${formatTooltipWeight(point.weight)} ${localizeServingUnit(
            unit,
          )}`,
          date: formatTooltipDate(point.day),
        }),
      );
    },
    [data, unit],
  );

  const handleClearSelection = useCallback(() => {
    setTooltipText(DEFAULT_TOOLTIP);
  }, []);

  if (!hasData && !isLoading && !isError) {
    return null;
  }

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-2">
        {mobileT('charts.weight')}
      </Text>

      <WeightTooltip text={tooltipText} />

      {isLoading ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {mobileT('charts.loading')}
          </Text>
        </View>
      ) : isError ? (
        <View className="h-50 justify-center items-center">
          <Text className="text-text-muted text-sm">
            {mobileT('charts.weightError')}
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
                formatYLabel: value => formatMobileNumber(value),
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
