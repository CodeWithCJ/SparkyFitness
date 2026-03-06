import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ZoomableChart from '@/components/ZoomableChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  SLEEP_STAGE_COLORS,
  type SleepAnalyticsData,
  type SleepChartData,
  type SleepEntry,
} from '@/types';
import { formatSecondsToHHMM } from '@/utils/timeFormatters';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Moon,
  TrendingUp,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import HRVCard from './HRVCard';
import SleepHeartRateCard from './SleepHeartRateCard';
import SleepRespirationCard from './SleepRespirationCard';
import SleepScienceSection from './SleepScience/SleepScienceSection';
import SleepStageChart from './SleepStageChart';
import SleepSummaryCard from './SleepSummaryCard';
import SpO2Card from './SpO2Card';
import { useSleepDebtQuery } from '@/hooks/SleepScience/useSleepScience';

interface SpO2DataPoint {
  date: string;
  average: number | null;
  lowest: number | null;
  highest: number | null;
}

interface HRVDataPoint {
  date: string;
  avg_overnight_hrv: number | null;
}

interface RespirationDataPoint {
  date: string;
  average: number | null;
  lowest: number | null;
  highest: number | null;
}

interface HeartRateDataPoint {
  date: string;
  resting_heart_rate: number | null;
}

interface SleepAnalyticsChartsProps {
  sleepAnalyticsData: SleepAnalyticsData[];
  sleepHypnogramData: SleepChartData[];
  spo2Data?: SpO2DataPoint[];
  hrvData?: HRVDataPoint[];
  respirationData?: RespirationDataPoint[];
  heartRateData?: HeartRateDataPoint[];
  latestSleepEntry?: SleepEntry | null;
}

const DEFAULT_HYPNOGRAMS_SHOWN = 2;

