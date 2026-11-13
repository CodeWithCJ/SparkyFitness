import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import {
  type CompareQuestion,
  type CompareResponse,
  overTimeData,
} from '@workspace/shared';
import { useTranslation } from 'react-i18next';
import { CartesianChart, Line } from 'victory-native';
import { useCSSVariable } from 'uniwind';

import { COMPARE_METRIC_LABELS } from '../../constants/compareMetrics';
import { compareValueText } from '../../utils/compareCopy';
import {
  CHART_LABEL_FONT_SIZE,
  formatXLabel30d90d,
  useChartFont,
} from '../charts/chartFormatting';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';

interface CompareOverTimeChartProps {
  response: CompareResponse;
  question: CompareQuestion;
}

const CHART_HEIGHT = 200;

const CompareOverTimeChart: React.FC<CompareOverTimeChartProps> = ({
  response,
  question,
}) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [colorA, colorB, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-cat-orange',
    '--color-text-muted',
  ]) as [string, string, string];

  const { rows, aRange, bRange } = useMemo(
    () => overTimeData(response),
    [response]
  );
  const data = useMemo(
    () => rows.map((row, index) => ({ index, a: row.a, b: row.b })),
    [rows]
  );

  if (rows.length === 0) {
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

  const legend = [
    { id: 'a', key: question.a, range: aRange, color: colorA },
    { id: 'b', key: question.b, range: bRange, color: colorB },
  ].map((item) => ({
    ...item,
    text: item.range
      ? t('compareReport.chart.range', {
          defaultValue: '{{metric}} {{min}}–{{max}}',
          metric: COMPARE_METRIC_LABELS[item.key](t),
          min: compareValueText(item.key, item.range.min, energyUnit),
          max: compareValueText(item.key, item.range.max, energyUnit),
        })
      : COMPARE_METRIC_LABELS[item.key](t),
  }));

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <View className="flex-row flex-wrap gap-x-4 gap-y-1 mb-2">
        {legend.map((item) => (
          <View key={item.id} className="flex-row items-center gap-1.5">
            <View
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <Text className="text-text-secondary text-xs">{item.text}</Text>
          </View>
        ))}
      </View>
      <View
        style={{ height: CHART_HEIGHT }}
        accessible
        accessibilityLabel={t('compareReport.chart.overTimeLabel', {
          defaultValue:
            '{{a}} and {{b}} over time, each scaled to its own range',
          a: COMPARE_METRIC_LABELS[question.a](t),
          b: COMPARE_METRIC_LABELS[question.b](t),
        })}
      >
        <CartesianChart
          data={data}
          xKey="index"
          yKeys={['a', 'b']}
          domain={{ y: [0, 1] }}
          domainPadding={{ left: 8, right: 8, top: 8, bottom: 8 }}
          xAxis={{
            font,
            labelColor: textMuted,
            tickCount: 4,
            formatXLabel: (value) =>
              formatXLabel30d90d(rows[Math.round(Number(value))]?.key ?? ''),
          }}
          yAxis={[
            {
              font,
              tickValues: [0, 0.5, 1],
              formatYLabel: () => '',
            },
          ]}
        >
          {({ points }) => (
            <>
              <Line
                points={points.a}
                color={colorA}
                strokeWidth={2}
                connectMissingData
              />
              <Line
                points={points.b}
                color={colorB}
                strokeWidth={2}
                connectMissingData
              />
            </>
          )}
        </CartesianChart>
      </View>
    </View>
  );
};

export default CompareOverTimeChart;
