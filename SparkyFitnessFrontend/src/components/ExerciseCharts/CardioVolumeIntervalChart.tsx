import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { ExerciseStatsSummaryResponse } from '@workspace/shared';
import { useTranslation } from 'react-i18next';

interface CardioVolumeIntervalChartProps {
  summaryData?: ExerciseStatsSummaryResponse;
  onIntervalChange?: (interval: 'day' | 'week' | 'month' | 'year') => void;
}

export const CardioVolumeIntervalChart = ({
  summaryData,
  onIntervalChange,
}: CardioVolumeIntervalChartProps) => {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<'distance' | 'duration' | 'calories'>(
    'distance'
  );

  if (
    !summaryData ||
    !summaryData.intervalsBreakdown ||
    summaryData.intervalsBreakdown.length === 0
  ) {
    return (
      <Card className="shadow-sm border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center justify-between">
            <span>
              {t(
                'exerciseAnalytics.volume.emptyTitle',
                'Exercise Volume & Time Totals'
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center text-muted-foreground text-sm">
          {t(
            'exerciseAnalytics.volume.noData',
            'No exercise distance or duration logged for this date range.'
          )}
        </CardContent>
      </Card>
    );
  }

  const unitLabel = summaryData.unitSystem === 'imperial' ? 'mi' : 'km';

  const chartData = summaryData.intervalsBreakdown.map((pt) => ({
    label: pt.label,
    distance: pt.distanceFormatted,
    duration: pt.durationMinutes,
    calories: pt.caloriesBurned,
    workouts: pt.workoutCount,
  }));

  const dataKey =
    metric === 'distance'
      ? 'distance'
      : metric === 'duration'
        ? 'duration'
        : 'calories';
  const metricLabel =
    metric === 'distance'
      ? `${t('exerciseAnalytics.volume.distance', 'Distance')} (${unitLabel})`
      : metric === 'duration'
        ? `${t('exerciseAnalytics.volume.duration', 'Duration')} (${t('common.min', 'min')})`
        : `${t('exerciseAnalytics.volume.calories', 'Calories')} (kcal)`;
  const barColor =
    metric === 'distance'
      ? '#3b82f6'
      : metric === 'duration'
        ? '#10b981'
        : '#f59e0b';

  return (
    <Card className="shadow-sm border">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 gap-2">
        <div>
          <CardTitle className="text-lg font-semibold">
            {t(
              'exerciseAnalytics.volume.title',
              'Exercise Volume & Interval Totals'
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {t('exerciseAnalytics.volume.summary', {
              defaultValue_one:
                'Grouped by {{interval}} • Total {{distance}} {{unit}} across {{count}} workout',
              defaultValue_other:
                'Grouped by {{interval}} • Total {{distance}} {{unit}} across {{count}} workouts',
              interval: t(
                `exerciseAnalytics.intervals.${summaryData.interval}`,
                summaryData.interval
              ),
              distance: summaryData.totals.totalDistanceFormatted,
              unit: unitLabel,
              count: summaryData.totals.workoutCount,
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Selector */}
          <div className="flex items-center bg-muted p-1 rounded-md text-xs">
            <Button
              variant={metric === 'distance' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setMetric('distance')}
            >
              {t('exerciseAnalytics.volume.distance', 'Distance')}
            </Button>
            <Button
              variant={metric === 'duration' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setMetric('duration')}
            >
              {t('exerciseAnalytics.volume.duration', 'Duration')}
            </Button>
            <Button
              variant={metric === 'calories' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setMetric('calories')}
            >
              {t('exerciseAnalytics.volume.calories', 'Calories')}
            </Button>
          </div>

          {/* Interval Selector */}
          {onIntervalChange && (
            <div className="flex items-center bg-muted p-1 rounded-md text-xs">
              <Button
                variant={summaryData.interval === 'week' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onIntervalChange('week')}
              >
                {t('exerciseAnalytics.intervals.week', 'Week')}
              </Button>
              <Button
                variant={summaryData.interval === 'month' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onIntervalChange('month')}
              >
                {t('exerciseAnalytics.intervals.month', 'Month')}
              </Button>
              <Button
                variant={summaryData.interval === 'year' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onIntervalChange('year')}
              >
                {t('exerciseAnalytics.intervals.year', 'Year')}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="h-72 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              opacity={0.3}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
            />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(val: unknown) => [
                `${String(val ?? 0)} ${metric === 'distance' ? unitLabel : metric === 'duration' ? t('common.min', 'min') : 'kcal'}`,
                metricLabel,
              ]}
              contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
            />
            <Bar dataKey={dataKey} fill={barColor} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