const SleepAnalyticsCharts = ({
  sleepAnalyticsData,
  sleepHypnogramData,
  spo2Data,
  hrvData,
  respirationData,
  heartRateData,
  latestSleepEntry,
}: SleepAnalyticsChartsProps) => {
  const { formatDateInUserTimezone, dateFormat } = usePreferences();
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation();
  const { data: sleepDebtData } = useSleepDebtQuery();
  const personalizedSleepNeed = sleepDebtData?.sleepNeed || 8;

  const tickColor = resolvedTheme === 'dark' ? '#E0E0E0' : '#333';
  const gridColor = resolvedTheme === 'dark' ? '#444' : '#ccc';
  const tooltipBackgroundColor = resolvedTheme === 'dark' ? '#333' : '#fff';
  const tooltipBorderColor = resolvedTheme === 'dark' ? '#555' : '#ccc';

  const [showAllHypnograms, setShowAllHypnograms] = useState(false);

  const formatBedWakeTime = (value: number) => {
    let hours = Math.floor(value);
    const minutes = Math.round((value - hours) * 60);

    // If hours >= 24, it means it's early morning (cross-midnight)
    if (hours >= 24) hours -= 24;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const chartData = sleepAnalyticsData
    .map((data) => {
      const totalMinutes =
        (data.stagePercentages.deep || 0) +
        (data.stagePercentages.rem || 0) +
        (data.stagePercentages.light || 0) +
        (data.stagePercentages.awake || 0);

      const bedtimeDate = new Date(data.earliestBedtime || 0);
      let bedtimeHours = bedtimeDate.getHours() + bedtimeDate.getMinutes() / 60;

      // CROSS-MIDNIGHT FIX:
      // If bedtime is between 00:00 and 12:00 (midday), treat it as 24:00+
      // This keeps the trend line continuous (e.g. 23:00 -> 01:00 becomes 23:00 -> 25:00)
      if (bedtimeHours >= 0 && bedtimeHours < 12) {
        bedtimeHours += 24;
      }

      const wakeTimeDate = new Date(data.latestWakeTime || 0);
      const wakeTimeHours =
        wakeTimeDate.getHours() + wakeTimeDate.getMinutes() / 60;

      return {
        date: data.date,
        deep: data.stagePercentages.deep,
        rem: data.stagePercentages.rem,
        light: data.stagePercentages.light,
        awake: data.stagePercentages.awake,
        totalMinutes,
        sleepDebt: data.sleepDebt,
        sleepEfficiency: data.sleepEfficiency,
        bedtime: bedtimeHours,
        wakeTime: wakeTimeHours,
      };
    })
    .sort((a, b) => {
      // Safe sorting for date strings
      return a.date.localeCompare(b.date);
    });

  interface CustomTooltipProps {
    active?: boolean;
    payload?: {
      value: number;
      name: string;
      fill: string;
      dataKey: string;
      payload: {
        totalMinutes?: number;
      };
    }[];
    label?: string;
  }

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div
          className="p-3 border rounded shadow-md"
          style={{
            backgroundColor: tooltipBackgroundColor,
            borderColor: tooltipBorderColor,
            color: tickColor,
          }}
        >
          <p className="font-semibold mb-2">
            {formatDateInUserTimezone(label || '', dateFormat)}
          </p>
          <div className="space-y-1">
            {payload.map((entry, index: number) => {
              if (
                entry.dataKey === 'sleepDebt' ||
                entry.dataKey === 'sleepEfficiency'
              )
                return null;

              const value = entry.value;
              const total = entry.payload?.totalMinutes || 0;
              const percent = total > 0 ? (value / total) * 100 : 0;

              return (
                <div
                  key={index}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: entry.fill }}
                    />
                    <span>{entry.name}:</span>
                  </div>
                  <span className="font-mono">
                    {formatSecondsToHHMM(value * 60)} ({percent.toFixed(1)}%)
                  </span>
                </div>
              );
            })}
          </div>
          {(() => {
            const totalMin = payload[0]?.payload?.totalMinutes;
            if (totalMin && totalMin > 0) {
              return (
                <div className="mt-2 pt-2 border-t border-border/50 text-sm font-semibold flex justify-between">
                  <span>{t('sleepAnalyticsCharts.total', 'Total')}:</span>
                  <span>{formatSecondsToHHMM(totalMin * 60)}</span>
                </div>
              );
            }
            return null;
          })()}
        </div>
      );
    }
    return null;
  };

  // Sort hypnograms by date descending (most recent first)
  const sortedHypnograms = useMemo(
    () => [...sleepHypnogramData].sort((a, b) => b.date.localeCompare(a.date)),
    [sleepHypnogramData]
  );

  const visibleHypnograms = useMemo(
    () =>
      showAllHypnograms
        ? sortedHypnograms
        : sortedHypnograms.slice(0, DEFAULT_HYPNOGRAMS_SHOWN),
    [showAllHypnograms, sortedHypnograms]
  );

  const hasMoreHypnograms = sortedHypnograms.length > DEFAULT_HYPNOGRAMS_SHOWN;

  // Check which health metrics are available
  const hasSpO2 = spo2Data && spo2Data.some((d) => d.average !== null);
  const hasHRV = hrvData && hrvData.some((d) => d.avg_overnight_hrv !== null);
  const hasRespiration =
    respirationData && respirationData.some((d) => d.average !== null);
  const hasHeartRate =
    heartRateData && heartRateData.some((d) => d.resting_heart_rate !== null);
  const hasAnyHealthMetrics =
    hasSpO2 || hasHRV || hasRespiration || hasHeartRate;

  const [isMounted, setIsMounted] = useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="space-y-6">
        <div className="h-64 flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg">
          <span className="text-sm text-muted-foreground">
            {t('common.loading', 'Loading Sleep Analytics...')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SECTION 1: Sleep Summary */}
      {latestSleepEntry && (
        <SleepSummaryCard latestSleepEntry={latestSleepEntry} />
      )}

      {/* SECTION 2: Nightly Details (Hypnograms) */}
      {sortedHypnograms.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center">
              <Moon className="w-5 h-5 mr-2" />
              {t('sleepAnalyticsCharts.nightlyDetails', 'Nightly Details')}
            </h3>
            {hasMoreHypnograms && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAllHypnograms(!showAllHypnograms)}
                className="text-muted-foreground"
              >
                {showAllHypnograms ? (
                  <>
                    {t('sleepAnalyticsCharts.showLess', 'Show Less')}
                    <ChevronUp className="w-4 h-4 ml-1" />
                  </>
                ) : (
                  <>
                    {t(
                      'sleepAnalyticsCharts.showAll',
                      `Show All (${sortedHypnograms.length})`
                    )}
                    <ChevronDown className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleHypnograms.map((data) => (
              <SleepStageChart key={data.date} sleepChartData={data} />
            ))}
          </div>
        </div>
      )}

      <SleepScienceSection />

      {/* SECTION 3: Sleep Trends */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center">
          <TrendingUp className="w-5 h-5 mr-2" />
          {t('sleepAnalyticsCharts.sleepTrends', 'Sleep Trends')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ZoomableChart
            title={t('sleepAnalyticsCharts.sleepStages', 'Sleep Stages')}
          >
            {(isMaximized, zoomLevel) => (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('sleepAnalyticsCharts.sleepStages', 'Sleep Stages')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={isMaximized ? 'h-[calc(95vh-150px)]' : 'h-48'}
                  >
                    <ResponsiveContainer
                      width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      height={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      minWidth={0}
                      minHeight={0}
                      debounce={100}
                    >
                      <BarChart data={chartData} stackOffset="expand">
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={gridColor}
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(tick) =>
                            formatDateInUserTimezone(tick, dateFormat)
                          }
                          stroke={tickColor}
                          tick={{ fill: tickColor }}
                        />
                        <YAxis
                          tickFormatter={(value) =>
                            `${(value * 100).toFixed(0)}%`
                          }
                          stroke={tickColor}
                          tick={{ fill: tickColor }}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ color: tickColor }} />
                        <Bar
                          dataKey="deep"
                          stackId="a"
                          fill={SLEEP_STAGE_COLORS.deep}
                          name={t('sleepAnalyticsCharts.deep', 'Deep')}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="rem"
                          stackId="a"
                          fill={SLEEP_STAGE_COLORS.rem}
                          name={t('sleepAnalyticsCharts.rem', 'REM')}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="light"
                          stackId="a"
                          fill={SLEEP_STAGE_COLORS.light}
                          name={t('sleepAnalyticsCharts.light', 'Light')}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="awake"
                          stackId="a"
                          fill={SLEEP_STAGE_COLORS.awake}
                          name={t('sleepAnalyticsCharts.awake', 'Awake')}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </ZoomableChart>

          <ZoomableChart
            title={t(
              'sleepAnalyticsCharts.sleepConsistency',
              'Sleep Consistency'
            )}
          >
            {(isMaximized, zoomLevel) => (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t(
                      'sleepAnalyticsCharts.sleepConsistency',
                      'Sleep Consistency'
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={isMaximized ? 'h-[calc(95vh-150px)]' : 'h-48'}
                  >
                    <ResponsiveContainer
                      width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      height={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      minWidth={0}
                      minHeight={0}
                      debounce={100}
                    >
                      <LineChart data={chartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={gridColor}
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(tick) =>
                            formatDateInUserTimezone(tick, dateFormat)
                          }
                          stroke={tickColor}
                          tick={{ fill: tickColor }}
                        />
                        <YAxis
                          tickFormatter={formatBedWakeTime}
                          stroke={tickColor}
                          tick={{ fill: tickColor }}
                        />
                        <Tooltip
                          labelFormatter={(label) =>
                            formatDateInUserTimezone(label, dateFormat)
                          }
                          formatter={(
                            value: number | undefined,
                            name: string | undefined
                          ) =>
                            value ? [`${formatBedWakeTime(value)}`, name] : ''
                          }
                          contentStyle={{
                            backgroundColor: tooltipBackgroundColor,
                            borderColor: tooltipBorderColor,
                            color: tickColor,
                          }}
                          itemStyle={{ color: tickColor }}
                        />
                        <Legend wrapperStyle={{ color: tickColor }} />
                        <Line
                          type="monotone"
                          dataKey="bedtime"
                          stroke="#8884d8"
                          name={t('sleepAnalyticsCharts.bedtime', 'Bedtime')}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="wakeTime"
                          stroke="#82ca9d"
                          name={t('sleepAnalyticsCharts.wakeTime', 'Wake Time')}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </ZoomableChart>

          <ZoomableChart
            title={t('sleepAnalyticsCharts.sleepDebt', 'Sleep Debt')}
          >
            {(isMaximized, zoomLevel) => (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('sleepAnalyticsCharts.sleepDebt', 'Sleep Debt')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={isMaximized ? 'h-[calc(95vh-150px)]' : 'h-48'}
                  >
                    <ResponsiveContainer
                      width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      height={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      minWidth={0}
                      minHeight={0}
                      debounce={100}
                    >
                      <LineChart data={chartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={gridColor}
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(tick) =>
                            formatDateInUserTimezone(tick, dateFormat)
                          }
                          stroke={tickColor}
                          tick={{ fill: tickColor }}
                        />
                        <YAxis
                          stroke={tickColor}
                          tick={{ fill: tickColor }}
                          domain={['auto', 'auto']}
                          tickFormatter={(value) =>
                            formatSecondsToHHMM(value * 3600)
                          }
                        />
                        {/* BACKGROUND COLOR ZONES */}
                        <ReferenceArea
                          y1={0}
                          y2={100}
                          fill="#ff0000"
                          fillOpacity={0.05}
                        />
                        <ReferenceArea
                          y1={-100}
                          y2={0}
                          fill="#00ff00"
                          fillOpacity={0.05}
                        />
                        <ReferenceLine
                          y={0}
                          stroke="#666"
                          strokeDasharray="3 3"
                        />
                        <Tooltip
                          labelFormatter={(label) =>
                            formatDateInUserTimezone(label, dateFormat)
                          }
                          formatter={(
                            value: number | undefined,
                            name: string | undefined
                          ) => [formatSecondsToHHMM((value || 0) * 3600), name]}
                          contentStyle={{
                            backgroundColor: tooltipBackgroundColor,
                            borderColor: tooltipBorderColor,
                            color: tickColor,
                          }}
                          itemStyle={{ color: tickColor }}
                        />
                        <Legend wrapperStyle={{ color: tickColor }} />
                        <Line
                          type="monotone"
                          dataKey="sleepDebt"
                          stroke="#8884d8"
                          name={t(
                            'sleepAnalyticsCharts.sleepDebtHours',
                            'Sleep Debt (hours)'
                          )}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                        {/* DEBT COLOR CODING - Placed after Line to ensure background rendering */}
                        <ReferenceArea
                          y1={0}
                          y2={24}
                          fill="#ff0000"
                          fillOpacity={0.1}
                        />{' '}
                        {/* Red for Debt */}
                        <ReferenceArea
                          y1={-24}
                          y2={0}
                          fill="#00ff00"
                          fillOpacity={0.1}
                        />{' '}
                        {/* Green for Surplus */}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
                <div className="text-sm text-muted-foreground p-4">
                  {t(
                    'sleepAnalyticsCharts.sleepDebtDisclaimerPersonalized',
                    `*Sleep Debt is calculated based on your personalized sleep need of {{time}}.`,
                    { time: formatSecondsToHHMM(personalizedSleepNeed * 3600) }
                  )}
                </div>
              </Card>
            )}
          </ZoomableChart>

          <ZoomableChart
            title={t(
              'sleepAnalyticsCharts.sleepEfficiency',
              'Sleep Efficiency'
            )}
          >
            {(isMaximized, zoomLevel) => (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t(
                      'sleepAnalyticsCharts.sleepEfficiency',
                      'Sleep Efficiency'
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={isMaximized ? 'h-[calc(95vh-150px)]' : 'h-48'}
                  >
                    <ResponsiveContainer
                      width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      height={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                      minWidth={0}
                      minHeight={0}
                      debounce={100}
                    >
                      <LineChart data={chartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={gridColor}
                        />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(tick) =>
                            formatDateInUserTimezone(tick, dateFormat)
                          }
                          stroke={tickColor}
                          tick={{ fill: tickColor }}
                        />
                        <YAxis
                          domain={['auto', 100]}
                          tickFormatter={(value) => `${value.toFixed(0)}%`}
                          stroke={tickColor}
                          tick={{ fill: tickColor }}
                        />
                        <Tooltip
                          labelFormatter={(label) =>
                            formatDateInUserTimezone(label, dateFormat)
                          }
                          formatter={(value: number | undefined) => [
                            `${(value || 0).toFixed(1)}%`,
                            t(
                              'sleepAnalyticsCharts.sleepEfficiency',
                              'Sleep Efficiency'
                            ),
                          ]}
                          contentStyle={{
                            backgroundColor: tooltipBackgroundColor,
                            borderColor: tooltipBorderColor,
                            color: tickColor,
                          }}
                          itemStyle={{ color: tickColor }}
                        />
                        <Legend wrapperStyle={{ color: tickColor }} />
                        <Line
                          type="monotone"
                          dataKey="sleepEfficiency"
                          stroke="#82ca9d"
                          name={t(
                            'sleepAnalyticsCharts.sleepEfficiency',
                            'Sleep Efficiency'
                          )}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </ZoomableChart>
        </div>
      </div>

      {/* SECTION 4: Health Metrics */}
      {hasAnyHealthMetrics && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            {t('sleepAnalyticsCharts.healthMetrics', 'Health Metrics')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hasSpO2 && <SpO2Card data={spo2Data!} />}
            {hasHRV && <HRVCard data={hrvData!} />}
            {hasRespiration && <SleepRespirationCard data={respirationData!} />}
            {hasHeartRate && <SleepHeartRateCard data={heartRateData!} />}
          </div>
        </div>
      )}
    </div>
  );
};

export default SleepAnalyticsCharts;
