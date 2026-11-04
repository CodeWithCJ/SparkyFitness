import { useMemo } from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useSleepEntriesQuery } from '@/hooks/CheckIn/useSleep';
import { useResolvedHeartRateZones } from '@/hooks/Settings/useHeartRateZones';
import {
  useDailyHealthMetrics,
  useHealthMetricSamples,
} from '@/hooks/useGenericHealth';
import { DailyExerciseEntry } from '@/types/reports';
import { samplesForDay } from '@/utils/healthMetricSamples';
import { dayStringToMs, msToDayString } from '@/utils/heartRateWindow';
import { zoneGradientStops } from '@/utils/heartRateZoneBands';
import { formatTimeOfDayString } from '@/utils/timeFormatters';
import { useTranslation } from 'react-i18next';
import type { HeartRateWindow } from './useHeartRateWindow';

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

interface HeartRateDataInput {
  startDate: string;
  endDate: string;
  exerciseEntries: DailyExerciseEntry[];
  restingHeartRateData: Array<{
    date: string;
    resting_heart_rate: number | null;
  }>;
}

export const useHeartRateData = (
  {
    startDate,
    endDate,
    exerciseEntries,
    restingHeartRateData,
  }: HeartRateDataInput,
  heartRateWindow: HeartRateWindow
) => {
  const { t } = useTranslation();
  const { timezone, timeFormat } = usePreferences();
  const { dayWindow, zoomDays, isDetailed, focusedDate } = heartRateWindow;

  // The person's own zones decide where the line changes color
  const zones = useResolvedHeartRateZones();
  const { bands } = zones;

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
      const samples = samplesForDay(hrSampleBuckets, d);
      if (samples.length === 0) return false;

      const hasExplicitSample = (
        samples as Array<{ ex?: string; bpm?: number }>
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
        return (samples as Array<{ t?: string; bpm?: number }>).some((s) => {
          if (!s.t || (s.bpm ?? 0) <= 0) return false;
          const dt = new Date(s.t);
          const sMin = dt.getHours() * 60 + dt.getMinutes();
          return sMin >= startMin && sMin <= endMin;
        });
      }

      return false;
    });
  }, [exerciseEntries, hrSampleBuckets, startDate, endDate]);

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
    return (
      samplesForDay(hrSampleBuckets, focusedDate) as Array<{
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

    // The seven days before the focused day, not the whole report range
    const sevenDaysBefore = msToDayString(
      dayStringToMs(focusedDate) - 7 * 24 * 60 * 60 * 1000
    );
    const validRhrs = mergedRestingHeartRateData
      .filter((r) => r.date >= sevenDaysBefore && r.date < focusedDate)
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
    const daily = Array.from(byDate.entries())
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
    // Consecutive days are about 24h apart; a longer jump means a missing day,
    // so the line breaks there instead of joining the two days
    return withGapBreaks(daily, 36 * 60 * 60 * 1000);
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
    return zoneGradientStops(Math.min(...real), Math.max(...real), bands);
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
      // Label recorded days only, not the empty points that break the line
      const recorded = rangeChartPoints.filter((p) => p.bpm !== null);
      const stride = Math.max(1, Math.ceil(recorded.length / 10));
      recorded.forEach((p, i) => {
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

  return {
    workoutNameById,
    relevantWorkouts,
    mergedRestingHeartRateData,
    daySleepWindows,
    daySamples,
    dayWorkouts,
    dayWorkoutBands,
    timelineStats,
    sleepBounds,
    rangePoints,
    windowPoints,
    dailyAveragePoints,
    overviewSeries,
    workoutIntervals,
    detailedPoints,
    rangeChartPoints,
    gradientFor,
    rangeGradientStops,
    activeRangeStats,
    rangeChartDecor,
    dayGradientStops,
    formatRangeTick,
    restingHrTrendStats,
    zones,
    hrSampleBuckets,
    sleepEntries,
    dailyHealthMetrics,
  };
};

export type HeartRateData = ReturnType<typeof useHeartRateData>;
