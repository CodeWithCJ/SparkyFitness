import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipValueType,
} from 'recharts';
import ZoomableChart from '@/components/ZoomableChart';
import { ChartDataPoint } from '@/types/reports';

interface ActivityElevationChartProps {
  data: ChartDataPoint[];
  xAxisMode: string;
  getXAxisDataKey: () => string;
  getXAxisLabel: () => string;
  distanceUnit: string;
}

export const ActivityElevationChart = ({
  data,
  xAxisMode,
  getXAxisDataKey,
  getXAxisLabel,
  distanceUnit,
}: ActivityElevationChartProps) => {
  const { t } = useTranslation();

  return (
    <ZoomableChart title={t('reports.activityReport.elevationM')}>
      {(isMaximized, zoomLevel) => (
        <Card className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}>
          <CardHeader>
            <CardTitle className="text-sm">
              {t('reports.activityReport.elevationM')}
            </CardTitle>
          </CardHeader>
          <CardContent
            className={`grow ${isMaximized ? 'min-h-0 h-full' : ''}`}
          >
            <ResponsiveContainer
              width={`${100 * zoomLevel}%`}
              height={isMaximized ? `${100 * zoomLevel}%` : 300 * zoomLevel}
              minWidth={0}
              minHeight={0}
              debounce={100}
            >
              <LineChart data={data} syncId="activityReportSync">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={getXAxisDataKey()}
                  label={{
                    value: getXAxisLabel(),
                    position: 'insideBottom',
                    offset: -5,
                  }}
                  tickFormatter={(value) => {
                    if (xAxisMode === 'activityDuration')
                      return `${Number(value).toFixed(0)} ${t('common.min', 'min')}`;
                    if (xAxisMode === 'distance')
                      return `${Number(value).toFixed(2)}`;
                    if (xAxisMode === 'timeOfDay')
                      return new Date(value).toLocaleTimeString();
                    return String(value);
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                  }}
                  labelFormatter={(value) => {
                    if (xAxisMode === 'timeOfDay')
                      return new Date(value).toLocaleTimeString();
                    if (xAxisMode === 'activityDuration')
                      return `${Number(value).toFixed(0)} ${t('common.min', 'min')}`;
                    if (xAxisMode === 'distance')
                      return `${Number(value).toFixed(2)} ${distanceUnit === 'km' ? 'km' : 'mi'}`;
                    return String(value);
                  }}
                  formatter={(value: TooltipValueType | undefined) =>
                    Number(value).toFixed(2)
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="elevation"
                  stroke="#007bff"
                  name={t('reports.activityReport.elevationM')}
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
};
