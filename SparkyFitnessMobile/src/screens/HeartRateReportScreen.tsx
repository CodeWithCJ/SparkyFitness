import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { CartesianChart } from 'victory-native';
import { defaultHeartRateZones } from '@workspace/shared';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useHeartRateReport } from '../hooks/useHeartRateReport';
import { useHeartRateZones } from '../hooks/useHeartRateZones';
import { useReportCustomization } from '../hooks/useReportCustomization';
import { formatLocalizedNumber } from '../localization';
import HeartRateZoneRanges from '../components/reports/HeartRateZoneRanges';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportSummaryCard, {
  type ReportSummaryRow,
} from '../components/reports/ReportSummaryCard';
import StatusView from '../components/StatusView';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  formatXLabel7d,
  formatXLabel30d90d,
  formatTooltipDate,
  computeNiceYAxisScale,
} from '../components/charts/chartFormatting';
import LineSeriesMark from '../components/charts/LineSeriesMark';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  createChartTouchLayoutSignature,
  type ChartTouchLayout,
} from '../components/ChartTouchOverlay';
import type { RootStackScreenProps } from '../types/navigation';

type HeartRateReportScreenProps = RootStackScreenProps<'HeartRateReport'>;

const X_TICK_COUNT = {
  '7d': 7,
  '30d': 6,
  '90d': 5,
};

