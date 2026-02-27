import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Wind } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { parseISO } from 'date-fns';
import { CustomCategory, CustomMeasurement } from '@/types/checkin';

// Respiration metric names as they come from Garmin sync
const RESPIRATION_METRICS = [
  'Average Respiration Rate',
  'Sleep Respiration Avg',
  'Awake Respiration Avg',
];

interface RespirationCardProps {
  categories: CustomCategory[];
  measurementsData: Record<string, CustomMeasurement[]>;
}

interface RespirationDay {
  date: string;
  displayDate: string;
  sleepAvg: number | null;
  awakeAvg: number | null;
  average: number | null;
}

// Get status info based on respiration rate
const getRespirationStatusInfo = (
  value: number
): { status: string; color: string; description: string } => {
  if (value < 12) {
    return {
      status: 'Low',
      color: '#f97316',
      description: 'Below normal breathing rate at rest.',
    };
  } else if (value <= 20) {
    return {
      status: 'Normal',
      color: '#22c55e',
      description: 'Healthy breathing rate for adults at rest.',
    };
  } else {
    return {
      status: 'Elevated',
      color: '#f97316',
      description: 'Above normal resting breathing rate.',
    };
  }
};

const RespirationCard: React.FC<RespirationCardProps> = ({
  categories,
  measurementsData,
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  // Get Respiration categories
  const respirationCategories = useMemo(() => {
    return {
      sleepAvg: categories.find((cat) => cat.name === 'Sleep Respiration Avg'),
      awakeAvg: categories.find((cat) => cat.name === 'Awake Respiration Avg'),
      average: categories.find(
        (cat) => cat.name === 'Average Respiration Rate'
      ),
    };
  }, [categories]);

  // Transform data: group by date, combine sleep and awake values
  const transformedData = useMemo(() => {
    const dataByDate: Record<string, RespirationDay> = {};

    // Process sleep respiration
    if (respirationCategories.sleepAvg) {
      const data = measurementsData[respirationCategories.sleepAvg.id] || [];
      data.forEach((entry) => {
        const date = entry.entry_date;
        if (!dataByDate[date]) {
          dataByDate[date] = {
            date,
            displayDate: formatDateInUserTimezone(parseISO(date), 'MMM dd'),
            sleepAvg: null,
            awakeAvg: null,
            average: null,
          };
        }
        const value =
          typeof entry.value === 'string'
            ? parseFloat(entry.value)
            : entry.value;
        dataByDate[date].sleepAvg = value;
      });
    }

    // Process awake respiration
    if (respirationCategories.awakeAvg) {
      const data = measurementsData[respirationCategories.awakeAvg.id] || [];
      data.forEach((entry) => {
        const date = entry.entry_date;
        if (!dataByDate[date]) {
          dataByDate[date] = {
            date,
            displayDate: formatDateInUserTimezone(parseISO(date), 'MMM dd'),
            sleepAvg: null,
            awakeAvg: null,
            average: null,
          };
        }
        const value =
          typeof entry.value === 'string'
            ? parseFloat(entry.value)
            : entry.value;
        dataByDate[date].awakeAvg = value;
      });
    }

    // Process average respiration (fallback if no sleep/awake data)
    if (respirationCategories.average) {
      const data = measurementsData[respirationCategories.average.id] || [];
      data.forEach((entry) => {
        const date = entry.entry_date;
        if (!dataByDate[date]) {
          dataByDate[date] = {
            date,
            displayDate: formatDateInUserTimezone(parseISO(date), 'MMM dd'),
            sleepAvg: null,
            awakeAvg: null,
            average: null,
          };
        }
        const value =
          typeof entry.value === 'string'
            ? parseFloat(entry.value)
            : entry.value;
        dataByDate[date].average = value;
      });
    }

    // Sort by date and return array
    return Object.values(dataByDate).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [respirationCategories, measurementsData, formatDateInUserTimezone]);

  // Check if we have sleep/awake data or just average
  const hasSleepAwakeData = transformedData.some(
    (d) => d.sleepAvg !== null || d.awakeAvg !== null
  );

  // Calculate stats
  const stats = useMemo(() => {
    if (transformedData.length === 0) return null;

    const sleepValues = transformedData
      .filter((d) => d.sleepAvg !== null)
      .map((d) => d.sleepAvg!);
    const awakeValues = transformedData
      .filter((d) => d.awakeAvg !== null)
      .map((d) => d.awakeAvg!);
    const avgValues = transformedData
      .filter((d) => d.average !== null)
      .map((d) => d.average!);

    return {
      sleepAvg:
        sleepValues.length > 0
          ? sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length
          : null,
      awakeAvg:
        awakeValues.length > 0
          ? awakeValues.reduce((a, b) => a + b, 0) / awakeValues.length
          : null,
      average:
        avgValues.length > 0
          ? avgValues.reduce((a, b) => a + b, 0) / avgValues.length
          : null,
    };
  }, [transformedData]);

  // Get latest day's data
  const latestData =
    transformedData.length > 0
      ? transformedData[transformedData.length - 1]
      : null;
  const displayValue = latestData?.sleepAvg ?? latestData?.average ?? 0;
  const { status, color, description } = getRespirationStatusInfo(displayValue);

  // Don't render if no respiration data
  const hasAnyData =
    respirationCategories.sleepAvg ||
    respirationCategories.awakeAvg ||
    respirationCategories.average;
  if (!hasAnyData || transformedData.length === 0) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-lg">
          <Wind className="w-5 h-5 mr-2" />
          {t('reports.respiration', 'Respiration')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left side: Current values and stats */}
          <div className="flex flex-col items-center justify-center space-y-4">
            {/* Stats display - similar to Garmin */}
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground mb-4">
                {t('reports.dailyAverages', 'Daily Averages')}
              </p>

              <div className="flex justify-center gap-8">
                {/* Sleep Avg */}
                <div className="text-center">
                  <p className="text-4xl font-bold text-blue-500">
                    {stats?.sleepAvg?.toFixed(0) ??
                      latestData?.sleepAvg?.toFixed(0) ??
                      '--'}
                  </p>
                  <p className="text-sm text-muted-foreground">brpm</p>
                  <p className="text-sm font-medium text-blue-500">
                    {t('reports.sleepAvg', 'Sleep Avg')}
                  </p>
                </div>

                {/* Awake Avg */}
                <div className="text-center">
                  <p className="text-4xl font-bold text-cyan-500">
                    {stats?.awakeAvg?.toFixed(0) ??
                      latestData?.awakeAvg?.toFixed(0) ??
                      '--'}
                  </p>
                  <p className="text-sm text-muted-foreground">brpm</p>
                  <p className="text-sm font-medium text-cyan-500">
                    {t('reports.awakeAvg', 'Awake Avg')}
                  </p>
                </div>
              </div>

              {/* Status indicator */}
              <div className="mt-4">
                <p className="font-semibold" style={{ color }}>
                  {t(
                    `reports.respirationStatus.${status.toLowerCase()}`,
                    status
                  )}
                </p>
                <p className="text-sm text-muted-foreground max-w-[250px] mx-auto">
                  {t(
                    `reports.respirationDescription.${status.toLowerCase()}`,
                    description
                  )}
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
                <LineChart data={transformedData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="displayDate"
                    fontSize={11}
                    tickLine={false}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    domain={[8, 24]}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      color: 'hsl(var(--foreground))',
                    }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        sleepAvg: t('reports.sleepAvg', 'Sleep Avg'),
                        awakeAvg: t('reports.awakeAvg', 'Awake Avg'),
                        average: t('reports.average', 'Average'),
                      };
                      return [
                        `${value?.toFixed(1)} brpm`,
                        labels[name] || name,
                      ];
                    }}
                    labelFormatter={(label) => label}
                  />
                  <Legend
                    formatter={(value) => {
                      const labels: Record<string, string> = {
                        sleepAvg: t('reports.sleepAvg', 'Sleep Avg'),
                        awakeAvg: t('reports.awakeAvg', 'Awake Avg'),
                        average: t('reports.average', 'Average'),
                      };
                      return labels[value] || value;
                    }}
                  />
                  {/* Sleep Avg line (blue) */}
                  {hasSleepAwakeData && (
                    <Line
                      type="monotone"
                      dataKey="sleepAvg"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, fill: '#3b82f6' }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                  {/* Awake Avg line (cyan) */}
                  {hasSleepAwakeData && (
                    <Line
                      type="monotone"
                      dataKey="awakeAvg"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      dot={{ fill: '#06b6d4', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, fill: '#06b6d4' }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                  {/* Fallback: Average line if no sleep/awake data */}
                  {!hasSleepAwakeData && (
                    <Line
                      type="monotone"
                      dataKey="average"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, fill: '#3b82f6' }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
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

        {/* Normal range indicator */}
        <div className="flex justify-center mt-4 text-xs text-muted-foreground">
          <span>
            {t('reports.normalRange', 'Normal adult resting range')}: 12-20 brpm
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

// Export the metric names for filtering in Reports.tsx
export { RESPIRATION_METRICS };
export default RespirationCard;
