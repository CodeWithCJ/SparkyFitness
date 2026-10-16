import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useSleepAnalytics } from '../hooks/useSleepAnalytics';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportInsights from '../components/reports/ReportInsights';
import ReportSummaryCard from '../components/reports/ReportSummaryCard';
import ReportHighlights, {
  type ReportHighlight,
} from '../components/reports/ReportHighlights';
import { sleepMetricSection } from '../constants/reports';
import { useReportCustomization } from '../hooks/useReportCustomization';
import TrendBarChart from '../components/TrendBarChart';
import { formatTooltipDate } from '../components/charts/chartFormatting';
import StatusView from '../components/StatusView';
import type {
  SleepAnalyticsMetric,
  SleepAnalyticsPoint,
} from '../utils/sleepAnalytics';
import type { RootStackScreenProps } from '../types/navigation';

type SleepAnalyticsScreenProps = RootStackScreenProps<'SleepAnalytics'>;

type MetricConfig = {
  key: SleepAnalyticsMetric;
  title: string;
  /** Unit appended to a value, already localized. */
  unit: string;
  maximumFractionDigits: number;
};

const getValue = (point: SleepAnalyticsPoint) => Math.max(0, point.value);

const formatSeconds = (
  seconds: number | null,
  t: ReturnType<typeof useTranslation>['t']
): string => {
  if (seconds === null) return '-';
  const totalMinutes = Math.round(seconds / 60);
  return t('sleepAnalytics.duration', {
    defaultValue: '{{hours}}h {{minutes}}m',
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  });
};

const formatClock = (minutes: number | null): string => {
  if (minutes === null) return '-';
  const rounded = Math.round(minutes) % 1440;
  return new Date(
    2000,
    0,
    1,
    Math.floor(rounded / 60),
    rounded % 60
  ).toLocaleTimeString(getAppLocale(), { hour: 'numeric', minute: '2-digit' });
};

