import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Heart } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { parseISO } from 'date-fns';
import ZoomableChart from '../ZoomableChart';

interface HeartRateDataPoint {
  date: string;
  resting_heart_rate: number | null;
}

interface SleepHeartRateCardProps {
  data: HeartRateDataPoint[];
}

// Get status based on resting heart rate - returns translation key
const getHRStatus = (value: number): { statusKey: string; statusDefault: string; color: string } => {
  if (value < 60) {
    return { statusKey: 'reports.heartRateAthletic', statusDefault: 'Athletic', color: '#22c55e' };
  } else if (value <= 80) {
    return { statusKey: 'reports.heartRateNormal', statusDefault: 'Normal', color: '#22c55e' };
  } else if (value <= 100) {
    return { statusKey: 'reports.heartRateElevated', statusDefault: 'Elevated', color: '#f97316' };
  } else {
    return { statusKey: 'reports.heartRateHigh', statusDefault: 'High', color: '#ef4444' };
  }
};

const SleepHeartRateCard: React.FC<SleepHeartRateCardProps> = ({ data }) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();

  // Process data
  const { chartData, stats, latestValue } = useMemo(() => {
    const validData = data
      .filter(d => d.resting_heart_rate !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (validData.length === 0) {
      return { chartData: [], stats: null, latestValue: null };
    }

    const chartData = validData.map(d => ({
      date: d.date,
      displayDate: formatDateInUserTimezone(parseISO(d.date), 'MMM dd'),
      rhr: d.resting_heart_rate,
    }));

    const rhrValues = validData.map(d => d.resting_heart_rate!);

    const stats = {
      avg: Math.round(rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length),
      min: Math.min(...rhrValues),
      max: Math.max(...rhrValues),
    };

    const latestValue = validData[validData.length - 1]?.resting_heart_rate ?? null;

    return { chartData, stats, latestValue };
  }, [data, formatDateInUserTimezone]);

  if (chartData.length === 0 || !stats || latestValue === null) {
    return null;
  }

  const { statusKey, statusDefault, color } = getHRStatus(latestValue);
  const status = t(statusKey, statusDefault);

  // Calculate Y-axis domain
  const yMin = Math.max(40, stats.min - 10);
  const yMax = stats.max + 10;

  return (
    <ZoomableChart title={t('sleepHealth.restingHeartRate', 'Resting Heart Rate')}>
      {(isMaximized) => (
        <Card className="w-full h-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-lg">
              <Heart className="w-5 h-5 mr-2" />
              {t('sleepHealth.restingHeartRate', 'Resting Heart Rate')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Top: Value and stats */}
            <div className="flex items-center justify-center gap-6 mb-4">
              <div className="text-center">
                <p className="text-4xl font-bold" style={{ color }}>
                  {latestValue}
                </p>
                <p className="text-xs text-muted-foreground">bpm</p>
                <p className="text-sm font-medium" style={{ color }}>{status}</p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-500">{stats.avg}</p>
                  <p className="text-xs text-muted-foreground">{t('sleepHealth.avgHR', 'Avg')}</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-500">{stats.min}-{stats.max}</p>
                  <p className="text-xs text-muted-foreground">{t('sleepHealth.range', 'Range')}</p>
                </div>
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
                    domain={[yMin, yMax]}
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
                    formatter={(value: number) => [`${value} bpm`]}
                  />
                  <Line
                    type="monotone"
                    dataKey="rhr"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 2, r: 3 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="text-center mt-2 text-xs text-muted-foreground">
              {t('sleepHealth.normalRHR', 'Normal adult: 60-100 bpm')}
            </div>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
};

export default SleepHeartRateCard;
