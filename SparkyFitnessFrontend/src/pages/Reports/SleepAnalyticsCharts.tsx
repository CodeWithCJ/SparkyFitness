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
  const tickColor = resolvedTheme === 'dark' ? '#E0E0E0' : '#333';
  const gridColor = resolvedTheme === 'dark' ? '#444' : '#ccc';
  const tooltipBackgroundColor = resolvedTheme === 'dark' ? '#333' : '#fff';
  const tooltipBorderColor = resolvedTheme === 'dark' ? '#555' : '#ccc';

  const [showAllHypnograms, setShowAllHypnograms] = useState(false);

  const formatBedWakeTime = (value: number) => {
    const hours = Math.floor(value);
    const minutes = Math.round((value - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const chartData = sleepAnalyticsData
    .map((data) => ({
      date: data.date,
      deep: data.stagePercentages.deep,
      rem: data.stagePercentages.rem,
      light: data.stagePercentages.light,
      awake: data.stagePercentages.awake,
      sleepDebt: data.sleepDebt,
      sleepEfficiency: data.sleepEfficiency,
      bedtime:
        new Date(data.earliestBedtime).getHours() +
        new Date(data.earliestBedtime).getMinutes() / 60,
      wakeTime:
        new Date(data.latestWakeTime).getHours() +
        new Date(data.latestWakeTime).getMinutes() / 60,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Sort hypnograms by date descending (most recent first)
  const sortedHypnograms = useMemo(
    () =>
      [...sleepHypnogramData].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
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
                        <Tooltip
                          labelFormatter={(label) =>
                            formatDateInUserTimezone(label, dateFormat)
                          }
                          contentStyle={{
                            backgroundColor: tooltipBackgroundColor,
                            borderColor: tooltipBorderColor,
                            color: tickColor,
                          }}
                          itemStyle={{ color: tickColor }}
                        />
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
                          formatter={(value: number, name: string) => [
                            `${formatBedWakeTime(value)}`,
                            name,
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
                          tickFormatter={(value) =>
                            formatSecondsToHHMM(value * 3600)
                          }
                        />
                        <Tooltip
                          labelFormatter={(label) =>
                            formatDateInUserTimezone(label, dateFormat)
                          }
                          formatter={(value: number, name: string) => [
                            formatSecondsToHHMM(value * 3600),
                            name,
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
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
                <div className="text-sm text-muted-foreground p-4">
                  {t(
                    'sleepAnalyticsCharts.sleepDebtDisclaimer',
                    '*Sleep Debt is calculated based on a recommended 8 hours of sleep. This will be customizable in a future release.'
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
                          domain={[0, 100]}
                          tickFormatter={(value) => `${value.toFixed(0)}%`}
                          stroke={tickColor}
                          tick={{ fill: tickColor }}
                        />
                        <Tooltip
                          labelFormatter={(label) =>
                            formatDateInUserTimezone(label, dateFormat)
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
