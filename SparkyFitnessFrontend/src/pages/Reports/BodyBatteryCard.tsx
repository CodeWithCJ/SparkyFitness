import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Battery } from 'lucide-react';
import type {
  CustomCategory,
  CustomMeasurementData,
} from '@/api/Reports/reportsService';
import BodyBatteryGauge from './BodyBatteryGauge';
import { usePreferences } from '@/contexts/PreferencesContext';
import { parseISO } from 'date-fns';
import { BODY_BATTERY_METRICS } from '@/constants/reports';

interface BodyBatteryCardProps {
  categories: CustomCategory[];
  measurementsData: Record<string, CustomMeasurementData[]>;
}

interface BodyBatteryDay {
  date: string;
  displayDate: string;
  highest: number | null;
  lowest: number | null;
  at_wake: number | null;
  charged: number | null;
  drained: number | null;
}

const BodyBatteryCard: React.FC<BodyBatteryCardProps> = ({
  categories,
  measurementsData,
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Get Body Battery categories
  const bodyBatteryCategories = useMemo(() => {
    return categories.filter((cat) => BODY_BATTERY_METRICS.includes(cat.name));
  }, [categories]);

  // Transform data: group by date, pivot metrics into single object per day
  const transformedData = useMemo(() => {
    const dataByDate: Record<string, BodyBatteryDay> = {};

    bodyBatteryCategories.forEach((category) => {
      const data = measurementsData[category.id] || [];

      data.forEach((entry) => {
        const date = entry.entry_date;
        if (!dataByDate[date]) {
          dataByDate[date] = {
            date,
            displayDate: formatDateInUserTimezone(parseISO(date), 'MMM dd'),
            highest: null,
            lowest: null,
            at_wake: null,
            charged: null,
            drained: null,
          };
        }

        const value =
          typeof entry.value === 'string'
            ? parseFloat(entry.value)
            : entry.value;

        switch (category.name) {
          case 'Body Battery Highest':
            dataByDate[date].highest = value;
            break;
          case 'Body Battery Lowest':
            dataByDate[date].lowest = value;
            break;
          case 'Body Battery At Wake':
            dataByDate[date].at_wake = value;
            break;
          case 'Body Battery Charged':
            dataByDate[date].charged = value;
            break;
          case 'Body Battery Drained':
            dataByDate[date].drained = value;
            break;
        }
      });
    });

    // Sort by date and return array
    return Object.values(dataByDate).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [bodyBatteryCategories, measurementsData, formatDateInUserTimezone]);

  // Get latest day's data for gauge
  const latestData =
    transformedData.length > 0
      ? transformedData[transformedData.length - 1]
      : null;

  // Use at_wake if available, otherwise highest
  const gaugeValue = latestData?.at_wake ?? latestData?.highest ?? 0;
  const chargedValue = latestData?.charged ?? 0;
  const drainedValue = latestData?.drained ?? 0;

  // Don't render if no body battery data
  if (bodyBatteryCategories.length === 0 || transformedData.length === 0) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-lg">
          <Battery className="w-5 h-5 mr-2" />
          {t('reports.bodyBattery', 'Body Battery')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left side: Gauge and stats */}
          <div className="flex flex-col items-center justify-center space-y-4">
            <BodyBatteryGauge value={Math.round(gaugeValue)} size={180} />

            {/* Charged/Drained Stats */}
            <div className="flex justify-center gap-8 mt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500">
                  +{Math.round(chargedValue)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('reports.charged', 'Charged')}
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-500">
                  -{Math.round(drainedValue)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('reports.drained', 'Drained')}
                </p>
              </div>
            </div>
          </div>

          {/* Right side: Trend chart */}
          <div className="h-64">
            <p className="text-sm font-medium mb-2">
              {t('reports.trend', 'Trend')}
            </p>
            {isMounted ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={0}
                debounce={100}
              >
                <BarChart
                  data={transformedData}
                  barGap={0}
                  barCategoryGap="20%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="displayDate"
                    fontSize={11}
                    tickLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        highest: t('reports.highest', 'Highest'),
                        at_wake: t('reports.atWake', 'At Wake'),
                        lowest: t('reports.lowest', 'Lowest'),
                      };
                      return [Math.round(value), labels[name] || name];
                    }}
                  />
                  <Legend
                    formatter={(value) => {
                      const labels: Record<string, string> = {
                        highest: t('reports.highest', 'Highest'),
                        at_wake: t('reports.atWake', 'At Wake'),
                        lowest: t('reports.lowest', 'Lowest'),
                      };
                      return labels[value] || value;
                    }}
                  />
                  <Bar
                    dataKey="highest"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="at_wake"
                    fill="#06b6d4"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="lowest"
                    fill="#6b7280"
                    radius={[4, 4, 0, 0]}
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
        </div>
      </CardContent>
    </Card>
  );
};

// Export the metric names for filtering in Reports.tsx
export { BODY_BATTERY_METRICS };
export default BodyBatteryCard;
