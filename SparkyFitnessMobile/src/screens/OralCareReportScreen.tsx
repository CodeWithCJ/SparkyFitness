import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  summarizeOralCareRange,
  type OralCareHistoryDay,
} from '@workspace/shared';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useReportCustomization } from '../hooks/useReportCustomization';
import { useOralCareRange } from '../hooks/useOralCare';
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
import { formatOralCareClock } from '../utils/oralCare';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'OralCareReport'>;

/** The history endpoint answers at most this many days. */
const MAX_DAYS = 366;

const brushesOf = (d: OralCareHistoryDay) => d.brushing_count;
const minutesOf = (d: OralCareHistoryDay) => d.brushing_seconds / 60;

/** Reports → Oral care: brushing against the goal over the report window. */
const OralCareReportScreen: React.FC<Props> = () => {
  const { t } = useTranslation();
  const {
    window: reportWindow,
    rangeProps,
    isSectionShown,
  } = useReportCustomization();
  const endDate = reportWindow.endDate;
  const earliest = addDays(endDate, -(MAX_DAYS - 1));
  const startDate =
    reportWindow.startDate < earliest ? earliest : reportWindow.startDate;

  const query = useOralCareRange(startDate, endDate);

  const header = useScreenHeader({
    title: t('oralCareReport.title', { defaultValue: 'Oral care' }),
    left: { kind: 'back' },
  });

  const history = query.data;
  const days = useMemo(
    () => (history?.days ?? []).map((d) => ({ ...d, day: d.date })),
    [history?.days]
  );
  const summary = useMemo(
    () => summarizeOralCareRange(history?.days ?? []),
    [history?.days]
  );

  const formatBrushTooltip = useCallback(
    (d: OralCareHistoryDay & { day: string }) =>
      t('oralCareReport.brushesTooltip', {
        defaultValue: '{{count}} brushes · {{date}}',
        count: d.brushing_count,
        date: formatTooltipDate(d.day),
      }),
    [t]
  );
  const formatMinutesTooltip = useCallback(
    (d: OralCareHistoryDay & { day: string }) =>
      t('oralCareReport.minutesTooltip', {
        defaultValue: '{{time}} · {{date}}',
        time: formatOralCareClock(d.brushing_seconds),
        date: formatTooltipDate(d.day),
      }),
    [t]
  );

  if (query.isLoading || query.isError || !history) {
    return (
      <ReportScreenLayout header={header} {...rangeProps}>
        <StatusView
          loading={query.isLoading}
          icon="chart-bar"
          iconTone="muted"
          inline
          title={
            query.isError
              ? t('oralCareReport.loadFailed', {
                  defaultValue: 'Failed to load oral care data',
                })
              : undefined
          }
        />
      </ReportScreenLayout>
    );
  }

  const target = history.settings.daily_target;
  const hasData = history.days.some(
    (d) => d.brushing_count > 0 || d.other_count > 0
  );

  const highlights: ReportHighlight[] = hasData
    ? [
        {
          label: t('oralCareReport.goalDays', { defaultValue: 'Goal met' }),
          value: t('oralCareReport.goalDaysValue', {
            defaultValue: '{{met}} of {{total}} days',
            met: summary.goalDays,
            total: summary.totalDays,
          }),
          testID: 'oral-care-highlight-goal',
        },
        {
          label: t('oralCareReport.brushesPerDay', {
            defaultValue: 'Brushes per day',
          }),
          value: formatLocalizedNumber(
            Math.round(summary.brushesPerDay * 10) / 10
          ),
          testID: 'oral-care-highlight-brushes',
        },
        {
          label: t('oralCareReport.minutesPerDay', {
            defaultValue: 'Brushing per day',
          }),
          value: formatOralCareClock(summary.minutesPerDay * 60),
          testID: 'oral-care-highlight-minutes',
        },
      ]
    : [];

  const insightLines: string[] = [];
  if (hasData) {
    insightLines.push(
      t('oralCareReport.insightGoal', {
        defaultValue:
          'You brushed {{target}} times a day on {{percent}}% of days.',
        target,
        percent: formatLocalizedNumber(summary.goalPercent),
      })
    );
    if (history.best_streak >= 3) {
      insightLines.push(
        t('oralCareReport.insightStreak', {
          defaultValue: 'Your longest streak is {{count}} days.',
          count: history.best_streak,
        })
      );
    }
  }

  const goalLine = days.map(() => target);
  const minutesGoalLine = days.map(
    () => (target * history.settings.target_seconds) / 60
  );

  return (
    <ReportScreenLayout header={header} {...rangeProps}>
      {isSectionShown('oralCare.overview') && highlights.length > 0 ? (
        <ReportHighlights items={highlights} />
      ) : null}
      {isSectionShown('oralCare.insights') ? (
        <ReportInsights lines={insightLines} testIDPrefix="oral-care" />
      ) : null}
      {isSectionShown('oralCare.brushesChart') ? (
        <TrendBarChart
          data={days}
          isLoading={false}
          isError={false}
          range={reportWindow.chartRange}
          title={t('oralCareReport.brushesChart', {
            defaultValue: 'Brushes per day',
          })}
          getValue={brushesOf}
          formatTooltip={formatBrushTooltip}
          goalValues={goalLine}
          errorText={t('oralCareReport.loadFailed', {
            defaultValue: 'Failed to load oral care data',
          })}
          emptyText={t('oralCareReport.empty', {
            defaultValue: 'No oral care logged in this period',
          })}
          testIDPrefix="oral-care-brushes"
        />
      ) : null}
      {isSectionShown('oralCare.minutesChart') ? (
        <TrendBarChart
          data={days}
          isLoading={false}
          isError={false}
          range={reportWindow.chartRange}
          title={t('oralCareReport.minutesChart', {
            defaultValue: 'Minutes brushing per day',
          })}
          getValue={minutesOf}
          formatTooltip={formatMinutesTooltip}
          goalValues={minutesGoalLine}
          errorText={t('oralCareReport.loadFailed', {
            defaultValue: 'Failed to load oral care data',
          })}
          emptyText={t('oralCareReport.empty', {
            defaultValue: 'No oral care logged in this period',
          })}
          testIDPrefix="oral-care-minutes"
        />
      ) : null}
      {hasData ? (
        isSectionShown('oralCare.summary') ? (
          <ReportSummaryCard
            title={t('oralCareReport.summaryTitle', {
              defaultValue: 'Streaks and other care',
            })}
            rows={[
              {
                label: t('oralCareReport.currentStreak', {
                  defaultValue: 'Current streak',
                }),
                value: t('oralCareReport.daysCount', {
                  defaultValue: '{{count}} days',
                  count: history.streak,
                }),
                testID: 'oral-care-streak-current',
              },
              {
                label: t('oralCareReport.longestStreak', {
                  defaultValue: 'Longest streak',
                }),
                value: t('oralCareReport.daysCount', {
                  defaultValue: '{{count}} days',
                  count: history.best_streak,
                }),
                testID: 'oral-care-streak-longest',
              },
              {
                label: t('oralCareReport.otherCare', {
                  defaultValue: 'Flossing, mouthwash and other',
                }),
                value: formatLocalizedNumber(summary.other),
                testID: 'oral-care-other',
              },
            ]}
          />
        ) : null
      ) : (
        <StatusView
          icon="chart-bar"
          iconTone="muted"
          inline
          title={t('oralCareReport.empty', {
            defaultValue: 'No oral care logged in this period',
          })}
        />
      )}
    </ReportScreenLayout>
  );
};

export default OralCareReportScreen;
