import React from 'react';
import { useTranslation } from 'react-i18next';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useMeasurementsReport } from '../hooks/useMeasurementsReport';
import { useReportCustomization } from '../hooks/useReportCustomization';
import { usePreferences, useProfile, useServerConnection } from '../hooks';
import { formatLocalizedNumber } from '../localization';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportInsights from '../components/reports/ReportInsights';
import ReportSummaryCard, {
  type ReportSummaryRow,
} from '../components/reports/ReportSummaryCard';
import ReportHighlights, {
  type ReportHighlight,
} from '../components/reports/ReportHighlights';
import WeightLineChart from '../components/WeightLineChart';
import StepsBarChart from '../components/StepsBarChart';
import StatusView from '../components/StatusView';
import { resolveWeightGoal } from '../utils/healthTrendGoals';
import type {
  MeasurementMetric,
  MeasurementTrend,
} from '../utils/measurementsReport';
import {
  formatWeightDisplay,
  lengthFromCm,
  weightFromKg,
} from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';

type MeasurementsReportScreenProps = RootStackScreenProps<'MeasurementsReport'>;

/** A change with an explicit sign, written from its magnitude so "-0.0" never shows. */
const withSign = (value: number, magnitude: string) =>
  `${value > 0 ? '+' : value < 0 ? '-' : ''}${magnitude}`;

const MeasurementsReportScreen: React.FC<
  MeasurementsReportScreenProps
