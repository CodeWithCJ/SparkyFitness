import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Rect } from '@shopify/react-native-skia';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import { CHART_LABEL_FONT_SIZE, useChartFont } from '../charts/chartFormatting';
import LineSeriesMark from '../charts/LineSeriesMark';
import TrendGoalLine from '../charts/TrendGoalLine';
import { getAppLocale } from '../../localization';
import type { LabHistoryPoint } from '../../utils/labResults';

interface LabHistoryChartProps {
  points: LabHistoryPoint[];
  refRangeLow: number | null;
  refRangeHigh: number | null;
}

const formatDateWithYear = (day: string): string => {
  const parts = day.split('-');
  if (parts.length < 3) return day;
  const [year, month, d] = parts.map(Number);
  return new Date(year, (month || 1) - 1, d || 1).toLocaleDateString(
    getAppLocale(),
    { month: 'short', day: 'numeric', year: 'numeric' }
  );
};

/** A marker's results over time, with its reference range as dashed lines. */
const LabHistoryChart: React.FC<LabHistoryChartProps> = ({
  points,
  refRangeLow,
  refRangeHigh,
}) => {
  const { t } = useTranslation();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  // Keep the range lines inside the plot even when every result is in range.
  const domain = useMemo(() => {
    const values = points.map((p) => p.value);
    const all = [
      ...values,
      ...(refRangeLow != null ? [refRangeLow] : []),
      ...(refRangeHigh != null ? [refRangeHigh] : []),
    ];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min || Math.abs(max) || 1) * 0.15;
    return { y: [Math.max(0, min - pad), max + pad] as [number, number] };
  }, [points, refRangeLow, refRangeHigh]);

  if (points.length === 0) {
    return (
      <View className="h-40 justify-center items-center">
        <Text className="text-text-muted text-sm">
          {t('labs.chartEmpty', { defaultValue: 'No results yet' })}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height: 200 }}>
      <CartesianChart
        data={points}
        xKey="day"
        yKeys={['value']}
        domain={domain}
        domainPadding={{ left: 25, right: 25, top: 12, bottom: 12 }}
        xAxis={{
          font,
          tickCount: Math.min(points.length, 4),
          labelColor: textMuted,
          formatXLabel: formatDateWithYear,
        }}
        yAxis={[{ font, tickCount: 5, labelColor: textMuted }]}
      >
        {({ points: plotted, chartBounds, yScale }) => (
          <>
            {refRangeLow != null && refRangeHigh != null && (
              <Rect
                x={chartBounds.left}
                y={yScale(refRangeHigh)}
                width={chartBounds.right - chartBounds.left}
                height={yScale(refRangeLow) - yScale(refRangeHigh)}
                color={accentColor}
                opacity={0.12}
              />
            )}
            <LineSeriesMark
              points={plotted.value}
              color={accentColor}
              strokeWidth={2}
              animate={{ type: 'timing', duration: 300 }}
              curveType="linear"
              connectMissingData
            />
            {refRangeLow != null && (
              <TrendGoalLine
                points={plotted.value}
                chartBounds={chartBounds}
                yScale={yScale}
                goals={points.map(() => refRangeLow)}
                color={textMuted}
              />
            )}
            {refRangeHigh != null && (
              <TrendGoalLine
                points={plotted.value}
                chartBounds={chartBounds}
                yScale={yScale}
                goals={points.map(() => refRangeHigh)}
                color={textMuted}
              />
            )}
          </>
        )}
      </CartesianChart>
    </View>
  );
};

export default LabHistoryChart;
