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

interface TrainingVolumeByMuscleGroupChartProps {
  data: { muscle: string; volume: number }[];
  weightUnit: string;
}

export const TrainingVolumeByMuscleGroupChart = ({
  data,
  weightUnit,
}: TrainingVolumeByMuscleGroupChartProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(
            'exerciseReportsDashboard.trainingVolumeByMuscleGroup',
            'Training Volume by Muscle Group'
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={0}
            debounce={100}
          >
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="muscle" />
              <YAxis
                label={{
                  value: t(
                    'exerciseReportsDashboard.volumeCurrent',
                    `Volume (${weightUnit})`,
                    { weightUnit }
                  ),
                  angle: -90,
                  position: 'insideLeft',
                  offset: 10,
                }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--background))' }}
              />
              <Legend />
              <Bar dataKey="volume" fill="#ff7300" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