> = () => {
  const { t } = useTranslation();
  const {
    window: reportWindow,
    rangeProps,
    isSectionShown,
  } = useReportCustomization();
  const { isConnected } = useServerConnection();
  const { preferences } = usePreferences({ enabled: isConnected });
  const { profile } = useProfile();
  const { report, isLoading, isError } = useMeasurementsReport({
    window: reportWindow,
  });

  const header = useScreenHeader({
    title: t('measurementsReport.title', { defaultValue: 'Measurements' }),
    left: { kind: 'back' },
  });

  const weightMode = preferences?.default_weight_unit ?? 'kg';
  // The chart is single-axis, so stones + lbs plots as lbs.
  const chartUnit: 'kg' | 'lbs' = weightMode === 'kg' ? 'kg' : 'lbs';
  const lengthUnit: 'cm' | 'inches' =
    (preferences?.default_measurement_unit ?? 'cm') === 'cm' ? 'cm' : 'inches';

  const fmt = (value: number, digits = 1) =>
    formatLocalizedNumber(value, { maximumFractionDigits: digits });
  const weightText = (kg: number) => formatWeightDisplay(kg, weightMode);
  const weightAmount = (kg: number) =>
    `${fmt(Math.abs(weightFromKg(kg, chartUnit)))} ${chartUnit}`;
  const weightChangeText = (kg: number) => withSign(kg, weightAmount(kg));
  const lengthText = (cm: number) =>
    `${fmt(lengthFromCm(cm, lengthUnit))} ${lengthUnit === 'cm' ? 'cm' : 'in'}`;
  const percentText = (value: number) => `${fmt(value)}%`;
  const massText = (kg: number) =>
    `${fmt(weightFromKg(kg, chartUnit))} ${chartUnit}`;

  if (isLoading || isError) {
    return (
      <ReportScreenLayout header={header} {...rangeProps}>
        <StatusView
          loading={isLoading}
          icon="chart-bar"
          iconTone="muted"
          inline
          title={
            isError
              ? t('measurementsReport.loadFailed', {
                  defaultValue: 'Failed to load measurements',
                })
              : undefined
          }
        />
      </ReportScreenLayout>
    );
  }

  const weight = report?.metrics.weight;
  const weightSeries = (weight?.points ?? []).map((point) => ({
    day: point.day,
    weight: weightFromKg(point.value, chartUnit),
  }));
  const weightGoal = resolveWeightGoal(profile?.target_weight, chartUnit);

  const trendRows = (
    metric: MeasurementMetric,
    trend: MeasurementTrend | undefined,
    label: string,
    format: (value: number) => string,
    formatChange: (value: number) => string
  ): ReportSummaryRow[] => {
    if (!trend || trend.latest === null) return [];
    return [
      {
        label,
        value: format(trend.latest),
        hint:
          trend.change === null
            ? undefined
            : t('measurementsReport.changeOverPeriod', {
                defaultValue: '{{change}} over the period',
                change: formatChange(trend.change),
              }),
        testID: `measurements-${metric}`,
      },
    ];
  };
  const plainChange = (suffix: string) => (value: number) =>
    withSign(value, `${fmt(Math.abs(value))}${suffix}`);

  const m = report?.metrics;
  const bodyRows = [
    ...trendRows(
      'body_fat_percentage',
      m?.body_fat_percentage,
      t('measurementsReport.bodyFat', { defaultValue: 'Body fat' }),
      percentText,
      plainChange('%')
    ),
    ...trendRows(
      'muscle_mass_kg',
      m?.muscle_mass_kg,
      t('measurementsReport.muscleMass', { defaultValue: 'Muscle mass' }),
      massText,
      (kg) => weightChangeText(kg)
    ),
  ];
  const tapeAmount = (cm: number) =>
    `${fmt(Math.abs(lengthFromCm(cm, lengthUnit)))} ${lengthUnit === 'cm' ? 'cm' : 'in'}`;
  const tapeChange = (cm: number) => withSign(cm, tapeAmount(cm));
  const tapeRows = [
    ...trendRows(
      'waist',
      m?.waist,
      t('measurementsReport.waist', { defaultValue: 'Waist' }),
      lengthText,
      tapeChange
    ),
    ...trendRows(
      'hips',
      m?.hips,
      t('measurementsReport.hips', { defaultValue: 'Hips' }),
      lengthText,
      tapeChange
    ),
    ...trendRows(
      'neck',
      m?.neck,
      t('measurementsReport.neck', { defaultValue: 'Neck' }),
      lengthText,
      tapeChange
    ),
  ];
  const weightRows: ReportSummaryRow[] =
    weight && weight.latest !== null
      ? [
          {
            label: t('measurementsReport.currentWeight', {
              defaultValue: 'Latest weight',
            }),
            value: weightText(weight.latest),
            testID: 'measurements-weight-latest',
          },
          ...(weight.change === null
            ? []
            : [
                {
                  label: t('measurementsReport.weightChange', {
                    defaultValue: 'Change over the period',
                  }),
                  value: weightChangeText(weight.change),
                  testID: 'measurements-weight-change',
                },
              ]),
          ...(weight.min !== null &&
          weight.max !== null &&
          weight.points.length > 1
            ? [
                {
                  label: t('measurementsReport.weightRange', {
                    defaultValue: 'Lowest / highest',
                  }),
                  value: `${weightText(weight.min)} / ${weightText(weight.max)}`,
                  testID: 'measurements-weight-range',
                },
              ]
            : []),
          ...(weightGoal !== undefined
            ? [
                {
                  label: t('measurementsReport.toGoal', {
                    defaultValue: 'To goal weight',
                  }),
                  value: `${fmt(
                    Math.abs(
                      weightFromKg(weight.latest, chartUnit) - weightGoal
                    )
                  )} ${chartUnit}`,
                  testID: 'measurements-weight-to-goal',
                },
              ]
            : []),
        ]
      : [];

  const highlights: ReportHighlight[] = [
    ...(weight && weight.latest !== null
      ? [
          {
            label: t('measurementsReport.weight', { defaultValue: 'Weight' }),
            value: weightText(weight.latest),
            change:
              weight.change === null || weight.change === 0
                ? undefined
                : weightChangeText(weight.change),
            // Whether a loss is good depends on the person's goal, so it stays neutral.
            changeTone: 'neutral' as const,
            testID: 'measurements-highlight-weight',
          },
        ]
      : []),
    ...(m?.body_fat_percentage.latest != null
      ? [
          {
            label: t('measurementsReport.bodyFat', {
              defaultValue: 'Body fat',
            }),
            value: percentText(m.body_fat_percentage.latest),
            change:
              m.body_fat_percentage.change === null ||
              m.body_fat_percentage.change === 0
                ? undefined
                : plainChange('%')(m.body_fat_percentage.change),
            changeTone: 'neutral' as const,
            testID: 'measurements-highlight-body-fat',
          },
        ]
      : []),
    ...(m?.waist.latest != null
      ? [
          {
            label: t('measurementsReport.waist', { defaultValue: 'Waist' }),
            value: lengthText(m.waist.latest),
            change:
              m.waist.change === null || m.waist.change === 0
                ? undefined
                : tapeChange(m.waist.change),
            changeTone: 'neutral' as const,
            testID: 'measurements-highlight-waist',
          },
        ]
      : []),
    ...(report && report.averageSteps !== null
      ? [
          {
            label: t('measurementsReport.avgSteps', {
              defaultValue: 'Avg steps',
            }),
            value: fmt(Math.round(report.averageSteps), 0),
            testID: 'measurements-highlight-steps',
          },
        ]
      : []),
  ];

  const insightLines: string[] = [];
  if (weight && weight.change !== null && weight.change !== 0) {
    insightLines.push(
      weight.change < 0
        ? t('measurementsReport.insightWeightDown', {
            defaultValue: 'Your weight is down {{amount}} over this period.',
            amount: weightAmount(weight.change),
          })
        : t('measurementsReport.insightWeightUp', {
            defaultValue: 'Your weight is up {{amount}} over this period.',
            amount: weightAmount(weight.change),
          })
    );
  }
  if (m?.waist.change != null && m.waist.change !== 0) {
    insightLines.push(
      m.waist.change < 0
        ? t('measurementsReport.insightWaistDown', {
            defaultValue: 'Your waist is down {{amount}}.',
            amount: tapeAmount(m.waist.change),
          })
        : t('measurementsReport.insightWaistUp', {
            defaultValue: 'Your waist is up {{amount}}.',
            amount: tapeAmount(m.waist.change),
          })
    );
  }
  if (weight && weight.latest !== null && weightGoal !== undefined) {
    const remaining = Math.abs(
      weightFromKg(weight.latest, chartUnit) - weightGoal
    );
    insightLines.push(
      t('measurementsReport.insightToGoal', {
        defaultValue: 'You are {{amount}} from your goal weight.',
        amount: `${fmt(remaining)} ${chartUnit}`,
      })
    );
  }
  if (report && report.averageSteps !== null) {
    insightLines.push(
      t('measurementsReport.insightSteps', {
        defaultValue:
          'You averaged {{steps}} steps on the days you recorded them.',
        steps: fmt(Math.round(report.averageSteps), 0),
      })
    );
  }

  const hasAnything =
    !!report && (report.checkInDays > 0 || report.stepDays > 0);

  return (
    <ReportScreenLayout header={header} {...rangeProps}>
      {!hasAnything ? (
        <StatusView
          icon="chart-bar"
          iconTone="muted"
          inline
          title={t('measurementsReport.empty', {
            defaultValue: 'No measurements in this period',
          })}
        />
      ) : (
        <>
          {isSectionShown('measurements.overview') && highlights.length > 0 ? (
            <ReportHighlights items={highlights} />
          ) : null}
          {isSectionShown('measurements.insights') ? (
            <ReportInsights lines={insightLines} testIDPrefix="measurements" />
          ) : null}
          {isSectionShown('measurements.weightChart') &&
          weightSeries.length > 0 ? (
            <WeightLineChart
              data={weightSeries}
              isLoading={false}
              isError={false}
              range={reportWindow.chartRange}
              unit={chartUnit}
              goal={weightGoal}
            />
          ) : null}
          {isSectionShown('measurements.weight') && weightRows.length > 0 ? (
            <ReportSummaryCard
              title={t('measurementsReport.weight', { defaultValue: 'Weight' })}
              rows={weightRows}
            />
          ) : null}
          {isSectionShown('measurements.bodyComposition') &&
          bodyRows.length > 0 ? (
            <ReportSummaryCard
              title={t('measurementsReport.bodyComposition', {
                defaultValue: 'Body composition',
              })}
              rows={bodyRows}
            />
          ) : null}
          {isSectionShown('measurements.tape') && tapeRows.length > 0 ? (
            <ReportSummaryCard
              title={t('measurementsReport.tape', {
                defaultValue: 'Body measurements',
              })}
              rows={tapeRows}
            />
          ) : null}
          {isSectionShown('measurements.stepsChart') &&
          (report?.stepDays ?? 0) > 0 ? (
            <StepsBarChart
              data={report?.steps ?? []}
              isLoading={false}
              isError={false}
              range={reportWindow.chartRange}
            />
          ) : null}
        </>
      )}
    </ReportScreenLayout>
  );
};

export default MeasurementsReportScreen;
