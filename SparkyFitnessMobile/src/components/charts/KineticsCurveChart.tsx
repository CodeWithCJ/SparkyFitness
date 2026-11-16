import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { CartesianChart, Line } from 'victory-native';
import { DashPathEffect } from '@shopify/react-native-skia';
import { useCSSVariable } from 'uniwind';
import { useChartFont, CHART_LABEL_FONT_SIZE } from './chartFormatting';
import LineSeriesMark from './LineSeriesMark';
import { usePreferences } from '../../hooks/usePreferences';
import { formatDateToTimeLabel } from '../../utils/entryTimeDisplay';

export type KineticsCurvePoint = { t: number; value: number };

type KineticsCurveChartProps = {
  data: KineticsCurvePoint[];
  testID: string;
  formatYLabel?: (value: number) => string;
  /** IANA zone for the clock labels; the device zone when left out. */
  timeZone?: string;
} & (
  | { threshold?: undefined; curveLabel?: undefined }
  | {
      /** Drawn as a dashed limit line; the legend names it and the curve. */
      threshold: { value: number; label: string };
      curveLabel: string;
    }
);

/**
 * A modeled intake level over one day (active caffeine, estimated blood
 * alcohol), with clock labels in the person's time format.
 */
const KineticsCurveChart: React.FC<KineticsCurveChartProps> = ({
  data,
  testID,
  formatYLabel,
  timeZone,
  threshold,
  curveLabel,
}) => {
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const { preferences } = usePreferences();
  const [accentColor, dangerColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-danger',
    '--color-text-muted',
  ]) as [string, string, string];

  // victory-native has no reference-line primitive, so the threshold is drawn
  // as a constant series.
  const thresholdValue = threshold?.value;
  const chartData = useMemo(
    () => data.map((point) => ({ ...point, threshold: thresholdValue ?? 0 })),
    [data, thresholdValue]
  );

  return (
    <>
      <View style={{ height: 150 }} testID={testID}>
        <CartesianChart
          data={chartData}
          xKey="t"
          yKeys={threshold ? ['value', 'threshold'] : ['value']}
          domainPadding={{ left: 10, right: 10, top: 12 }}
          xAxis={{
            font,
            tickCount: 4,
            labelColor: textMuted,
            formatXLabel: (value: number) =>
              formatDateToTimeLabel(
                new Date(value),
                preferences?.time_format,
                undefined,
                timeZone
              ),
          }}
          yAxis={[
            {
              font,
              tickCount: 4,
              labelColor: textMuted,
              ...(formatYLabel && {
                formatYLabel: (value: number | undefined) =>
                  value === undefined ? '' : formatYLabel(value),
              }),
            },
          ]}
        >
          {({ points }) => (
            <>
              {threshold ? (
                // Dashed so it reads as a limit rather than a second series.
                <Line
                  points={points.threshold}
                  color={dangerColor}
                  strokeWidth={1}
                >
                  <DashPathEffect intervals={[4, 4]} />
                </Line>
              ) : null}
              <LineSeriesMark
                points={points.value}
                color={accentColor}
                strokeWidth={2}
                curveType="linear"
                connectMissingData
              />
            </>
          )}
        </CartesianChart>
      </View>

      {/* The plot carries two series and no axis legend, so name them. */}
      {threshold ? (
        <View className="flex-row justify-center items-center gap-4 mt-1">
          <View className="flex-row items-center gap-1.5">
            <View
              style={{ width: 14, height: 2, backgroundColor: accentColor }}
            />
            <Text className="text-text-muted text-[11px]">{curveLabel}</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View
              style={{
                width: 14,
                height: 0,
                borderTopWidth: 1,
                borderStyle: 'dashed',
                borderColor: dangerColor,
              }}
            />
            <Text className="text-text-muted text-[11px]">
              {threshold.label}
            </Text>
          </View>
        </View>
      ) : null}
    </>
  );
};

export default KineticsCurveChart;
