import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import ZoomableChart from '@/components/ZoomableChart';
import { ChartDataPoint } from '@/types/reports';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatTimeWithPreference } from '@/utils/timeFormatters';
import { axisLabelValue } from '@/utils/chartUtils';
import { useHeartRateZones } from '@/hooks/Settings/useHeartRateZones';
import {
  fallbackZoneFloors,
  tierGradientStops,
  tierThresholds,
  zoneStroke,
} from '@/utils/heartRateZoneTiers';
import { HEART_RATE_ZONE_COLORS } from '@workspace/shared';

interface ActivityHeartRateChartProps {
  data: ChartDataPoint[];
  xAxisMode: string;
  getXAxisDataKey: () => string;
  getXAxisLabel: () => string;
  distanceUnit: string;
}

export const ActivityHeartRateChart = ({
  data,
  xAxisMode,
  getXAxisDataKey,
  distanceUnit,
}: ActivityHeartRateChartProps) => {
  const { t } = useTranslation();
  const { timeFormat } = usePreferences();
  const { data: zoneData } = useHeartRateZones();

  // Tier edges follow the person's own zones, not fixed bpm values
  const thresholds = useMemo(
    () =>
      tierThresholds(
        zoneData?.resolved.zones.map((z) => z.lower_bpm) ?? fallbackZoneFloors()
      ),
    [zoneData]
  );
  const gradientStops = useMemo(() => {
    const values = data
      .map((p) => Number(p.heartRate))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (values.length === 0) return [];
    return tierGradientStops(
      Math.min(...values),
      Math.max(...values),
      thresholds
    );
  }, [data, thresholds]);

  return (
    <ZoomableChart title={t('reports.activityReport.heartRateBpm')}>
      {(isMaximized, zoomLevel) => (
        <Card className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-semibold">
              {t('reports.activityReport.heartRateBpm', 'Heart Rate (bpm)')}
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: HEART_RATE_ZONE_COLORS[0] }}
                />
                {t('heartRate.zoneLight', 'Light')}
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: HEART_RATE_ZONE_COLORS[1] }}
                />
                {t('heartRate.zoneModerate', 'Moderate')}
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: HEART_RATE_ZONE_COLORS[2] }}
                />
                {t('heartRate.zoneVigorous', 'Vigorous')}
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: HEART_RATE_ZONE_COLORS[3] }}
                />
                {t('heartRate.zonePeak', 'Peak')}
              </span>
            </div>
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
              <LineChart
                data={data}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="activityHrZoneGrad"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    {gradientStops.map((stop, i) => (
                      <stop
                        key={`${stop.offset}-${i}`}
                        offset={stop.offset}
                        stopColor={stop.color}
                      />
                    ))}
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  opacity={0.2}
                />
                <XAxis
                  dataKey={getXAxisDataKey()}
                  tick={{ fontSize: 10 }}
                  minTickGap={24}
                  tickFormatter={(value) => {
                    if (xAxisMode === 'activityDuration')
                      return `${Number(value).toFixed(0)} ${t('common.min', 'min')}`;
                    if (xAxisMode === 'distance')
                      return `${Number(value).toFixed(1)} ${distanceUnit === 'km' ? 'km' : 'mi'}`;
                    if (xAxisMode === 'timeOfDay')
                      return formatTimeWithPreference(
                        new Date(axisLabelValue(value)),
                        timeFormat
                      );
                    return String(value);
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  width={36}
                  tick={{ fontSize: 10 }}
                  allowDecimals={false}
                  domain={[
                    (min: number) =>
                      Math.max(0, Math.floor(min / 10) * 10 - 10),
                    (max: number) => Math.ceil(max / 10) * 10 + 10,
                  ]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                  }}
                  labelFormatter={(value) => {
                    if (xAxisMode === 'timeOfDay')
                      return formatTimeWithPreference(
                        new Date(axisLabelValue(value)),
                        timeFormat
                      );
                    if (xAxisMode === 'activityDuration')
                      return `${Number(value).toFixed(0)} ${t('common.min', 'min')}`;
                    if (xAxisMode === 'distance')
                      return `${Number(value).toFixed(2)} ${distanceUnit === 'km' ? 'km' : 'mi'}`;
                    return String(value);
                  }}
                />
                {thresholds.map((bpm) => (
                  <ReferenceLine
                    key={bpm}
                    y={bpm}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    strokeOpacity={0.3}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="heartRate"
                  stroke={zoneStroke(gradientStops, 'activityHrZoneGrad')}
                  name={t('reports.activityReport.heartRateBpm')}
                  dot={false}
                  strokeWidth={2.5}
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