const SleepAnalyticsScreen: React.FC<SleepAnalyticsScreenProps> = () => {
  const { t } = useTranslation();
  const {
    window: reportWindow,
    rangeProps,
    isSectionShown,
  } = useReportCustomization();
  const { analytics, previousAnalytics, isLoading, isError } =
    useSleepAnalytics({ window: reportWindow });
  const days = reportWindow.days;

  const header = useScreenHeader({
    title: t('sleepAnalytics.title', { defaultValue: 'Sleep Analytics' }),
    left: { kind: 'back' },
  });

  const metrics = useMemo<MetricConfig[]>(
    () => [
      {
        key: 'duration',
        title: t('sleepAnalytics.metrics.duration', {
          defaultValue: 'Time asleep',
        }),
        unit: ' h',
        maximumFractionDigits: 1,
      },
      {
        key: 'sleepScore',
        title: t('sleepAnalytics.metrics.sleepScore', {
          defaultValue: 'Sleep score',
        }),
        unit: '',
        maximumFractionDigits: 0,
      },
      {
        key: 'hrv',
        title: t('sleepAnalytics.metrics.hrv', {
          defaultValue: 'Overnight HRV',
        }),
        unit: ' ms',
        maximumFractionDigits: 0,
      },
      {
        key: 'restingHeartRate',
        title: t('sleepAnalytics.metrics.restingHeartRate', {
          defaultValue: 'Resting heart rate',
        }),
        unit: ' bpm',
        maximumFractionDigits: 0,
      },
      {
        key: 'spo2',
        title: t('sleepAnalytics.metrics.spo2', {
          defaultValue: 'Blood oxygen (SpO2)',
        }),
        unit: '%',
        maximumFractionDigits: 1,
      },
      {
        key: 'respiration',
        title: t('sleepAnalytics.metrics.respiration', {
          defaultValue: 'Respiration',
        }),
        unit: ' br/min',
        maximumFractionDigits: 1,
      },
      {
        key: 'stress',
        title: t('sleepAnalytics.metrics.stress', {
          defaultValue: 'Sleep stress',
        }),
        unit: '',
        maximumFractionDigits: 0,
      },
      {
        key: 'bodyBattery',
        title: t('sleepAnalytics.metrics.bodyBattery', {
          defaultValue: 'Body battery gained',
        }),
        unit: '',
        maximumFractionDigits: 0,
      },
    ],
    [t]
  );

  const formatMetric = useCallback(
    (value: number, metric: MetricConfig) =>
      `${formatLocalizedNumber(value, {
        maximumFractionDigits: metric.maximumFractionDigits,
      })}${metric.unit}`,
    []
  );

  if (!isLoading && !isError && analytics && analytics.nightsWithData === 0) {
    return (
      <ReportScreenLayout header={header} {...rangeProps}>
        <StatusView
          icon="sleep-bedtime"
          iconTone="muted"
          inline
          title={t('sleepAnalytics.empty', {
            defaultValue: 'No sleep data in this period',
          })}
          subtitle={t('sleepAnalytics.emptyHint', {
            defaultValue: 'Sync your health data to see sleep trends.',
          })}
        />
      </ReportScreenLayout>
    );
  }

  const visibleMetrics = analytics
    ? metrics.filter((metric) => analytics.averages[metric.key] !== null)
    : [];

  const changeHint = (metric: MetricConfig): string | undefined => {
    const now = analytics?.averages[metric.key] ?? null;
    const before = previousAnalytics?.averages[metric.key] ?? null;
    if (now === null || before === null) return undefined;
    const digits = metric.maximumFractionDigits;
    const factor = 10 ** digits;
    const diff = Math.round((now - before) * factor) / factor;
    if (diff === 0) {
      return t('sleepAnalytics.noChange', {
        defaultValue: 'Same as previous {{days}} days',
        days,
      });
    }
    return t('sleepAnalytics.changeHint', {
      defaultValue: '{{change}} vs previous {{days}} days',
      change: `${diff > 0 ? '+' : ''}${formatMetric(diff, metric)}`,
      days,
    });
  };

  const stageShare = (pct: number | null): string | undefined =>
    pct === null
      ? undefined
      : t('sleepAnalytics.stageShare', {
          defaultValue: '{{pct}}% of the night',
          pct: formatLocalizedNumber(Math.round(pct)),
        });

  const hoursLabel = (hours: number | null): string =>
    hours === null
      ? '-'
      : t('sleepAnalytics.hoursValue', {
          defaultValue: '{{hours}} h',
          hours: formatLocalizedNumber(hours, { maximumFractionDigits: 1 }),
        });

  const weekendRows = analytics
    ? [
        ...(analytics.weekdayHours !== null && analytics.weekendHours !== null
          ? [
              {
                label: t('sleepAnalytics.weekdayAsleep', {
                  defaultValue: 'Weeknights asleep',
                }),
                value: hoursLabel(analytics.weekdayHours),
                testID: 'sleep-weekday-hours',
              },
              {
                label: t('sleepAnalytics.weekendAsleep', {
                  defaultValue: 'Weekend nights asleep',
                }),
                value: hoursLabel(analytics.weekendHours),
                hint: t('sleepAnalytics.weekendDiff', {
                  defaultValue: '{{diff}} vs weeknights',
                  diff: `${analytics.weekendHours - analytics.weekdayHours >= 0 ? '+' : ''}${hoursLabel(
                    analytics.weekendHours - analytics.weekdayHours
                  )}`,
                }),
                testID: 'sleep-weekend-hours',
              },
            ]
          : []),
        ...(analytics.weekdayBedtimeMinutes !== null &&
        analytics.weekendBedtimeMinutes !== null
          ? [
              {
                label: t('sleepAnalytics.weekdayBedtime', {
                  defaultValue: 'Weeknight bedtime',
                }),
                value: formatClock(analytics.weekdayBedtimeMinutes),
                testID: 'sleep-weekday-bedtime',
              },
              {
                label: t('sleepAnalytics.weekendBedtime', {
                  defaultValue: 'Weekend bedtime',
                }),
                value: formatClock(analytics.weekendBedtimeMinutes),
                testID: 'sleep-weekend-bedtime',
              },
            ]
          : []),
      ]
    : [];

  const nightRows =
    analytics && analytics.nightsWithDuration > 0
      ? [
          {
            label: t('sleepAnalytics.fullNights', {
              defaultValue: 'Nights of 7h or more',
            }),
            value: t('sleepAnalytics.fullNightsValue', {
              defaultValue: '{{full}} of {{total}}',
              full: analytics.fullNights,
              total: analytics.nightsWithDuration,
            }),
            testID: 'sleep-full-nights',
          },
          ...(analytics.longestNight
            ? [
                {
                  label: t('sleepAnalytics.longestNight', {
                    defaultValue: 'Longest night',
                  }),
                  value: hoursLabel(analytics.longestNight.hours),
                  hint: formatTooltipDate(analytics.longestNight.day),
                  testID: 'sleep-longest-night',
                },
              ]
            : []),
          ...(analytics.shortestNight
            ? [
                {
                  label: t('sleepAnalytics.shortestNight', {
                    defaultValue: 'Shortest night',
                  }),
                  value: hoursLabel(analytics.shortestNight.hours),
                  hint: formatTooltipDate(analytics.shortestNight.day),
                  testID: 'sleep-shortest-night',
                },
              ]
            : []),
        ]
      : [];

  const routineRows = analytics
    ? [
        {
          label: t('sleepAnalytics.efficiency', {
            defaultValue: 'Sleep efficiency',
          }),
          value:
            analytics.efficiencyPct === null
              ? '-'
              : `${formatLocalizedNumber(Math.round(analytics.efficiencyPct))}%`,
          hint: t('sleepAnalytics.efficiencyHint', {
            defaultValue: 'Time asleep as a share of time in bed',
          }),
          testID: 'sleep-efficiency',
        },
        {
          label: t('sleepAnalytics.avgBedtime', {
            defaultValue: 'Average bedtime',
          }),
          value: formatClock(analytics.averageBedtimeMinutes),
          testID: 'sleep-avg-bedtime',
        },
        {
          label: t('sleepAnalytics.avgWake', {
            defaultValue: 'Average wake time',
          }),
          value: formatClock(analytics.averageWakeMinutes),
          testID: 'sleep-avg-wake',
        },
        ...(analytics.bedtimeVariabilityMinutes === null
          ? []
          : [
              {
                label: t('sleepAnalytics.bedtimeVariability', {
                  defaultValue: 'Bedtime consistency',
                }),
                value: t('sleepAnalytics.variabilityValue', {
                  defaultValue: '±{{minutes}} min',
                  minutes: Math.round(analytics.bedtimeVariabilityMinutes),
                }),
                hint: t('sleepAnalytics.variabilityHint', {
                  defaultValue: 'Lower means a steadier routine',
                }),
                testID: 'sleep-bedtime-variability',
              },
            ]),
        ...(analytics.wakeVariabilityMinutes === null
          ? []
          : [
              {
                label: t('sleepAnalytics.wakeVariability', {
                  defaultValue: 'Wake time consistency',
                }),
                value: t('sleepAnalytics.variabilityValue', {
                  defaultValue: '±{{minutes}} min',
                  minutes: Math.round(analytics.wakeVariabilityMinutes),
                }),
                hint: t('sleepAnalytics.variabilityHint', {
                  defaultValue: 'Lower means a steadier routine',
                }),
                testID: 'sleep-wake-variability',
              },
            ]),
      ]
    : [];

  const averageRows = visibleMetrics.map((metric) => ({
    label: metric.title,
    value: formatMetric(analytics?.averages[metric.key] ?? 0, metric),
    hint: changeHint(metric),
    testID: `sleep-average-${metric.key}`,
  }));

  const durationMetric = metrics.find((metric) => metric.key === 'duration');
  const scoreMetric = metrics.find((metric) => metric.key === 'sleepScore');
  const signedDiff = (metric: MetricConfig | undefined) => {
    if (!metric || !analytics || !previousAnalytics) return undefined;
    const now = analytics.averages[metric.key];
    const before = previousAnalytics.averages[metric.key];
    if (now === null || before === null) return undefined;
    const factor = 10 ** metric.maximumFractionDigits;
    const diff = Math.round((now - before) * factor) / factor;
    if (diff === 0) return undefined;
    return {
      text: `${diff > 0 ? '+' : ''}${formatMetric(diff, metric)}`,
      tone: diff > 0 ? ('positive' as const) : ('negative' as const),
    };
  };
  const durationChange = signedDiff(durationMetric);
  const scoreChange = signedDiff(scoreMetric);
  const highlights: ReportHighlight[] = analytics
    ? [
        ...(durationMetric && analytics.averages.duration !== null
          ? [
              {
                label: durationMetric.title,
                value: formatMetric(
                  analytics.averages.duration,
                  durationMetric
                ),
                change: durationChange?.text,
                changeTone: durationChange?.tone,
                testID: 'sleep-highlight-duration',
              },
            ]
          : []),
        ...(analytics.efficiencyPct !== null
          ? [
              {
                label: t('sleepAnalytics.efficiency', {
                  defaultValue: 'Sleep efficiency',
                }),
                value: `${formatLocalizedNumber(Math.round(analytics.efficiencyPct))}%`,
                testID: 'sleep-highlight-efficiency',
              },
            ]
          : []),
        ...(scoreMetric && analytics.averages.sleepScore !== null
          ? [
              {
                label: scoreMetric.title,
                value: formatMetric(analytics.averages.sleepScore, scoreMetric),
                change: scoreChange?.text,
                changeTone: scoreChange?.tone,
                testID: 'sleep-highlight-score',
              },
            ]
          : []),
        {
          label: t('sleepAnalytics.nightsTracked', {
            defaultValue: 'Nights tracked',
          }),
          value: t('sleepAnalytics.nightsOfWindow', {
            defaultValue: '{{nights}} of {{total}}',
            nights: analytics.nightsWithData,
            total: days,
          }),
          testID: 'sleep-highlight-nights',
        },
      ]
    : [];

  const insightLines: string[] = [];
  if (analytics) {
    if (analytics.weekdayHours !== null && analytics.weekendHours !== null) {
      const diff = analytics.weekendHours - analytics.weekdayHours;
      if (Math.abs(diff) >= 0.5) {
        insightLines.push(
          diff > 0
            ? t('sleepAnalytics.insightWeekendLonger', {
                defaultValue:
                  'You sleep {{hours}} longer on weekends than on weeknights.',
                hours: hoursLabel(diff),
              })
            : t('sleepAnalytics.insightWeekendShorter', {
                defaultValue:
                  'You sleep {{hours}} less on weekends than on weeknights.',
                hours: hoursLabel(Math.abs(diff)),
              })
        );
      }
    }
    if (analytics.nightsWithDuration > 0) {
      insightLines.push(
        t('sleepAnalytics.insightFullNights', {
          defaultValue: '{{full}} of {{total}} nights reached 7 hours.',
          full: analytics.fullNights,
          total: analytics.nightsWithDuration,
        })
      );
    }
    if (
      analytics.bedtimeVariabilityMinutes !== null &&
      analytics.bedtimeVariabilityMinutes >= 45
    ) {
      insightLines.push(
        t('sleepAnalytics.insightIrregular', {
          defaultValue: 'Your bedtime varies by about ±{{minutes}} min.',
          minutes: Math.round(analytics.bedtimeVariabilityMinutes),
        })
      );
    }
    if (durationChange) {
      insightLines.push(
        t('sleepAnalytics.insightDurationChange', {
          defaultValue: 'Time asleep is {{change}} on the previous period.',
          change: durationChange.text,
        })
      );
    }
  }

  return (
    <ReportScreenLayout header={header} {...rangeProps}>
      {isLoading || isError ? (
        <StatusView
          loading={isLoading}
          icon="sleep-bedtime"
          iconTone="muted"
          inline
          title={
            isError
              ? t('sleepAnalytics.loadFailed', {
                  defaultValue: 'Failed to load sleep data',
                })
              : undefined
          }
        />
      ) : (
        <View>
          {isSectionShown('sleep.overview') && highlights.length > 0 ? (
            <ReportHighlights items={highlights} />
          ) : null}
          {isSectionShown('sleep.insights') ? (
            <ReportInsights lines={insightLines} testIDPrefix="sleep" />
          ) : null}
          {isSectionShown('sleep.stages') && analytics ? (
            <ReportSummaryCard
              title={t('sleepAnalytics.stages', {
                defaultValue: 'Average night',
              })}
              rows={[
                {
                  label: t('sleepAnalytics.stageDeep', {
                    defaultValue: 'Deep',
                  }),
                  value: formatSeconds(analytics.stages.deepSeconds, t),
                  hint: stageShare(analytics.stagePct.deep),
                  testID: 'sleep-stage-deep',
                },
                {
                  label: t('sleepAnalytics.stageLight', {
                    defaultValue: 'Light',
                  }),
                  value: formatSeconds(analytics.stages.lightSeconds, t),
                  hint: stageShare(analytics.stagePct.light),
                  testID: 'sleep-stage-light',
                },
                {
                  label: t('sleepAnalytics.stageRem', { defaultValue: 'REM' }),
                  value: formatSeconds(analytics.stages.remSeconds, t),
                  hint: stageShare(analytics.stagePct.rem),
                  testID: 'sleep-stage-rem',
                },
                {
                  label: t('sleepAnalytics.stageAwake', {
                    defaultValue: 'Awake',
                  }),
                  value: formatSeconds(analytics.stages.awakeSeconds, t),
                  hint: stageShare(analytics.stagePct.awake),
                  testID: 'sleep-stage-awake',
                },
              ]}
            />
          ) : null}
          {isSectionShown('sleep.routine') && routineRows.length > 0 ? (
            <ReportSummaryCard
              title={t('sleepAnalytics.routine', { defaultValue: 'Routine' })}
              rows={routineRows}
            />
          ) : null}
          {visibleMetrics
            .filter((metric) => isSectionShown(sleepMetricSection(metric.key)))
            .map((metric) => (
              <TrendBarChart
                key={metric.key}
                data={analytics?.series[metric.key] ?? []}
                isLoading={false}
                isError={false}
                range={reportWindow.chartRange}
                title={metric.title}
                getValue={getValue}
                formatTooltip={(point) =>
                  t('sleepAnalytics.tooltip', {
                    defaultValue: '{{value}} · {{date}}',
                    value:
                      point.value > 0 ? formatMetric(point.value, metric) : '-',
                    date: formatTooltipDate(point.day),
                  })
                }
                errorText=""
                emptyText=""
                testIDPrefix={`sleep-chart-${metric.key}`}
              />
            ))}
          {isSectionShown('sleep.weekendVsWeekday') &&
          weekendRows.length > 0 ? (
            <ReportSummaryCard
              title={t('sleepAnalytics.weekendVsWeekday', {
                defaultValue: 'Weekdays vs weekends',
              })}
              rows={weekendRows}
            />
          ) : null}
          {isSectionShown('sleep.nights') && nightRows.length > 0 ? (
            <ReportSummaryCard
              title={t('sleepAnalytics.nights', { defaultValue: 'Nights' })}
              rows={nightRows}
            />
          ) : null}
          {isSectionShown('sleep.averages') && averageRows.length > 0 ? (
            <ReportSummaryCard
              title={t('sleepAnalytics.averages', {
                defaultValue: 'Period averages',
              })}
              rows={averageRows}
            />
          ) : null}
        </View>
      )}
    </ReportScreenLayout>
  );
};

export default SleepAnalyticsScreen;
