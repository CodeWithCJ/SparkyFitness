import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { SleepAnalyticsData, SLEEP_STAGE_COLORS, SleepChartData } from '@/types';
import { usePreferences } from '@/contexts/PreferencesContext';
import ZoomableChart from '../ZoomableChart';
import SleepStageChart from './SleepStageChart';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';


interface SleepAnalyticsChartsProps {
    sleepAnalyticsData: SleepAnalyticsData[];
    sleepHypnogramData: SleepChartData[];
}

const SleepAnalyticsCharts: React.FC<SleepAnalyticsChartsProps> = ({ sleepAnalyticsData, sleepHypnogramData }) => {
    const { formatDateInUserTimezone, dateFormat } = usePreferences();
    const { theme } = useTheme();
    const { t } = useTranslation();
    const tickColor = theme === 'dark' ? '#E0E0E0' : '#333';
    const gridColor = theme === 'dark' ? '#444' : '#ccc';
    const tooltipBackgroundColor = theme === 'dark' ? '#333' : '#fff';
    const tooltipBorderColor = theme === 'dark' ? '#555' : '#ccc';

    const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}${t('sleepAnalyticsCharts.hoursShort', 'h ')}${minutes}${t('sleepAnalyticsCharts.minutesShort', 'm')}`;
  };

  const formatBedWakeTime = (value: number) => {
    const hours = Math.floor(value);
    const minutes = Math.round((value - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const chartData = sleepAnalyticsData
    .map(data => ({
      date: data.date,
      deep: data.stagePercentages.deep,
      rem: data.stagePercentages.rem,
      light: data.stagePercentages.light,
      awake: data.stagePercentages.awake,
      sleepDebt: data.sleepDebt,
      sleepEfficiency: data.sleepEfficiency,
      bedtime: new Date(data.earliestBedtime).getHours() + new Date(data.earliestBedtime).getMinutes() / 60,
      wakeTime: new Date(data.latestWakeTime).getHours() + new Date(data.latestWakeTime).getMinutes() / 60,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
      {sleepHypnogramData.map((data) => (
        <SleepStageChart key={data.date} sleepChartData={data} />
      ))}
      <ZoomableChart title={t('sleepAnalyticsCharts.sleepStages', 'Sleep Stages')}>
        {(isMaximized, zoomLevel) => (
          <Card>
            <CardHeader>
              <CardTitle>{t('sleepAnalyticsCharts.sleepStages', 'Sleep Stages')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={isMaximized ? "h-[calc(95vh-150px)]" : "h-48"}>
                <ResponsiveContainer width={isMaximized ? `${100 * zoomLevel}%` : "100%"} height={isMaximized ? `${100 * zoomLevel}%` : "100%"}>
                  <BarChart data={chartData} stackOffset="expand">
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="date" tickFormatter={(tick) => formatDateInUserTimezone(tick, dateFormat)} stroke={tickColor} tick={{ fill: tickColor }} />
                    <YAxis tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} stroke={tickColor} tick={{ fill: tickColor }} />
                    <Tooltip labelFormatter={(label) => formatDateInUserTimezone(label, dateFormat)} contentStyle={{ backgroundColor: tooltipBackgroundColor, borderColor: tooltipBorderColor, color: tickColor }} itemStyle={{ color: tickColor }} />
                    <Legend wrapperStyle={{ color: tickColor }} />
                    <Bar dataKey="deep" stackId="a" fill={SLEEP_STAGE_COLORS.deep} name={t('sleepAnalyticsCharts.deep', 'Deep')} />
                    <Bar dataKey="rem" stackId="a" fill={SLEEP_STAGE_COLORS.rem} name={t('sleepAnalyticsCharts.rem', 'REM')} />
                    <Bar dataKey="light" stackId="a" fill={SLEEP_STAGE_COLORS.light} name={t('sleepAnalyticsCharts.light', 'Light')} />
                    <Bar dataKey="awake" stackId="a" fill={SLEEP_STAGE_COLORS.awake} name={t('sleepAnalyticsCharts.awake', 'Awake')} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </ZoomableChart>

      <ZoomableChart title={t('sleepAnalyticsCharts.sleepConsistency', 'Sleep Consistency')}>
        {(isMaximized, zoomLevel) => (
          <Card>
            <CardHeader>
              <CardTitle>{t('sleepAnalyticsCharts.sleepConsistency', 'Sleep Consistency')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={isMaximized ? "h-[calc(95vh-150px)]" : "h-48"}>
                <ResponsiveContainer width={isMaximized ? `${100 * zoomLevel}%` : "100%"} height={isMaximized ? `${100 * zoomLevel}%` : "100%"}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="date" tickFormatter={(tick) => formatDateInUserTimezone(tick, dateFormat)} stroke={tickColor} tick={{ fill: tickColor }} />
                    <YAxis tickFormatter={formatBedWakeTime} stroke={tickColor} tick={{ fill: tickColor }} />
                    <Tooltip
                        labelFormatter={(label) => formatDateInUserTimezone(label, dateFormat)}
                        formatter={(value: number, name: string) => [`${formatBedWakeTime(value)}`, name]}
                        contentStyle={{ backgroundColor: tooltipBackgroundColor, borderColor: tooltipBorderColor, color: tickColor }} itemStyle={{ color: tickColor }}
                    />
                    <Legend wrapperStyle={{ color: tickColor }} />
                    <Line type="monotone" dataKey="bedtime" stroke="#8884d8" name={t('sleepAnalyticsCharts.bedtime', 'Bedtime')} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="wakeTime" stroke="#82ca9d" name={t('sleepAnalyticsCharts.wakeTime', 'Wake Time')} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </ZoomableChart>

      <ZoomableChart title={t('sleepAnalyticsCharts.sleepDebt', 'Sleep Debt')}>
        {(isMaximized, zoomLevel) => (
          <Card>
            <CardHeader>
              <CardTitle>{t('sleepAnalyticsCharts.sleepDebt', 'Sleep Debt')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={isMaximized ? "h-[calc(95vh-150px)]" : "h-48"}>
                <ResponsiveContainer width={isMaximized ? `${100 * zoomLevel}%` : "100%"} height={isMaximized ? `${100 * zoomLevel}%` : "100%"}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="date" tickFormatter={(tick) => formatDateInUserTimezone(tick, dateFormat)} stroke={tickColor} tick={{ fill: tickColor }} />
                    <YAxis stroke={tickColor} tick={{ fill: tickColor }} />
                    <Tooltip labelFormatter={(label) => formatDateInUserTimezone(label, dateFormat)} contentStyle={{ backgroundColor: tooltipBackgroundColor, borderColor: tooltipBorderColor, color: tickColor }} itemStyle={{ color: tickColor }} />
                    <Legend wrapperStyle={{ color: tickColor }} />
                    <Line type="monotone" dataKey="sleepDebt" stroke="#8884d8" name={t('sleepAnalyticsCharts.sleepDebtHours', 'Sleep Debt (hours)')} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
            <div className="text-sm text-muted-foreground p-4">
              {t('sleepAnalyticsCharts.sleepDebtDisclaimer', '*Sleep Debt is calculated based on a recommended 8 hours of sleep. This will be customizable in a future release.')}
            </div>
          </Card>
        )}
      </ZoomableChart>

      <ZoomableChart title={t('sleepAnalyticsCharts.sleepEfficiency', 'Sleep Efficiency')}>
        {(isMaximized, zoomLevel) => (
          <Card>
            <CardHeader>
              <CardTitle>{t('sleepAnalyticsCharts.sleepEfficiency', 'Sleep Efficiency')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={isMaximized ? "h-[calc(95vh-150px)]" : "h-48"}>
                <ResponsiveContainer width={isMaximized ? `${100 * zoomLevel}%` : "100%"} height={isMaximized ? `${100 * zoomLevel}%` : "100%"}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="date" tickFormatter={(tick) => formatDateInUserTimezone(tick, dateFormat)} stroke={tickColor} tick={{ fill: tickColor }} />
                    <YAxis domain={[0, 100]} tickFormatter={(value) => `${value.toFixed(0)}%`} stroke={tickColor} tick={{ fill: tickColor }} />
                    <Tooltip labelFormatter={(label) => formatDateInUserTimezone(label, dateFormat)} contentStyle={{ backgroundColor: tooltipBackgroundColor, borderColor: tooltipBorderColor, color: tickColor }} itemStyle={{ color: tickColor }} />
                    <Legend wrapperStyle={{ color: tickColor }} />
                    <Line type="monotone" dataKey="sleepEfficiency" stroke="#82ca9d" name={t('sleepAnalyticsCharts.sleepEfficiency', 'Sleep Efficiency')} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </ZoomableChart>
    </div>
  );
};

export default SleepAnalyticsCharts;