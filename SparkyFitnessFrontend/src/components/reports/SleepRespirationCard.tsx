import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Wind } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { parseISO } from 'date-fns';
import ZoomableChart from '../ZoomableChart';

interface RespirationDataPoint {
  date: string;
  average: number | null;
  lowest: number | null;
  highest: number | null;
}

interface SleepRespirationCardProps {
  data: RespirationDataPoint[];
}

// Get status based on respiration rate - returns translation key
const getRespirationStatus = (value: number): { statusKey: string; statusDefault: string; color: string } => {
  if (value < 12) {
    return { statusKey: 'reports.respirationLow', statusDefault: 'Low', color: '#f97316' };
  } else if (value <= 20) {
    return { statusKey: 'reports.respirationNormal', statusDefault: 'Normal', color: '#22c55e' };
  } else {
    return { statusKey: 'reports.respirationElevated', statusDefault: 'Elevated', color: '#f97316' };
  }
};

const SleepRespirationCard: React.FC<SleepRespirationCardProps> = ({ data }) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();

  // Process data
  const { chartData, stats, latestValue } = useMemo(() => {
    const validData = data
      .filter(d => d.average !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (validData.length === 0) {
      return { chartData: [], stats: null, latestValue: null };
    }

    const chartData = validData.map(d => ({
      date: d.date,
      displayDate: formatDateInUserTimezone(parseISO(d.date), 'MMM dd'),
      avg: d.average,
      lowest: d.lowest,
      highest: d.highest,
    }));

    const avgValues = validData.map(d => d.average!);
    const lowestValues = validData.filter(d => d.lowest !== null).map(d => d.lowest!);

    const stats = {
      avg: Math.round(avgValues.reduce((a, b) => a + b, 0) / avgValues.length),
      lowest: lowestValues.length > 0 ? Math.min(...lowestValues) : null,
    };

    const latestValue = validData[validData.length - 1]?.average ?? null;

    return { chartData, stats, latestValue };
  }, [data, formatDateInUserTimezone]);

  if (chartData.length === 0 || !stats || latestValue === null) {
    return null;
  }

  const { statusKey, statusDefault, color } = getRespirationStatus(latestValue);
  const status = t(statusKey, statusDefault);

  return (
    <ZoomableChart title={t('sleepHealth.respiration', 'Respiration')}>
      {(isMaximized) => (
        <Card className="w-full h-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-lg">
              <Wind className="w-5 h-5 mr-2" />
              {t('sleepHealth.respiration', 'Respiration')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Top: Value and stats */}
            <div className="flex items-center justify-center gap-6 mb-4">
              <div className="text-center">
                <p className="text-4xl font-bold" style={{ color }}>
                  {Math.round(latestValue)}
                </p>
                <p className="text-xs text-muted-foreground">brpm</p>
                <p className="text-sm font-medium" style={{ color }}>{status}</p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-500">{stats.avg}</p>
                  <p className="text-xs text-muted-foreground">{t('sleepHealth.avgResp', 'Avg')}</p>
                </div>
                {stats.lowest !== null && (
                  <div className="text-center">
                    <p className="text-lg font-bold text-orange-500">{stats.lowest}</p>
                    <p className="text-xs text-muted-foreground">{t('sleepHealth.lowestResp', 'Lowest')}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Chart */}
            <div className={isMaximized ? "h-[calc(95vh-250px)]" : "h-32"}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="displayDate"
                    fontSize={10}
                    tickLine={false}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    domain={[8, 24]}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      color: 'hsl(var(--foreground))'
                    }}
                    formatter={(value: number) => [`${value} brpm`]}
                  />
                  {/* Normal range reference area */}
                  <ReferenceArea
                    y1={12}
                    y2={20}
                    fill="hsl(var(--muted))"
                    fillOpacity={0.3}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={{ fill: '#06b6d4', strokeWidth: 2, r: 3 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="text-center mt-2 text-xs text-muted-foreground">
              {t('sleepHealth.normalRange', 'Normal: 12-20 brpm')}
            </div>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
};

export default SleepRespirationCard;
