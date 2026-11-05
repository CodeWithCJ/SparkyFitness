import { addDays, daysBetween } from '@workspace/shared';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';

import { formatLocalizedNumber } from '../localization';
import {
  BIOMETRIC_TREND_NIGHTS,
  type BiometricTrendPoint,
} from '../utils/sleepBiometricTrend';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from './ChartTouchOverlay';
import {
  CHART_LABEL_FONT_SIZE,
  computeNiceYAxisScale,
  formatTooltipDate,
  formatXLabel30d90d,
  useChartFont,
} from './charts/chartFormatting';
import LineSeriesMark from './charts/LineSeriesMark';

interface SleepBiometricTrendChartProps {
  /** Points already in the unit shown, oldest first. */
  points: BiometricTrendPoint[];
  /** First day of the window, so each point sits at its night, gaps included. */
  startDay: string;
  unit: string;
  format?: Intl.NumberFormatOptions;
  isLoading: boolean;
  isError: boolean;
  testID?: string;
}

const CHART_HEIGHT = 150;

/**
 * A line of one overnight biometric across the last nights, opened under its row on
 * the Sleep Details card. Press and hold to read a night's value.
 */
const SleepBiometricTrendChart: React.FC<SleepBiometricTrendChartProps> = ({
  points,
  startDay,
  unit,
  format,
  isLoading,
  isError,
  testID,
}) => {
  const { t } = useTranslation();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT
  );

  // Clear a lingering selection when the points change, during render so the
  // tooltip never shows a value from the previous dataset.
  const [selectionPoints, setSelectionPoints] = useState(points);
  if (selectionPoints !== points) {
    setSelectionPoints(points);
    setSelectedIndex(null);
  }

  // A numeric x (nights since the window start), not the day string: victory-native
  // spaces string x values evenly, which would hide a gap of missing nights.
  const plotted = useMemo(
    () =>
      points.map((point) => ({
        x: daysBetween(startDay, point.day),
        value: point.value,
      })),
    [points, startDay]
  );
  const formatNightLabel = useCallback(
    (x: number) => formatXLabel30d90d(addDays(startDay, Math.round(x))),
    [startDay]
  );

  const yAxisScale = useMemo(() => {
    if (points.length === 0) return undefined;
    const values = points.map((point) => point.value);
    return computeNiceYAxisScale(Math.min(...values), Math.max(...values));
  }, [points]);

  const handleTouchLayoutChange = useCallback((next: ChartTouchLayout) => {
    setTouchLayout((current) =>
      createChartTouchLayoutSignature(current) ===
      createChartTouchLayoutSignature(next)
        ? current
        : next
    );
  }, []);

  const selected = selectedIndex != null ? points[selectedIndex] : undefined;
  const latest = points[points.length - 1];
  const shown = selected ?? latest;
  const caption = shown
    ? `${formatLocalizedNumber(shown.value, format)} ${unit} · ${formatTooltipDate(shown.day)}`
    : '';

  let body: React.ReactNode;
  if (isLoading) {
    body = t('common.loading', { defaultValue: 'Loading...' });
  } else if (isError) {
    body = t('sleep.trendLoadFailed', {
      defaultValue: 'Could not load the trend',
    });
  } else if (points.length < 2) {
    body = t('sleep.trendNotEnoughData', {
      defaultValue: 'Not enough nights to show a trend yet',
    });
  }

  return (
    <View testID={testID} className="pt-1 pb-2">
      {body != null ? (
        <View
          style={{ height: CHART_HEIGHT }}
          className="justify-center items-center"
        >
          <Text className="text-text-muted text-sm">{body}</Text>
        </View>
      ) : (
        <>
          <Text className="text-text-secondary text-xs text-center mb-1">
            {caption}
          </Text>
          <View style={{ height: CHART_HEIGHT }}>
            <CartesianChart
              data={plotted}
              xKey="x"
              yKeys={['value']}
              domain={{
                x: [0, BIOMETRIC_TREND_NIGHTS - 1],
                ...(yAxisScale ? { y: [yAxisScale.min, yAxisScale.max] } : {}),
              }}
              domainPadding={{ left: 12, right: 12, top: 8, bottom: 8 }}
              xAxis={{
                font,
                tickCount: 4,
                labelColor: textMuted,
                formatXLabel: formatNightLabel,
              }}
              yAxis={[
                {
                  font,
                  // Must match tickValues.length, or victory-native re-samples them.
                  tickCount: yAxisScale?.tickValues.length ?? 5,
                  labelColor: textMuted,
                  tickValues: yAxisScale?.tickValues,
                  formatYLabel: (value: number) =>
                    formatLocalizedNumber(value, format),
                },
              ]}
            >
              {({ points: chartPoints, chartBounds }) => (
                <>
                  <ChartLayoutReporter
                    chartBounds={chartBounds}
                    points={chartPoints.value}
                    onChange={handleTouchLayoutChange}
                  />
                  <LineSeriesMark
                    points={chartPoints.value}
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
              onSelect={setSelectedIndex}
              onClear={() => setSelectedIndex(null)}
              testIDPrefix={testID ? `${testID}-touch` : undefined}
            />
          </View>
        </>
      )}
    </View>
  );
};

export default SleepBiometricTrendChart;
