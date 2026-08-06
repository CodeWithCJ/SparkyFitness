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
  /** exercise_entries.source (case-insensitive) — determines whether these
   *  zones came from the device itself or from our own age-based estimate. */
  providerName?: string;
}

// Only these two sources go through hrZoneCalculator.ts's age-based estimate
// (211 - 0.64*age) server-side — HealthKit and Health Connect expose no
// user-configured max HR to third-party apps at all. Garmin (and any future
// provider that sends its own zones) reports the athlete's real device-
// configured max HR, so the note must not show for those.
const ESTIMATED_MAX_HR_PROVIDERS = new Set(['healthkit', 'health connect']);

export const ActivityHeartRateZonesChart = ({
  data,
  providerName,
}: ActivityHeartRateZonesChartProps) => {
  const { t } = useTranslation();
  const isEstimatedMaxHr = ESTIMATED_MAX_HR_PROVIDERS.has(
    (providerName ?? '').toLowerCase()
  );

  return (
    <ZoomableChart title={t('reports.activityReport.heartRateTimeInZones')}>
      {(isMaximized, zoomLevel) => (
        <Card className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}>
          <CardHeader>
            <CardTitle className="text-sm">
              {t('reports.activityReport.heartRateTimeInZones')}
            </CardTitle>
            {isEstimatedMaxHr && (
              <p className="text-xs text-muted-foreground">
                {t(
                  'reports.activityReport.hrZonesEstimatedFromAge',
                  "Zones are estimated from your age — Apple Health and Health Connect don't share a configured max heart rate with apps."
                )}
              </p>
            )}
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
