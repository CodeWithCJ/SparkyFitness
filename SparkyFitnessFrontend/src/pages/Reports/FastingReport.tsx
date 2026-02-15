import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import type { FastingLog } from '@/services/fastingService';
import { usePreferences } from '@/contexts/PreferencesContext';
import { parseISO } from 'date-fns';
import ZoomableChart from '@/components/ZoomableChart';
import { List, Clock, Hourglass, Award } from 'lucide-react';
import { calculateSmartYAxisDomain, getChartConfig } from '@/utils/chartUtils';

interface FastingReportProps {
  fastingData: FastingLog[];
}

const COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#ef4444'];

export const FastingReport: React.FC<FastingReportProps> = ({
  fastingData,
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  const [isMounted, setIsMounted] = useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Compute summary statistics
  const summary = useMemo(() => {
    const totalFasts = fastingData.length;
    const totalMinutes = fastingData.reduce(
      (sum, f) => sum + (f.duration_minutes ?? 0),
      0
    );
    // average duration in hours (totalMinutes is in minutes)
    const avgDuration = totalFasts ? totalMinutes / totalFasts / 60 : 0;
    const longestFast = Math.max(
      ...fastingData.map((f) => f.duration_minutes ?? 0),
      0
    );
    return {
      totalFasts,
      totalHours: (totalMinutes / 60).toFixed(1),
      avgDuration: avgDuration.toFixed(1),
      longestFast: (longestFast / 60).toFixed(1),
    };
  }, [fastingData]);

  // Daily fasting duration for bar chart
  const dailyData = useMemo(() => {
    const map: Record<string, number> = {};
    fastingData.forEach((f) => {
      const date = formatDateInUserTimezone(
        parseISO(f.start_time),
        'yyyy-MM-dd'
      );
      const mins = f.duration_minutes ?? 0;
      map[date] = (map[date] || 0) + mins / 60; // hours
    });
    return Object.entries(map).map(([date, hours]) => ({
      date,
      hours: Number(hours.toFixed(2)),
    }));
  }, [fastingData, formatDateInUserTimezone]);

  // Chart domain calculation consistent with Charts tab
  const config = getChartConfig('hours');

  // Zone distribution (simple example based on duration)
  const zoneData = useMemo(() => {
    const zones: Record<string, number> = {
      Anabolic: 0,
      Catabolic: 0,
      FatBurning: 0,
      Ketosis: 0,
    };
    fastingData.forEach((f) => {
      const hrs = (f.duration_minutes ?? 0) / 60;
      if (hrs < 12) zones.Anabolic += 1;
      else if (hrs < 16) zones.Catabolic += 1;
      else if (hrs < 20) zones.FatBurning += 1;
      else zones.Ketosis += 1;
    });
    return Object.entries(zones).map(([name, value]) => ({ name, value }));
  }, [fastingData]);

  // Consistency calendar data (heatmap style) – simplified as array of dates with count
  const calendarData = useMemo(() => {
    const map: Record<string, number> = {};
    fastingData.forEach((f) => {
      const date = formatDateInUserTimezone(
        parseISO(f.start_time),
        'yyyy-MM-dd'
      );
      map[date] = (map[date] || 0) + 1;
    });
    return Object.entries(map).map(([date, count]) => ({ date, count }));
  }, [fastingData, formatDateInUserTimezone]);

  // Trend line (moving average of daily hours)
  const trendData = useMemo(() => {
    const sorted = dailyData
      .slice()
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
    const window = 3;
    return sorted.map((d, i) => {
      const slice = sorted.slice(Math.max(0, i - window + 1), i + 1);
      const avg = slice.reduce((s, cur) => s + cur.hours, 0) / slice.length;
      return { date: d.date, avg: Number(avg.toFixed(2)) };
    });
  }, [dailyData]);

  // compute max values for domain calculations
  const dailyDomain = calculateSmartYAxisDomain(dailyData, 'hours', {
    marginPercent: config.marginPercent,
    minRangeThreshold: config.minRangeThreshold,
    useZeroBaseline: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  const trendDomain = calculateSmartYAxisDomain(trendData, 'avg', {
    marginPercent: config.marginPercent,
    minRangeThreshold: config.minRangeThreshold,
    useZeroBaseline: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-r from-indigo-600 to-violet-500 text-white">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <List className="w-4 h-4" />
              {t('reports.fasting.totalFasts', 'Total Fasts')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-white">
            {summary.totalFasts}
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-cyan-500 to-sky-600 text-white">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {t('reports.fasting.totalHours', 'Total Hours')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-white">
            {summary.totalHours}
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Hourglass className="w-4 h-4" />
              {t('reports.fasting.avgDuration', 'Avg Duration (hrs)')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-white">
            {summary.avgDuration}
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-rose-500 to-red-600 text-white">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Award className="w-4 h-4" />
              {t('reports.fasting.longestFast', 'Longest Fast (hrs)')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold text-white">
            {summary.longestFast}
          </CardContent>
        </Card>
      </div>

      {/* Daily Fasting Duration Bar Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle>
              {t('reports.fasting.dailyDuration', 'Daily Fasting Duration')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ZoomableChart
            title={t('reports.fasting.dailyDuration', 'Daily Fasting Duration')}
          >
            <Card>
              <CardContent>
                <div className="h-72">
                  {isMounted ? (
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={0}
                      minHeight={0}
                      debounce={100}
                    >
                      <BarChart data={dailyData}>
                        <XAxis dataKey="date" />
                        <YAxis
                          domain={dailyDomain}
                          label={{
                            value: t('reports.fasting.hours', 'Hours'),
                            angle: -90,
                            position: 'insideLeft',
                          }}
                          tickFormatter={(val) => {
                            if (val === null || val === undefined) return '';
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const num = Number(val as any);
                            return Number.isNaN(num)
                              ? String(val)
                              : num.toFixed(2);
                          }}
                        />
                        <Tooltip
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any) => {
                            if (value === null || value === undefined)
                              return '';
                            const num = Number(value);
                            return Number.isNaN(num)
                              ? String(value)
                              : num.toFixed(2);
                          }}
                        />
                        <Bar
                          dataKey="hours"
                          fill="#6366f1"
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
                      <span className="text-xs text-muted-foreground">
                        {t('common.loading', 'Loading charts...')}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </ZoomableChart>
        </CardContent>
      </Card>

      {/* Fasting Zones Distribution Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('reports.fasting.zoneDistribution', 'Fasting Zones')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isMounted ? (
            <ResponsiveContainer
              width="100%"
              height={300}
              minWidth={0}
              minHeight={0}
              debounce={100}
            >
              <PieChart>
                <Pie
                  data={zoneData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                  isAnimationActive={false}
                >
                  {zoneData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
              <span className="text-xs text-muted-foreground">
                {t('common.loading', 'Loading charts...')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consistency Calendar (simple heatmap) */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('reports.fasting.consistency', 'Fasting Consistency')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* For brevity, render as a list of dates with count */}
          <ul className="space-y-1">
            {calendarData.map((d) => (
              <li key={d.date}>
                {d.date}: {d.count} {t('reports.fasting.fast', 'fast')}
                {d.count > 1 ? 's' : ''}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Fasting Trends Line Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle>
              {t('reports.fasting.trends', 'Fasting Trends')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ZoomableChart title={t('reports.fasting.trends', 'Fasting Trends')}>
            <Card>
              <CardContent>
                <div className="h-72">
                  {isMounted ? (
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={0}
                      minHeight={0}
                      debounce={100}
                    >
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis
                          domain={trendDomain}
                          label={{
                            value: t('reports.fasting.avgHours', 'Avg Hours'),
                            angle: -90,
                            position: 'insideLeft',
                          }}
                          tickFormatter={(val) => {
                            if (val === null || val === undefined) return '';
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const num = Number(val as any);
                            return Number.isNaN(num)
                              ? String(val)
                              : num.toFixed(2);
                          }}
                        />
                        <Tooltip
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(value: any) => {
                            if (value === null || value === undefined)
                              return '';
                            const num = Number(value);
                            return Number.isNaN(num)
                              ? String(value)
                              : num.toFixed(2);
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="avg"
                          stroke="#06b6d4"
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
                      <span className="text-xs text-muted-foreground">
                        {t('common.loading', 'Loading charts...')}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </ZoomableChart>
        </CardContent>
      </Card>
    </div>
  );
};
