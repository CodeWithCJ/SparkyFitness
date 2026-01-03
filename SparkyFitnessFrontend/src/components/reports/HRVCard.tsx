import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Activity } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { parseISO } from 'date-fns';
import ZoomableChart from '../ZoomableChart';

interface HRVDataPoint {
  date: string;
  avg_overnight_hrv: number | null;
}

interface HRVCardProps {
  data: HRVDataPoint[];
}

interface TransformedData {
  date: string;
  displayDate: string;
  hrv: number | null;
}

// Get status based on HRV relative to baseline - returns translation key
const getHRVStatus = (hrv: number, baselineLow: number, baselineHigh: number): { statusKey: string; statusDefault: string; color: string } => {
  if (hrv < baselineLow) {
    return { statusKey: 'reports.hrvLow', statusDefault: 'Low', color: '#f97316' };
  } else if (hrv > baselineHigh) {
    return { statusKey: 'reports.hrvElevated', statusDefault: 'High', color: '#3b82f6' };
  } else {
    return { statusKey: 'reports.hrvBalanced', statusDefault: 'Balanced', color: '#22c55e' };
  }
};

// Calculate baseline from historical data (mean ± 1 std dev)
const calculateBaseline = (values: number[]): { low: number; high: number; avg: number } => {
  if (values.length === 0) return { low: 0, high: 100, avg: 50 };

  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

  if (values.length < 2) {
    return { low: avg * 0.8, high: avg * 1.2, avg };
  }

  const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
  const avgSquaredDiff = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  return {
    low: Math.max(0, avg - stdDev),
    high: avg + stdDev,
    avg
  };
};

const HRVCard: React.FC<HRVCardProps> = ({ data }) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();

  // Transform and process data
  const { transformedData, latestHRV, baseline, stats } = useMemo(() => {
    const validData = data
      .filter(d => d.avg_overnight_hrv != null)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (validData.length === 0) {
      return { transformedData: [], latestHRV: null, baseline: { low: 0, high: 100, avg: 50 }, stats: null };
    }

    const hrvValues = validData.map(d => d.avg_overnight_hrv!);
    const baseline = calculateBaseline(hrvValues);

    const transformed: TransformedData[] = validData.map((entry) => ({
      date: entry.date,
      displayDate: formatDateInUserTimezone(parseISO(entry.date), 'MMM dd'),
      hrv: entry.avg_overnight_hrv!,
    }));

    const latestHRV = transformed[transformed.length - 1]?.hrv ?? null;

    const stats = {
      avg: Math.round(hrvValues.reduce((sum, v) => sum + v, 0) / hrvValues.length),
    };

    return { transformedData: transformed, latestHRV, baseline, stats };
  }, [data, formatDateInUserTimezone]);

  if (transformedData.length === 0 || latestHRV === null) {
    return null;
  }

  const { statusKey, statusDefault, color } = getHRVStatus(latestHRV, baseline.low, baseline.high);
  const status = t(statusKey, statusDefault);

  // Calculate Y-axis domain
  const hrvValues = transformedData.map(d => d.hrv!);
  const minHRV = Math.min(...hrvValues, baseline.low);
  const maxHRV = Math.max(...hrvValues, baseline.high);
  const yMin = Math.max(0, Math.floor(minHRV - 10));
  const yMax = Math.ceil(maxHRV + 10);

  return (
    <ZoomableChart title={t('sleepHealth.hrvStatus', 'HRV Status')}>
      {(isMaximized) => (
        <Card className="w-full h-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-lg">
              <Activity className="w-5 h-5 mr-2" />
              {t('sleepHealth.hrvStatus', 'HRV Status')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Top: Value and stats */}
            <div className="flex items-center justify-center gap-6 mb-4">
              <div className="text-center">
                <p className="text-4xl font-bold" style={{ color }}>
                  {Math.round(latestHRV)}
                </p>
                <p className="text-xs text-muted-foreground">ms</p>
                <p className="text-sm font-medium" style={{ color }}>{status}</p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-500">{stats?.avg}</p>
                  <p className="text-xs text-muted-foreground">{t('sleepHealth.avgHRV', 'Avg')}</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-500">
                    {Math.round(baseline.low)}-{Math.round(baseline.high)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('sleepHealth.baseline', 'Baseline')}</p>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className={isMaximized ? "h-[calc(95vh-250px)]" : "h-32"}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={transformedData}>
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
                    formatter={(value: number) => [`${value?.toFixed(0)} ms`]}
                  />
                  <ReferenceArea
                    y1={baseline.low}
                    y2={baseline.high}
                    fill="hsl(var(--muted))"
                    fillOpacity={0.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="hrv"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ fill: '#22c55e', strokeWidth: 2, r: 3 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="text-center mt-2 text-xs text-muted-foreground">
              {t('sleepHealth.hrvDisclaimer', '*Baseline from your data (mean ± std dev)')}
            </div>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
};

export default HRVCard;
