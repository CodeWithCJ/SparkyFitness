import React from 'react';
import { useTranslation } from 'react-i18next';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useSubstancesReport } from '../hooks/useSubstancesReport';
import { useReportCustomization } from '../hooks/useReportCustomization';
import { formatLocalizedNumber } from '../localization';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportInsights from '../components/reports/ReportInsights';
import ReportSummaryCard from '../components/reports/ReportSummaryCard';
import ReportHighlights, {
  type ReportHighlight,
} from '../components/reports/ReportHighlights';
import TrendBarChart from '../components/TrendBarChart';
import StatusView from '../components/StatusView';
import { formatTooltipDate } from '../components/charts/chartFormatting';
import { percentChange } from '../utils/nutritionReport';
import type { SubstanceDay } from '../utils/substancesReport';
import type { RootStackScreenProps } from '../types/navigation';

type SubstancesReportScreenProps = RootStackScreenProps<'SubstancesReport'>;

const caffeineValue = (point: SubstanceDay) => point.caffeineMg;
const alcoholValue = (point: SubstanceDay) => point.alcoholG;

const SubstancesReportScreen: React.FC<SubstancesReportScreenProps> = () => {
  const { t } = useTranslation();
  const {
    window: reportWindow,
    rangeProps,
    isSectionShown,
  } = useReportCustomization();
  const { report, isLoading, isError } = useSubstancesReport({
    window: reportWindow,
  });
  const days = reportWindow.days;

  const header = useScreenHeader({
    title: t('substancesReport.title', {
      defaultValue: 'Caffeine and alcohol',
    }),
    left: { kind: 'back' },
  });

  const fmt = (value: number, digits = 0) =>
    formatLocalizedNumber(value, { maximumFractionDigits: digits });
  const mg = (value: number) =>
    t('substancesReport.mg', {
      defaultValue: '{{value}} mg',
      value: fmt(Math.round(value)),
    });
  const grams = (value: number) =>
    t('substancesReport.grams', {
      defaultValue: '{{value}} g',
      value: fmt(value, value < 10 ? 1 : 0),
    });

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
              ? t('substancesReport.loadFailed', {
                  defaultValue: 'Failed to load caffeine and alcohol data',
                })
              : undefined
          }
        />
      </ReportScreenLayout>
    );
  }

  const hasAnything =
    !!report &&
    (report.caffeine.daysWithCaffeine > 0 || report.alcohol.drinkingDays > 0);

  if (!report || !hasAnything) {
    return (
      <ReportScreenLayout header={header} {...rangeProps}>
        <StatusView
          icon="chart-bar"
          iconTone="muted"
          inline
          title={t('substancesReport.empty', {
            defaultValue: 'No caffeine or alcohol logged in this period',
          })}
        />
      </ReportScreenLayout>
    );
  }

  const { caffeine, alcohol } = report;
  const caffeineChange = percentChange(
    caffeine.averageMg,
    caffeine.previousAverageMg
  );
  const alcoholChange = percentChange(
    alcohol.totalG,
    alcohol.previousTotalG > 0 ? alcohol.previousTotalG : null
  );
  const signedPercent = (value: number) =>
    `${value > 0 ? '+' : ''}${fmt(value)}%`;

  // Less is the better direction for both, so a rise is the warning color.
  const tone = (change: number | null) =>
    change === null || change === 0
      ? ('neutral' as const)
      : change < 0
        ? ('positive' as const)
        : ('negative' as const);

  const highlights: ReportHighlight[] = [
    ...(caffeine.averageMg !== null
      ? [
          {
            label: t('substancesReport.avgCaffeine', {
              defaultValue: 'Avg caffeine',
            }),
            value: mg(caffeine.averageMg),
            change:
              caffeineChange === null || caffeineChange === 0
                ? undefined
                : signedPercent(caffeineChange),
            changeTone: tone(caffeineChange),
            testID: 'substances-highlight-caffeine',
          },
        ]
      : []),
    ...(caffeine.daysWithCaffeine > 0
      ? [
          {
            label: t('substancesReport.daysOverLimit', {
              defaultValue: 'Days over limit',
            }),
            value: fmt(caffeine.daysOverLimit),
            testID: 'substances-highlight-over-limit',
          },
        ]
      : []),
    ...(alcohol.drinkingDays > 0
      ? [
          {
            label: t('substancesReport.totalAlcohol', {
              defaultValue: 'Alcohol total',
            }),
            value: grams(alcohol.totalG),
            change:
              alcoholChange === null || alcoholChange === 0
                ? undefined
                : signedPercent(alcoholChange),
            changeTone: tone(alcoholChange),
            testID: 'substances-highlight-alcohol',
          },
          {
            label: t('substancesReport.alcoholFreeDays', {
              defaultValue: 'Alcohol-free days',
            }),
            value: t('substancesReport.daysOfWindow', {
              defaultValue: '{{value}} of {{total}}',
              value: alcohol.alcoholFreeDays,
              total: alcohol.loggedDays,
            }),
            testID: 'substances-highlight-free-days',
          },
        ]
      : []),
  ];

  const insightLines: string[] = [];
  if (caffeine.daysWithCaffeine > 0) {
    insightLines.push(
      caffeine.daysOverLimit > 0
        ? caffeine.limitVaries
          ? t('substancesReport.insightOverVaries', {
              defaultValue:
                'You went over your caffeine limit on {{count}} days.',
              defaultValue_one:
                'You went over your caffeine limit on {{count}} day.',
              defaultValue_other:
                'You went over your caffeine limit on {{count}} days.',
              count: caffeine.daysOverLimit,
            })
          : t('substancesReport.insightOver', {
              defaultValue:
                'You went over {{limit}} of caffeine on {{count}} days.',
              limit: mg(caffeine.limitMg),
              count: caffeine.daysOverLimit,
            })
        : caffeine.limitVaries
          ? t('substancesReport.insightUnderVaries', {
              defaultValue: 'You stayed under your caffeine limit every day.',
            })
          : t('substancesReport.insightUnder', {
              defaultValue: 'You stayed under {{limit}} of caffeine every day.',
              limit: mg(caffeine.limitMg),
            })
    );
  }
  if (alcohol.drinkingDays > 0 && alcohol.alcoholFreeDays > 0) {
    insightLines.push(
      t('substancesReport.insightFree', {
        defaultValue:
          '{{free}} of your {{total}} logged days were alcohol-free.',
        free: alcohol.alcoholFreeDays,
        total: alcohol.loggedDays,
      })
    );
  }
  if (alcoholChange !== null && Math.abs(alcoholChange) >= 10) {
    insightLines.push(
      alcoholChange < 0
        ? t('substancesReport.insightAlcoholDown', {
            defaultValue: 'Alcohol is down {{pct}}% on the previous period.',
            pct: fmt(Math.abs(alcoholChange)),
          })
        : t('substancesReport.insightAlcoholUp', {
            defaultValue: 'Alcohol is up {{pct}}% on the previous period.',
            pct: fmt(alcoholChange),
          })
    );
  }

  const caffeineRows = [
    ...(caffeine.averageMg !== null
      ? [
          {
            label: t('substancesReport.avgOnCaffeineDays', {
              defaultValue: 'Average on days with caffeine',
            }),
            value: mg(caffeine.averageMg),
            testID: 'substances-caffeine-average',
          },
        ]
      : []),
    {
      label: t('substancesReport.limit', { defaultValue: 'Daily limit' }),
      value: mg(caffeine.limitMg),
      testID: 'substances-caffeine-limit',
    },
    {
      label: t('substancesReport.overLimit', {
        defaultValue: 'Days over the limit',
      }),
      value: t('substancesReport.daysCount', {
        defaultValue: '{{count}} days',
        count: caffeine.daysOverLimit,
      }),
      testID: 'substances-caffeine-over',
    },
    ...(caffeine.peak
      ? [
          {
            label: t('substancesReport.peakDay', {
              defaultValue: 'Highest day',
            }),
            value: mg(caffeine.peak.mg),
            hint: formatTooltipDate(caffeine.peak.day),
            testID: 'substances-caffeine-peak',
          },
        ]
      : []),
  ];

  const alcoholRows = [
    {
      label: t('substancesReport.drinkingDays', {
        defaultValue: 'Days with alcohol',
      }),
      value: t('substancesReport.daysCount', {
        defaultValue: '{{count}} days',
        count: alcohol.drinkingDays,
      }),
      testID: 'substances-alcohol-days',
    },
    ...(alcohol.averagePerDrinkingDayG !== null
      ? [
          {
            label: t('substancesReport.avgPerDrinkingDay', {
              defaultValue: 'Average on those days',
            }),
            value: grams(alcohol.averagePerDrinkingDayG),
            testID: 'substances-alcohol-average',
          },
        ]
      : []),
    ...(alcohol.peak
      ? [
          {
            label: t('substancesReport.peakDay', {
              defaultValue: 'Highest day',
            }),
            value: grams(alcohol.peak.g),
            hint: formatTooltipDate(alcohol.peak.day),
            testID: 'substances-alcohol-peak',
          },
        ]
      : []),
  ];

  // Caffeine is the headline (mg); alcohol is spelled out in the hint so a
  // bare "0 g" is never mistaken for caffeine.
  const weekRows = report.weeks.map((week, index) => ({
    label: `${formatTooltipDate(week.startDate)} – ${formatTooltipDate(week.endDate)}`,
    value:
      week.caffeineAvgMg === null
        ? grams(week.alcoholG)
        : mg(week.caffeineAvgMg),
    hint:
      week.caffeineAvgMg === null
        ? t('substancesReport.weekAlcohol', {
            defaultValue: 'alcohol',
          })
        : t('substancesReport.weekCaffeineAlcohol', {
            defaultValue: 'caffeine a day · {{alcohol}} alcohol',
            alcohol: grams(week.alcoholG),
          }),
    testID: `substances-week-${index}`,
  }));

  return (
    <ReportScreenLayout header={header} {...rangeProps}>
      {isSectionShown('substances.overview') && highlights.length > 0 ? (
        <ReportHighlights items={highlights} />
      ) : null}
      {isSectionShown('substances.insights') ? (
        <ReportInsights lines={insightLines} testIDPrefix="substances" />
      ) : null}
      {isSectionShown('substances.caffeineChart') &&
      caffeine.daysWithCaffeine > 0 ? (
        <TrendBarChart
          data={report.days}
          isLoading={false}
          isError={false}
          range={reportWindow.chartRange}
          title={t('substancesReport.caffeineChart', {
            defaultValue: 'Caffeine',
          })}
          getValue={caffeineValue}
          formatTooltip={(point) =>
            t('substancesReport.caffeineTooltip', {
              defaultValue: '{{value}} · {{date}}',
              value: mg(point.caffeineMg),
              date: formatTooltipDate(point.day),
            })
          }
          goalValues={report.days.map((day) => day.limitMg)}
          errorText=""
          emptyText=""
          testIDPrefix="substances-caffeine-chart"
        />
      ) : null}
      {isSectionShown('substances.caffeine') &&
      caffeine.daysWithCaffeine > 0 ? (
        <ReportSummaryCard
          title={t('substancesReport.caffeineTitle', {
            defaultValue: 'Caffeine',
          })}
          rows={caffeineRows}
        />
      ) : null}
      {isSectionShown('substances.alcoholChart') && alcohol.drinkingDays > 0 ? (
        <TrendBarChart
          data={report.days}
          isLoading={false}
          isError={false}
          range={reportWindow.chartRange}
          title={t('substancesReport.alcoholChart', {
            defaultValue: 'Alcohol',
          })}
          getValue={alcoholValue}
          formatTooltip={(point) =>
            t('substancesReport.alcoholTooltip', {
              defaultValue: '{{value}} · {{date}}',
              value: grams(point.alcoholG),
              date: formatTooltipDate(point.day),
            })
          }
          errorText=""
          emptyText=""
          testIDPrefix="substances-alcohol-chart"
        />
      ) : null}
      {isSectionShown('substances.alcohol') && alcohol.drinkingDays > 0 ? (
        <ReportSummaryCard
          title={t('substancesReport.alcoholTitle', {
            defaultValue: 'Alcohol',
          })}
          rows={alcoholRows}
        />
      ) : null}
      {isSectionShown('substances.weekly') && days > 7 ? (
        <ReportSummaryCard
          title={t('substancesReport.weekly', {
            defaultValue: 'Week by week',
          })}
          rows={weekRows}
        />
      ) : null}
    </ReportScreenLayout>
  );
};

export default SubstancesReportScreen;
