import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HealthMetric, HealthMetricSamples } from '@workspace/shared';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  Heart,
  Wind,
  ShieldAlert,
  BatteryCharging,
  Flame,
  Thermometer,
} from 'lucide-react';
import { calculateSmartYAxisDomain } from '@/utils/chartUtils';
import { usePreferences } from '@/contexts/PreferencesContext';

interface IntradaySamplesChartProps {
  metric: HealthMetric;
  samples?: HealthMetricSamples[];
  title?: string;
  selectedDate?: string;
  isLoading?: boolean;
}

interface SampleDataPoint {
  time: string;
  displayTime: string;
  value: number;
  raw: unknown;
}

const IntradaySamplesChart: React.FC<IntradaySamplesChartProps> = ({
  metric,
  samples = [],
  title,
  selectedDate,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  const { formatTime } = usePreferences();

  const metricConfig = useMemo(() => {
    switch (metric) {
      case 'hrv':
        return {
          title: t('sleepHealth.hrvStatus', 'Overnight HRV'),
          unit: 'ms',
          color: '#22c55e',
          icon: Activity,
          getValue: (s: Record<string, unknown>) =>
            typeof s['rmssd_ms'] === 'number'
              ? (s['rmssd_ms'] as number)
              : typeof s['sdnn_ms'] === 'number'
                ? (s['sdnn_ms'] as number)
                : null,
        };
      case 'heart_rate':
        return {
          title: t('sleepHealth.restingHeartRate', 'Heart Rate'),
          unit: 'bpm',
          color: '#f43f5e',
          icon: Heart,
          getValue: (s: Record<string, unknown>) =>
            typeof s['bpm'] === 'number' ? (s['bpm'] as number) : null,
        };
      case 'spo2':
        return {
          title: t('sleepHealth.spo2', 'SpO2'),
          unit: '%',
          color: '#06b6d4',
          icon: Activity,
          getValue: (s: Record<string, unknown>) =>
            typeof s['percentage'] === 'number'
              ? (s['percentage'] as number)
              : null,
        };
      case 'skin_temperature':
        return {
          title: t('dailyHealthMetrics.skinTemp', 'Skin Temperature'),
          unit: '°C',
          color: '#f59e0b',
          icon: Thermometer,
          getValue: (s: Record<string, unknown>) =>
            typeof s['celsius'] === 'number'
              ? (s['celsius'] as number)
              : typeof s['temperature_celsius'] === 'number'
                ? (s['temperature_celsius'] as number)
                : typeof s['deviation_celsius'] === 'number'
                  ? (s['deviation_celsius'] as number)
                  : null,
        };
      case 'respiration':
        return {
          title: t('sleepHealth.respiration', 'Respiration'),
          unit: 'brpm',
          color: '#3b82f6',
          icon: Wind,
          getValue: (s: Record<string, unknown>) =>
            typeof s['brpm'] === 'number' ? (s['brpm'] as number) : null,
        };
      case 'stress':
        return {
          title: t('dailyHealthMetrics.avgStress', 'Stress'),
          unit: '/ 100',
          color: '#eab308',
          icon: ShieldAlert,
          getValue: (s: Record<string, unknown>) =>
            typeof s['level'] === 'number' ? (s['level'] as number) : null,
        };
      case 'body_battery':
        return {
          title: t('dailyHealthMetrics.bodyBattery', 'Body Battery'),
          unit: '/ 100',
          color: '#10b981',
          icon: BatteryCharging,
          getValue: (s: Record<string, unknown>) =>
            typeof s['level'] === 'number' ? (s['level'] as number) : null,
        };
      default:
        return {
          title: metric,
          unit: '',
          color: '#6366f1',
          icon: Flame,
          getValue: () => null,
        };
    }
  }, [metric, t]);

  const { chartData, stats, provider } = useMemo(() => {
    // Filter to selected date if provided
    const filteredRows = selectedDate
      ? samples.filter((row) => row.entry_date === selectedDate)
      : samples;

    const sourceProvider = filteredRows[0]?.source_provider;
    const allSamples: SampleDataPoint[] = [];

    for (const row of filteredRows) {
      if (Array.isArray(row.samples)) {
        for (const sample of row.samples) {
          if (!sample || typeof sample !== 'object') continue;
          const s = sample as Record<string, unknown>;
          const val = metricConfig.getValue(s);
          if (val == null || !Number.isFinite(val)) continue;

          const isoTime = String(s['t'] || '');
          const d = new Date(isoTime);
          if (!Number.isFinite(d.getTime())) continue;

          allSamples.push({
            time: isoTime,
            // formatTime applies the user's configured timezone and time
            // format; getHours()/getMinutes() would use the browser's zone.
            displayTime: formatTime(isoTime),
            value: Number(val),
            raw: sample,
          });
        }
      }
    }

    allSamples.sort((a, b) => a.time.localeCompare(b.time));

    if (allSamples.length === 0) {
      return { chartData: [], stats: null, provider: sourceProvider };
    }

    const values = allSamples.map((s) => s.value);
    const stats = {
      min: Math.min(...values),
      max: Math.max(...values),
      avg:
        Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) /
        10,
      latest: values[values.length - 1],
      count: values.length,
    };

    return { chartData: allSamples, stats, provider: sourceProvider };
  }, [samples, selectedDate, metricConfig, formatTime]);

  const Icon = metricConfig.icon;

  if (isLoading) {
    return (
      <Card className="w-full animate-pulse p-4">
        <div className="h-5 bg-muted rounded w-1/3 mb-3"></div>
        <div className="h-40 bg-muted rounded-xl"></div>
      </Card>
    );
  }

  if (chartData.length === 0 || !stats) {
    return null;
  }

  // Reuse the shared domain helper rather than hand-rolling one here. Its
  // margin is additive and it only clamps to zero when the data is
  // non-negative, which matters because skin temperature is reported as a
  // signed deviation from baseline: the previous inline
  // `Math.max(0, min * 0.9)` clipped those readings out of the chart twice
  // over -- multiplying a negative raises it (-0.5 * 0.9 = -0.45) and the
  // clamp then floored the axis at 0.
  // Projected to the one key the helper reads; SampleDataPoint carries a `raw`
  // sample object that does not fit ChartDataPoint's index signature.
  const yDomain = calculateSmartYAxisDomain(
    chartData.map((point) => ({ value: point.value })),
    'value'
  ) ?? [0, 100];

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" style={{ color: metricConfig.color }} />
            <CardTitle className="text-sm font-semibold">
              {title || metricConfig.title}
            </CardTitle>
          </div>
          {provider && (
            <Badge variant="secondary" className="capitalize text-xs">
              {provider}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-center justify-between mb-3 text-xs">
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-2xl font-black"
              style={{ color: metricConfig.color }}
            >
              {stats.latest != null ? stats.latest : '--'}
            </span>
            <span className="text-muted-foreground font-medium">
              {metricConfig.unit}
            </span>
          </div>

          <div className="flex items-center gap-3 text-muted-foreground font-mono">
            <span>
              {t('sleepHealth.avg', 'Avg: {{avg}} {{unit}}', {
                avg: stats.avg,
                unit: metricConfig.unit,
              })}
            </span>
            <span>
              {t('sleepHealth.min', 'Min: {{min}}', { min: stats.min })}
            </span>
            <span>
              {t('sleepHealth.max', 'Max: {{max}}', { max: stats.max })}
            </span>
          </div>
        </div>

        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
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
                domain={yDomain}
                fontSize={10}
                tickLine={false}
                axisLine={false}
                stroke="hsl(var(--muted-foreground))"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                width={35}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  color: 'hsl(var(--foreground))',
                  fontSize: '12px',
                }}
                formatter={(val: unknown) => [
                  `${val} ${metricConfig.unit}`,
                  title || metricConfig.title,
                ]}
                labelFormatter={(label) => `${label ?? ''}`}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={metricConfig.color}
                strokeWidth={2}
                dot={
                  chartData.length < 15
                    ? { fill: metricConfig.color, r: 3 }
                    : false
                }
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default IntradaySamplesChart;
