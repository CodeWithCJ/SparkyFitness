import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Activity } from 'lucide-react';
import { getSpO2Color } from './SpO2Gauge';
import { usePreferences } from '@/contexts/PreferencesContext';
import { parseISO } from 'date-fns';
import ZoomableChart from '../ZoomableChart';

interface SpO2DataPoint {
  date: string;
  average: number | null;
  lowest: number | null;
  highest: number | null;
}

interface SpO2CardProps {
  data: SpO2DataPoint[];
}

// Get status based on SpO2 value - returns translation key
const getSpO2Status = (value: number): { statusKey: string; statusDefault: string; color: string } => {
  if (value >= 95) {
    return { statusKey: 'reports.spo2Excellent', statusDefault: 'Excellent', color: '#22c55e' };
  } else if (value >= 90) {
    return { statusKey: 'reports.spo2Normal', statusDefault: 'Normal', color: '#22c55e' };
  } else if (value >= 80) {
    return { statusKey: 'reports.spo2Low', statusDefault: 'Low', color: '#eab308' };
  } else {
    return { statusKey: 'reports.spo2VeryLow', statusDefault: 'Very Low', color: '#ef4444' };
  }
};

const SpO2Card: React.FC<SpO2CardProps> = ({ data }) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();

  // Filter out entries without SpO2 data and sort by date
  const validData = useMemo(() => {
    return data
      .filter(d => d.average !== null && d.average !== undefined)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data]);

  // Get latest day's data
  const latestData = validData.length > 0 ? validData[validData.length - 1] : null;

  // Calculate overall stats
  const stats = useMemo(() => {
    if (validData.length === 0) return null;

    const averages = validData.map(d => d.average!);
    const lowestValues = validData.filter(d => d.lowest !== null).map(d => d.lowest!);

    return {
      avgSpO2: Math.round(averages.reduce((a, b) => a + b, 0) / averages.length),
      minSpO2: lowestValues.length > 0 ? Math.min(...lowestValues) : null,
    };
  }, [validData]);

  // Prepare chart data with formatted dates
  const chartData = useMemo(() => {
    return validData.map(d => ({
      ...d,
      displayDate: formatDateInUserTimezone(parseISO(d.date), 'MMM dd'),
    }));
  }, [validData, formatDateInUserTimezone]);

  // Don't render if no SpO2 data
  if (validData.length === 0 || !stats) {
    return null;
  }

  const latestValue = latestData?.average ?? 0;
  const { statusKey, statusDefault, color } = getSpO2Status(latestValue);
  const status = t(statusKey, statusDefault);

  return (
    <ZoomableChart title={t('sleepHealth.pulseOx', 'Pulse Ox (SpO2)')}>
      {(isMaximized) => (
        <Card className="w-full h-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-lg">
              <Activity className="w-5 h-5 mr-2" />
              {t('sleepHealth.pulseOx', 'Pulse Ox (SpO2)')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Top: Value and stats */}
            <div className="flex items-center justify-center gap-6 mb-4">
              <div className="text-center">
                <p className="text-4xl font-bold" style={{ color }}>
                  {latestValue}%
                </p>
                <p className="text-sm font-medium" style={{ color }}>{status}</p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold text-green-500">{stats.avgSpO2}%</p>
                  <p className="text-xs text-muted-foreground">{t('sleepHealth.avgSpO2', 'Average')}</p>
                </div>
                {stats.minSpO2 !== null && (
                  <div className="text-center">
                    <p className="text-lg font-bold" style={{ color: getSpO2Color(stats.minSpO2) }}>
                      {stats.minSpO2}%
                    </p>
                    <p className="text-xs text-muted-foreground">{t('sleepHealth.lowestSpO2', 'Lowest')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Chart */}
            <div className={isMaximized ? "h-[calc(95vh-250px)]" : "h-32"}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="displayDate"
                    fontSize={10}
                    tickLine={false}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    domain={[80, 100]}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      color: 'hsl(var(--foreground))'
                    }}
                    formatter={(value: number) => [`${value}%`]}
                  />
                  <Bar dataKey="average" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getSpO2Color(entry.average || 0)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex justify-center gap-3 mt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                <span>≥90%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#eab308' }} />
                <span>80-89%</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                <span>&lt;80%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
};

export default SpO2Card;
