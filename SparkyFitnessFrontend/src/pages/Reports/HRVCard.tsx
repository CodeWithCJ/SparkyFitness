import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import { Activity } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { parseISO } from 'date-fns';
import { calculateBaseline, getHRVStatus } from '@/utils/reportUtil';
import { useHealthMetricSamples } from '@/hooks/useGenericHealth';
import { samplesForDay } from '@/utils/healthMetricSamples';

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

const HRVCard = ({ data }: HRVCardProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, formatTime } = usePreferences();
  const [isMounted, setIsMounted] = useState(false);
  const [showIntraday, setShowIntraday] = useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Transform and process data
  const { transformedData, latestHRV, baseline, stats } = useMemo(() => {
    const validData = data
      .filter((d) => d.avg_overnight_hrv != null)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (validData.length === 0) {
      return {
        transformedData: [],
        latestHRV: null,
        baseline: { low: 0, high: 100, avg: 50 },
        stats: null,
      };
    }

    const hrvValues = validData.map((d) => d.avg_overnight_hrv!);
    const baseline = calculateBaseline(hrvValues);

    const transformed: TransformedData[] = validData.map((entry) => ({
      date: entry.date,
      displayDate: formatDateInUserTimezone(parseISO(entry.date), 'MMM dd'),
      hrv: entry.avg_overnight_hrv!,
    }));

    const latestHRV = transformed[transformed.length - 1]?.hrv ?? null;

    const stats = {
      avg: Math.round(
        hrvValues.reduce((sum, v) => sum + v, 0) / hrvValues.length
      ),
    };

    return { transformedData: transformed, latestHRV, baseline, stats };
  }, [data, formatDateInUserTimezone]);

  const latestDate = transformedData[transformedData.length - 1]?.date;
  const { data: hrvSampleBuckets = [] } = useHealthMetricSamples(
    'hrv',
    latestDate || '',
    latestDate
  );

  const intradayPoints = useMemo(() => {
    if (!latestDate) return [];
    const points: Array<{ time: string; displayTime: string; rmssd: number }> =
      [];
    for (const sample of samplesForDay(hrvSampleBuckets, latestDate)) {
      if (!sample || typeof sample !== 'object') continue;
      const s = sample as Record<string, unknown>;
      const rmssd =
        typeof s['rmssd_ms'] === 'number' ? (s['rmssd_ms'] as number) : null;
      if (rmssd == null) continue;
      const iso = String(s['t'] || '');
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) continue;

      // formatTime applies the user's configured timezone and time format;
      // getHours()/getMinutes() would use the browser's zone instead.
      points.push({ time: iso, displayTime: formatTime(iso), rmssd });
    }
    return points.sort((a, b) => a.time.localeCompare(b.time));
  }, [hrvSampleBuckets, latestDate, formatTime]);

  const hasIntraday = intradayPoints.length > 0;

  if (transformedData.length === 0 || latestHRV === null) {
    return null;
  }

  if (!isMounted) {
    return (
      <Card className="w-full h-full">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center text-lg">
            <Activity className="w-5 h-5 mr-2" />
            {t('sleepHealth.hrvStatus', 'HRV Status')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
            <span className="text-xs text-muted-foreground">
              {t('common.loading', 'Loading...')}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { statusKey, statusDefault, color } = getHRVStatus(
    latestHRV,
    baseline.low,
    baseline.high
  );
  const status = t(statusKey, statusDefault);

  // Calculate Y-axis domain
  const hrvValues = transformedData.map((d) => d.hrv!);
  const minHRV = Math.min(...hrvValues, baseline.low);
  const maxHRV = Math.max(...hrvValues, baseline.high);
  const yMin = Math.max(0, Math.floor(minHRV - 10));
  const yMax = Math.ceil(maxHRV + 10);

  const intraMin = hasIntraday
    ? Math.max(
        0,
        Math.floor(Math.min(...intradayPoints.map((p) => p.rmssd)) - 5)
      )
    : 0;
  const intraMax = hasIntraday
    ? Math.ceil(Math.max(...intradayPoints.map((p) => p.rmssd)) + 5)
    : 100;

  return (
    <Card className="w-full h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center text-lg">
            <Activity className="w-5 h-5 mr-2" />
            {t('sleepHealth.hrvStatus', 'HRV Status')}
          </CardTitle>
          {hasIntraday && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setShowIntraday(!showIntraday)}
            >
              {showIntraday
                ? t('sleepHealth.dailyTrend', 'Trend')
                : t('sleepHealth.overnightSeries', 'Night Series')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Top: Value and stats */}
        <div className="flex items-center justify-center gap-6 mb-4">
          <div className="text-center">
            <p className="text-4xl font-bold" style={{ color }}>
              {Math.round(latestHRV)}
            </p>
            <p className="text-xs text-muted-foreground">ms</p>
            <p className="text-sm font-medium" style={{ color }}>
              {status}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-center">
              <p className="text-lg font-bold text-blue-500">{stats?.avg}</p>
              <p className="text-xs text-muted-foreground">
                {t('sleepHealth.avgHRV', 'Avg')}
              </p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gray-500">
                {Math.round(baseline.low)}-{Math.round(baseline.high)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('sleepHealth.baseline', 'Baseline')}
              </p>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-32">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={0}
            debounce={100}
          >
            {showIntraday && hasIntraday ? (
              <ComposedChart data={intradayPoints}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="displayTime"
                  fontSize={10}
                  tickLine={false}
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[intraMin, intraMax]}
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
                    color: 'hsl(var(--foreground))',
                  }}
                  formatter={(value: unknown) => [
                    `${Number(value).toFixed(0)} ms`,
                    t('sleepHealth.hrvStatus', 'Overnight HRV'),
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="rmssd"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            ) : (
              <ComposedChart data={transformedData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                />
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
                    color: 'hsl(var(--foreground))',
                  }}
                  formatter={(
                    value:
                      | string
                      | number
                      | ReadonlyArray<string | number>
                      | undefined
                  ) => [
                    `${Number(Array.isArray(value) ? value[0] : value).toFixed(0)} ms`,
                  ]}
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
                  isAnimationActive={false}
                />
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>

        <div className="text-center mt-2 text-xs text-muted-foreground">
          {/* Match the chart that is actually rendered: showIntraday can stay
              true after the selected date loses its samples, in which case the
              daily chart is shown and the toggle is hidden. */}
          {showIntraday && hasIntraday
            ? t(
                'sleepHealth.overnightHrvSeriesDesc',
                '5-minute interval overnight HRV series'
              )
            : t(
                'sleepHealth.hrvDisclaimer',
                '*Baseline from your data (mean ± std dev)'
              )}
        </div>
      </CardContent>
    </Card>
  );
};

export default HRVCard;
