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
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  type TooltipValueType,
} from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  parseISO,
  subDays,
  eachDayOfInterval,
  format as formatDF,
} from 'date-fns';
import ZoomableChart from '@/components/ZoomableChart';
import { List, Clock, Hourglass, Award } from 'lucide-react';
import { calculateSmartYAxisDomain, getChartConfig } from '@/utils/chartUtils';
import { FastingLog } from '@/types/fasting';

interface FastingReportProps {
  fastingData: FastingLog[];
}

interface Zones {
  Anabolic: number;
  Catabolic: number;
  FatBurning: number;
  Ketosis: number;
}
const COLORS = ['#6366f1', '#06b6d4', '#f59e0b', '#ef4444'];

export const FastingReport = ({ fastingData }: FastingReportProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  const [isMounted, setIsMounted] = useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const formatHoursToReadable = (
    value: TooltipValueType | undefined | number
  ) => {
    if (value === null || value === undefined) return '';
    const num = Number(Array.isArray(value) ? value[0] : value);
    if (Number.isNaN(num)) return String(value);
    const hrs = Math.floor(num);
    const mins = Math.round((num - hrs) * 60);
    return `${hrs}h ${mins}m`;
  };

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
    const zones: Zones = {
      Anabolic: 0,
      Catabolic: 0,
      FatBurning: 0,
      Ketosis: 0,
    };
    fastingData.forEach((f) => {
      const hrs = (f.duration_minutes ?? 0) / 60;
      if (hrs < 12) {
        zones.Anabolic = (zones.Anabolic ?? 0) + 1;
      } else if (hrs < 16) {
        zones.Catabolic = (zones.Catabolic ?? 0) + 1;
      } else if (hrs < 20) {
        zones.FatBurning = (zones.FatBurning ?? 0) + 1;
      } else {
        zones.Ketosis = (zones.Ketosis ?? 0) + 1;
      }
    });
    return Object.entries(zones).map(([name, value]) => ({ name, value }));
  }, [fastingData]);

  // Heatmap Data (Last 90 Days)
  const heatmapData = useMemo(() => {
    const today = new Date();
    const startDate = subDays(today, 90);

    // Define the interval of 91 days (including today)
    const daysInterval = eachDayOfInterval({ start: startDate, end: today });

    // Create map for fast lookup
    const fastDaysMap: Record<string, number> = {};
    fastingData.forEach((f) => {
      // Find local date string
      const d = formatDateInUserTimezone(parseISO(f.start_time), 'yyyy-MM-dd');
      fastDaysMap[d] = (fastDaysMap[d] || 0) + (f.duration_minutes ?? 0);
    });

    return daysInterval.map((d) => {
      const dateStr = formatDF(d, 'yyyy-MM-dd');
      return {
        date: dateStr,
        minutesFasted: fastDaysMap[dateStr] || 0,
      };
    });
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
  }) as [number, number];
  const trendDomain = calculateSmartYAxisDomain(trendData, 'avg', {
    marginPercent: config.marginPercent,
    minRangeThreshold: config.minRangeThreshold,
    useZeroBaseline: false,
  }) as [number, number];

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
                            const num = Number(
                              Array.isArray(val) ? val[0] : val
                            );
                            return Number.isNaN(num)
                              ? String(val)
                              : num.toFixed(2);
                          }}
                        />
                        <Tooltip formatter={formatHoursToReadable} />
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
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
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

      {/* Fasting History Table (Replaces Consistency List) */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('reports.fasting.history', 'Fasting History')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t('reports.fasting.startDate', 'Start Date')}
                  </TableHead>
                  <TableHead>
                    {t('reports.fasting.endDate', 'End Date')}
                  </TableHead>
                  <TableHead>
                    {t('reports.fasting.duration', 'Duration')}
                  </TableHead>
                  <TableHead>
                    {t('reports.fasting.protocol', 'Protocol')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fastingData
                  .slice()
                  .sort(
                    (a, b) =>
                      parseISO(b.start_time).getTime() -
                      parseISO(a.start_time).getTime()
                  )
                  .map((f) => {
                    const startStr = formatDateInUserTimezone(
                      parseISO(f.start_time),
                      'MMM dd, yyyy h:mm a'
                    );
                    const endStr = f.end_time
                      ? formatDateInUserTimezone(
                          parseISO(f.end_time),
                          'MMM dd, yyyy h:mm a'
                        )
                      : 'Ongoing';
                    const duration = formatHoursToReadable(
                      (f.duration_minutes ?? 0) / 60
                    );
                    return (
                      <TableRow key={f.id}>
                        <TableCell>{startStr}</TableCell>
                        <TableCell>{endStr}</TableCell>
                        <TableCell>{duration}</TableCell>
                        <TableCell>{f.fasting_type || 'Custom'}</TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Consistency Heatmap (GitHub Style) */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t(
              'reports.fasting.consistencyGrid',
              'Fasting Heatmap (Last 90 Days)'
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-[3px] max-w-full">
            {heatmapData.map((d) => {
              // Determine shade of green based on minutes fasted
              // 0 = gray, > 0 = scale
              let bgClass = 'bg-muted';
              if (d.minutesFasted > 0) {
                if (d.minutesFasted < 12 * 60)
                  bgClass = 'bg-green-300 dark:bg-green-800';
                else if (d.minutesFasted < 16 * 60)
                  bgClass = 'bg-green-400 dark:bg-green-700';
                else if (d.minutesFasted < 20 * 60)
                  bgClass = 'bg-green-500 dark:bg-green-600';
                else bgClass = 'bg-green-600 dark:bg-green-500';
              }
              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${formatHoursToReadable(d.minutesFasted / 60)}`}
                  className={`w-4 h-4 rounded-sm ${bgClass} transition-colors hover:ring-2 ring-primary`}
                />
              );
            })}
          </div>
          <div className="flex gap-2 items-center mt-4 text-xs text-muted-foreground">
            <span>Less</span>
            <div className="flex gap-[3px]">
              <div className="w-4 h-4 rounded-sm bg-muted" />
              <div className="w-4 h-4 rounded-sm bg-green-300 dark:bg-green-800" />
              <div className="w-4 h-4 rounded-sm bg-green-400 dark:bg-green-700" />
              <div className="w-4 h-4 rounded-sm bg-green-500 dark:bg-green-600" />
              <div className="w-4 h-4 rounded-sm bg-green-600 dark:bg-green-500" />
            </div>
            <span>More</span>
          </div>
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

                            const num = Number(
                              Array.isArray(val) ? val[0] : val
                            );
                            return Number.isNaN(num)
                              ? String(val)
                              : num.toFixed(2);
                          }}
                        />
                        <Tooltip formatter={formatHoursToReadable} />
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
