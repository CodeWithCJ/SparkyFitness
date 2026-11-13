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
  ResponsiveContainer,
} from 'recharts';
import ZoomableChart from '@/components/ZoomableChart';
import type { StoredZoneMethod } from '@workspace/shared';
import { zoneChartMethodLabel } from '@/utils/heartRateZoneLabels';

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

const zoneTick = (name: string) => {
  const match = name.match(/zone\s*(\d+)/i);
  return match ? `Z${match[1]}` : name;
};

const formatZoneDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins} min`;
  return `${mins}m ${secs}s`;
};

// Seconds under a minute, else minutes with a decimal when needed, so ticks
// a few seconds apart never round to the same label.
const zoneAxisTick = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const mins = total / 60;
  return Number.isInteger(mins) ? `${mins}m` : `${mins.toFixed(1)}m`;
};

interface ActivityHeartRateZonesChartProps {
  data: HeartRateZoneData[];
  /** exercise_entries.source (case-insensitive) — determines whether these
   *  zones came from the device itself or from our own age-based estimate. */
  providerName?: string;
  /** How the stored zones were worked out; null/absent for workouts stored before methods were recorded. */
  zoneMethod?: StoredZoneMethod | 'mixed' | null;
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
  zoneMethod,
}: ActivityHeartRateZonesChartProps) => {
  const { t } = useTranslation();
  const methodLabel = zoneChartMethodLabel(t, zoneMethod);
  // Rows stored before methods were recorded were all worked out from age, so
  // the age note still applies to them; newer rows say their own method.
  const isEstimatedMaxHr =
    !methodLabel &&
    ESTIMATED_MAX_HR_PROVIDERS.has((providerName ?? '').toLowerCase());

  return (
    <ZoomableChart title={t('reports.activityReport.heartRateTimeInZones')}>
      {(isMaximized, zoomLevel) => (
        <Card className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}>
          <CardHeader>
            <CardTitle className="text-sm">
              {t('reports.activityReport.heartRateTimeInZones')}
            </CardTitle>
            {methodLabel && (
              <p
                className="text-xs text-muted-foreground"
                data-testid="hr-zones-method"
              >
                {methodLabel}
              </p>
            )}
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
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  interval={0}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: string) => zoneTick(String(value))}
                />
                <YAxis
                  width={40}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: number) => zoneAxisTick(Number(value))}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))' }}
                  content={({ active, payload }) => {
                    const point = payload?.[0];
                    if (!active || !point) return null;
                    const row = point.payload as HeartRateZoneData;
                    const seconds = Number(point.value);
                    if (!Number.isFinite(seconds)) return null;
                    return (
                      <div className="rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-sm">
                        <div className="font-medium">{row.name}</div>
                        <div>{formatZoneDuration(seconds)}</div>
                      </div>
                    );
                  }}
                />
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
