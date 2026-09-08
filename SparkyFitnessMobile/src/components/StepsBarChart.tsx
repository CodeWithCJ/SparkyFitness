import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatLocalizedNumber } from '../localization/i18n';
import { formatTooltipDate } from './charts/chartFormatting';
import type { StepsDataPoint } from '../hooks/useMeasurementsRange';
import type { HealthTrendDateRange } from '../types/healthTrends';
import TrendBarChart from './TrendBarChart';

type StepsBarChartProps = {
  data: StepsDataPoint[];
  isLoading: boolean;
  isError: boolean;
  range: HealthTrendDateRange;
};

const getSteps = (point: StepsDataPoint): number => point.steps;

const DEFAULT_TOOLTIP = '';

/**
 * Builds the tooltip copy from the semantically selected data point. The text
 * is derived from the current `t` translator and the current application
 * locale on every render, so an already-visible tooltip can never retain stale
 * copy after a language switch.
 */
export const buildTooltipText = (
  point: StepsDataPoint | undefined,
  t: ReturnType<typeof useTranslation>['t']
): string => {
  if (!point) return DEFAULT_TOOLTIP;
  const formattedCount = formatLocalizedNumber(point.steps);
  return `${t('charts.steps.tooltip', {
    count: point.steps,
    formattedCount,
    defaultValue: '{{formattedCount}} steps',
    defaultValue_one: '{{formattedCount}} step',
    defaultValue_other: '{{formattedCount}} steps',
  })} · ${formatTooltipDate(point.day)}`;
};

const StepsBarChart: React.FC<StepsBarChartProps> = ({
  data,
  isLoading,
  isError,
  range,
}) => {
  const { t } = useTranslation();

  const formatTooltip = React.useCallback(
    (point: StepsDataPoint) => buildTooltipText(point, t),
    [t]
  );

  return (
    <TrendBarChart
      data={data}
      isLoading={isLoading}
      isError={isError}
      range={range}
      title={t('charts.steps.title', { defaultValue: 'Steps' })}
      getValue={getSteps}
      formatTooltip={formatTooltip}
      errorText={t('charts.steps.loadFailed', {
        defaultValue: 'Failed to load step data',
      })}
      emptyText={t('charts.steps.empty', {
        defaultValue: 'No step data for this period',
      })}
      testIDPrefix="steps-touch-overlay"
    />
  );
};

export default StepsBarChart;
