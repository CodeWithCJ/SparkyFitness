import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActivityDetailsQuery } from '@/hooks/Exercises/useExercises';
import {
  useHealthMetricSamples,
  useWorkoutGpsPoints,
  useWorkoutHrZones,
} from '@/hooks/useGenericHealth';
import { DailyExerciseEntry } from '@/types/reports';
import { HeartRateZoneLegend } from '@/components/HeartRateZoneLegend';
import { zoneStroke } from '@/utils/heartRateZoneBands';
import { extractWorkoutHeartRateSeries } from '@/utils/workoutTelemetryExtractor';
import { CheckCircle2, Flame, Heart, Info, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import WorkoutZoneSummary from './WorkoutZoneSummary';
import type { HeartRateChartTheme } from './useHeartRateChartTheme';
import { useWorkoutZoneBreakdown } from './useWorkoutZoneBreakdown';

/**
 * Self-contained component rendering heart rate metrics and zone breakdown for an individual workout.
 */
const WorkoutHeartRateItem: React.FC<{
  workout: DailyExerciseEntry;
  hrSampleBuckets: ReturnType<typeof useHealthMetricSamples>['data'];
  chartTheme: HeartRateChartTheme;
  timezone: string;
}> = ({ workout, hrSampleBuckets = [], chartTheme, timezone }) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, dateFormat } = usePreferences();

  const formattedDate = workout.entry_date
    ? formatDateInUserTimezone(workout.entry_date, dateFormat)
    : '';

  const title =
    workout.exercises?.name ||
    (typeof workout['exercise_name'] === 'string'
      ? workout['exercise_name']
      : t('heartRate.exerciseSession', 'Exercise Session'));

  const durMinutes = Math.max(
    1,
    Math.round(Number(workout.duration_minutes || 0))
  );

  // 1. Fetch GPS points, zones, and provider activity details
  const { data: gpsRow } = useWorkoutGpsPoints(workout.id);
  const gpsPoints = gpsRow?.points;
  const { data: workoutHrZones = [] } = useWorkoutHrZones(workout.id);
  const currentProvider = workout['provider_name']
    ? String(workout['provider_name'])
    : '';
  const { data: activityDetails } = useActivityDetailsQuery(
    workout.id,
    currentProvider
  );

  // 2. Extract unified telemetry (GPS trackpoints -> Garmin metrics -> background wear series)
  const telemetry = useMemo(() => {
    return extractWorkoutHeartRateSeries(
      gpsPoints,
      activityDetails as Record<string, unknown> | undefined,
      hrSampleBuckets,
      workout,
      timezone
    );
  }, [gpsPoints, activityDetails, hrSampleBuckets, workout, timezone]);

  const points = telemetry.points;
  const avgBpm = telemetry.avgBpm;
  const peakBpm = telemetry.maxBpm;
  const hasHeartRate =
    (avgBpm !== null && avgBpm > 0) || (peakBpm !== null && peakBpm > 0);

  const timeRange =
    telemetry.startTimeLabel && telemetry.endTimeLabel
      ? `${telemetry.startTimeLabel} – ${telemetry.endTimeLabel} (${durMinutes} min)`
      : workout['entry_time']
        ? `${workout['entry_time']} (${durMinutes} min)`
        : `${durMinutes} min`;

  const { zones, minutesByZone, edges, resolvedZones, pointsGradientStops } =
    useWorkoutZoneBreakdown({
      workoutHrZones,
      activityDetails,
      points,
    });

  // Zone 3 counts once, zones 4 and 5 count twice
  const moderateMins = minutesByZone[2] ?? 0;
  const vigorousMins = (minutesByZone[3] ?? 0) + (minutesByZone[4] ?? 0);
  const activeZoneMinutes = moderateMins + vigorousMins * 2;

  if (!hasHeartRate) {
    return null;
  }

  return (
    <div className="bg-muted/30 border border-border/70 rounded-xl p-5 space-y-5">
      {/* Header & Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground font-medium mb-1">
            {formattedDate ? `${formattedDate} · ` : ''}
            {timeRange}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-lg font-bold text-foreground">{title}</h3>
            {activeZoneMinutes > 0 && (
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold px-2 py-0.5">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {t('heartRate.activeZoneMinutes', 'Active Zone Minutes')}:{' '}
                {activeZoneMinutes}
              </Badge>
            )}
          </div>
        </div>

        {/* Heart Rate Numbers from DB */}
        <div className="flex items-center gap-4 self-start sm:self-auto">
          {avgBpm ? (
            <div className="flex items-baseline gap-1.5">
              <Heart className="w-4 h-4 text-rose-500 fill-rose-500/30 self-center" />
              <span className="text-2xl font-extrabold text-foreground">
                {avgBpm}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('heartRate.bpmAvg', 'bpm (avg)')}
              </span>
            </div>
          ) : null}
          {peakBpm ? (
            <div className="flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-semibold bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full">
              <Flame className="w-3.5 h-3.5 text-rose-500" />
              {peakBpm} {t('heartRate.bpmPeak', 'bpm (peak)')}
            </div>
          ) : null}
          {!hasHeartRate && (
            <Badge
              variant="outline"
              className="text-xs text-muted-foreground font-normal"
            >
              {t('heartRate.noHeartRateLogged', 'No heart rate recorded')}
            </Badge>
          )}
        </div>
      </div>

      {/* Smart Insight Banner (if zones exist in DB) */}
      {(moderateMins > 0 || vigorousMins > 0) && (
        <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/20 px-3.5 py-2.5 rounded-lg text-xs text-amber-800 dark:text-amber-200/90">
          <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
          <span>
            {t(
              'heartRate.zonesSpentInsight',
              'You spent {{moderate}} minutes in zone 3, and {{vigorous}} minutes in zones 4 and 5.',
              {
                moderate: moderateMins,
                vigorous: vigorousMins,
              }
            )}
          </span>
        </div>
      )}

      {/* Real Telemetry Curve (when points exist from GPS, activity details, or synced wearable) */}
      {points.length > 0 ? (
        <div className="space-y-3 pt-1">
          <div className="h-56 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={points}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`workoutHrGradient-${workout.id}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    {pointsGradientStops.map((stop, i) => (
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
                  stroke={chartTheme.gridColor}
                />
                <XAxis
                  dataKey="min"
                  tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                  tickFormatter={(m) => `${m}m`}
                  axisLine={{ stroke: chartTheme.axisLineColor }}
                  tickLine={false}
                />
                <YAxis
                  domain={[
                    (min: number) =>
                      Math.max(30, Math.floor(min / 10) * 10 - 10),
                    (max: number) => Math.ceil(max / 10) * 10 + 10,
                  ]}
                  tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartTheme.tooltipBg,
                    borderColor: chartTheme.tooltipBorder,
                    borderRadius: '0.75rem',
                    color: chartTheme.tooltipText,
                    fontSize: '12px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  }}
                  formatter={(val) => [
                    `${val ?? 0} bpm`,
                    t('heartRate.heartRateBpm', 'Heart Rate'),
                  ]}
                  labelFormatter={(label) =>
                    t('heartRate.minIntoWorkout', '{{min}} min into workout', {
                      min: label,
                    })
                  }
                />
                {edges.map((bpm) => (
                  <ReferenceLine
                    key={bpm}
                    y={bpm}
                    stroke={chartTheme.refLineColor}
                    strokeDasharray="4 4"
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="bpm"
                  stroke={zoneStroke(
                    pointsGradientStops,
                    `workoutHrGradient-${workout.id}`
                  )}
                  strokeWidth={2.8}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: '#fff',
                    stroke: '#eab308',
                    strokeWidth: 2,
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Zone Legend */}
          <HeartRateZoneLegend
            resolved={resolvedZones.resolved}
            displayZones={resolvedZones.displayZones}
            isDefault={resolvedZones.isDefault}
          />
        </div>
      ) : hasHeartRate ? (
        /* Notice when summary numbers exist but per-second continuous curve is missing */
        <div className="p-3.5 bg-background border border-border/80 rounded-lg text-xs text-muted-foreground space-y-1">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <Info className="w-4 h-4 text-muted-foreground" />
            {t('heartRate.summaryRecorded', 'Summary heart rate recorded')}
          </div>
          <p>
            {t(
              'heartRate.summaryRecordedDesc',
              'Average ({{avg}} bpm) and peak ({{peak}} bpm) were recorded for this workout. A continuous per-second curve requires high-resolution telemetry synced from a wearable GPS watch or mobile seeding.',
              { avg: avgBpm, peak: peakBpm }
            )}
          </p>
        </div>
      ) : null}

      <WorkoutZoneSummary zones={zones} />
    </div>
  );
};

export default WorkoutHeartRateItem;
