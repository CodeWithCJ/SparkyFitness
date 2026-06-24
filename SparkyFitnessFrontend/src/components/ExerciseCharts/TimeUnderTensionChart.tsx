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
import ZoomableChart from '@/components/ZoomableChart';

interface TimeUnderTensionChartProps {
  data: { date: string; timeUnderTension: number }[];
  exerciseName: string;
}

export const TimeUnderTensionChart = ({
  data,
  exerciseName,
}: TimeUnderTensionChartProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(
            'exerciseReportsDashboard.timeUnderTensionTrend',
            `Time Under Tension Trend - ${exerciseName}`,
            { exerciseName }
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ZoomableChart
          title={t(
            'exerciseReportsDashboard.timeUnderTensionTrendTitle',
            'Time Under Tension Trend'
          )}
        >
          {(isMaximized, zoomLevel) => (
            <ResponsiveContainer
              width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
              height={isMaximized ? '100%' : 300}
              minWidth={0}
              minHeight={0}
              debounce={100}
            >
              <BarChart
                data={data}
                margin={{ top: 20, right: 30, bottom: 20, left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis
                  label={{
                    value: t(
                      'exerciseReportsDashboard.timeUnderTensionMin',
                      'Time Under Tension (min)'
                    ),
                    angle: -90,
                    position: 'insideLeft',
                    offset: 10,
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--background))' }}
                />
                <Legend />
                <Bar
                  dataKey="timeUnderTension"
                  fill="#d0ed57"
                  name={exerciseName}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ZoomableChart>
      </CardContent>
    </Card>
  );
};
