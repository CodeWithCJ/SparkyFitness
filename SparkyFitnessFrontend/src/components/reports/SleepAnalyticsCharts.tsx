import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { SleepAnalyticsData, SLEEP_STAGE_COLORS, SleepChartData } from '@/types';
import { usePreferences } from '@/contexts/PreferencesContext';
import ZoomableChart from '../ZoomableChart';
import SleepStageChart from './SleepStageChart';


interface SleepAnalyticsChartsProps {
  sleepAnalyticsData: SleepAnalyticsData[];
  sleepHypnogramData: SleepChartData[];
}

const SleepAnalyticsCharts: React.FC<SleepAnalyticsChartsProps> = ({ sleepAnalyticsData, sleepHypnogramData }) => {
  const { formatDateInUserTimezone, dateFormat } = usePreferences();

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
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
      <ZoomableChart title="Sleep Stages">
        {(isMaximized, zoomLevel) => (
          <Card>
            <CardHeader>
              <CardTitle>Sleep Stages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={isMaximized ? "h-[calc(95vh-150px)]" : "h-48"}>
                <ResponsiveContainer width={isMaximized ? `${100 * zoomLevel}%` : "100%"} height={isMaximized ? `${100 * zoomLevel}%` : "100%"}>
                  <BarChart data={chartData} stackOffset="expand">
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis dataKey="date" tickFormatter={(tick) => formatDateInUserTimezone(tick, dateFormat)} stroke="#E0E0E0" tick={{ fill: '#E0E0E0' }} />
                    <YAxis tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} stroke="#E0E0E0" tick={{ fill: '#E0E0E0' }} />
                    <Tooltip labelFormatter={(label) => formatDateInUserTimezone(label, dateFormat)} contentStyle={{ backgroundColor: '#333', borderColor: '#555', color: '#E0E0E0' }} itemStyle={{ color: '#E0E0E0' }} />
                    <Legend wrapperStyle={{ color: '#E0E0E0' }} />
                    <Bar dataKey="deep" stackId="a" fill={SLEEP_STAGE_COLORS.deep} name="Deep" />
                    <Bar dataKey="rem" stackId="a" fill={SLEEP_STAGE_COLORS.rem} name="REM" />
                    <Bar dataKey="light" stackId="a" fill={SLEEP_STAGE_COLORS.light} name="Light" />
                    <Bar dataKey="awake" stackId="a" fill={SLEEP_STAGE_COLORS.awake} name="Awake" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </ZoomableChart>

      <ZoomableChart title="Sleep Consistency">
        {(isMaximized, zoomLevel) => (
          <Card>
            <CardHeader>
              <CardTitle>Sleep Consistency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={isMaximized ? "h-[calc(95vh-150px)]" : "h-48"}>
                <ResponsiveContainer width={isMaximized ? `${100 * zoomLevel}%` : "100%"} height={isMaximized ? `${100 * zoomLevel}%` : "100%"}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis dataKey="date" tickFormatter={(tick) => formatDateInUserTimezone(tick, dateFormat)} stroke="#E0E0E0" tick={{ fill: '#E0E0E0' }} />
                    <YAxis tickFormatter={formatBedWakeTime} stroke="#E0E0E0" tick={{ fill: '#E0E0E0' }} />
                    <Tooltip
                      labelFormatter={(label) => formatDateInUserTimezone(label, dateFormat)}
                      formatter={(value: number, name: string) => [`${formatBedWakeTime(value)}`, name]}
                      contentStyle={{ backgroundColor: '#333', borderColor: '#555', color: '#E0E0E0' }} itemStyle={{ color: '#E0E0E0' }}
                    />
                    <Legend wrapperStyle={{ color: '#E0E0E0' }} />
                    <Line type="monotone" dataKey="bedtime" stroke="#8884d8" name="Bedtime" />
                    <Line type="monotone" dataKey="wakeTime" stroke="#82ca9d" name="Wake Time" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </ZoomableChart>

      <ZoomableChart title="Sleep Debt">
        {(isMaximized, zoomLevel) => (
          <Card>
            <CardHeader>
              <CardTitle>Sleep Debt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={isMaximized ? "h-[calc(95vh-150px)]" : "h-48"}>
                <ResponsiveContainer width={isMaximized ? `${100 * zoomLevel}%` : "100%"} height={isMaximized ? `${100 * zoomLevel}%` : "100%"}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis dataKey="date" tickFormatter={(tick) => formatDateInUserTimezone(tick, dateFormat)} stroke="#E0E0E0" tick={{ fill: '#E0E0E0' }} />
                    <YAxis stroke="#E0E0E0" tick={{ fill: '#E0E0E0' }} />
                    <Tooltip labelFormatter={(label) => formatDateInUserTimezone(label, dateFormat)} contentStyle={{ backgroundColor: '#333', borderColor: '#555', color: '#E0E0E0' }} itemStyle={{ color: '#E0E0E0' }} />
                    <Legend wrapperStyle={{ color: '#E0E0E0' }} />
                    <Line type="monotone" dataKey="sleepDebt" stroke="#8884d8" name="Sleep Debt (hours)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
            <div className="text-sm text-muted-foreground p-4">
              *Sleep Debt is calculated based on a recommended 8 hours of sleep. This will be customizable in a future release.
            </div>
          </Card>
        )}
      </ZoomableChart>

      <ZoomableChart title="Sleep Efficiency">
        {(isMaximized, zoomLevel) => (
          <Card>
            <CardHeader>
              <CardTitle>Sleep Efficiency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={isMaximized ? "h-[calc(95vh-150px)]" : "h-48"}>
                <ResponsiveContainer width={isMaximized ? `${100 * zoomLevel}%` : "100%"} height={isMaximized ? `${100 * zoomLevel}%` : "100%"}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                    <XAxis dataKey="date" tickFormatter={(tick) => formatDateInUserTimezone(tick, dateFormat)} stroke="#E0E0E0" tick={{ fill: '#E0E0E0' }} />
                    <YAxis domain={[0, 100]} tickFormatter={(value) => `${value.toFixed(0)}%`} stroke="#E0E0E0" tick={{ fill: '#E0E0E0' }} />
                    <Tooltip labelFormatter={(label) => formatDateInUserTimezone(label, dateFormat)} contentStyle={{ backgroundColor: '#333', borderColor: '#555', color: '#E0E0E0' }} itemStyle={{ color: '#E0E0E0' }} />
                    <Legend wrapperStyle={{ color: '#E0E0E0' }} />
                    <Line type="monotone" dataKey="sleepEfficiency" stroke="#82ca9d" name="Sleep Efficiency" />
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