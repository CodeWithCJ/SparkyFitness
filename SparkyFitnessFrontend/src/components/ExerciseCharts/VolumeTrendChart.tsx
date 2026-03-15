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
import { formatWeight } from '@/utils/numberFormatting';

interface VolumeTrendChartProps {
  data: { date: string; volume: number; comparisonVolume: number }[];
  weightUnit: string;
  onDrilldown: (date: string) => void;
  comparisonPeriod: string | null;
}

export const VolumeTrendChart = ({
  data,
  weightUnit,
  onDrilldown,
  comparisonPeriod,
}: VolumeTrendChartProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('exerciseReportsDashboard.volumeTrend', 'Volume Trend')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ZoomableChart
          title={t('exerciseReportsDashboard.volumeTrend', 'Volume Trend')}
        >
          <ResponsiveContainer
            width="100%"
            height={300}
            minWidth={0}
            minHeight={0}
            debounce={100}
          >
            <BarChart
              onClick={(e) => {
                const event = e as unknown as {
                  activePayload?: { payload: { entry_date: string } }[];
                };
                if (event?.activePayload && event.activePayload.length > 0) {
                  onDrilldown(event.activePayload[0]?.payload.entry_date ?? '');
                }
              }}
              data={data}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis
                tickFormatter={(value) => formatWeight(value, weightUnit)}
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
                formatter={(value: number | undefined) =>
                  value ? formatWeight(value, weightUnit) : 0
                }
                contentStyle={{ backgroundColor: 'hsl(var(--background))' }}
              />
              <Legend />
              <Bar
                dataKey="volume"
                fill="#8884d8"
                name={t(
                  'exerciseReportsDashboard.volumeCurrent',
                  'Volume (Current)'
                )}
                isAnimationActive={false}
              />
              {comparisonPeriod && (
                <Bar
                  dataKey="comparisonVolume"
                  fill="#8884d8"
                  opacity={0.6}
                  name={t(
                    'exerciseReportsDashboard.volumeComparison',
                    'Volume (Comparison)'
                  )}
                  isAnimationActive={false}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </ZoomableChart>
      </CardContent>
    </Card>
  );
};
