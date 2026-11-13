import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { DashPathEffect } from '@shopify/react-native-skia';
import {
  type CompareQuestion,
  type CompareResponse,
  displayDots,
  pairedDots,
  timingOf,
  trendLine,
} from '@workspace/shared';
import { useTranslation } from 'react-i18next';
import { CartesianChart, Line, Scatter } from 'victory-native';
import { useCSSVariable } from 'uniwind';

import { COMPARE_METRIC_LABELS } from '../../constants/compareMetrics';
import { dotsAxisCaption } from '../../utils/compareCopy';
import { formatLocalizedNumber } from '../../localization';
import { CHART_LABEL_FONT_SIZE, useChartFont } from '../charts/chartFormatting';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';

interface CompareScatterChartProps {
  response: CompareResponse;
  question: CompareQuestion;
}

const CHART_HEIGHT = 220;
const TREND_DASH = [6, 4];

const oneDecimal = (value: number): string =>
  formatLocalizedNumber(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

const CompareScatterChart: React.FC<CompareScatterChartProps> = ({
  response,
  question,
}) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [accent, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const { mode, timing } = timingOf(question.choice);
  const { data, hasTrend } = useMemo(() => {
    const dots = displayDots(
      pairedDots(response, mode, timing),
      question,
      energyUnit
    );
    // A fitted line reads as a finding, so it is drawn only for a real link.
    const line = response.result.linked === true ? trendLine(dots) : null;
    const sorted = [...dots].sort((p, q) => p.x - q.x);
    return {
      hasTrend: line !== null,
      data: sorted.map((dot) => ({
        x: dot.x,
        y: dot.y,
        trend: line ? line.slope * dot.x + line.intercept : dot.y,
      })),
    };
  }, [response, question, mode, timing, energyUnit]);

  const aLabel = COMPARE_METRIC_LABELS[question.a](t);
  const bLabel = COMPARE_METRIC_LABELS[question.b](t);

  if (data.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
        <Text className="text-text-muted text-sm text-center">
          {mode === 'week'
            ? t('compareReport.chart.noDotsWeeks', {
                defaultValue: 'No weeks with both yet',
              })
            : t('compareReport.chart.noDots', {
                defaultValue: 'No days with both yet',
              })}
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-muted text-xs mb-1">
        {dotsAxisCaption(question.b, mode, t)}
      </Text>
      <View
        style={{ height: CHART_HEIGHT }}
        accessible
        accessibilityLabel={t('compareReport.chart.dotsLabel', {
          defaultValue: 'Each dot pairs {{a}} with {{b}}',
          a: aLabel,
          b: bLabel,
        })}
      >
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={['y', 'trend']}
          domainPadding={{ left: 16, right: 16, top: 16, bottom: 16 }}
          xAxis={{
            font,
            labelColor: textMuted,
            tickCount: 5,
            formatXLabel: (value) => oneDecimal(Number(value)),
          }}
          yAxis={[
            {
              font,
              labelColor: textMuted,
              tickCount: 5,
              formatYLabel: (value) => oneDecimal(Number(value)),
            },
          ]}
        >
          {({ points }) => (
            <>
              {hasTrend && (
                <Line points={points.trend} color={textMuted} strokeWidth={1.5}>
                  <DashPathEffect intervals={TREND_DASH} />
                </Line>
              )}
              <Scatter
                points={points.y}
                color={accent}
                radius={4}
                shape="circle"
              />
            </>
          )}
        </CartesianChart>
      </View>
      <Text className="text-text-muted text-xs text-center mt-1">
        {dotsAxisCaption(question.a, mode, t)}
      </Text>
    </View>
  );
};

export default CompareScatterChart;
