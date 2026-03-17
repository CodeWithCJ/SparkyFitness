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
  TooltipValueType,
} from 'recharts';
import ZoomableChart from '@/components/ZoomableChart';
import { formatWeight } from '@/utils/numberFormatting';

interface Estimated1RMTrendChartProps {
  data: {
    date: string;
    estimated1RM: number;
    comparisonEstimated1RM: number;
  }[];
  weightUnit: string;
  comparisonPeriod: string | null;
}

export const Estimated1RMTrendChart = ({
  data,
  weightUnit,
  comparisonPeriod,
}: Estimated1RMTrendChartProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(
            'exerciseReportsDashboard.estimated1RMTrend',
            'Estimated 1RM Trend'
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ZoomableChart
          title={t(
            'exerciseReportsDashboard.estimated1RMTrend',
            'Estimated 1RM Trend'
          )}
        >
          <ResponsiveContainer
            width="100%"
            height={300}
            minWidth={0}
            minHeight={0}
            debounce={100}
          >
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis
                tickFormatter={(value) => formatWeight(value, weightUnit)}
                label={{
                  value: t(
                    'exerciseReportsDashboard.estimated1RMCurrent',
                    `Estimated 1RM (${weightUnit})`,
                    { weightUnit }
                  ),
                  angle: -90,
                  position: 'insideLeft',
                  offset: 10,
                }}
              />
              <Tooltip
                formatter={(value: TooltipValueType | undefined) =>
                  value ? formatWeight(Number(value), weightUnit) : 0
                }
                contentStyle={{ backgroundColor: 'hsl(var(--background))' }}
              />
              <Legend />
              <Bar
                dataKey="estimated1RM"
                fill="#ffc658"
                name={t(
                  'exerciseReportsDashboard.estimated1RMCurrent',
                  'Estimated 1RM (Current)'
                )}
                isAnimationActive={false}
              />
              {comparisonPeriod && (
                <Bar
                  dataKey="comparisonEstimated1RM"
                  fill="#ffc658"
                  opacity={0.6}
                  name={t(
                    'exerciseReportsDashboard.estimated1RMComparison',
                    'Estimated 1RM (Comparison)'
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
