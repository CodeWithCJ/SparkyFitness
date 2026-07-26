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

interface CardioVolumeIntervalChartProps {
  summaryData?: ExerciseStatsSummaryResponse;
  onIntervalChange?: (interval: 'day' | 'week' | 'month' | 'year') => void;
}

export const CardioVolumeIntervalChart = ({
  summaryData,
  onIntervalChange,
}: CardioVolumeIntervalChartProps) => {
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
            <span>Exercise Volume & Time Totals</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center text-muted-foreground text-sm">
          No exercise distance or duration logged for this date range.
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
      ? `Distance (${unitLabel})`
      : metric === 'duration'
        ? 'Duration (mins)'
        : 'Calories (kcal)';
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
            Exercise Volume & Interval Totals
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Grouped by {summaryData.interval} • Total{' '}
            {summaryData.totals.totalDistanceFormatted} {unitLabel} across{' '}
            {summaryData.totals.workoutCount} workouts
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
              Distance
            </Button>
            <Button
              variant={metric === 'duration' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setMetric('duration')}
            >
              Duration
            </Button>
            <Button
              variant={metric === 'calories' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setMetric('calories')}
            >
              Calories
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
                Week
              </Button>
              <Button
                variant={summaryData.interval === 'month' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onIntervalChange('month')}
              >
                Month
              </Button>
              <Button
                variant={summaryData.interval === 'year' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onIntervalChange('year')}
              >
                Year
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
                `${String(val ?? 0)} ${metric === 'distance' ? unitLabel : metric === 'duration' ? 'mins' : 'kcal'}`,
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
