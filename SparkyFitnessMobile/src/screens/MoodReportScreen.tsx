import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useMoodReport } from '../hooks/useMoodReport';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportInsights from '../components/reports/ReportInsights';
import ReportSummaryCard from '../components/reports/ReportSummaryCard';
import ReportHighlights, {
  type ReportHighlight,
} from '../components/reports/ReportHighlights';
import { useReportCustomization } from '../hooks/useReportCustomization';
import TrendBarChart from '../components/TrendBarChart';
import { formatTooltipDate } from '../components/charts/chartFormatting';
import {
  moodForValue,
  moodTagLabel,
  type MoodDayPoint,
} from '../utils/moodReport';
import type { RootStackScreenProps } from '../types/navigation';

type MoodReportScreenProps = RootStackScreenProps<'MoodReport'>;

const getMoodValue = (point: MoodDayPoint) => point.value;

const MoodReportScreen: React.FC<MoodReportScreenProps> = () => {
  const { t } = useTranslation();
  const {
    window: reportWindow,
    rangeProps,
    isSectionShown,
  } = useReportCustomization();
  const { report, previousReport, isLoading, isError } = useMoodReport({
    window: reportWindow,
  });
  const days = reportWindow.days;

  const header = useScreenHeader({
    title: t('moodReport.title', { defaultValue: 'Mood' }),
    left: { kind: 'back' },
  });

  const formatTooltip = useCallback(
    (point: MoodDayPoint) => {
      const mood = point.value > 0 ? moodForValue(point.value) : null;
      return t('moodReport.tooltip', {
        defaultValue: '{{mood}} · {{date}}',
        mood: mood ? `${mood.emoji} ${mood.name}` : '-',
        date: formatTooltipDate(point.day),
      });
    },
    [t]
  );

  const averageMood =
    report?.averageValue != null ? moodForValue(report.averageValue) : null;

  const previousAverage = previousReport?.averageValue ?? null;
  const averageDiff =
    report?.averageValue != null && previousAverage !== null
      ? Math.round(report.averageValue - previousAverage)
      : null;
  const averageHint =
    averageDiff === null
      ? undefined
      : t('moodReport.changeHint', {
          defaultValue: '{{change}} vs previous {{days}} days',
          change: `${averageDiff > 0 ? '+' : ''}${formatLocalizedNumber(averageDiff)}`,
          days,
        });

  const dayRow = (
    label: string,
    point: MoodDayPoint | null,
    testID: string
  ) => {
    const mood = point ? moodForValue(point.value) : null;
    return point
      ? [
          {
            label,
            value: mood ? `${mood.emoji} ${mood.name}` : '-',
            hint: formatTooltipDate(point.day),
            testID,
          },
        ]
      : [];
  };

  const weekdayName = (weekday: number) =>
    // 2000-01-02 was a Sunday, so day 2 + weekday lands on that weekday.
    new Date(2000, 0, 2 + weekday).toLocaleDateString(getAppLocale(), {
      weekday: 'long',
    });

  const rows = [
    {
      label: t('moodReport.averageMood', { defaultValue: 'Average mood' }),
      value:
        report?.averageValue != null
          ? `${averageMood ? `${averageMood.emoji} ${averageMood.name} · ` : ''}${formatLocalizedNumber(
              Math.round(report.averageValue)
            )}`
          : '-',
      hint: averageHint,
      testID: 'mood-average',
    },
    {
      label: t('moodReport.daysLogged', { defaultValue: 'Days logged' }),
      value: formatLocalizedNumber(report?.loggedDays ?? 0),
      testID: 'mood-days-logged',
    },
  ];

  const highlights: ReportHighlight[] =
    report && report.loggedDays > 0
      ? [
          {
            label: t('moodReport.averageMood', {
              defaultValue: 'Average mood',
            }),
            value: averageMood
              ? `${averageMood.emoji} ${averageMood.name}`
              : '-',
            change:
              averageDiff === null || averageDiff === 0
                ? undefined
                : `${averageDiff > 0 ? '+' : ''}${formatLocalizedNumber(averageDiff)}`,
            changeTone:
              averageDiff === null || averageDiff === 0
                ? 'neutral'
                : averageDiff > 0
                  ? 'positive'
                  : 'negative',
            testID: 'mood-highlight-average',
          },
          {
            label: t('moodReport.daysLogged', { defaultValue: 'Days logged' }),
            value: t('moodReport.daysOfWindow', {
              defaultValue: '{{logged}} of {{total}}',
              logged: report.loggedDays,
              total: days,
            }),
            testID: 'mood-highlight-days',
          },
          ...(report.best
            ? [
                {
                  label: t('moodReport.bestDay', { defaultValue: 'Best day' }),
                  value: formatTooltipDate(report.best.day),
                  testID: 'mood-highlight-best',
                },
              ]
            : []),
          ...(report.topTags[0]
            ? [
                {
                  label: t('moodReport.mostLogged', {
                    defaultValue: 'Most logged mood',
                  }),
                  value: moodTagLabel(report.topTags[0].tag),
                  testID: 'mood-highlight-top-tag',
                },
              ]
            : []),
        ]
      : [];

  const insightLines: string[] = [];
  if (report && report.loggedDays > 0) {
    if (report.weekdayAverages.length >= 3) {
      const best = report.weekdayAverages.reduce((a, b) =>
        b.value > a.value ? b : a
      );
      const bestMood = moodForValue(best.value);
      insightLines.push(
        t('moodReport.insightBestWeekday', {
          defaultValue: '{{weekday}} is your best day of the week{{mood}}.',
          weekday: weekdayName(best.weekday),
          mood: bestMood ? ` (${bestMood.emoji} ${bestMood.name})` : '',
        })
      );
    }
    if (report.topTags[0]) {
      insightLines.push(
        t('moodReport.insightTopMood', {
          defaultValue: 'Your most logged mood was {{mood}}, {{count}} times.',
          defaultValue_one:
            'Your most logged mood was {{mood}}, {{count}} time.',
          defaultValue_other:
            'Your most logged mood was {{mood}}, {{count}} times.',
          mood: moodTagLabel(report.topTags[0].tag),
          count: report.topTags[0].count,
        })
      );
    }
    if (averageDiff !== null && averageDiff !== 0) {
      insightLines.push(
        averageDiff > 0
          ? t('moodReport.insightUp', {
              defaultValue: 'Your average mood is up on the previous period.',
            })
          : t('moodReport.insightDown', {
              defaultValue: 'Your average mood is down on the previous period.',
            })
      );
    }
  }

  return (
    <ReportScreenLayout header={header} {...rangeProps}>
      {isSectionShown('mood.overview') && highlights.length > 0 ? (
        <ReportHighlights items={highlights} />
      ) : null}
      {isSectionShown('mood.insights') ? (
        <ReportInsights lines={insightLines} testIDPrefix="mood" />
      ) : null}
      {isSectionShown('mood.chart') ? (
        <TrendBarChart
          data={report?.days ?? []}
          isLoading={isLoading}
          isError={isError}
          range={reportWindow.chartRange}
          title={t('moodReport.chartTitle', { defaultValue: 'Daily mood' })}
          getValue={getMoodValue}
          formatTooltip={formatTooltip}
          formatYLabel={(value) => formatLocalizedNumber(Math.round(value))}
          errorText={t('moodReport.loadFailed', {
            defaultValue: 'Failed to load mood entries',
          })}
          emptyText={t('moodReport.empty', {
            defaultValue: 'No mood entries in this period',
          })}
          testIDPrefix="mood-chart"
        />
      ) : null}
      {report && report.loggedDays > 0 ? (
        <>
          {isSectionShown('mood.summary') ? (
            <ReportSummaryCard
              title={t('moodReport.summary', { defaultValue: 'Summary' })}
              rows={rows}
            />
          ) : null}
          {isSectionShown('mood.highlights') && report.best ? (
            <ReportSummaryCard
              title={t('moodReport.highlights', { defaultValue: 'Highlights' })}
              rows={[
                ...dayRow(
                  t('moodReport.bestDay', { defaultValue: 'Best day' }),
                  report.best,
                  'mood-best-day'
                ),
                ...dayRow(
                  t('moodReport.lowestDay', { defaultValue: 'Lowest day' }),
                  report.lowest,
                  'mood-lowest-day'
                ),
              ]}
            />
          ) : null}
          {isSectionShown('mood.byWeekday') &&
          report.weekdayAverages.length > 1 ? (
            <ReportSummaryCard
              title={t('moodReport.byWeekday', {
                defaultValue: 'Average by weekday',
              })}
              rows={report.weekdayAverages.map(({ weekday, value }) => {
                const mood = moodForValue(value);
                return {
                  label: weekdayName(weekday),
                  value: mood ? `${mood.emoji} ${mood.name}` : '-',
                  testID: `mood-weekday-${weekday}`,
                };
              })}
            />
          ) : null}
          {isSectionShown('mood.topMoods') && report.topTags.length > 0 ? (
            <ReportSummaryCard
              title={t('moodReport.topMoods', { defaultValue: 'Most logged' })}
              rows={report.topTags.map(({ tag, count }) => ({
                label: moodTagLabel(tag),
                value: formatLocalizedNumber(count),
                testID: `mood-tag-${tag}`,
              }))}
            />
          ) : null}
        </>
      ) : null}
    </ReportScreenLayout>
  );
};

export default MoodReportScreen;
