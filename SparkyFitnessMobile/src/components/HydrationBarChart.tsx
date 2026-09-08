import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTooltipDate } from './charts/chartFormatting';
import type {
  HealthTrendDateRange,
  HydrationDataPoint,
} from '../types/healthTrends';
import {
  WATER_UNIT_LABELS,
  formatVolumeForUnit,
  volumeFromMl,
} from '../utils/unitConversions';
import TrendBarChart from './TrendBarChart';

type HydrationBarChartProps = {
  data: HydrationDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: HealthTrendDateRange;
  /** The user's `water_display_unit`. Points arrive from the server in millilitres. */
  unit: string;
};

/** A point already converted out of millilitres, so the plot and its labels agree. */
type ConvertedHydrationPoint = {
  day: string;
  volume: number;
};

const getVolume = (point: ConvertedHydrationPoint): number => point.volume;

const DEFAULT_TOOLTIP = '';

/**
 * Builds the tooltip copy from the selected point. The volume is already in the display
 * unit; the number is formatted against the current application locale on every render,
 * so an already-visible tooltip cannot retain stale copy after a language switch.
 */
export const buildHydrationTooltipText = (
  point: ConvertedHydrationPoint | undefined,
  unit: string,
  t: ReturnType<typeof useTranslation>['t']
): string => {
  if (!point) return DEFAULT_TOOLTIP;

  return t('charts.hydration.tooltip', {
    defaultValue: '{{formattedVolume}} {{unit}} · {{date}}',
    formattedVolume: formatVolumeForUnit(point.volume, unit),
    unit: WATER_UNIT_LABELS[unit] ?? unit,
    date: formatTooltipDate(point.day),
  });
};

/**
 * Daily water intake.
 *
 * This is the millilitres-to-display-unit boundary for the trend: converting once here
 * keeps the bars, the y-axis labels and the tooltip in the same unit, the same way
 * `DashboardScreen` owns the kg-to-display-unit boundary for the weight series.
 */
const HydrationBarChart: React.FC<HydrationBarChartProps> = ({
  data,
  isLoading,
  isError,
  range,
  unit,
}) => {
  const { t } = useTranslation();

  const convertedData = useMemo<ConvertedHydrationPoint[]>(
    () =>
      data.map((point) => ({
        day: point.day,
        volume: volumeFromMl(point.milliliters, unit),
      })),
    [data, unit]
  );

  const formatTooltip = useCallback(
    (point: ConvertedHydrationPoint) =>
      buildHydrationTooltipText(point, unit, t),
    [unit, t]
  );

  return (
    <TrendBarChart
      data={convertedData}
      isLoading={isLoading}
      isError={isError}
      range={range}
      title={t('charts.hydration.title', { defaultValue: 'Hydration' })}
      getValue={getVolume}
      formatTooltip={formatTooltip}
      errorText={t('charts.hydration.loadFailed', {
        defaultValue: 'Failed to load hydration data',
      })}
      emptyText={t('charts.hydration.empty', {
        defaultValue: 'No hydration data for this period',
      })}
      testIDPrefix="hydration-touch-overlay"
    />
  );
};

export default HydrationBarChart;
