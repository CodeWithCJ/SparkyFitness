import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Droplet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseISO } from 'date-fns';
import ZoomableChart from '@/components/ZoomableChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useHydrationNutritionRange } from '@/hooks/Reports/useReports';
import { calculateSmartYAxisDomain } from '@/utils/chartUtils';
import { convertMlToSelectedUnit } from '@/utils/nutritionCalculations';

interface HydrationTrendChartProps {
  startDate: string;
  endDate: string;
  userId?: string | null;
}

// #2348: water_ml is deliberately excluded from the RANGE_COLS-driven
// NutritionChartsGrid (design-decisions correction 3), so hydration gets its
// own bespoke chart here, beside the existing water UI. Caffeine/alcohol
// need no equivalent -- they already render inside NutritionChartsGrid.
const HydrationTrendChart = ({
  startDate,
  endDate,
  userId,
}: HydrationTrendChartProps) => {
  const { t } = useTranslation();
  const { water_display_unit, formatDateInUserTimezone } = usePreferences();
  const { data, isLoading } = useHydrationNutritionRange(
    startDate,
    endDate,
    userId
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.days.length === 0) {
    return null;
  }

  const chartData = data.days.map((day) => ({
    date: day.date,
    water: convertMlToSelectedUnit(day.water_ml, water_display_unit),
  }));

  const average =
    chartData.reduce((sum, d) => sum + d.water, 0) / chartData.length;
  const decimals =
    water_display_unit === 'ml' ? 0 : water_display_unit === 'liter' ? 2 : 1;
  const yAxisDomain = calculateSmartYAxisDomain(chartData, 'water', {
    useZeroBaseline: true,
  });

  const formatDateForChart = (dateStr: string) =>
    formatDateInUserTimezone(parseISO(dateStr), 'MMM dd');

  return (
    <ZoomableChart
      title={`${t('reports.hydration.title', 'Hydration')} (${water_display_unit})`}
    >
      {(isMaximized, zoomLevel) => (
        <Card className={isMaximized ? 'h-full flex flex-col' : ''}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Droplet className="w-4 h-4 text-blue-500" />
                {t('reports.hydration.title', 'Hydration')} (
                {water_display_unit})
              </CardTitle>
              <div className="text-right text-xs text-muted-foreground font-normal">
                {t('reports.average', 'Avg')}: {average.toFixed(decimals)}{' '}
                {water_display_unit}
              </div>
            </div>
          </CardHeader>
          <CardContent
            className={`grow min-h-0 ${isMaximized ? 'flex flex-col' : ''}`}
          >
            <div
              className={(isMaximized ? 'grow min-h-0' : 'h-48') + ' min-w-0'}
            >
              <ResponsiveContainer
                width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                height="100%"
                minWidth={0}
                minHeight={0}
                debounce={100}
              >
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    fontSize={10}
                    tickFormatter={formatDateForChart}
                    tickCount={
                      isMaximized ? Math.max(chartData.length, 10) : undefined
                    }
                  />
                  <YAxis
                    fontSize={10}
                    domain={yAxisDomain || undefined}
                    tickFormatter={(value: number) => value.toFixed(decimals)}
                  />
                  <Tooltip
                    labelFormatter={(value) =>
                      formatDateForChart(value as string)
                    }
                    formatter={(
                      value:
                        | string
                        | number
                        | ReadonlyArray<string | number>
                        | undefined
                    ) => {
                      if (value === null || value === undefined) {
                        return [
                          'N/A',
                          t('reports.hydration.title', 'Hydration'),
                        ];
                      }
                      const numValue = Number(
                        Array.isArray(value) ? value[0] : value
                      );
                      return [
                        `${numValue.toFixed(decimals)} ${water_display_unit}`,
                        t('reports.hydration.title', 'Hydration'),
                      ];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="water"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
};

export default HydrationTrendChart;
