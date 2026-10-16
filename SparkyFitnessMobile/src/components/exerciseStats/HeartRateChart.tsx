import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import type { WorkoutHeartRatePoint } from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  computeNiceYAxisScale,
} from '../charts/chartFormatting';
import LineSeriesMark from '../charts/LineSeriesMark';

/** Keeps the Skia path light on long sessions sampled every second. */
const MAX_POINTS = 600;

interface HeartRateChartProps {
  data: readonly WorkoutHeartRatePoint[];
  /** Caption under the x axis, whose ticks are bare minute counts. */
  xAxisCaption: string;
}

/** Heart rate over the session, x in minutes from the first reading. */
const HeartRateChart: React.FC<HeartRateChartProps> = ({
  data,
  xAxisCaption,
}) => {
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [lineColor, textMuted] = useCSSVariable([
    '--color-heart-rate',
    '--color-text-muted',
  ]) as [string, string];

  const points = useMemo(() => {
    const step = Math.ceil(data.length / MAX_POINTS);
    return data
      .filter((_, index) => index % step === 0 || index === data.length - 1)
      .map((point) => ({ minute: point.elapsedMinutes, bpm: point.bpm }));
  }, [data]);

  const yAxisScale = useMemo(() => {
    const bpms = points.map((point) => point.bpm);
    return bpms.length > 0
      ? computeNiceYAxisScale(Math.min(...bpms), Math.max(...bpms))
      : undefined;
  }, [points]);

  return (
    <View>
      <View style={{ height: 180 }}>
        <CartesianChart
          data={points}
          xKey="minute"
          yKeys={['bpm']}
          domain={
            yAxisScale ? { y: [yAxisScale.min, yAxisScale.max] } : undefined
          }
          domainPadding={{ top: 8, bottom: 8 }}
          xAxis={{
            font,
            tickCount: 5,
            labelColor: textMuted,
            formatXLabel: (value) =>
              formatLocalizedNumber(Math.round(Number(value))),
          }}
          yAxis={[
            {
              font,
              tickCount: yAxisScale?.tickValues.length ?? 5,
              tickValues: yAxisScale?.tickValues,
              labelColor: textMuted,
              formatYLabel: (value) => formatLocalizedNumber(Number(value)),
            },
          ]}
        >
          {({ points: chartPoints }) => (
            <LineSeriesMark
              points={chartPoints.bpm}
              color={lineColor}
              strokeWidth={2}
              curveType="linear"
            />
          )}
        </CartesianChart>
      </View>
      <Text className="text-text-muted text-xs text-center mt-1">
        {xAxisCaption}
      </Text>
    </View>
  );
};

export default HeartRateChart;
