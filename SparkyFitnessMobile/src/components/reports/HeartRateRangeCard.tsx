import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';

import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  formatXLabel7d,
  formatXLabel30d90d,
  formatTooltipDate,
  computeNiceYAxisScale,
} from '../charts/chartFormatting';
import LineSeriesMark from '../charts/LineSeriesMark';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from '../ChartTouchOverlay';
import { useHeartRateDailyAverages } from '../../hooks/useHeartRateTimelines';
import { formatLocalizedNumber } from '../../localization';

interface Props {
  startDate: string;
  endDate: string;
  windowDays: number;
  /**
   * Called with the day the finger lands on, to open it in the day timeline.
   * Left out while the day timeline is hidden, so no hint promises it.
   */
  onSelectDay?: (day: string) => void;
}

/** Average heart rate for every day of the report window. */
const HeartRateRangeCard: React.FC<Props> = ({
  startDate,
  endDate,
  windowDays,
  onSelectDay,
}) => {
  const { t } = useTranslation();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [lineColor, textMuted] = useCSSVariable([
    '--color-heart-rate',
    '--color-text-muted',
  ]) as [string, string];
  const { days, isLoading, isError } = useHeartRateDailyAverages(
    startDate,
    endDate
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT
  );

  const yScale = useMemo(() => {
    if (days.length === 0) return undefined;
    return computeNiceYAxisScale(
      Math.max(30, Math.min(...days.map((d) => d.minBpm)) - 5),
      Math.max(...days.map((d) => d.maxBpm)) + 5
    );
  }, [days]);

  const handleLayout = useCallback((next: ChartTouchLayout) => {
    setTouchLayout((current) =>
      createChartTouchLayoutSignature(current) ===
      createChartTouchLayoutSignature(next)
        ? current
        : next
    );
  }, []);

  const handleSelect = useCallback(
    (index: number) => {
      const point = days[index];
      if (!point) return;
      setSelected(index);
      onSelectDay?.(point.day);
    },
    [days, onSelectDay]
  );

  const point = selected !== null ? days[selected] : undefined;
  const tooltip = point
    ? t('reports.heartRateRangeTooltip', {
        defaultValue: '{{avg}} bpm avg ({{min}}–{{max}}) · {{date}}',
        avg: formatLocalizedNumber(point.avgBpm),
        min: formatLocalizedNumber(point.minBpm),
        max: formatLocalizedNumber(point.maxBpm),
        date: formatTooltipDate(point.day),
      })
    : onSelectDay
      ? t('reports.heartRateRangeHint', {
          defaultValue: 'Touch and hold a day to open it below',
        })
      : '';

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-lg font-semibold mb-1">
        {t('reports.heartRateRangeTimeline', {
          defaultValue: 'Average Heart Rate by Day',
        })}
      </Text>
      <View className="h-6 justify-center mt-2 mb-1">
        <Text className="text-text-secondary text-sm text-center">
          {tooltip}
        </Text>
      </View>
      {isLoading ? null : isError ? (
        <Text className="text-text-secondary text-sm text-center py-6">
          {t('reports.heartRateLoadFailed', {
            defaultValue: 'Failed to load heart rate data',
          })}
        </Text>
      ) : days.length === 0 ? (
        <Text
          testID="heart-rate-range-empty"
          className="text-text-secondary text-sm text-center py-6"
        >
          {t('reports.heartRateRangeEmpty', {
            defaultValue: 'No heart rate readings in this period',
          })}
        </Text>
      ) : (
        <View style={{ height: 185 }}>
          <CartesianChart
            data={days}
            xKey="day"
            yKeys={['avgBpm']}
            domain={yScale ? { y: [yScale.min, yScale.max] } : undefined}
            domainPadding={{ left: 25, right: 25, top: 12, bottom: 12 }}
            xAxis={{
              font,
              tickCount: windowDays <= 7 ? 7 : windowDays <= 30 ? 6 : 5,
              labelColor: textMuted,
              formatXLabel:
                windowDays <= 7 ? formatXLabel7d : formatXLabel30d90d,
            }}
            yAxis={[
              {
                font,
                tickCount: yScale?.tickValues.length ?? 5,
                labelColor: textMuted,
                tickValues: yScale?.tickValues,
              },
            ]}
          >
            {({ points, chartBounds }) => (
              <>
                <ChartLayoutReporter
                  chartBounds={chartBounds}
                  points={points.avgBpm}
                  onChange={handleLayout}
                />
                <LineSeriesMark
                  points={points.avgBpm}
                  color={lineColor}
                  strokeWidth={2.2}
                  curveType="cardinal"
                  connectMissingData
                />
              </>
            )}
          </CartesianChart>
          <ChartTouchOverlay
            layout={touchLayout}
            onSelect={handleSelect}
            onClear={() => setSelected(null)}
            testIDPrefix="heart-rate-range-touch-overlay"
          />
        </View>
      )}
    </View>
  );
};

export default HeartRateRangeCard;
