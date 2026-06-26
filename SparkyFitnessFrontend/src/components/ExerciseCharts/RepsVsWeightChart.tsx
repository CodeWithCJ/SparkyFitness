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

interface RepsVsWeightChartProps {
  data: { reps: number; averageWeight: number }[];
  exerciseName: string;
  weightUnit: string;
}

export const RepsVsWeightChart = ({
  data,
  exerciseName,
  weightUnit,
}: RepsVsWeightChartProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(
            'exerciseReportsDashboard.repsVsWeight',
            `Reps vs Weight - ${exerciseName}`,
            { exerciseName }
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ZoomableChart
          title={t('exerciseReportsDashboard.repsVsWeight', 'Reps vs Weight', {
            exerciseName: '',
          })}
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
                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                data={data}
              >
                <CartesianGrid />
                <XAxis
                  dataKey="reps"
                  name={t('exerciseReportsDashboard.reps', 'Reps')}
                />
                <YAxis
                  label={{
                    value: t(
                      'exerciseReportsDashboard.averageWeight',
                      `Average Weight (${weightUnit})`,
                      { weightUnit }
                    ),
                    angle: -90,
                    position: 'insideLeft',
                    offset: 10,
                    style: { textAnchor: 'middle' },
                  }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--background))' }}
                />
                <Legend />
                <Bar
                  dataKey="averageWeight"
                  name={exerciseName}
                  fill="#a4de6c"
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