const HeartRateReportScreen: React.FC<HeartRateReportScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const {
    window: reportWindow,
    rangeProps,
    isSectionShown,
  } = useReportCustomization();

  const header = useScreenHeader({
    title: t('reports.heartRate', { defaultValue: 'Heart Rate' }),
    left: { kind: 'back' },
  });

  // The person's own five zones (Settings > Heart Rate Zones), or the shared
  // defaults until they load
  const { zones } = useHeartRateZones();
  const resolvedZones = useMemo(() => {
    if (!zones) return defaultHeartRateZones();
    const r = zones.resolved;
    return {
      maxHr: r.max_hr,
      maxHrSource: r.max_hr_source,
      restingHr: r.resting_hr,
      method: r.method,
      effectiveMethod: r.effective_method,
      floors: r.zones.map((z) => z.lower_bpm),
      zones: r.zones.map((z) => ({
        zone: z.zone,
        lowerBpm: z.lower_bpm,
        upperBpm: z.upper_bpm,
      })),
    };
  }, [zones]);

  const { report, isLoading, isError } = useHeartRateReport({
    window: reportWindow,
  });

  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const textMuted = '#9ca3af';
  const heartRateColor = '#f43f5e';
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT
  );

  const days = useMemo(
    () => (Array.isArray(report?.days) ? report.days : []),
    [report]
  );
  const hasData = days.length > 0;

  const yAxisScale = useMemo(() => {
    if (days.length === 0) return undefined;
    const values = days.map((point) => point.restingHr);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return computeNiceYAxisScale(Math.max(30, min - 5), max + 5);
  }, [days]);

  const domain = useMemo(
    () =>
      yAxisScale
        ? { y: [yAxisScale.min, yAxisScale.max] as [number, number] }
        : undefined,
    [yAxisScale]
  );

  const formatXLabel =
    reportWindow.days <= 7 ? formatXLabel7d : formatXLabel30d90d;

  const selectedPoint =
    selectedIndex !== null ? days[selectedIndex] : undefined;

  const tooltipText = useMemo(() => {
    if (!selectedPoint) return '';
    return `${formatLocalizedNumber(selectedPoint.restingHr)} bpm · ${formatTooltipDate(selectedPoint.day)}`;
  }, [selectedPoint]);

  const handleTouchLayoutChange = useCallback(
    (nextLayout: ChartTouchLayout) => {
      setTouchLayout((currentLayout) => {
        if (
          createChartTouchLayoutSignature(currentLayout) ===
          createChartTouchLayoutSignature(nextLayout)
        ) {
          return currentLayout;
        }

        return nextLayout;
      });
    },
    []
  );

  const handleSelectPoint = useCallback(
    (index: number) => {
      const point = days[index];
      if (!point) return;
      setSelectedIndex(index);
    },
    [days]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  const summaryRows = useMemo<ReportSummaryRow[]>(() => {
    if (!report) return [];
    const rows: ReportSummaryRow[] = [];

    if (report.averageRestingHr !== null) {
      let hint: string | undefined;
      if (report.restingHrChange !== null && report.restingHrChange !== 0) {
        const sign = report.restingHrChange > 0 ? '+' : '';
        hint = t('reports.heartRateChangeVsPrevious', {
          defaultValue: '{{change}} bpm vs previous period',
          change: `${sign}${report.restingHrChange}`,
        });
      }
      rows.push({
        label: t('reports.averageRestingHr', {
          defaultValue: 'Average Resting Heart Rate',
        }),
        value: `${formatLocalizedNumber(report.averageRestingHr)} bpm`,
        hint,
      });
    }

    if (report.minRestingHr !== null && report.maxRestingHr !== null) {
      rows.push({
        label: t('reports.restingHrRange', {
          defaultValue: 'Resting HR Range',
        }),
        value: `${formatLocalizedNumber(report.minRestingHr)} - ${formatLocalizedNumber(report.maxRestingHr)} bpm`,
      });
    }

    if (report.avgRecovery1Min !== null) {
      rows.push({
        label: t('reports.heartRateRecovery1Min', {
          defaultValue: '1-Min Recovery',
        }),
        value: `-${formatLocalizedNumber(report.avgRecovery1Min)} bpm`,
        hint: t('reports.heartRateRecoveryHint', {
          defaultValue: 'Heart rate drop 1 minute post-exercise',
        }),
      });
    }

    rows.push({
      label: t('reports.recordedDays', { defaultValue: 'Recorded Days' }),
      value: t('reports.daysRatio', {
        defaultValue: '{{daysWithData}} of {{totalDays}} days',
        daysWithData: report.daysWithData,
        totalDays: report.totalDaysInWindow,
      }),
    });

    return rows;
  }, [report, t]);

  if (isLoading || isError) {
    return (
      <ReportScreenLayout header={header} {...rangeProps}>
        <StatusView
          loading={isLoading}
          icon="heart-rate"
          iconTone="muted"
          inline
          title={
            isError
              ? t('reports.heartRateLoadFailed', {
                  defaultValue: 'Failed to load heart rate data',
                })
              : undefined
          }
        />
      </ReportScreenLayout>
    );
  }

  if (!report || !hasData) {
    return (
      <ReportScreenLayout header={header} {...rangeProps}>
        <StatusView
          icon="heart-rate"
          iconTone="muted"
          inline
          title={t('reports.heartRateEmpty', {
            defaultValue: 'No heart rate data recorded for this period',
          })}
        />
      </ReportScreenLayout>
    );
  }

  return (
    <ReportScreenLayout header={header} {...rangeProps}>
      {/* 1. Multi-Day Resting HR Trend Chart */}
      {isSectionShown('heartRate.restingHrChart') && (
        <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
          <Text className="text-text-primary text-lg font-semibold mb-1">
            {t('reports.restingHeartRateTrend', {
              defaultValue: 'Resting Heart Rate Trend',
            })}
          </Text>
          <View className="h-6 justify-center mt-2 mb-1">
            <Text className="text-text-secondary text-sm text-center">
              {tooltipText}
            </Text>
          </View>

          <View style={{ height: 185 }}>
            <CartesianChart
              data={days}
              xKey="day"
              yKeys={['restingHr']}
              domain={domain}
              domainPadding={{ left: 25, right: 25, top: 12, bottom: 12 }}
              xAxis={{
                font,
                tickCount:
                  reportWindow.days <= 7
                    ? X_TICK_COUNT['7d']
                    : reportWindow.days <= 30
                      ? X_TICK_COUNT['30d']
                      : X_TICK_COUNT['90d'],
                labelColor: textMuted,
                formatXLabel,
              }}
              yAxis={[
                {
                  font,
                  tickCount: yAxisScale?.tickValues.length ?? 5,
                  labelColor: textMuted,
                  tickValues: yAxisScale?.tickValues,
                },
              ]}
            >
              {({ points, chartBounds }) => (
                <>
                  <ChartLayoutReporter
                    chartBounds={chartBounds}
                    points={points.restingHr}
                    onChange={handleTouchLayoutChange}
                  />
                  <LineSeriesMark
                    points={points.restingHr}
                    color={heartRateColor}
                    strokeWidth={2.2}
                    animate={{ type: 'timing', duration: 300 }}
                    curveType="cardinal"
                    connectMissingData
                  />
                </>
              )}
            </CartesianChart>
            <ChartTouchOverlay
              layout={touchLayout}
              onSelect={handleSelectPoint}
              onClear={handleClearSelection}
              testIDPrefix="heart-rate-report-touch-overlay"
            />
          </View>
        </View>
      )}

      {/* 2. Heart Rate Zones Guide */}
      {isSectionShown('heartRate.zones') && (
        <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
          <Text className="text-text-primary text-lg font-semibold mb-3">
            {t('reports.heartRateZones', {
              defaultValue: 'Heart Rate Zones',
            })}
          </Text>
          <HeartRateZoneRanges
            resolved={resolvedZones}
            displayZones={zones?.settings.display_zones ?? 5}
            isDefault={!zones}
            onOpenSettings={() => navigation.navigate('HeartRateZonesSettings')}
          />
        </View>
      )}

      {/* 3. Summary Metrics Card */}
      {isSectionShown('heartRate.overview') && (
        <ReportSummaryCard
          title={t('reports.heartRateSummary', {
            defaultValue: 'Heart Rate Summary',
          })}
          rows={summaryRows}
        />
      )}

      {/* 4. Insights & Health Guidance Card */}
      {isSectionShown('heartRate.insights') && (
        <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
          <Text className="text-text-primary text-lg font-semibold mb-2">
            {t('reports.heartRateInsights', {
              defaultValue: 'Resting Heart Rate Insights',
            })}
          </Text>
          <Text className="text-text-secondary text-sm leading-5">
            {report.averageRestingHr && report.averageRestingHr < 60
              ? t('reports.insightAthletic', {
                  defaultValue:
                    'Your average resting heart rate is in the athletic range (<60 bpm), reflecting strong cardiovascular efficiency.',
                })
              : t('reports.insightNormal', {
                  defaultValue:
                    'A typical healthy adult resting heart rate ranges from 60 to 100 bpm. Lower rates generally reflect higher cardiovascular fitness.',
                })}
          </Text>
        </View>
      )}
    </ReportScreenLayout>
  );
};

export default HeartRateReportScreen;
