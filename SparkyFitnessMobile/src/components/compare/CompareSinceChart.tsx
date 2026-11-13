import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import {
  DashPathEffect,
  Line as SkiaLine,
  Rect,
} from '@shopify/react-native-skia';
import { type CompareSinceResponse, sinceChartData } from '@workspace/shared';
import { useTranslation } from 'react-i18next';
import { CartesianChart, Line } from 'victory-native';
import { useCSSVariable } from 'uniwind';

import { COMPARE_METRIC_LABELS } from '../../constants/compareMetrics';
import { compareValueText } from '../../utils/compareCopy';
import { formatDateWithYear, formatMonthYear } from '../../utils/dayLabel';
import {
  CHART_LABEL_FONT_SIZE,
  formatChartYLabel,
  formatXLabel30d90d,
  useChartFont,
} from '../charts/chartFormatting';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';

interface CompareSinceChartProps {
  response: CompareSinceResponse;
}

const CHART_HEIGHT = 200;
const SHADE_OPACITY = 0.15;
const LINE_DASH = [6, 4];
/** Past this many days the axis names months with their year. */
const SHORT_AXIS_DAYS = 120;

type Swatch = 'dot' | 'block' | 'dash';

/**
 * The outcome day by day, the before and since stretches shaded apart, a
 * marker where the start day begins and the line drawn across. Nothing before
 * there is a start; a yes/no outcome has no line.
 */
const CompareSinceChart: React.FC<CompareSinceChartProps> = ({ response }) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [accent, beforeColor, sinceColor, textMuted, textSecondary] =
    useCSSVariable([
      '--color-accent-primary',
      '--color-cat-slate',
      '--color-cat-teal',
      '--color-text-muted',
      '--color-text-secondary',
    ]) as [string, string, string, string, string];

  const chart = useMemo(
    () => sinceChartData(response, energyUnit),
    [response, energyUnit]
  );
  const key = response.outcome.key;
  const { start } = response.result;
  if (start === null || chart.rows.length === 0) return null;

  const metric = COMPARE_METRIC_LABELS[key](t);
  if (!chart.rows.some((row) => row.value !== null)) {
    return (
      <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
        <Text className="text-text-muted text-sm text-center">
          {t('compareReport.chart.noOverTime', {
            defaultValue: 'Nothing logged in this range',
          })}
        </Text>
      </View>
    );
  }

  const formatDay =
    chart.rows.length > SHORT_AXIS_DAYS ? formatMonthYear : formatXLabel30d90d;
  const formatY = (value: number) =>
    key === 'bedtime' ? compareValueText(key, value) : formatChartYLabel(value);

  const legend: { id: string; swatch: Swatch; color: string; text: string }[] =
    [
      { id: 'outcome', swatch: 'dot', color: accent, text: metric },
      ...(chart.before
        ? [
            {
              id: 'before',
              swatch: 'block' as const,
              color: beforeColor,
              text: t('compareReport.since.chartBefore', {
                defaultValue: 'Before',
              }),
            },
          ]
        : []),
      {
        id: 'since',
        swatch: 'block',
        color: sinceColor,
        text: t('compareReport.since.chartSince', { defaultValue: 'Since' }),
      },
      ...(chart.line !== null
        ? [
            {
              id: 'line',
              swatch: 'dash' as const,
              color: textMuted,
              text: t('compareReport.since.chartLine', {
                defaultValue: 'Line {{line}}',
                line: compareValueText(key, response.result.line, energyUnit),
              }),
            },
          ]
        : []),
    ];

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <View className="flex-row flex-wrap gap-x-4 gap-y-1 mb-2">
        {legend.map((item) => (
          <View key={item.id} className="flex-row items-center gap-1.5">
            <View
              className={
                item.swatch === 'dot'
                  ? 'w-2.5 h-2.5 rounded-full'
                  : item.swatch === 'block'
                    ? 'w-3 h-2.5 rounded-sm'
                    : 'w-3 h-0.5'
              }
              style={{
                backgroundColor: item.color,
                opacity: item.swatch === 'block' ? 0.5 : 1,
              }}
            />
            <Text className="text-text-secondary text-xs">{item.text}</Text>
          </View>
        ))}
      </View>
      <View
        style={{ height: CHART_HEIGHT }}
        accessible
        accessibilityLabel={t('compareReport.since.chartLabel', {
          defaultValue: '{{metric}} over time, before and since {{start}}',
          metric,
          start: formatDateWithYear(start),
        })}
      >
        <CartesianChart
          data={chart.rows}
          xKey="index"
          yKeys={chart.line === null ? ['value'] : ['value', 'line']}
          domainPadding={{ left: 8, right: 8, top: 8, bottom: 8 }}
          xAxis={{
            font,
            labelColor: textMuted,
            tickCount: 3,
            formatXLabel: (value) => {
              const day = chart.rows[Math.round(Number(value))]?.day;
              return day ? formatDay(day) : '';
            },
          }}
          yAxis={[
            {
              font,
              labelColor: textMuted,
              tickCount: 5,
              formatYLabel: (value) => formatY(Number(value)),
            },
          ]}
        >
          {({ points, chartBounds, xScale }) => {
            // Each day fills a slot one index wide, clipped to the plot.
            const slotLeft = (index: number) =>
              Math.max(chartBounds.left, xScale(index - 0.5));
            const slotRight = (index: number) =>
              Math.min(chartBounds.right, xScale(index + 0.5));
            const shade = (
              span: { from: number; to: number } | null,
              color: string
            ) =>
              span ? (
                <Rect
                  x={slotLeft(span.from)}
                  y={chartBounds.top}
                  width={Math.max(0, slotRight(span.to) - slotLeft(span.from))}
                  height={chartBounds.bottom - chartBounds.top}
                  color={color}
                  opacity={SHADE_OPACITY}
                />
              ) : null;
            const markerX = chart.start === null ? null : slotLeft(chart.start);
            return (
              <>
                {shade(chart.before, beforeColor)}
                {shade(chart.since, sinceColor)}
                {markerX === null ? null : (
                  <SkiaLine
                    p1={{ x: markerX, y: chartBounds.top }}
                    p2={{ x: markerX, y: chartBounds.bottom }}
                    color={textSecondary}
                    strokeWidth={1.5}
                  />
                )}
                {chart.line === null ? null : (
                  <Line
                    points={points.line}
                    color={textMuted}
                    strokeWidth={1.5}
                  >
                    <DashPathEffect intervals={LINE_DASH} />
                  </Line>
                )}
                <Line
                  points={points.value}
                  color={accent}
                  strokeWidth={1.5}
                  connectMissingData
                />
              </>
            );
          }}
        </CartesianChart>
      </View>
    </View>
  );
};

export default CompareSinceChart;
