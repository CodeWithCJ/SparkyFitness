import { useTranslation } from 'react-i18next';
import type { AdaptiveTdeeData } from './types';
import { useTrendUnits } from './useTrendUnits';

interface AdaptiveWeightDetailsProps {
  adaptiveTdeeData: AdaptiveTdeeData | null | undefined;
  summary?: boolean;
}

export const AdaptiveWeightDetails = ({
  adaptiveTdeeData: data,
  summary = false,
}: AdaptiveWeightDetailsProps) => {
  const { t } = useTranslation();
  const { trendMassUnit, toTrendMass } = useTrendUnits();
  if (typeof data?.weightChangeCalories !== 'number') return null;

  const fitted = data.weightTrendMethod === 'bounded_daily';
  if (summary) {
    const weeklyRate = toTrendMass((data.dailyWeightChangeKg ?? 0) * 7);
    return (
      <p>
        {t('diary.calculateExplanation.observedWeightRateSummary', {
          defaultValue:
            'Observed weight trend: {{sign}}{{rate}} {{unit}}/week.',
          sign: weeklyRate > 0 ? '+' : weeklyRate < 0 ? '−' : '',
          rate: Math.abs(weeklyRate).toFixed(2),
          unit: trendMassUnit,
        })}
      </p>
    );
  }
  const terms = {
    start: `${toTrendMass(data.startWeightTrend ?? 0).toFixed(1)} ${trendMassUnit}`,
    end: `${toTrendMass(data.endWeightTrend ?? 0).toFixed(1)} ${trendMassUnit}`,
    change: `${toTrendMass(data.weightChangeKg ?? 0).toFixed(2)} ${trendMassUnit}`,
    days: fitted
      ? (data.weightObservationSpanDays ?? 0)
      : Math.max(0, (data.daysInWindow ?? 0) - 1),
    daily: toTrendMass(data.dailyWeightChangeKg ?? 0).toFixed(4),
    unit: trendMassUnit,
    massUnit: trendMassUnit,
  };

  return (
    <>
      <li>
        {fitted
          ? t('diary.calculateExplanation.fittedWeightTrend', {
              defaultValue:
                'Fitted weight trend: {{start}} → {{end}} ({{change}} over {{days}} days) = {{daily}} {{massUnit}}/day — a line fitted to actual measurement dates; missing days are not filled.',
              ...terms,
            })
          : t('diary.calculateExplanation.weightTrendTerm', {
              defaultValue:
                'Weight trend: {{start}} → {{end}} ({{change}} over the {{days}} days between the window’s first and last day) = {{daily}} {{massUnit}}/day — 7-day averages of your logged weights, not the readings themselves, with missing days filled in between the ones either side',
              ...terms,
            })}
      </li>
      {fitted && (
        <li>
          {t('diary.calculateExplanation.measuredWeightCoverage', {
            defaultValue:
              'Observed weights: {{readings}} measured days spanning {{span}} days.',
            readings: data.observedWeightDays ?? 0,
            span: data.weightObservationSpanDays ?? 0,
          })}
        </li>
      )}
    </>
  );
};
