import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  TooltipValueType,
} from 'recharts';
import ZoomableChart from '@/components/ZoomableChart';

interface HeartRateZoneData {
  name: string;
  [key: string]: string | number;
}

interface ActivityHeartRateZonesChartProps {
  data: HeartRateZoneData[];
}

export const ActivityHeartRateZonesChart = ({
  data,
}: ActivityHeartRateZonesChartProps) => {
  const { t } = useTranslation();

  return (
    <ZoomableChart title={t('reports.activityReport.heartRateTimeInZones')}>
      {(isMaximized, zoomLevel) => (
        <Card className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}>
          <CardHeader>
            <CardTitle className="text-sm">
              {t('reports.activityReport.heartRateTimeInZones')}
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
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                  }}
                  formatter={(value: TooltipValueType | undefined) =>
                    value != null &&
                    `${Number(value).toFixed(2)} ${t('reports.activityReport.timeInZoneS')}`
                  }
                />
                <Legend />
                <Bar
                  dataKey={t('reports.activityReport.timeInZoneS')}
                  fill="#8884d8"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
};
