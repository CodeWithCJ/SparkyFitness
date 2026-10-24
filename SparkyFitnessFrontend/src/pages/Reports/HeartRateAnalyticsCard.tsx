import React, { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  LineChart,
} from 'recharts';
import {
  Heart,
  Flame,
  Activity,
  Moon,
  Sun,
  AlertTriangle,
  Sparkles,
  Info,
  CheckCircle2,
  Dumbbell,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import DateRangeBrush from '@/components/DateRangeBrush';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  useHealthMetricSamples,
  useDailyHealthMetrics,
  useWorkoutHrZones,
  useWorkoutGpsPoints,
} from '@/hooks/useGenericHealth';
import { useActivityDetailsQuery } from '@/hooks/Exercises/useExercises';
import { DailyExerciseEntry } from '@/types/reports';
import {
  computeTimeInZones,
  getWorkoutEmoji,
  HEART_RATE_ZONE_COLORS,
} from '@workspace/shared';
import { extractWorkoutHeartRateSeries } from '@/utils/workoutTelemetryExtractor';
import { useSleepEntriesQuery } from '@/hooks/CheckIn/useSleep';
import { useHeartRateZones } from '@/hooks/Settings/useHeartRateZones';
import {
  fallbackZoneFloors,
  foldZonesIntoTiers,
  tierGradientStops,
  tierThresholds,
  zoneStroke,
} from '@/utils/heartRateZoneTiers';
import { formatTimeOfDayString } from '@/utils/timeFormatters';
import {
  DayWindow,
  dayStringToMs,
  isDetailedWindow,
  lastDaysWindow,
  msToDayString,
  selectionMsToWindow,
  shiftWindow,
  windowDayCount,
  windowToSelectionMs,
} from '@/utils/heartRateWindow';

interface HeartRateAnalyticsCardProps {
  startDate: string;
  endDate: string;
  exerciseEntries?: DailyExerciseEntry[];
  restingHeartRateData?: Array<{
    date: string;
    resting_heart_rate: number | null;
  }>;
}

/**
 * Self-contained component rendering heart rate metrics and zone breakdown for an individual workout.
 */
