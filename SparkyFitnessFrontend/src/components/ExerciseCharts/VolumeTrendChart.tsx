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

interface VolumeTrendChartProps {
  data: { date: string; volume: number; comparisonVolume: number }[];
  weightUnit: string;
  comparisonPeriod: string | null;
}

export const VolumeTrendChart = ({
  data,
  weightUnit,
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
                    style: { textAnchor: 'middle' },
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
          )}
        </ZoomableChart>
      </CardContent>
    </Card>
  );
};
