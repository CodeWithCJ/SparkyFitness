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

interface MaxWeightTrendChartProps {
  data: { date: string; maxWeight: number; comparisonMaxWeight: number }[];
  weightUnit: string;
  onDrilldown: (date: string) => void;
  comparisonPeriod: string | null;
}

export const MaxWeightTrendChart = ({
  data,
  weightUnit,
  onDrilldown,
  comparisonPeriod,
}: MaxWeightTrendChartProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('exerciseReportsDashboard.maxWeightTrend', 'Max Weight Trend')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ZoomableChart
          title={t(
            'exerciseReportsDashboard.maxWeightTrend',
            'Max Weight Trend'
          )}
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
                    'exerciseReportsDashboard.maxWeightCurrent',
                    `Max Weight (${weightUnit})`,
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
                dataKey="maxWeight"
                fill="#82ca9d"
                name={t(
                  'exerciseReportsDashboard.maxWeightCurrent',
                  'Max Weight (Current)'
                )}
                isAnimationActive={false}
              />
              {comparisonPeriod && (
                <Bar
                  dataKey="comparisonMaxWeight"
                  fill="#82ca9d"
                  opacity={0.6}
                  name={t(
                    'exerciseReportsDashboard.maxWeightComparison',
                    'Max Weight (Comparison)'
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