const WorkoutHeartRateItem: React.FC<{
  workout: DailyExerciseEntry;
  hrSampleBuckets: ReturnType<typeof useHealthMetricSamples>['data'];
  chartTheme: {
    gridColor: string;
    tickColor: string;
    axisLineColor: string;
    refLineColor: string;
    tooltipBg: string;
    tooltipBorder: string;
    tooltipText: string;
  };
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

  // 3. Zone breakdown (stored rows -> Garmin payload -> the person's own zones).
  // All five zones are summed first, then folded into the four named tiers, so
  // the percentages always add up.
  const { data: zoneData } = useHeartRateZones();
  const zoneFloors = useMemo(
    () => zoneData?.resolved.zones.map((z) => z.lower_bpm) ?? null,
    [zoneData]
  );
  const thresholds = useMemo(
    () => tierThresholds(zoneFloors ?? fallbackZoneFloors()),
    [zoneFloors]
  );

  const zones = useMemo(() => {
    const secondsByZone = [0, 0, 0, 0, 0];
    const add = (zone: number, seconds: number) => {
      if (Number.isInteger(zone) && zone >= 1 && zone <= 5 && seconds > 0) {
        secondsByZone[zone - 1] = (secondsByZone[zone - 1] ?? 0) + seconds;
      }
    };

    if (workoutHrZones && workoutHrZones.length > 0) {
      workoutHrZones.forEach((z) => add(z.zone_index, z.seconds_in_zone || 0));
    } else {
      const act = (activityDetails as Record<string, unknown> | undefined)?.[
        'activity'
      ] as Record<string, unknown> | undefined;
      const rawZones = (act?.['hr_in_timezones'] ||
        (activityDetails as Record<string, unknown> | undefined)?.[
          'hr_in_timezones'
        ]) as Array<{ zoneNumber: number; secsInZone: number }> | undefined;

      if (Array.isArray(rawZones) && rawZones.length > 0) {
        rawZones.forEach((z) => add(z.zoneNumber, z.secsInZone || 0));
      } else if (points.length >= 2 && zoneFloors) {
        computeTimeInZones(
          points.map((p) => ({
            t: new Date(p.timestamp).toISOString(),
            bpm: p.bpm,
          })),
          zoneFloors
        ).forEach((b) => add(b.zone_index, b.seconds_in_zone));
      }
    }

    const totalSecs = secondsByZone.reduce((a, b) => a + b, 0);
    if (totalSecs <= 0) return [];
    const names = [
      t('heartRate.zoneLight', 'Light'),
      t('heartRate.zoneModerate', 'Moderate'),
      t('heartRate.zoneVigorous', 'Vigorous'),
      t('heartRate.zonePeak', 'Peak'),
    ];
    return foldZonesIntoTiers(secondsByZone).map((secs, idx) => ({
      name: names[idx] ?? `Zone ${idx + 1}`,
      pct: Math.round((secs / totalSecs) * 100),
      mins: Math.round(secs / 60),
      color: HEART_RATE_ZONE_COLORS[idx] ?? '#22c55e',
    }));
  }, [workoutHrZones, activityDetails, points, zoneFloors, t]);

  const pointsGradientStops = useMemo(() => {
    const values = points.map((p) => p.bpm).filter((v) => v > 0);
    if (values.length === 0) return [];
    return tierGradientStops(
      Math.min(...values),
      Math.max(...values),
      thresholds
    );
  }, [points, thresholds]);

  const moderateMins = zones[1]?.mins ?? 0;
  const vigorousMins = (zones[2]?.mins ?? 0) + (zones[3]?.mins ?? 0);
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
              'You spent {{moderate}} minutes in the moderate zone, and {{vigorous}} minutes in vigorous and peak zones.',
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
                  formatter={(val) => [`${val ?? 0} bpm`, 'Heart Rate']}
                  labelFormatter={(label) => `${label} min into workout`}
                />
                {thresholds.map((bpm) => (
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
          <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground font-medium">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#06b6d4]" />
              {t('heartRate.zoneLight', 'Light')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />
              {t('heartRate.zoneModerate', 'Moderate')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]" />
              {t('heartRate.zoneVigorous', 'Vigorous')}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" />
              {t('heartRate.zonePeak', 'Peak')}
            </div>
          </div>
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

      {/* Time in Each Zone Section */}
      {zones.length > 0 && (
        <div className="pt-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {t('heartRate.timeInEachZone', 'Time in each zone')}
            </h4>
          </div>
          <div className="space-y-2.5 pt-1">
            {zones.map((z) => (
              <div key={z.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-foreground/80">
                    {z.name}
                  </span>
                  <span className="text-muted-foreground">
                    {z.pct}% • {z.mins}m
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(2, z.pct)}%`,
                      backgroundColor: z.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Puts an empty point wherever the readings stop for longer than `gapMs`, so
 * the chart breaks the line there instead of joining the two ends.
 */
function withGapBreaks<T extends { timestamp: number; bpm: number }>(
  points: T[],
  gapMs: number
): Array<Omit<T, 'bpm'> & { bpm: number | null }> {
  const out: Array<Omit<T, 'bpm'> & { bpm: number | null }> = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev && p.timestamp - prev.timestamp > gapMs) {
      out.push({
        ...prev,
        timestamp: prev.timestamp + 1,
        bpm: null,
        ...({ elevatedBpm: null } as object),
      });
    }
    out.push(p);
  });
  return out;
}

const HeartRateAnalyticsCard: React.FC<HeartRateAnalyticsCardProps> = ({
  startDate,
  endDate,
  exerciseEntries = [],
  restingHeartRateData = [],
}) => {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { formatDateInUserTimezone, dateFormat, timezone, timeFormat } =
    usePreferences();

  // The person's own zones decide where the line changes color
  const { data: zoneData } = useHeartRateZones();
  const thresholds = useMemo(
    () =>
      tierThresholds(
        zoneData?.resolved.zones.map((z) => z.lower_bpm) ?? fallbackZoneFloors()
      ),
    [zoneData]
  );

  // Query health metric continuous samples across the entire selected date range
  const { data: hrSampleBuckets = [] } = useHealthMetricSamples(
    'heart_rate',
    startDate,
    endDate
  );

  // Query sleep entries across the date range to anchor realistic bedtime, wake time, and sleep resting HR
  const { data: sleepEntries = [] } = useSleepEntriesQuery(
    startDate || '',
    endDate || ''
  );

  // Lookup map for resolving exercise UUIDs in telemetry samples into human-readable workout names
  const workoutNameById = useMemo(() => {
    const map = new Map<string, string>();
    exerciseEntries.forEach((e) => {
      const name =
        e.exercises?.name ||
        (typeof e['exercise_name'] === 'string'
          ? e['exercise_name']
          : t('common.workout', 'Workout'));
      map.set(e.id, name);
    });
    return map;
  }, [exerciseEntries, t]);

  // Find all actual workouts in the date range that have heart rate data (either direct columns or telemetry wear series)
  const relevantWorkouts = useMemo(() => {
    return exerciseEntries.filter((e) => {
      const d = String(e.entry_date || '').slice(0, 10);
      const inRange =
        (!startDate || d >= startDate) && (!endDate || d <= endDate);
      const name = String(e.exercises?.name || e['exercise_name'] || '');
      const isCalorieAggregate =
        name.toLowerCase().includes('active calories') ||
        name.toLowerCase().includes('resting calories');
      if (!inRange || isCalorieAggregate) return false;

      // 1. Direct heart rate on row
      if (
        Number(e['avg_heart_rate'] || 0) > 0 ||
        Number(e['max_heart_rate'] || 0) > 0
      ) {
        return true;
      }

      // 2. Check if continuous wear series in hrSampleBuckets covers this workout
      const bucket = hrSampleBuckets.find(
        (b) => String(b.entry_date || '').slice(0, 10) === d
      );
      if (!bucket || !Array.isArray(bucket.samples)) return false;

      const hasExplicitSample = (
        bucket.samples as Array<{ ex?: string; bpm?: number }>
      ).some(
        (s) =>
          (s.ex === e.id || s.ex === name || s.ex === e['exercise_name']) &&
          (s.bpm ?? 0) > 0
      );
      if (hasExplicitSample) return true;

      // Check workout time window
      const rawTime =
        typeof e['entry_time'] === 'string' ? e['entry_time'] : null;
      if (rawTime && rawTime.includes(':')) {
        const [hStr, mStr] = rawTime.split(':');
        const startMin =
          parseInt(hStr || '0', 10) * 60 + parseInt(mStr || '0', 10);
        const durMin = Math.max(1, Math.round(Number(e.duration_minutes || 0)));
        const endMin = startMin + durMin;
        return (bucket.samples as Array<{ t?: string; bpm?: number }>).some(
          (s) => {
            if (!s.t || (s.bpm ?? 0) <= 0) return false;
            const dt = new Date(s.t);
            const sMin = dt.getHours() * 60 + dt.getMinutes();
            return sMin >= startMin && sMin <= endMin;
          }
        );
      }

      return false;
    });
  }, [exerciseEntries, hrSampleBuckets, startDate, endDate]);

  // Workout selector state: 'all' or specific workout ID
  const [workoutFilter, setWorkoutFilter] = useState<string>('all');

  // Whole report range, and the day window the brush is showing inside it
  const range = useMemo<DayWindow>(() => {
    // Reports always passes both dates; the epoch only keeps the maths valid
    const fallback = '1970-01-01';
    return {
      start: startDate || endDate || fallback,
      end: endDate || startDate || fallback,
    };
  }, [startDate, endDate]);
  const [windowState, setWindowState] = useState<{
    rangeKey: string;
    window: DayWindow;
  } | null>(null);
  // A new report range resets the window to the full range
  const rangeKey = `${range.start}|${range.end}`;
  const dayWindow: DayWindow =
    windowState?.rangeKey === rangeKey ? windowState.window : range;
  const setDayWindow = useCallback(
    (next: DayWindow) => setWindowState({ rangeKey, window: next }),
    [rangeKey]
  );

  const totalDays = windowDayCount(range);
  const zoomDays = windowDayCount(dayWindow);
  const isSingleDay = zoomDays === 1;
  const isDetailed = isDetailedWindow(dayWindow);

  // Fetch daily health metrics (where synced Apple Health, Garmin, and Polar resting HR live)
  const { data: dailyHealthMetrics = [] } = useDailyHealthMetrics(
    startDate,
    endDate
  );

  // Merge resting heart rate from daily_health_metrics, check_in_measurements, and sleep_entries
  const mergedRestingHeartRateData = useMemo(() => {
    const map = new Map<string, number>();
    dailyHealthMetrics.forEach((d) => {
      if (
        d.entry_date &&
        typeof d.resting_heart_rate === 'number' &&
        d.resting_heart_rate > 0
      ) {
        map.set(d.entry_date, Math.round(d.resting_heart_rate));
      }
    });
    restingHeartRateData.forEach((r) => {
      if (
        r.date &&
        typeof r.resting_heart_rate === 'number' &&
        r.resting_heart_rate > 0
      ) {
        map.set(r.date, Math.round(r.resting_heart_rate));
      }
    });
    sleepEntries.forEach((s) => {
      const d = String(s.entry_date || s.wake_time || '').slice(0, 10);
      if (
        d &&
        typeof s.resting_heart_rate === 'number' &&
        s.resting_heart_rate > 0
      ) {
        if (!map.has(d)) {
          map.set(d, Math.round(s.resting_heart_rate));
        }
      }
    });
    return Array.from(map.entries())
      .map(([date, resting_heart_rate]) => ({ date, resting_heart_rate }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyHealthMetrics, restingHeartRateData, sleepEntries]);

  const displayedWorkouts = useMemo(() => {
    if (workoutFilter === 'all') return relevantWorkouts;
    return relevantWorkouts.filter((w) => w.id === workoutFilter);
  }, [relevantWorkouts, workoutFilter]);

  // The 24-hour view shows the last day of the window
  const focusedDate = dayWindow.end;

  // Derive morning and evening sleep windows for the focused date in the user's timezone
  const daySleepWindows = useMemo(() => {
    const parseTimeInZone = (isoStr: string | null | undefined) => {
      if (!isoStr) return null;
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return null;
      try {
        const formatter = new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone || 'UTC',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const parts = formatter.formatToParts(d);
        const year = parts.find((p) => p.type === 'year')?.value ?? '';
        const month = parts.find((p) => p.type === 'month')?.value ?? '';
        const day = parts.find((p) => p.type === 'day')?.value ?? '';
        const hour = parseInt(
          parts.find((p) => p.type === 'hour')?.value ?? '0',
          10
        );
        const minute = parseInt(
          parts.find((p) => p.type === 'minute')?.value ?? '0',
          10
        );
        return {
          dateStr: `${year}-${month}-${day}`,
          hour,
          minute,
          minutesFromMidnight: hour * 60 + minute,
          timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        };
      } catch {
        const h = d.getHours();
        const m = d.getMinutes();
        return {
          dateStr: d.toISOString().slice(0, 10),
          hour: h,
          minute: m,
          minutesFromMidnight: h * 60 + m,
          timeStr: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        };
      }
    };

    // 1. Morning sleep: waking up on focusedDate
    let morningWakeTime: string | null = null;
    let morningWakeMinutes: number | null = null;
    let morningBedtimeStr: string | null = null;
    let morningDurationStr: string | null = null;

    const morningSleep = sleepEntries.find((s) => {
      const wtInfo = parseTimeInZone(s.wake_time);
      if (wtInfo && wtInfo.dateStr === focusedDate) return true;
      const d = String(s.entry_date || '').slice(0, 10);
      return d === focusedDate;
    });

    if (morningSleep) {
      const wtInfo = parseTimeInZone(morningSleep.wake_time);
      const btInfo = parseTimeInZone(morningSleep.bedtime);
      if (wtInfo) {
        morningWakeMinutes = Math.min(
          13 * 60,
          Math.max(3 * 60, wtInfo.minutesFromMidnight)
        );
        const endH = Math.floor(morningWakeMinutes / 60);
        const endM = morningWakeMinutes % 60;
        morningWakeTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      }
      if (btInfo) {
        morningBedtimeStr = btInfo.timeStr;
      }
      if (morningSleep.duration_in_seconds) {
        const hrs = Math.floor(morningSleep.duration_in_seconds / 3600);
        const mins = Math.round((morningSleep.duration_in_seconds % 3600) / 60);
        morningDurationStr = `${hrs}h ${mins}m`;
      }
    }

    // 2. Evening sleep: falling asleep on the evening of focusedDate or in early hours past midnight (<= 5 AM next day)
    let eveningBedtime: string | null = null;
    let eveningBedMinutes: number | null = null;
    let eveningBedtimeDisplay: string | null = null;

    const nextDay = new Date(`${focusedDate}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDayStr = nextDay.toISOString().slice(0, 10);

    const followingSleep = sleepEntries.find((s) => {
      const btInfo = parseTimeInZone(s.bedtime);
      if (btInfo) {
        if (btInfo.dateStr === focusedDate && btInfo.hour >= 18) return true;
        if (btInfo.dateStr === nextDayStr && btInfo.hour <= 5) return true;
      }
      const d = String(s.entry_date || '').slice(0, 10);
      return d === nextDayStr;
    });

    if (followingSleep?.bedtime) {
      const btInfo = parseTimeInZone(followingSleep.bedtime);
      if (btInfo) {
        eveningBedtimeDisplay = btInfo.timeStr;
        if (btInfo.dateStr === focusedDate && btInfo.hour >= 19) {
          eveningBedMinutes = btInfo.minutesFromMidnight;
          eveningBedtime = btInfo.timeStr;
        } else if (btInfo.dateStr === nextDayStr && btInfo.hour <= 5) {
          // Fell asleep in early hours past midnight (e.g. 00:15 / 12:15 AM).
          // Anchor evening bedtime on the 24h timeline at the very end of the day (23:45 to 24:00)
          // so the user's bedtime is visually displayed and labeled, rather than missing!
          eveningBedMinutes = 1425;
          eveningBedtime = '23:45';
        }
      }
    }

    return {
      morningWakeTime,
      morningWakeMinutes,
      morningBedtimeStr,
      morningDurationStr,
      eveningBedtime,
      eveningBedMinutes,
      eveningBedtimeDisplay,
    };
  }, [sleepEntries, focusedDate, timezone]);

  const daySamples = useMemo(() => {
    const bucket = hrSampleBuckets.find(
      (b) => String(b.entry_date || '').slice(0, 10) === focusedDate
    );
    if (!bucket || !Array.isArray(bucket.samples)) return [];
    return (
      bucket.samples as Array<{
        t: string;
        bpm: number;
        ex?: string;
        sl?: string;
      }>
    )
      .filter((s) => typeof s.bpm === 'number' && s.bpm > 0 && s.t)
      .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
  }, [hrSampleBuckets, focusedDate]);

  // Workouts on the selected day
  const dayWorkouts = useMemo(() => {
    return relevantWorkouts.filter((w) => {
      const wDate = String(w.entry_date || '').slice(0, 10);
      return wDate === focusedDate;
    });
  }, [relevantWorkouts, focusedDate]);

  // Compute workout bands for shading on the 24h chart
  const dayWorkoutBands = useMemo(() => {
    return dayWorkouts.flatMap((w) => {
      // A workout with no start time has no place on the day, so it is not drawn
      if (
        typeof w['entry_time'] !== 'string' ||
        !w['entry_time'].includes(':')
      ) {
        return [];
      }
      const rawTime = w['entry_time'].slice(0, 5);
      const [hStr, mStr] = rawTime.split(':');
      const startMinutes =
        parseInt(hStr || '0', 10) * 60 + parseInt(mStr || '0', 10);
      const durMins = Math.max(1, Math.round(Number(w.duration_minutes || 0)));
      const endMinutes = Math.min(1439, startMinutes + durMins);
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      const name =
        w.exercises?.name ||
        (typeof w['exercise_name'] === 'string'
          ? w['exercise_name']
          : t('common.workout', 'Workout'));
      return [
        {
          id: w.id,
          name,
          startTime: rawTime,
          endTime,
          startMinutes,
          endMinutes,
        },
      ];
    });
  }, [dayWorkouts, t]);

  // ==========================================================================
  // 24-HOUR CONTINUOUS TIMELINE DATA (MERGED VITALS + WORKOUT TELEMETRY)
  // ==========================================================================
  const timelineStats = useMemo(() => {
    const rhrRecord = mergedRestingHeartRateData.find(
      (r) => String(r.date || '').slice(0, 10) === focusedDate
    );
    const recordedRhr = rhrRecord?.resting_heart_rate ?? null;

    const stepMinutes = 5;
    const totalSteps = 1440 / stepMinutes;

    // Recorded readings only, grouped into 5-minute buckets of the day
    const buckets = new Map<
      number,
      { sum: number; count: number; ex?: string }
    >();
    daySamples.forEach((s) => {
      const d = new Date(s.t);
      const m = d.getHours() * 60 + d.getMinutes();
      const step = Math.min(totalSteps, Math.round(m / stepMinutes));
      const bucket = buckets.get(step) ?? { sum: 0, count: 0 };
      bucket.sum += s.bpm;
      bucket.count += 1;
      if (s.ex) bucket.ex = s.ex;
      buckets.set(step, bucket);
    });

    type TimelinePoint = {
      time: string;
      /** null where nothing was recorded, so the line breaks there */
      bpm: number | null;
      isSleep: boolean;
      isWorkout: boolean;
      workoutName: string | null;
      isElevated: boolean;
    };
    const chartPoints: TimelinePoint[] = [];

    if (buckets.size > 0) {
      for (let i = 0; i <= totalSteps; i++) {
        const m = Math.min(1440, i * stepMinutes);
        const timeLabel = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const matchingWorkout = dayWorkoutBands.find(
          (wb) => m >= wb.startMinutes && m <= wb.endMinutes
        );
        const isSleepTime =
          (daySleepWindows.morningWakeMinutes !== null &&
            m < daySleepWindows.morningWakeMinutes) ||
          (daySleepWindows.eveningBedMinutes !== null &&
            m >= daySleepWindows.eveningBedMinutes);

        const bucket = buckets.get(i);
        const bpm = bucket ? Math.round(bucket.sum / bucket.count) : null;
        const activeEx = bucket?.ex;
        const resolvedWorkoutName =
          matchingWorkout?.name ??
          (activeEx
            ? workoutNameById.get(String(activeEx)) ||
              (String(activeEx).length > 20
                ? t('common.workout', 'Workout')
                : String(activeEx))
            : null);
        chartPoints.push({
          time: timeLabel,
          bpm,
          isSleep: isSleepTime,
          isWorkout: Boolean(activeEx || matchingWorkout),
          workoutName: resolvedWorkoutName,
          isElevated:
            bpm !== null && !activeEx && !matchingWorkout && !isSleepTime
              ? bpm >= 100
              : false,
        });
      }
    }

    const recorded = chartPoints.filter(
      (p): p is TimelinePoint & { bpm: number } => p.bpm !== null
    );

    if (recorded.length === 0) {
      return {
        hasData: false,
        restingHr: recordedRhr,
        chartPoints: [] as TimelinePoint[],
        sleepDipPct: null,
        daytimeAvg: null,
        sleepingAvg: null,
        minBpm: null,
        maxBpm: null,
        minTime: null,
        maxTime: null,
        rhrDiff: null,
        elevatedSpike: null,
      };
    }

    const bpms = recorded.map((s) => s.bpm);
    const minVal = Math.min(...bpms);
    const maxVal = Math.max(...bpms);
    const minPt = recorded.find((s) => s.bpm === minVal);
    const maxPt = recorded.find((s) => s.bpm === maxVal);

    const average = (values: number[]) =>
      values.length > 0
        ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
        : null;
    const sleepingAvg = average(
      recorded.filter((s) => s.isSleep).map((s) => s.bpm)
    );
    const daytimeAvg = average(
      recorded.filter((s) => !s.isSleep).map((s) => s.bpm)
    );
    const sleepDipPct =
      daytimeAvg && sleepingAvg && daytimeAvg > 0
        ? Math.round(((sleepingAvg - daytimeAvg) / daytimeAvg) * 100)
        : null;

    const validRhrs = mergedRestingHeartRateData
      .map((r) => r.resting_heart_rate)
      .filter((v): v is number => v !== null && v > 0);
    const avgRhr7d =
      validRhrs.length > 0
        ? validRhrs.reduce((a, b) => a + b, 0) / validRhrs.length
        : null;
    const rhrDiff =
      recordedRhr !== null && avgRhr7d !== null
        ? Math.round(recordedRhr - avgRhr7d)
        : null;

    // Ignore spikes during workouts and sleep
    const elevated = recorded.find((s) => s.isElevated);

    return {
      hasData: true,
      restingHr: recordedRhr,
      rhrDiff,
      minBpm: minVal,
      minTime: minPt ? minPt.time : null,
      maxBpm: maxVal,
      maxTime: maxPt ? maxPt.time : null,
      sleepDipPct,
      daytimeAvg,
      sleepingAvg,
      elevatedSpike: elevated
        ? { bpm: elevated.bpm, time: elevated.time }
        : null,
      chartPoints,
    };
  }, [
    daySamples,
    dayWorkoutBands,
    mergedRestingHeartRateData,
    focusedDate,
    daySleepWindows,
    workoutNameById,
    t,
  ]);

  // Derive exact Recharts-aligned category keys for morning and evening sleep ReferenceAreas
  const sleepBounds = useMemo(() => {
    const pts = timelineStats.chartPoints;
    if (!pts.length) {
      return {
        morningEnd: null,
        eveningStart: null,
        chartStart: null,
        chartEnd: null,
      };
    }
    const chartStart = pts[0]?.time ?? '00:00';
    const chartEnd = pts[pts.length - 1]?.time ?? '24:00';

    // Morning sleep end: last consecutive point in first half where isSleep is true
    let morningEnd: string | null = null;
    const morningLimit = Math.floor(pts.length * 0.55);
    for (let i = 0; i < morningLimit; i++) {
      if (pts[i]?.isSleep) {
        morningEnd = pts[i]?.time ?? null;
      } else if (morningEnd) {
        break;
      }
    }

    // Evening sleep start: first point in second half where isSleep is true
    let eveningStart: string | null = null;
    const eveningSearchStart = Math.floor(pts.length * 0.55);
    for (let i = eveningSearchStart; i < pts.length; i++) {
      if (pts[i]?.isSleep) {
        eveningStart = pts[i]?.time ?? null;
        break;
      }
    }

    const morningFormatted =
      daySleepWindows.morningBedtimeStr && daySleepWindows.morningWakeTime
        ? `${formatTimeOfDayString(daySleepWindows.morningBedtimeStr, timeFormat)} – ${formatTimeOfDayString(daySleepWindows.morningWakeTime, timeFormat)}`
        : daySleepWindows.morningWakeTime
          ? `${t('heartRate.wokeUpAt', 'Woke at')} ${formatTimeOfDayString(daySleepWindows.morningWakeTime, timeFormat)}`
          : null;

    const eveningFormatted = daySleepWindows.eveningBedtimeDisplay
      ? formatTimeOfDayString(daySleepWindows.eveningBedtimeDisplay, timeFormat)
      : null;

    return {
      morningEnd,
      eveningStart,
      chartStart,
      chartEnd,
      morningLabel: morningFormatted
        ? `${t('heartRate.asleepLabel', '😴 Asleep')} (${morningFormatted})`
        : t('heartRate.asleepLabel', '😴 Asleep'),
      eveningLabel: eveningFormatted
        ? `${t('heartRate.bedtimeLabel', '😴 Bedtime')} (${eveningFormatted})`
        : t('heartRate.bedtimeLabel', '😴 Bedtime'),
    };
  }, [timelineStats.chartPoints, daySleepWindows, timeFormat, t]);

  // ==========================================================================
  // FULL DATE RANGE TIMELINE (CONTINUOUS TELEMETRY + WORKOUTS + RESTING HR)
  // ==========================================================================
  const rangePoints = useMemo(() => {
    const points: Array<{
      timestamp: number;
      date: string;
      timeLabel: string;
      bpm: number;
      restingHr: number | null;
      isWorkout: boolean;
      workoutName: string | null;
    }> = [];

    const rhrByDate = new Map<string, number>();
    mergedRestingHeartRateData.forEach((r) => {
      if (
        r.date &&
        typeof r.resting_heart_rate === 'number' &&
        r.resting_heart_rate > 0
      ) {
        rhrByDate.set(r.date, Math.round(r.resting_heart_rate));
      }
    });

    // 1. Process continuous background samples across all buckets in the date range
    hrSampleBuckets.forEach((bucket) => {
      const bucketDate = bucket.entry_date;
      if (!bucketDate || !Array.isArray(bucket.samples)) return;
      const dayRhr = rhrByDate.get(bucketDate) ?? null;

      (
        bucket.samples as Array<{
          t?: string;
          bpm?: number;
          ex?: string;
          sl?: string;
        }>
      ).forEach((s) => {
        if (!s.t || typeof s.bpm !== 'number' || s.bpm <= 0) return;
        const ts = new Date(s.t).getTime();
        if (Number.isNaN(ts)) return;
        const d = new Date(ts);
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const timeLabel = `${bucketDate.slice(5)} ${timeStr}`;
        const resolvedWorkoutName = s.ex
          ? workoutNameById.get(String(s.ex)) ||
            (String(s.ex).length > 20
              ? t('common.workout', 'Workout')
              : String(s.ex))
          : null;
        points.push({
          timestamp: ts,
          date: bucketDate,
          timeLabel,
          bpm: s.bpm,
          restingHr: dayRhr,
          isWorkout: Boolean(s.ex),
          workoutName: resolvedWorkoutName,
        });
      });
    });

    points.sort((a, b) => a.timestamp - b.timestamp);
    return points;
  }, [hrSampleBuckets, mergedRestingHeartRateData, workoutNameById, t]);

  // Recorded readings inside the brush window
  const windowPoints = useMemo(
    () =>
      rangePoints.filter(
        (p) => p.date >= dayWindow.start && p.date <= dayWindow.end
      ),
    [rangePoints, dayWindow]
  );

  // One averaged point per day for windows too long to show every reading
  const dailyAveragePoints = useMemo(() => {
    const byDate = new Map<
      string,
      { sum: number; count: number; restingHr: number | null }
    >();
    windowPoints.forEach((p) => {
      const entry = byDate.get(p.date) ?? {
        sum: 0,
        count: 0,
        restingHr: p.restingHr,
      };
      entry.sum += p.bpm;
      entry.count += 1;
      byDate.set(p.date, entry);
    });
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, e]) => ({
        timestamp: new Date(`${date}T12:00:00`).getTime(),
        date,
        timeLabel: date.slice(5),
        bpm: Math.round(e.sum / e.count),
        restingHr: e.restingHr,
        isWorkout: false,
        workoutName: null as string | null,
        elevatedBpm: null as number | null,
      }));
  }, [windowPoints]);

  // Daily averages over the whole report range, drawn in the brush strip
  const overviewSeries = useMemo(() => {
    const byDate = new Map<string, { sum: number; count: number }>();
    rangePoints.forEach((p) => {
      const entry = byDate.get(p.date) ?? { sum: 0, count: 0 };
      entry.sum += p.bpm;
      entry.count += 1;
      byDate.set(p.date, entry);
    });
    return Array.from(byDate.entries())
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([date, e]) => ({
        ms: dayStringToMs(date) + 12 * 60 * 60 * 1000,
        value: e.sum / e.count,
      }));
  }, [rangePoints]);

  // Workout start and end instants (browser time, like the reading labels)
  const workoutIntervals = useMemo(
    () =>
      relevantWorkouts.flatMap((w) => {
        const d = String(w.entry_date || '').slice(0, 10);
        const time =
          typeof w['entry_time'] === 'string'
            ? w['entry_time'].slice(0, 5)
            : '';
        if (d < dayWindow.start || d > dayWindow.end || !time.includes(':'))
          return [];
        const x1 = new Date(`${d}T${time}:00`).getTime();
        const mins = Math.max(1, Math.round(Number(w.duration_minutes || 0)));
        const name =
          w.exercises?.name ||
          (typeof w['exercise_name'] === 'string'
            ? w['exercise_name']
            : t('common.workout', 'Workout'));
        return [{ id: w.id, name, x1, x2: x1 + mins * 60000 }];
      }),
    [relevantWorkouts, dayWindow, t]
  );

  // Readings, with the highest reading of each stretch above 100 bpm outside
  // exercise and sleep marked as elevated
  const detailedPoints = useMemo(() => {
    const sleepSpans = sleepEntries
      .filter((s) => s.bedtime && s.wake_time)
      .map((s) => [Date.parse(s.bedtime!), Date.parse(s.wake_time!)]);
    const quiet = (p: (typeof windowPoints)[number]) =>
      p.bpm >= 100 &&
      !p.isWorkout &&
      !workoutIntervals.some(
        (w) => p.timestamp >= w.x1 && p.timestamp <= w.x2
      ) &&
      !sleepSpans.some(([a, b]) => p.timestamp >= a! && p.timestamp <= b!);
    const gap = 30 * 60000;
    let lastMarked = -Infinity;
    const marked = windowPoints.map((p, i) => {
      let elevated: number | null = null;
      if (quiet(p)) {
        let isPeak = true;
        for (let j = i - 1; j >= 0; j--) {
          const q = windowPoints[j]!;
          if (p.timestamp - q.timestamp > gap) break;
          if (q.bpm > p.bpm) isPeak = false;
        }
        for (let j = i + 1; j < windowPoints.length; j++) {
          const q = windowPoints[j]!;
          if (q.timestamp - p.timestamp > gap) break;
          if (q.bpm >= p.bpm) isPeak = false;
        }
        if (isPeak && p.timestamp - lastMarked > gap) {
          elevated = p.bpm;
          lastMarked = p.timestamp;
        }
      }
      return { ...p, elevatedBpm: elevated };
    });
    return withGapBreaks(marked, gap);
  }, [windowPoints, workoutIntervals, sleepEntries]);

  const rangeChartPoints = isDetailed ? detailedPoints : dailyAveragePoints;

  const gradientFor = (values: Array<number | null | undefined>) => {
    const real = values.filter((v): v is number => typeof v === 'number');
    if (real.length === 0) return [];
    return tierGradientStops(Math.min(...real), Math.max(...real), thresholds);
  };
  const rangeGradientStops = gradientFor(rangeChartPoints.map((p) => p.bpm));

  // Stats for the visible window, from recorded readings
  const activeRangeStats = useMemo(() => {
    if (windowPoints.length === 0) {
      return {
        hasData: false,
        avgBpm: null,
        restingHr: null,
        minBpm: null,
        maxBpm: null,
        workoutCount: 0,
      };
    }
    let sum = 0;
    let minBpm = Infinity;
    let maxBpm = -Infinity;
    windowPoints.forEach((p) => {
      sum += p.bpm;
      minBpm = Math.min(minBpm, p.bpm);
      maxBpm = Math.max(maxBpm, p.bpm);
    });
    const windowRhrs = mergedRestingHeartRateData.filter(
      (r) =>
        r.date >= dayWindow.start &&
        r.date <= dayWindow.end &&
        typeof r.resting_heart_rate === 'number' &&
        r.resting_heart_rate > 0
    );
    return {
      hasData: true,
      avgBpm: Math.round(sum / windowPoints.length),
      restingHr:
        windowRhrs.length > 0
          ? Math.round(
              windowRhrs.reduce((a, b) => a + (b.resting_heart_rate || 0), 0) /
                windowRhrs.length
            )
          : null,
      minBpm,
      maxBpm,
      workoutCount: relevantWorkouts.filter((w) => {
        const d = String(w.entry_date || '').slice(0, 10);
        return d >= dayWindow.start && d <= dayWindow.end;
      }).length,
    };
  }, [windowPoints, mergedRestingHeartRateData, relevantWorkouts, dayWindow]);

  // Sleep and workout shading plus x-axis ticks for the multi-day chart
  const rangeChartDecor = useMemo(() => {
    const first = rangeChartPoints[0]?.timestamp;
    const last = rangeChartPoints[rangeChartPoints.length - 1]?.timestamp;
    if (first === undefined || last === undefined) {
      return {
        sleep: [],
        workouts: [],
        ticks: [] as number[],
        domain: null as [number, number] | null,
      };
    }

    // Detailed windows cover the whole selected days, with a tick every
    // 2, 4 or 6 hours so the labels are evenly spaced
    const dayMs = 24 * 60 * 60 * 1000;
    const lo = new Date(`${dayWindow.start}T00:00:00`).getTime();
    const hi = new Date(
      `${msToDayString(dayStringToMs(dayWindow.end) + dayMs)}T00:00:00`
    ).getTime();
    const ticks: number[] = [];
    if (isDetailed) {
      const stepHours = zoomDays <= 1 ? 2 : zoomDays === 2 ? 4 : 6;
      for (let h = 0; lo + h * 3600000 <= hi; h += stepHours) {
        ticks.push(lo + h * 3600000);
      }
    } else {
      const stride = Math.max(1, Math.ceil(rangeChartPoints.length / 10));
      rangeChartPoints.forEach((p, i) => {
        if (i % stride === 0) ticks.push(p.timestamp);
      });
    }

    if (!isDetailed) {
      return { sleep: [], workouts: [], ticks, domain: null };
    }

    const clip = (x1: number, x2: number) =>
      x2 > lo && x1 < hi
        ? { x1: Math.max(x1, lo), x2: Math.min(x2, hi) }
        : null;

    const clockLabel = (ms: number) => {
      const d = new Date(ms);
      return formatTimeOfDayString(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        timeFormat
      );
    };

    const sleep = sleepEntries.flatMap((s) => {
      if (!s.bedtime || !s.wake_time) return [];
      const bed = Date.parse(s.bedtime);
      const wake = Date.parse(s.wake_time);
      const band = clip(bed, wake);
      return band
        ? [{ ...band, label: `😴 ${clockLabel(bed)} – ${clockLabel(wake)}` }]
        : [];
    });

    const workouts = workoutIntervals.flatMap((w) => {
      const band = clip(w.x1, w.x2);
      return band ? [{ id: w.id, name: w.name, ...band }] : [];
    });

    return {
      sleep,
      workouts,
      ticks,
      domain: [lo, hi] as [number, number],
    };
  }, [
    rangeChartPoints,
    isDetailed,
    zoomDays,
    dayWindow,
    sleepEntries,
    workoutIntervals,
    timeFormat,
  ]);

  const dayGradientStops = gradientFor(
    timelineStats.chartPoints.map((p) => p.bpm)
  );

  const formatRangeTick = (ts: number) => {
    const d = new Date(ts);
    const date = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return isDetailed
      ? `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : date;
  };

  // Resting HR Trend data across selected date range (with rich statistical insights)
  const restingHrTrendStats = useMemo(() => {
    let filtered = mergedRestingHeartRateData.filter(
      (d) =>
        typeof d.resting_heart_rate === 'number' && d.resting_heart_rate > 0
    );
    if (startDate && endDate) {
      filtered = filtered.filter(
        (d) => d.date >= startDate && d.date <= endDate
      );
    }
    const points = filtered.map((d) => {
      const parts = d.date.split('-');
      const shortLabel =
        parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : d.date;
      return {
        date: d.date,
        shortDate: shortLabel,
        bpm: d.resting_heart_rate as number,
        isFocused: d.date === focusedDate,
      };
    });

    if (points.length === 0) {
      return {
        points: [],
        avgBpm: null,
        minBpm: null,
        maxBpm: null,
        trendDelta: null,
        dayCount: 0,
      };
    }

    const bpms = points.map((p) => p.bpm);
    const minBpm = Math.min(...bpms);
    const maxBpm = Math.max(...bpms);
    const avgBpm = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);

    let trendDelta: number | null = null;
    if (points.length >= 4) {
      const half = Math.floor(points.length / 2);
      const firstHalf = points.slice(0, half);
      const secondHalf = points.slice(-half);
      const firstAvg =
        firstHalf.reduce((a, b) => a + b.bpm, 0) / firstHalf.length;
      const secondAvg =
        secondHalf.reduce((a, b) => a + b.bpm, 0) / secondHalf.length;
      trendDelta = Math.round(secondAvg - firstAvg);
    }

    return {
      points,
      avgBpm,
      minBpm,
      maxBpm,
      trendDelta,
      dayCount: points.length,
    };
  }, [mergedRestingHeartRateData, startDate, endDate, focusedDate]);

  // Dynamic Theme Colors for Charts
  const chartTheme = useMemo(
    () => ({
      gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      tickColor: isDark ? 'rgba(255, 255, 255, 0.45)' : '#6b7280',
      axisLineColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e5e7eb',
      refLineColor: isDark
        ? 'rgba(255, 255, 255, 0.15)'
        : 'rgba(0, 0, 0, 0.12)',
      tooltipBg: isDark ? '#111827' : '#ffffff',
      tooltipBorder: isDark ? 'rgba(255, 255, 255, 0.15)' : '#e5e7eb',
      tooltipText: isDark ? '#ffffff' : '#111827',
      sleepAreaFill: isDark ? '#312e81' : '#c7d2fe',
      sleepAreaOpacity: isDark ? 0.35 : 0.45,
      sleepAreaText: isDark ? '#a5b4fc' : '#4338ca',
      workoutAreaFill: isDark ? '#ea580c' : '#fdba74',
      workoutAreaOpacity: isDark ? 0.35 : 0.4,
      workoutAreaText: isDark ? '#fb923c' : '#c2410c',
      restingLineColor: isDark ? '#22c55e' : '#16a34a',
    }),
    [isDark]
  );

  return (
    <Card className="w-full bg-card text-card-foreground border-border shadow-sm rounded-2xl overflow-hidden">
      {/* ==================================================================== */}
      {/* 1. TOP HEADER: TITLE & BADGE                                         */}
      {/* ==================================================================== */}
      <CardHeader className="pb-4 pt-6 px-6 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-sm">
              <Heart className="w-5 h-5 fill-rose-500/20" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-rose-500 font-bold">
                SparkyFitness
              </div>
              <CardTitle className="text-xl font-bold tracking-tight text-foreground">
                {t('reports.heartRateTab', 'Heart Rate Analytics')}
              </CardTitle>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-10">
        {/* ==================================================================== */}
        {/* SECTION 1: 24-HOUR CONTINUOUS TIMELINE                               */}
        {/* ==================================================================== */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                {isSingleDay
                  ? t(
                      'heartRate.dayTimelineTitle',
                      '24-Hour Heart Rate Timeline'
                    )
                  : t('heartRate.rangeTimelineTitle', 'Heart Rate Timeline')}
                <Badge
                  variant="outline"
                  className="text-[11px] font-semibold text-primary border-primary/30 ml-1"
                >
                  {isSingleDay
                    ? t('heartRate.singleDayBadge', '24H Detail')
                    : isDetailed
                      ? t(
                          'heartRate.detailedBadge',
                          'Detailed · {{days}} days',
                          {
                            days: zoomDays,
                          }
                        )
                      : t(
                          'heartRate.dailyAverageBadge',
                          'Summary · daily averages'
                        )}
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground">
                {isSingleDay
                  ? t(
                      'heartRate.dayTimelineSub',
                      'All-day circadian heart rate and sleep dip'
                    )
                  : t(
                      'heartRate.rangeTimelineSub',
                      'Continuous heart rate, workouts, and resting HR across selected date range'
                    )}
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
              {/* Window presets: 24H, 3D, 7D, All (they just move the brush) */}
              <div className="inline-flex items-center rounded-lg bg-muted/70 p-0.5 border border-border">
                {[
                  { label: '24H', days: 1 },
                  { label: '3D', days: 3 },
                  { label: '7D', days: 7 },
                ]
                  .filter(
                    (preset) => preset.days === 1 || totalDays >= preset.days
                  )
                  .map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant={
                        zoomDays === preset.days && dayWindow.end === range.end
                          ? 'secondary'
                          : 'ghost'
                      }
                      size="sm"
                      className="h-7 text-xs px-2 font-medium shadow-none"
                      onClick={() =>
                        setDayWindow(lastDaysWindow(range, preset.days))
                      }
                    >
                      {preset.label}
                    </Button>
                  ))}
                <Button
                  type="button"
                  variant={zoomDays >= totalDays ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs px-2 font-medium shadow-none"
                  onClick={() => setDayWindow(range)}
                >
                  {t('heartRate.zoomAll', 'All')}
                </Button>
              </div>

              {/* Day Navigator (shown when zoomed to 1 day / 24H) */}
              {isSingleDay && (
                <div className="flex items-center gap-1 bg-muted/50 border border-border/80 px-1.5 py-0.5 rounded-lg">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() =>
                      setDayWindow(shiftWindow(dayWindow, -1, range))
                    }
                    disabled={dayWindow.start <= range.start}
                    aria-label={t('common.previousDay', 'Previous Day')}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs font-semibold px-1.5 min-w-[75px] text-center">
                    {formatDateInUserTimezone(focusedDate, dateFormat)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() =>
                      setDayWindow(shiftWindow(dayWindow, 1, range))
                    }
                    disabled={dayWindow.end >= range.end}
                    aria-label={t('common.nextDay', 'Next Day')}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* MULTI-DAY RANGE TIMELINE */}
          {!isSingleDay && (
            <>
              {activeRangeStats.hasData ? (
                <>
                  {/* Range Stat Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Card 1: Resting HR */}
                    <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Heart className="w-3.5 h-3.5 text-rose-500" />
                        {t('heartRate.restingHeartRate', 'Resting HR')}
                      </div>
                      <div className="text-2xl font-extrabold text-foreground">
                        {activeRangeStats.restingHr
                          ? `${activeRangeStats.restingHr} bpm`
                          : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('heartRate.periodAvg', 'Period average')}
                      </div>
                    </div>

                    {/* Card 2: Peak HR */}
                    <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Flame className="w-3.5 h-3.5 text-rose-500" />
                        {t('heartRate.peakBpm', 'Peak HR')}
                      </div>
                      <div className="text-2xl font-extrabold text-foreground">
                        {activeRangeStats.maxBpm
                          ? `${activeRangeStats.maxBpm} bpm`
                          : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('heartRate.highestReading', 'Highest reading')}
                      </div>
                    </div>

                    {/* Card 3: Range Average HR */}
                    <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Activity className="w-3.5 h-3.5 text-sky-500" />
                        {t('heartRate.averageHr', 'Average HR')}
                      </div>
                      <div className="text-2xl font-extrabold text-foreground">
                        {activeRangeStats.avgBpm
                          ? `${activeRangeStats.avgBpm} bpm`
                          : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {zoomDays >= totalDays
                          ? t('heartRate.acrossRange', 'Across selected range')
                          : t(
                              'heartRate.acrossWindow',
                              'Across visible {{days}} days',
                              {
                                days: zoomDays,
                              }
                            )}
                      </div>
                    </div>

                    {/* Card 4: Workouts Count */}
                    <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Dumbbell className="w-3.5 h-3.5 text-amber-500" />
                        {t('heartRate.recordedWorkouts', 'Recorded Workouts')}
                      </div>
                      <div className="text-2xl font-extrabold text-foreground">
                        {activeRangeStats.workoutCount}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('heartRate.withHeartRate', 'With heart rate')}
                      </div>
                    </div>
                  </div>

                  {/* Range chart: every reading for short windows, daily averages for long ones */}
                  <div className="h-72 w-full relative pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={rangeChartPoints}
                        margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="rangeHeartRateZoneGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            {rangeGradientStops.map((stop, i) => (
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
                          dataKey="timestamp"
                          type="number"
                          scale="time"
                          domain={
                            rangeChartDecor.domain ?? ['dataMin', 'dataMax']
                          }
                          ticks={rangeChartDecor.ticks}
                          tickFormatter={formatRangeTick}
                          tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                          axisLine={{ stroke: chartTheme.axisLineColor }}
                          tickLine={false}
                        />
                        <YAxis
                          domain={
                            isDetailed
                              ? [35, 'auto']
                              : [
                                  (min: number) => Math.max(35, min - 8),
                                  (max: number) => max + 8,
                                ]
                          }
                          tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length)
                              return null;
                            const dataPoint = payload[0]?.payload as
                              | {
                                  bpm?: number;
                                  restingHr?: number | null;
                                  workoutName?: string | null;
                                  timeLabel?: string;
                                }
                              | undefined;
                            if (!dataPoint || dataPoint.bpm == null)
                              return null;
                            return (
                              <div
                                style={{
                                  backgroundColor: chartTheme.tooltipBg,
                                  borderColor: chartTheme.tooltipBorder,
                                  color: chartTheme.tooltipText,
                                }}
                                className="px-3 py-2 rounded-xl border shadow-md text-xs space-y-1"
                              >
                                <div className="font-semibold">
                                  {dataPoint.timeLabel}
                                </div>
                                <div className="flex items-center gap-1.5 font-bold text-rose-500">
                                  <Heart className="w-3.5 h-3.5 fill-rose-500" />
                                  <span>
                                    {dataPoint.bpm ?? 0} bpm
                                    {isDetailed
                                      ? ''
                                      : ` (${t('heartRate.dailyAverageShort', 'daily avg')})`}
                                  </span>
                                </div>
                                {dataPoint.restingHr && (
                                  <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                    💚{' '}
                                    {t(
                                      'heartRate.restingHeartRate',
                                      'Resting HR'
                                    )}
                                    : {dataPoint.restingHr} bpm
                                  </div>
                                )}
                                {dataPoint.workoutName && (
                                  <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                    {getWorkoutEmoji(dataPoint.workoutName)}{' '}
                                    {dataPoint.workoutName}
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        />

                        {/* Sleep and workout shading (detailed windows only) */}
                        {rangeChartDecor.sleep.map((band) => (
                          <ReferenceArea
                            key={`sleep-${band.x1}`}
                            x1={band.x1}
                            x2={band.x2}
                            fill={chartTheme.sleepAreaFill}
                            fillOpacity={chartTheme.sleepAreaOpacity}
                            label={{
                              value: band.label,
                              fill: chartTheme.sleepAreaText,
                              fontSize: 10,
                              position: 'insideTopLeft',
                            }}
                          />
                        ))}
                        {rangeChartDecor.workouts.map((band) => (
                          <ReferenceArea
                            key={`workout-${band.id}`}
                            x1={band.x1}
                            x2={band.x2}
                            fill={chartTheme.workoutAreaFill}
                            fillOpacity={chartTheme.workoutAreaOpacity}
                            label={{
                              value: `${getWorkoutEmoji(band.name)} ${band.name}`,
                              fill: chartTheme.workoutAreaText,
                              fontSize: 10,
                              position: 'insideTopLeft',
                            }}
                          />
                        ))}

                        {/* Dashed Resting HR line */}
                        <Line
                          type="monotone"
                          dataKey="restingHr"
                          name={t('heartRate.restingHeartRate', 'Resting HR')}
                          stroke="#10b981"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />

                        {/* Heart rate: zone gradient for readings, solid line with dots for daily averages */}
                        <Line
                          type="monotone"
                          dataKey="bpm"
                          name={t('heartRate.heartRateBpm', 'Heart Rate')}
                          stroke={zoneStroke(
                            rangeGradientStops,
                            'rangeHeartRateZoneGradient'
                          )}
                          strokeWidth={2.2}
                          dot={isDetailed ? false : { r: 3.5, fill: '#f43f5e' }}
                          activeDot={{
                            r: 5,
                            fill: '#f43f5e',
                            stroke: '#ffffff',
                            strokeWidth: 2,
                          }}
                          isAnimationActive={false}
                        />
                        {isDetailed && (
                          <Line
                            type="monotone"
                            dataKey="elevatedBpm"
                            stroke="none"
                            dot={{ r: 4, fill: '#eab308', stroke: '#ffffff' }}
                            activeDot={false}
                            isAnimationActive={false}
                            legendType="none"
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {isDetailed && (
                    <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] font-medium text-muted-foreground pt-1">
                      {rangeChartDecor.sleep.length > 0 && (
                        <span className="flex items-center gap-1.5">
                          <Moon className="w-3 h-3 text-indigo-400" />
                          {t('heartRate.legendSleep', 'Sleep')}
                        </span>
                      )}
                      {rangeChartDecor.workouts.length > 0 && (
                        <span className="flex items-center gap-1.5">
                          <Dumbbell className="w-3 h-3 text-orange-500" />
                          {t('heartRate.legendWorkout', 'Workout')}
                        </span>
                      )}
                      {detailedPoints.some((p) => p.elevatedBpm !== null) && (
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#eab308]" />
                          {t(
                            'heartRate.legendElevated',
                            'Elevated outside exercise'
                          )}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Zone Color Code Legend */}
                  <div className="flex items-center justify-center gap-4 text-[11px] font-medium text-muted-foreground pt-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#06b6d4]" />
                      {t('heartRate.zoneLight', 'Light')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                      {t('heartRate.zoneModerate', 'Moderate')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#eab308]" />
                      {t('heartRate.zoneVigorous', 'Vigorous')}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                      {t('heartRate.zonePeak', 'Peak')}
                    </span>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center bg-muted/20 border border-border rounded-xl space-y-3">
                  <Activity className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
                  <p className="text-sm font-semibold text-foreground">
                    {t(
                      'heartRate.noRangeData',
                      'No heart rate data recorded for this date range'
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    {t(
                      'heartRate.noTimelineDataSub',
                      'All-day background heart rate syncs from Apple Health, Google Health Connect, or Garmin wearables. In simulator/emulator testing, run "Seed Mock Data" in the mobile app to populate continuous circadian telemetry.'
                    )}
                  </p>
                </div>
              )}
            </>
          )}

          {/* 24-HOUR SINGLE DAY TIMELINE */}
          {isSingleDay &&
            (timelineStats.hasData ? (
              <>
                {/* 4 Summary Stat Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Resting HR */}
                  <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Heart className="w-3.5 h-3.5 text-rose-500" />
                      {t('heartRate.restingHeartRate', 'Resting HR')}
                    </div>
                    <div className="text-2xl font-extrabold text-foreground">
                      {timelineStats.restingHr
                        ? `${timelineStats.restingHr} bpm`
                        : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      {timelineStats.rhrDiff !== null ? (
                        <span
                          className={
                            timelineStats.rhrDiff <= 0
                              ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                              : 'text-amber-600 dark:text-amber-400 font-semibold'
                          }
                        >
                          {timelineStats.rhrDiff <= 0
                            ? `${timelineStats.rhrDiff} bpm vs 7d avg`
                            : `+${timelineStats.rhrDiff} bpm vs 7d avg`}
                        </span>
                      ) : (
                        t(
                          'heartRate.dailyRestingBaseline',
                          'Daily resting baseline'
                        )
                      )}
                    </div>
                  </div>

                  {/* Card 2: Peak HR */}
                  <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Flame className="w-3.5 h-3.5 text-rose-500" />
                      {t('heartRate.peakBpmToday', 'Peak HR Today')}
                    </div>
                    <div className="text-2xl font-extrabold text-foreground">
                      {timelineStats.maxBpm
                        ? `${timelineStats.maxBpm} bpm`
                        : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {timelineStats.maxTime
                        ? t('heartRate.recordedAt', 'at {{time}}', {
                            time: timelineStats.maxTime,
                          })
                        : t('heartRate.highestReading', 'Highest reading')}
                    </div>
                  </div>

                  {/* Card 3: Sleep Dip */}
                  <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Moon className="w-3.5 h-3.5" />
                      {t('heartRate.sleepDip', 'Sleep Dip')}
                    </div>
                    <div className="text-2xl font-extrabold text-foreground">
                      {timelineStats.sleepDipPct !== null
                        ? `${timelineStats.sleepDipPct}%`
                        : '—'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {daySleepWindows.morningBedtimeStr &&
                      daySleepWindows.morningWakeTime ? (
                        <span className="font-medium text-foreground">
                          {formatTimeOfDayString(
                            daySleepWindows.morningBedtimeStr,
                            timeFormat
                          )}{' '}
                          –{' '}
                          {formatTimeOfDayString(
                            daySleepWindows.morningWakeTime,
                            timeFormat
                          )}
                          {daySleepWindows.morningDurationStr
                            ? ` (${daySleepWindows.morningDurationStr})`
                            : ''}
                        </span>
                      ) : (
                        t(
                          'heartRate.optimalRestoration',
                          'Optimal cardiovascular restoration'
                        )
                      )}
                    </div>
                  </div>

                  {/* Card 4: Daytime / Sleeping Avg */}
                  <div className="bg-muted/40 border border-border/80 rounded-xl p-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Sun className="w-3.5 h-3.5" />
                      {t(
                        'heartRate.daytimeSleepingAvg',
                        'Daytime / Sleeping Avg'
                      )}
                    </div>
                    <div className="text-2xl font-extrabold text-foreground">
                      {timelineStats.daytimeAvg ?? '—'} |{' '}
                      {timelineStats.sleepingAvg ?? '—'} bpm
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t(
                        'heartRate.daytimeSleepingSub',
                        'Daytime avg | Sleeping avg'
                      )}
                    </div>
                  </div>
                </div>

                {/* 24-Hour Continuous Timeline Chart */}
                <div className="h-64 w-full relative pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={timelineStats.chartPoints}
                      margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="dayHeartRateZoneGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          {dayGradientStops.map((stop, i) => (
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
                        dataKey="time"
                        ticks={[
                          '00:00',
                          '04:00',
                          '08:00',
                          '12:00',
                          '16:00',
                          '20:00',
                          '24:00',
                        ]}
                        tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                        axisLine={{ stroke: chartTheme.axisLineColor }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[35, 185]}
                        ticks={[40, 75, 110, 175]}
                        tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload || !payload.length)
                            return null;
                          const dataPoint = payload[0]?.payload as
                            | {
                                bpm?: number;
                                workoutName?: string | null;
                                isSleep?: boolean;
                              }
                            | undefined;
                          if (!dataPoint || dataPoint.bpm == null) return null;
                          return (
                            <div
                              style={{
                                backgroundColor: chartTheme.tooltipBg,
                                borderColor: chartTheme.tooltipBorder,
                                color: chartTheme.tooltipText,
                              }}
                              className="px-3 py-2 rounded-xl border shadow-md text-xs space-y-1"
                            >
                              <div className="font-semibold">{label}</div>
                              <div className="flex items-center gap-1.5 font-bold text-rose-500">
                                <Heart className="w-3.5 h-3.5 fill-rose-500" />
                                <span>{dataPoint.bpm ?? 0} bpm</span>
                              </div>
                              {timelineStats.restingHr !== null && (
                                <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 pt-0.5 border-t border-border/50">
                                  <span>
                                    💚{' '}
                                    {t(
                                      'heartRate.restingHeartRate',
                                      'Resting HR'
                                    )}
                                    : {timelineStats.restingHr} bpm
                                  </span>
                                  {dataPoint.bpm !== undefined && (
                                    <span className="text-[10px] text-muted-foreground ml-auto">
                                      {dataPoint.bpm >= timelineStats.restingHr
                                        ? `+${dataPoint.bpm - timelineStats.restingHr}`
                                        : `${dataPoint.bpm - timelineStats.restingHr}`}{' '}
                                      bpm
                                    </span>
                                  )}
                                </div>
                              )}
                              {dataPoint.workoutName && (
                                <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                  {getWorkoutEmoji(dataPoint.workoutName)}{' '}
                                  {dataPoint.workoutName}
                                </div>
                              )}
                              {dataPoint.isSleep && (
                                <div className="text-[11px] font-medium text-indigo-400">
                                  😴{' '}
                                  {t('heartRate.sleepPeriod', 'Sleep Period')}
                                </div>
                              )}
                            </div>
                          );
                        }}
                      />

                      {/* Shaded Morning Sleep Window */}
                      {sleepBounds.chartStart && sleepBounds.morningEnd && (
                        <ReferenceArea
                          x1={sleepBounds.chartStart}
                          x2={sleepBounds.morningEnd}
                          y1={35}
                          y2={185}
                          fill={chartTheme.sleepAreaFill}
                          fillOpacity={chartTheme.sleepAreaOpacity}
                          label={{
                            value: sleepBounds.morningLabel,
                            fill: chartTheme.sleepAreaText,
                            fontSize: 10,
                            position: 'insideTopLeft',
                          }}
                        />
                      )}

                      {/* Shaded Evening Sleep Window */}
                      {sleepBounds.eveningStart && sleepBounds.chartEnd && (
                        <ReferenceArea
                          x1={sleepBounds.eveningStart}
                          x2={sleepBounds.chartEnd}
                          y1={35}
                          y2={185}
                          fill={chartTheme.sleepAreaFill}
                          fillOpacity={chartTheme.sleepAreaOpacity}
                          label={{
                            value: sleepBounds.eveningLabel,
                            fill: chartTheme.sleepAreaText,
                            fontSize: 10,
                            position: 'insideTopLeft',
                          }}
                        />
                      )}

                      {/* Shaded Workout Windows */}
                      {dayWorkoutBands.map((wb) => {
                        const snapTo5Min = (minutes: number) => {
                          const snapped = Math.min(
                            1440,
                            Math.max(0, Math.round(minutes / 5) * 5)
                          );
                          const h = Math.floor(snapped / 60);
                          const m = snapped % 60;
                          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                        };
                        const start = snapTo5Min(wb.startMinutes);
                        const end = snapTo5Min(wb.endMinutes);
                        return (
                          <ReferenceArea
                            key={wb.id}
                            x1={start}
                            x2={end}
                            y1={35}
                            y2={185}
                            fill={chartTheme.workoutAreaFill}
                            fillOpacity={chartTheme.workoutAreaOpacity}
                            label={{
                              value: `${getWorkoutEmoji(wb.name)} ${wb.name}`,
                              fill: chartTheme.workoutAreaText,
                              fontSize: 10,
                              position: 'insideTopLeft',
                            }}
                          />
                        );
                      })}

                      {/* Dashed Resting HR line */}
                      {timelineStats.restingHr && (
                        <ReferenceLine
                          y={timelineStats.restingHr}
                          stroke={chartTheme.restingLineColor}
                          strokeDasharray="4 4"
                          label={{
                            value: t(
                              'heartRate.restingValueLabel',
                              'Resting {{val}}',
                              {
                                val: timelineStats.restingHr,
                              }
                            ),
                            fill: chartTheme.restingLineColor,
                            fontSize: 10,
                            position: 'right',
                          }}
                        />
                      )}

                      {/* Continuous Heart Rate Curve with Zone Gradient */}
                      <Line
                        type="monotone"
                        dataKey="bpm"
                        stroke={zoneStroke(
                          dayGradientStops,
                          'dayHeartRateZoneGradient'
                        )}
                        strokeWidth={2.2}
                        dot={false}
                        activeDot={{
                          r: 5,
                          fill: '#f43f5e',
                          stroke: '#ffffff',
                          strokeWidth: 2,
                        }}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Zone Color Code Legend */}
                <div className="flex items-center justify-center gap-4 text-[11px] font-medium text-muted-foreground pt-1">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#06b6d4]" />
                    {t('heartRate.zoneLight', 'Light')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#22c55e]" />
                    {t('heartRate.zoneModerate', 'Moderate')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#eab308]" />
                    {t('heartRate.zoneVigorous', 'Vigorous')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                    {t('heartRate.zonePeak', 'Peak')}
                  </span>
                </div>

                {/* Elevated HR Alert (Sedentary / Rest only - ignores workouts) */}
                {timelineStats.elevatedSpike && (
                  <div className="flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/25 px-4 py-2.5 rounded-xl text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      {t(
                        'heartRate.elevatedHrAlert',
                        'Elevated HR outside exercise – {{bpm}} bpm at {{time}}',
                        {
                          bpm: timelineStats.elevatedSpike.bpm,
                          time: timelineStats.elevatedSpike.time,
                        }
                      )}
                    </span>
                  </div>
                )}
              </>
            ) : (
              /* Honest Empty State when no 24-hour continuous samples exist in DB */
              <div className="p-8 text-center bg-muted/20 border border-border rounded-xl space-y-3">
                <Activity className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
                <p className="text-sm font-semibold text-foreground">
                  {t(
                    'heartRate.noTimelineDataForDate',
                    'No 24-hour continuous telemetry for {{date}}',
                    {
                      date: focusedDate
                        ? formatDateInUserTimezone(focusedDate, dateFormat)
                        : '',
                    }
                  )}
                </p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {t(
                    'heartRate.noTimelineDataSub',
                    'All-day background heart rate syncs from Apple Health, Google Health Connect, or Garmin wearables. In simulator/emulator testing, run "Seed Mock Data" in the mobile app to populate continuous circadian telemetry.'
                  )}
                </p>
                {timelineStats.restingHr !== null && (
                  <div className="inline-flex items-center gap-2 bg-muted/60 border border-border px-3 py-1.5 rounded-lg text-xs font-medium text-foreground">
                    <Heart className="w-3.5 h-3.5 text-rose-500" />
                    <span>
                      {t(
                        'heartRate.dayRestingAvailable',
                        'Daily Resting HR: {{val}} bpm',
                        {
                          val: timelineStats.restingHr,
                        }
                      )}
                    </span>
                  </div>
                )}
              </div>
            ))}

          {/* Date window brush: drag to pan, drag either edge to resize */}
          {totalDays > 1 && (
            <DateRangeBrush
              rangeStartMs={dayStringToMs(range.start)}
              rangeEndMs={dayStringToMs(range.end) + 24 * 60 * 60 * 1000}
              selectionStartMs={windowToSelectionMs(dayWindow).startMs}
              selectionEndMs={windowToSelectionMs(dayWindow).endMs}
              minSelectionMs={24 * 60 * 60 * 1000}
              series={overviewSeries}
              onChange={(startMs, endMs) =>
                setDayWindow(selectionMsToWindow(startMs, endMs, range))
              }
              formatLabel={(ms) =>
                formatDateInUserTimezone(msToDayString(ms), dateFormat)
              }
            />
          )}

          {/* Resting HR Trend & History Section */}
          <div className="pt-4 border-t border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground">
                    {t(
                      'heartRate.restingHrHistoryTitle',
                      'Resting Heart Rate Trend'
                    )}
                  </h3>
                  {restingHrTrendStats.dayCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    >
                      {t('heartRate.daysCount', '{{count}} days', {
                        count: restingHrTrendStats.dayCount,
                      })}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(
                    'heartRate.restingHrHistorySub',
                    'Daily baseline heart rate. Click any day to focus 24-hour timeline above.'
                  )}
                </p>
              </div>

              {/* Quick Stat Badges */}
              {restingHrTrendStats.avgBpm !== null && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                    <span className="text-muted-foreground">
                      {t('common.average', 'Avg')}:
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {restingHrTrendStats.avgBpm} bpm
                    </span>
                  </div>
                  {restingHrTrendStats.minBpm !== null &&
                    restingHrTrendStats.maxBpm !== null && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted border border-border text-xs">
                        <span className="text-muted-foreground">
                          {t('common.range', 'Range')}:
                        </span>
                        <span className="font-semibold text-foreground">
                          {restingHrTrendStats.minBpm} –{' '}
                          {restingHrTrendStats.maxBpm} bpm
                        </span>
                      </div>
                    )}
                  {restingHrTrendStats.trendDelta !== null && (
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                        restingHrTrendStats.trendDelta < 0
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : restingHrTrendStats.trendDelta > 0
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                            : 'bg-muted border-border text-muted-foreground'
                      }`}
                    >
                      <span>
                        {restingHrTrendStats.trendDelta < 0
                          ? `↓ ${Math.abs(restingHrTrendStats.trendDelta)} bpm (${t('heartRate.improving', 'Improving')})`
                          : restingHrTrendStats.trendDelta > 0
                            ? `↑ ${restingHrTrendStats.trendDelta} bpm (${t('heartRate.elevated', 'Elevated')})`
                            : t('heartRate.stable', 'Stable')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {restingHrTrendStats.points.length > 0 ? (
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={restingHrTrendStats.points}
                    margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
                    onClick={(e) => {
                      const chartEvent = e as unknown as {
                        activePayload?: Array<{ payload?: { date?: string } }>;
                      };
                      const clickedDate =
                        chartEvent?.activePayload?.[0]?.payload?.date;
                      if (clickedDate) {
                        setDayWindow({ start: clickedDate, end: clickedDate });
                      }
                    }}
                  >
                    <CartesianGrid
                      stroke={chartTheme.gridColor}
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="shortDate"
                      stroke={chartTheme.axisLineColor}
                      tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[
                        (dataMin: number) => Math.max(35, dataMin - 4),
                        (dataMax: number) => dataMax + 4,
                      ]}
                      stroke={chartTheme.axisLineColor}
                      tick={{ fill: chartTheme.tickColor, fontSize: 11 }}
                      tickLine={false}
                      width={38}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const dataPoint = payload[0]?.payload as {
                          date: string;
                          shortDate: string;
                          bpm: number;
                          isFocused: boolean;
                        };
                        const diffVsAvg =
                          restingHrTrendStats.avgBpm !== null
                            ? dataPoint.bpm - restingHrTrendStats.avgBpm
                            : null;
                        return (
                          <div
                            className="rounded-xl p-3 shadow-xl border text-xs space-y-1.5"
                            style={{
                              backgroundColor: chartTheme.tooltipBg,
                              borderColor: chartTheme.tooltipBorder,
                              color: chartTheme.tooltipText,
                            }}
                          >
                            <div className="font-semibold text-muted-foreground text-[11px]">
                              {formatDateInUserTimezone(
                                dataPoint.date,
                                dateFormat
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold text-emerald-500">
                                {dataPoint.bpm} bpm
                              </span>
                              {diffVsAvg !== null && diffVsAvg !== 0 && (
                                <span
                                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                    diffVsAvg < 0
                                      ? 'bg-emerald-500/10 text-emerald-500'
                                      : 'bg-amber-500/10 text-amber-500'
                                  }`}
                                >
                                  {diffVsAvg > 0 ? `+${diffVsAvg}` : diffVsAvg}{' '}
                                  vs avg
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground/80 pt-1 border-t border-border/50">
                              {dataPoint.date === focusedDate && isSingleDay
                                ? `✓ ${t('heartRate.currentlyViewing', 'Viewing 24h detail above')}`
                                : `👉 ${t('heartRate.clickToFocus', 'Click to zoom into 24h detail')}`}
                            </div>
                          </div>
                        );
                      }}
                    />
                    {restingHrTrendStats.avgBpm !== null && (
                      <ReferenceLine
                        y={restingHrTrendStats.avgBpm}
                        stroke={chartTheme.restingLineColor}
                        strokeDasharray="4 4"
                        strokeOpacity={0.6}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="bpm"
                      stroke="#22c55e"
                      strokeWidth={2.4}
                      activeDot={{
                        r: 6,
                        fill: '#22c55e',
                        stroke: '#ffffff',
                        strokeWidth: 2,
                        cursor: 'pointer',
                      }}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        const isCurrent =
                          payload.date === focusedDate && isSingleDay;
                        return (
                          <circle
                            key={`dot-${payload.date}`}
                            cx={cx}
                            cy={cy}
                            r={isCurrent ? 5.5 : 3.5}
                            fill={isCurrent ? '#22c55e' : '#16a34a'}
                            stroke={isCurrent ? '#ffffff' : 'none'}
                            strokeWidth={isCurrent ? 2 : 0}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setDayWindow({
                                start: payload.date,
                                end: payload.date,
                              });
                            }}
                          />
                        );
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-4">
                {t(
                  'heartRate.noRestingHrHistory',
                  'No resting HR recorded in this date range'
                )}
              </p>
            )}
          </div>
        </div>

        {/* ==================================================================== */}
        {/* SECTION 2: EXERCISES & WORKOUTS (One below another)                 */}
        {/* ==================================================================== */}
        <div className="space-y-6 border-t border-border/60 pt-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {t(
                  'heartRate.workoutsSectionTitle',
                  'Exercise & Workout Heart Rate'
                )}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t(
                  'heartRate.workoutsSectionSub',
                  'Cardiovascular response, active zone minutes, and intensity distribution'
                )}
              </p>
            </div>

            {/* Exercise Filter Dropdown: "All Workouts" as default */}
            {relevantWorkouts.length > 0 && (
              <div className="flex items-center gap-2 bg-muted/60 border border-border px-3 py-1.5 rounded-lg text-xs self-start sm:self-auto">
                <Dumbbell className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="font-semibold text-foreground text-xs">
                  {t('heartRate.filter', 'Filter')}:
                </span>
                <select
                  value={workoutFilter}
                  onChange={(e) => {
                    const id = e.target.value;
                    setWorkoutFilter(id);
                    const picked = relevantWorkouts.find((w) => w.id === id);
                    const day = String(picked?.entry_date || '').slice(0, 10);
                    if (day) setDayWindow({ start: day, end: day });
                  }}
                  className="bg-transparent border-none text-xs text-foreground font-semibold focus:outline-none cursor-pointer pr-1"
                >
                  <option
                    value="all"
                    className="bg-popover text-popover-foreground font-semibold"
                  >
                    {t(
                      'heartRate.allWorkoutsOption',
                      'All Workouts ({{count}})',
                      {
                        count: relevantWorkouts.length,
                      }
                    )}
                  </option>
                  {relevantWorkouts.map((w) => {
                    const formattedD = w.entry_date
                      ? formatDateInUserTimezone(w.entry_date, dateFormat)
                      : '';
                    const name =
                      w.exercises?.name ||
                      (typeof w['exercise_name'] === 'string'
                        ? w['exercise_name']
                        : 'Workout');
                    const hrInfo = w['avg_heart_rate']
                      ? ` (${w['avg_heart_rate']} bpm)`
                      : '';
                    return (
                      <option
                        key={w.id}
                        value={w.id}
                        className="bg-popover text-popover-foreground"
                      >
                        {formattedD ? `${formattedD} · ` : ''}
                        {name}
                        {hrInfo}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* List of Workouts rendered one below another */}
          {displayedWorkouts.length > 0 ? (
            <div className="space-y-6">
              {displayedWorkouts.map((w) => (
                <WorkoutHeartRateItem
                  key={w.id}
                  workout={w}
                  hrSampleBuckets={hrSampleBuckets}
                  chartTheme={chartTheme}
                  timezone={timezone}
                />
              ))}
            </div>
          ) : (
            /* Empty state when no workouts exist in range */
            <div className="p-8 text-center bg-muted/20 border border-border rounded-xl space-y-2">
              <Dumbbell className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
              <p className="text-sm font-semibold text-foreground">
                {t(
                  'heartRate.noWorkoutsInRange',
                  'No workouts found in this date range'
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(
                  'heartRate.noWorkoutsInRangeSub',
                  'Log a workout or widen your date range filter to view exercise zone metrics.'
                )}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default HeartRateAnalyticsCard;
