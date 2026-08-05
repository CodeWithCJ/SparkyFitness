import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  Cell,
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

// Standard 5-zone HR palette (Zone 1 = easiest/blue through Zone 5 = hardest/red),
// matching the Garmin/Apple Fitness convention. Extra zones beyond 5 repeat the
// last (hardest) color rather than falling back to a neutral gray.
const ZONE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'];
const zoneColorAt = (index: number) =>
  ZONE_COLORS[Math.min(index, ZONE_COLORS.length - 1)];

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
              height={isMaximized ? '100%' : 300 * zoomLevel}
              minWidth={0}
              minHeight={0}
              debounce={100}
            >
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} />
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
                  isAnimationActive={false}
                >
                  {data.map((entry, index) => (
                    <Cell key={entry.name} fill={zoneColorAt(index)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </ZoomableChart>
  );
};
