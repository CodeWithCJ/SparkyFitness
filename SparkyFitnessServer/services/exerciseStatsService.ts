import { getClient } from '../db/poolManager.js';
import {
  addDays,
  daysBetween,
  classifyActivitySport,
  toPrSportGroup,
  activitySportLabel,
  isExerciseModality,
  PR_SPORT_GROUPS,
} from '@workspace/shared';
import type {
  ActivitySport,
  GpsTrackPoint,
  PrSportGroup,
  SportConfidence,
} from '@workspace/shared';
import type {
  ExerciseStatsSummaryQuery,
  ExerciseStatsSummaryResponse,
  ExerciseActivityQueryRequest,
  ExerciseActivityQueryResponse,
  ExercisePRMatrixResponse,
  MatchedCoursesResponse,
  ExerciseActivityQueryItem,
  ExercisePersonalRecordItem,
  MatchedCourseGroup,
} from '@workspace/shared';
import {
  bodyWeightJoinSql,
  cardioPredicateSql,
  setLoadSql,
} from '../utils/exerciseLoadSql.js';
import {
  bestSplitSeconds,
  samplesFromDistanceSeries,
  samplesFromGpsPoints,
} from '../utils/bestSplit.js';
import type { SplitSample } from '../utils/bestSplit.js';

interface SqlRow {
  [key: string]: unknown;
}

/**
 * An activity with no stored track can only stand in for a distance it nearly
 * matches: its time is scaled to the exact distance by its average pace, so a
 * 5.8 km run is never reported as a 5K. Tracked activities need no tolerance,
 * their best stretch is measured directly.
 */
const UNTRACKED_MIN_RATIO = 0.98;
const UNTRACKED_MAX_RATIO = 1.05;

/**
 * Fastest plausible speed per sport group, in metres per second (the same
 * ceilings the mobile recorder rejects glitches with). A straight-line segment
 * faster than this in a stored track is a GPS jump, not movement.
 */
/** A sport group that has distance standards (every group but 'other'). */
type StandardSportGroup = Exclude<PrSportGroup, 'other'>;

const MAX_SPEED_MPS: Record<StandardSportGroup, number> = {
  run: 12,
  walk: 7,
  ride: 30,
  swim: 5,
};

/**
 * Best split per standard, remembered per activity. Measuring a split reads and
 * walks a whole track, so it is done once and reused until the track changes:
 * the key carries the track's last update and size, and the sport group the
 * speed ceiling came from. A value is seconds, or null when the activity does
 * not cover the distance. In memory and bounded, oldest evicted first; a
 * restart just recomputes.
 */
const SPLIT_CACHE_MAX_ENTRIES = 20000;
const splitCache = new Map<string, Record<string, number | null>>();

function rememberSplits(
  key: string,
  splits: Record<string, number | null>
): void {
  if (splitCache.size >= SPLIT_CACHE_MAX_ENTRIES) {
    const oldest = splitCache.keys().next().value;
    if (oldest !== undefined) splitCache.delete(oldest);
  }
  splitCache.set(key, splits);
}

/**
 * Upper bound on the stored size of an empty jsonb array. `pg_column_size` reads
 * the stored size without detoasting the value (`jsonb_array_length` would
 * detoast every track just to be asked "is it empty"). An empty array is a 4
 * byte container header plus a 1 or 4 byte varlena header, 8 bytes at most; the
 * smallest non-empty one adds an entry and its value, 11 bytes at least.
 */
const EMPTY_JSONB_ARRAY_MAX_BYTES = 8;

/** Activities whose tracks are loaded per query when looking for best splits. */
const TRACK_BATCH_SIZE = 25;

/** Distance spread within which activities of one course are comparable. */
const COURSE_DISTANCE_TOLERANCE = 0.05;

/** Most activities of one course read when looking for its best time. */
const COURSE_MAX_ACTIVITIES = 500;

/** Most activities one PR request will look at. */
const PR_MAX_ACTIVITIES = 5000;

/** A PR-query row, with the columns needed to recover its sport. */
interface PrCandidateRow {
  id: string;
  exercise_name: string | null;
  category: string | null;
  notes: string | null;
  entry_date: Date | string;
  duration_minutes: string | number;
  distance: string | number;
  provider_name: string | null;
  detail_data: unknown;
  exercise_source_id: string | null;
  has_gps_track?: boolean;
  has_distance_series?: boolean;
  /** Identifies the stored track revision, for the split cache. */
  track_version?: string | null;
}

type PrTimeBasis = NonNullable<ExercisePersonalRecordItem['timeBasis']>;

interface PrCandidate {
  row: PrCandidateRow;
  sport: ActivitySport;
  confidence: SportConfidence;
  /** Seconds for the standard distance itself. */
  seconds: number;
  basis: PrTimeBasis;
}

/** Converts kilometers to km or miles based on unit system preference */
function convertDistance(
  distanceKm: number,
  unitSystem: 'metric' | 'imperial'
): number {
  if (unitSystem === 'imperial') {
    return Math.round(distanceKm * 0.621371 * 100) / 100; // Miles
  }
  return Math.round(distanceKm * 100) / 100; // Kilometers
}

/** Formats pace in seconds per km to readable "MM:SS /km" or "MM:SS /mi" */
function formatPace(
  secondsPerKm: number,
  unitSystem: 'metric' | 'imperial'
): string {
  const targetSeconds =
    unitSystem === 'imperial' ? secondsPerKm * 1.609344 : secondsPerKm;
  const mins = Math.floor(targetSeconds / 60);
  const secs = Math.floor(targetSeconds % 60);
  const formattedSecs = secs < 10 ? `0${secs}` : `${secs}`;
  const suffix = unitSystem === 'imperial' ? '/mi' : '/km';
  return `${mins}:${formattedSecs} ${suffix}`;
}

/** Formats seconds into HH:MM:SS or MM:SS */
function formatTimeDuration(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const formattedMins = mins < 10 && hrs > 0 ? `0${mins}` : `${mins}`;
  const formattedSecs = secs < 10 ? `0${secs}` : `${secs}`;
  if (hrs > 0) {
    return `${hrs}:${formattedMins}:${formattedSecs}`;
  }
  return `${formattedMins}:${formattedSecs}`;
}

/**
 * A stored measurement as a number rounded to `decimals`, or null when the
 * column is empty or not above zero. A zero from a source that never measured
 * floors or ascent would otherwise show as "0 floors" on every activity.
 */
function positiveOrNull(value: unknown, decimals: number): number | null {
  if (value === null || value === undefined) return null;
  const parsed = parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const factor = 10 ** decimals;
  return Math.round(parsed * factor) / factor;
}

/**
 * Formats a Date as a YYYY-MM-DD calendar day from its local components.
 * DATE_TRUNC returns local midnight, so toISOString().slice(0, 10) reports the
 * previous day whenever the server timezone is behind UTC.
 */
function toDayString(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Distance standards in kilometers.
 *
 * TODO(per-sport standards): these bands are running milestones. Cycling has
 * its own (40 km TT, 100 km) and swimming is measured in pool splits, so a Ride
 * section currently shows run distances. Correct within each sport, just not
 * idiomatic for non-runners.
 */
const DISTANCE_STANDARDS: Record<
  string,
  { min: number; max: number; label: string }
> = {
  '1k': { min: 0.8, max: 1.3, label: '1 km Best' },
  '1mi': { min: 1.4, max: 1.8, label: '1 Mile Best' },
  '5k': { min: 4.0, max: 5.8, label: '5 km Best' },
  '10k': { min: 9.0, max: 11.2, label: '10 km Best' },
  '15k': { min: 14.0, max: 16.5, label: '15 km Best' },
  half_marathon: { min: 19.5, max: 23.0, label: 'Half Marathon (21.1 km)' },
  marathon: { min: 40.0, max: 45.0, label: 'Marathon (42.2 km)' },
};

/** Exact length of each distance standard, in kilometers. */
const STANDARD_DISTANCE_KM: Record<string, number> = {
  '1k': 1,
  '1mi': 1.609344,
  '5k': 5,
  '10k': 10,
  '15k': 15,
  half_marathon: 21.0975,
  marathon: 42.195,
};

/**
 * Calculates multi-interval exercise statistics and period-over-period trends.
 */
async function getExerciseStatsSummary(
  targetUserId: string,
  query: ExerciseStatsSummaryQuery
): Promise<ExerciseStatsSummaryResponse> {
  const client = await getClient(targetUserId);
  try {
    const unitSystem = query.unitSystem || 'metric';
    const interval = query.interval || 'month';

    const now = new Date();
    let startDateStr = query.startDate;
    let endDateStr = query.endDate;

    if (!endDateStr) {
      endDateStr = toDayString(now);
    }

    if (!startDateStr) {
      const start = new Date(now);
      if (interval === 'week') {
        start.setDate(start.getDate() - 28);
      } else if (interval === 'month') {
        start.setMonth(start.getMonth() - 6);
      } else if (interval === 'year' || interval === 'ytd') {
        start.setFullYear(start.getFullYear() - 1);
      } else if (interval === 'lifetime') {
        start.setFullYear(start.getFullYear() - 10);
      } else {
        start.setDate(start.getDate() - 30);
      }
      startDateStr = toDayString(start);
    }

    const totalSql = `
      SELECT 
        COALESCE(SUM(COALESCE(distance, 0)), 0) as total_distance_km,
        COALESCE(SUM(duration_minutes), 0) as total_duration_minutes,
        COALESCE(SUM(calories_burned), 0) as total_calories_burned,
        COUNT(DISTINCT id) as workout_count,
        AVG(avg_heart_rate) as avg_heart_rate,
        COALESCE(SUM(elevation_gain_meters), 0) as total_elevation_gain_meters
      FROM public.exercise_entries
      WHERE user_id = $1 
        AND entry_date >= $2 
        AND entry_date <= $3
        AND exercise_name != 'Active Calories'
        ${query.category ? 'AND LOWER(category) = LOWER($4)' : ''}
    `;

    const totalParams = query.category
      ? [targetUserId, startDateStr, endDateStr, query.category]
      : [targetUserId, startDateStr, endDateStr];

    const totalResult = await client.query(totalSql, totalParams);
    const totalsRow: SqlRow = totalResult.rows[0] || {};

    const totalDistanceKm = parseFloat(
      String(totalsRow.total_distance_km || '0')
    );
    const totalDurationMinutes = parseFloat(
      String(totalsRow.total_duration_minutes || '0')
    );
    const totalCaloriesBurned = Math.round(
      parseFloat(String(totalsRow.total_calories_burned || '0'))
    );
    const workoutCount = parseInt(String(totalsRow.workout_count || '0'), 10);
    const totalElevationGainMeters = Math.round(
      parseFloat(String(totalsRow.total_elevation_gain_meters || '0'))
    );
    const avgHeartRate = totalsRow.avg_heart_rate
      ? Math.round(parseFloat(String(totalsRow.avg_heart_rate)))
      : null;

    const strengthSql = `
      SELECT 
        COALESCE(SUM(${setLoadSql('e', 's')} * s.reps), 0) as total_volume,
        COALESCE(SUM(s.reps), 0) as total_reps
      FROM public.exercise_entry_sets s
      JOIN public.exercise_entries e ON s.exercise_entry_id = e.id
      ${bodyWeightJoinSql('e')}
      WHERE e.user_id = $1
        AND e.entry_date >= $2
        AND e.entry_date <= $3
        ${query.category ? 'AND LOWER(e.category) = LOWER($4)' : ''}
    `;
    const strengthResult = await client.query(
      strengthSql,
      query.category
        ? [targetUserId, startDateStr, endDateStr, query.category]
        : [targetUserId, startDateStr, endDateStr]
    );
    const totalLiftedVolumeKg = parseFloat(
      String(strengthResult.rows[0]?.total_volume || '0')
    );
    const totalReps = parseInt(
      String(strengthResult.rows[0]?.total_reps || '0'),
      10
    );

    const truncUnit =
      interval === 'day'
        ? 'day'
        : interval === 'week'
          ? 'week'
          : interval === 'year'
            ? 'year'
            : 'month';

    // Last calendar day covered by a bucket that starts at `start`. Both
    // startDate and endDate previously returned the bucket's start, so every
    // bucket claimed to span a single day regardless of the interval.
    const periodEndOf = (start: Date): Date => {
      const end = new Date(start);
      if (truncUnit === 'day') return end;
      if (truncUnit === 'week') {
        end.setDate(end.getDate() + 6);
        return end;
      }
      if (truncUnit === 'year') {
        end.setMonth(11, 31);
        return end;
      }
      // month: day 0 of the following month is the last day of this one.
      end.setMonth(end.getMonth() + 1, 0);
      return end;
    };

    const breakdownSql = `
      SELECT 
        DATE_TRUNC('${truncUnit}', entry_date) as period_start,
        COALESCE(SUM(COALESCE(distance, 0)), 0) as distance_km,
        COALESCE(SUM(duration_minutes), 0) as duration_minutes,
        COALESCE(SUM(calories_burned), 0) as calories_burned,
        COUNT(DISTINCT id) as workout_count,
        AVG(avg_heart_rate) as avg_heart_rate,
        COALESCE(SUM(elevation_gain_meters), 0) as elevation_gain_meters
      FROM public.exercise_entries
      WHERE user_id = $1
        AND entry_date >= $2
        AND entry_date <= $3
        AND exercise_name != 'Active Calories'
        ${query.category ? 'AND LOWER(category) = LOWER($4)' : ''}
      GROUP BY period_start
      ORDER BY period_start ASC
    `;

    const breakdownResult = await client.query(breakdownSql, totalParams);

    // Lifted volume per bucket. Kept as its own grouped query rather than a
    // join on the breakdown above: joining one-to-many sets would multiply the
    // distance/duration/calorie sums per set row.
    const breakdownVolumeSql = `
      SELECT
        DATE_TRUNC('${truncUnit}', e.entry_date) as period_start,
        COALESCE(SUM(${setLoadSql('e', 's')} * s.reps), 0) as total_volume
      FROM public.exercise_entry_sets s
      JOIN public.exercise_entries e ON s.exercise_entry_id = e.id
      ${bodyWeightJoinSql('e')}
      WHERE e.user_id = $1
        AND e.entry_date >= $2
        AND e.entry_date <= $3
        AND e.exercise_name != 'Active Calories'
        ${query.category ? 'AND LOWER(e.category) = LOWER($4)' : ''}
      GROUP BY period_start
    `;
    const breakdownVolumeResult = await client.query(
      breakdownVolumeSql,
      totalParams
    );
    const volumeByPeriod = new Map<string, number>(
      breakdownVolumeResult.rows.map((row: SqlRow) => [
        new Date(String(row.period_start)).toISOString(),
        parseFloat(String(row.total_volume || '0')),
      ])
    );
    const intervalsBreakdown = breakdownResult.rows.map((row: SqlRow) => {
      const dKm = parseFloat(String(row.distance_km || '0'));
      const pDate = new Date(String(row.period_start));
      const label =
        interval === 'week'
          ? // Year included: 'Wk Jan 5' alone collides across years, merging
            // buckets and sorting them against each other.
            `Wk ${pDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: '2-digit',
            })}`
          : interval === 'month'
            ? pDate.toLocaleDateString('en-US', {
                month: 'short',
                year: '2-digit',
              })
            : toDayString(pDate);

      return {
        label,
        startDate: toDayString(pDate),
        endDate: toDayString(periodEndOf(pDate)),
        distanceMeters: Math.round(dKm * 1000),
        distanceFormatted: convertDistance(dKm, unitSystem),
        durationMinutes: parseFloat(String(row.duration_minutes || '0')),
        caloriesBurned: Math.round(
          parseFloat(String(row.calories_burned || '0'))
        ),
        workoutCount: parseInt(String(row.workout_count || '0'), 10),
        avgHeartRate: row.avg_heart_rate
          ? Math.round(parseFloat(String(row.avg_heart_rate)))
          : null,
        totalElevationGainMeters: Math.round(
          parseFloat(String(row.elevation_gain_meters || '0'))
        ),
        movingDurationMinutes: parseFloat(String(row.duration_minutes || '0')),
        totalLiftedVolumeKg:
          Math.round((volumeByPeriod.get(pDate.toISOString()) ?? 0) * 100) /
          100,
      };
    });

    // Day-string arithmetic, not Date arithmetic. `new Date('2026-07-30')`
    // parses as UTC midnight while toDayString reads local getters, so on any
    // server with TZ set west of UTC the round trip lands a day early and the
    // whole comparison window slides by one day.
    const diffDays = Math.max(1, daysBetween(startDateStr, endDateStr));
    const prevEndDay = addDays(startDateStr, -1);
    const prevStartDay = addDays(prevEndDay, -diffDays);

    const prevSql = `
      SELECT 
        COALESCE(SUM(COALESCE(distance, 0)), 0) as total_distance_km,
        COALESCE(SUM(duration_minutes), 0) as total_duration_minutes,
        COALESCE(SUM(calories_burned), 0) as total_calories_burned,
        COUNT(DISTINCT id) as workout_count
      FROM public.exercise_entries
      WHERE user_id = $1 
        AND entry_date >= $2 
        AND entry_date <= $3
        AND exercise_name != 'Active Calories'
        ${query.category ? 'AND LOWER(category) = LOWER($4)' : ''}
    `;
    const prevParams = query.category
      ? [targetUserId, prevStartDay, prevEndDay, query.category]
      : [targetUserId, prevStartDay, prevEndDay];
    const prevResult = await client.query(prevSql, prevParams);
    const prevRow: SqlRow = prevResult.rows[0] || {};
    const prevDistance = parseFloat(String(prevRow.total_distance_km || '0'));
    const prevDuration = parseFloat(
      String(prevRow.total_duration_minutes || '0')
    );
    const prevCalories = parseFloat(
      String(prevRow.total_calories_burned || '0')
    );
    const prevWorkouts = parseFloat(String(prevRow.workout_count || '0'));

    const calcChange = (curr: number, prev: number) => {
      if (prev <= 0) return curr > 0 ? 100 : 0;
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    };

    // Recorded time-in-zone, summed from exercise_entry_hr_zones. This was
    // previously synthesized from the average heart rate and a workout count,
    // which produced plausible-looking numbers that were never measured. Zones
    // with no recorded data stay at 0 rather than falling back to an estimate:
    // a zero reads as "nothing recorded", an estimate is indistinguishable from
    // a real reading.
    const hrZoneSql = `
      SELECT z.zone_index, COALESCE(SUM(z.seconds_in_zone), 0) AS seconds
      FROM public.exercise_entry_hr_zones z
      JOIN public.exercise_entries e ON e.id = z.exercise_entry_id
      WHERE z.user_id = $1
        AND z.entry_date >= $2
        AND z.entry_date <= $3
        ${query.category ? 'AND LOWER(e.category) = LOWER($4)' : ''}
      GROUP BY z.zone_index
    `;
    const hrZoneResult = await client.query(hrZoneSql, totalParams);
    const secondsByZone = new Map<number, number>(
      hrZoneResult.rows.map((row: SqlRow) => [
        parseInt(String(row.zone_index), 10),
        Math.round(parseFloat(String(row.seconds || '0'))),
      ])
    );
    const hrDistribution = {
      zone1RecoverySeconds: secondsByZone.get(1) ?? 0,
      zone2EnduranceSeconds: secondsByZone.get(2) ?? 0,
      zone3AerobicSeconds: secondsByZone.get(3) ?? 0,
      zone4ThresholdSeconds: secondsByZone.get(4) ?? 0,
      zone5AnaerobicSeconds: secondsByZone.get(5) ?? 0,
    };

    return {
      interval,
      startDate: startDateStr,
      endDate: endDateStr,
      unitSystem,
      totals: {
        totalDistanceMeters: Math.round(totalDistanceKm * 1000),
        totalDistanceFormatted: convertDistance(totalDistanceKm, unitSystem),
        totalDurationMinutes,
        totalCaloriesBurned,
        workoutCount,
        avgHeartRate,
        totalElevationGainMeters,
        totalMovingDurationMinutes: totalDurationMinutes,
        totalLiftedVolumeKg,
        totalReps,
      },
      comparisonWithPreviousPeriod: {
        distanceChangePercent: calcChange(totalDistanceKm, prevDistance),
        durationChangePercent: calcChange(totalDurationMinutes, prevDuration),
        caloriesChangePercent: calcChange(totalCaloriesBurned, prevCalories),
        workoutCountChangePercent: calcChange(workoutCount, prevWorkouts),
      },
      intervalsBreakdown,
      heartRateZoneDistribution: hrDistribution,
    };
  } finally {
    client.release();
  }
}

/**
 * Executes advanced filtering/querying across activities.
 */
async function queryExerciseActivities(
  targetUserId: string,
  request: ExerciseActivityQueryRequest
): Promise<ExerciseActivityQueryResponse> {
  const client = await getClient(targetUserId);
  try {
    const unitSystem = request.unitSystem || 'metric';
    const page = request.page || 1;
    const pageSize = request.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const whereClauses = ['user_id = $1', "exercise_name != 'Active Calories'"];
    const params: (string | number)[] = [targetUserId];

    if (request.category) {
      params.push(request.category.toLowerCase());
      whereClauses.push(`LOWER(category) = $${params.length}`);
    }

    let minKm =
      request.distanceMinMeters !== undefined
        ? request.distanceMinMeters / 1000
        : undefined;
    let maxKm =
      request.distanceMaxMeters !== undefined
        ? request.distanceMaxMeters / 1000
        : undefined;

    if (
      request.distanceStandard &&
      DISTANCE_STANDARDS[request.distanceStandard]
    ) {
      minKm = DISTANCE_STANDARDS[request.distanceStandard].min;
      maxKm = DISTANCE_STANDARDS[request.distanceStandard].max;
    }

    if (minKm !== undefined) {
      params.push(minKm);
      whereClauses.push(`distance >= $${params.length}`);
    } else if (!request.category) {
      // See cardioPredicateSql for what counts as cardio.
      whereClauses.push(cardioPredicateSql());
    }
    if (maxKm !== undefined) {
      params.push(maxKm);
      whereClauses.push(`distance <= $${params.length}`);
    }

    if (request.startDate) {
      params.push(request.startDate);
      whereClauses.push(`entry_date >= $${params.length}`);
    }
    if (request.endDate) {
      params.push(request.endDate);
      whereClauses.push(`entry_date <= $${params.length}`);
    }

    if (request.searchKeyword) {
      params.push(`%${request.searchKeyword.toLowerCase()}%`);
      whereClauses.push(
        `(LOWER(exercise_name) LIKE $${params.length} OR LOWER(notes) LIKE $${params.length})`
      );
    }

    const whereSql = whereClauses.join(' AND ');

    const countSql = `SELECT COUNT(*) FROM public.exercise_entries WHERE ${whereSql}`;
    const countResult = await client.query(countSql, params);
    const totalCount = parseInt(String(countResult.rows[0]?.count || '0'), 10);

    const sortCol =
      request.sortBy === 'distance'
        ? 'distance'
        : request.sortBy === 'duration_minutes'
          ? 'duration_minutes'
          : request.sortBy === 'calories_burned'
            ? 'calories_burned'
            : request.sortBy === 'avg_heart_rate'
              ? 'avg_heart_rate'
              : request.sortBy === 'avg_pace'
                ? 'duration_minutes / NULLIF(distance, 0)'
                : 'entry_date';
    const sortOrder = request.sortOrder === 'asc' ? 'ASC' : 'DESC';

    params.push(pageSize, offset);
    // hasGpsTrack is answered from the stored track, not from a source
    // allowlist. The allowlist was also wrong: it tested source = 'strava'
    // while the ingest pipeline writes 'Strava' (stravaDataProcessor.ts), so
    // every Strava activity reported no GPS. Asking the telemetry table cannot
    // drift out of sync with provider naming, and it correctly returns false
    // for an indoor Garmin workout that genuinely has no track.
    const itemsSql = `
      SELECT
        id, user_id, exercise_name, category, entry_date, entry_time,
        duration_minutes, distance, avg_heart_rate, calories_burned, source, notes,
        floors_climbed, elevation_gain_meters, workout_effort,
        avg_cadence, stride_length_cm, modality,
        weather_temp_celsius, weather_condition,
        EXISTS (
          SELECT 1 FROM public.exercise_entry_gps_points g
          WHERE g.exercise_entry_id = exercise_entries.id
            AND jsonb_array_length(g.points) > 0
        ) as has_gps_track
      FROM public.exercise_entries
      WHERE ${whereSql}
      ORDER BY ${sortCol} ${sortOrder} NULLS LAST, created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const itemsResult = await client.query(itemsSql, params);

    const items: ExerciseActivityQueryItem[] = itemsResult.rows.map(
      (row: SqlRow) => {
        const distKm = row.distance ? parseFloat(String(row.distance)) : null;
        const rawDur = parseFloat(String(row.duration_minutes || '0'));
        const durMins = Math.round(rawDur * 100) / 100;

        let avgPaceSecs: number | null = null;
        let formattedPace: string | null = null;

        if (distKm && distKm > 0 && durMins > 0) {
          avgPaceSecs = Math.round((durMins * 60) / distKm);
          formattedPace = formatPace(avgPaceSecs, unitSystem);
        }

        const entryDateStr =
          row.entry_date instanceof Date
            ? toDayString(row.entry_date)
            : String(row.entry_date);

        return {
          id: String(row.id),
          userId: String(row.user_id),
          exerciseName: String(row.exercise_name || 'Workout'),
          category: row.category ? String(row.category) : null,
          entryDate: entryDateStr,
          entryTime: row.entry_time ? String(row.entry_time) : null,
          durationMinutes: durMins,
          movingDurationMinutes: durMins,
          distanceMeters: distKm ? Math.round(distKm * 1000) : null,
          distanceFormatted: distKm
            ? convertDistance(distKm, unitSystem)
            : null,
          avgPaceSecondsPerKm: avgPaceSecs,
          formattedPace,
          caloriesBurned: Math.round(
            parseFloat(String(row.calories_burned || '0'))
          ),
          avgHeartRate: row.avg_heart_rate
            ? Math.round(parseFloat(String(row.avg_heart_rate)))
            : null,
          floorsClimbed: positiveOrNull(row.floors_climbed, 0),
          elevationGainMeters: positiveOrNull(row.elevation_gain_meters, 1),
          avgCadence: positiveOrNull(row.avg_cadence, 0),
          strideLengthCm: positiveOrNull(row.stride_length_cm, 1),
          workoutEffort:
            row.workout_effort !== null && row.workout_effort !== undefined
              ? Number(row.workout_effort)
              : null,
          // Unlike elevation, 0 °C is a real reading, so only null is "none".
          weatherTempCelsius:
            row.weather_temp_celsius !== null &&
            row.weather_temp_celsius !== undefined
              ? Math.round(parseFloat(String(row.weather_temp_celsius)) * 10) /
                10
              : null,
          weatherCondition: row.weather_condition
            ? String(row.weather_condition)
            : null,
          source: row.source ? String(row.source) : null,
          notes: row.notes ? String(row.notes) : null,
          hasGpsTrack: row.has_gps_track === true,
          // The column is plain text, so only a known modality is passed on.
          modality: isExerciseModality(row.modality) ? row.modality : null,
        };
      }
    );

    return {
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize) || 1,
      items,
    };
  } finally {
    client.release();
  }
}

/**
 * Calculates Personal Records (PRs) matrix across standard milestone distances and strength 1RMs.
 */
async function getPersonalRecordMatrix(
  targetUserId: string,
  unitSystem: 'metric' | 'imperial' = 'metric'
): Promise<ExercisePRMatrixResponse> {
  const client = await getClient(targetUserId);
  try {
    const cardioPRs: ExercisePersonalRecordItem[] = [];

    const standardEntries = Object.entries(DISTANCE_STANDARDS);

    // Every activity long enough for the shortest standard. Which standards it
    // can stand in for is decided below, per activity, because that depends on
    // its sport (not a column; see classifyActivitySport) and on whether it has
    // a track to measure a split from.
    const minStandardKm = Math.min(...Object.values(STANDARD_DISTANCE_KM));
    const prSql = `
      SELECT ee.id, ee.exercise_name, ee.category, ee.notes, ee.entry_date,
             ee.duration_minutes, ee.distance,
             d.provider_name, d.detail_data,
             x.source_id AS exercise_source_id,
             EXISTS (
               SELECT 1 FROM public.exercise_entry_gps_points g
               WHERE g.exercise_entry_id = ee.id
                 AND pg_column_size(g.points) > ${EMPTY_JSONB_ARRAY_MAX_BYTES}
             ) AS has_gps_track,
             EXISTS (
               SELECT 1 FROM public.exercise_entry_distance_series ds
               WHERE ds.exercise_entry_id = ee.id
                 AND pg_column_size(ds.points) > ${EMPTY_JSONB_ARRAY_MAX_BYTES}
             ) AS has_distance_series,
             COALESCE((SELECT g.updated_at::text || ':' || pg_column_size(g.points)
                FROM public.exercise_entry_gps_points g
               WHERE g.exercise_entry_id = ee.id), '') || '/' ||
             COALESCE((SELECT ds.updated_at::text || ':' || pg_column_size(ds.points)
                FROM public.exercise_entry_distance_series ds
               WHERE ds.exercise_entry_id = ee.id), '') AS track_version
      FROM public.exercise_entries ee
      LEFT JOIN public.exercises x ON x.id = ee.exercise_id
      LEFT JOIN LATERAL (
        SELECT provider_name, detail_data
        FROM public.exercise_entry_activity_details
        WHERE exercise_entry_id = ee.id
        ORDER BY CASE WHEN detail_type LIKE '%activity_data%' THEN 0 ELSE 1 END
        LIMIT 1
      ) d ON TRUE
      WHERE ee.user_id = $1
        AND ee.distance >= $2
        AND ee.duration_minutes > 0
        AND ee.exercise_name != 'Active Calories'
      ORDER BY ee.entry_date DESC
      LIMIT ${PR_MAX_ACTIVITIES}
    `;
    const prResult = await client.query(prSql, [
      targetUserId,
      minStandardKm * UNTRACKED_MIN_RATIO,
    ]);

    // Sport first, so tracks are only loaded for activities that can hold a
    // record: a skiing or rowing-machine entry never competes in these bands.
    const classified: {
      row: PrCandidateRow;
      sport: ActivitySport;
      confidence: SportConfidence;
      sportGroup: StandardSportGroup;
      distKm: number;
      durSecs: number;
    }[] = [];
    for (const row of prResult.rows as PrCandidateRow[]) {
      const distKm = parseFloat(String(row.distance));
      const durSecs = parseFloat(String(row.duration_minutes)) * 60;
      // Drops any row whose numerics fail to parse, so a NaN time can never
      // win a band.
      if (!(distKm > 0) || !(durSecs > 0)) continue;
      const { sport, confidence } = classifyActivitySport({
        exerciseName: row.exercise_name,
        category: row.category,
        notes: row.notes,
        providerName: row.provider_name,
        detailData: row.detail_data,
        exerciseSourceId: row.exercise_source_id,
      });
      const sportGroup = toPrSportGroup(sport);
      if (sportGroup === 'other') continue;
      classified.push({ row, sport, confidence, sportGroup, distKm, durSecs });
    }

    // Measured splits for the activities that have a track or a distance
    // series. Ones already measured come from the cache; the rest have their
    // tracks loaded in small batches, so a long history never holds every track
    // in memory at once, and are cached for the next request.
    const splitsById = new Map<string, Record<string, number | null>>();
    const cacheKeys = new Map<string, string>();
    const misses: typeof classified = [];
    for (const item of classified) {
      const { row, sportGroup } = item;
      if (row.has_gps_track !== true && row.has_distance_series !== true) {
        continue;
      }
      const id = String(row.id);
      const cacheKey = `${id}:${sportGroup}:${row.track_version ?? ''}`;
      cacheKeys.set(id, cacheKey);
      // Without a track version (nothing to tell revisions apart) never cache.
      const cached = row.track_version ? splitCache.get(cacheKey) : undefined;
      if (cached) splitsById.set(id, cached);
      else misses.push(item);
    }
    for (let i = 0; i < misses.length; i += TRACK_BATCH_SIZE) {
      const batch = misses.slice(i, i + TRACK_BATCH_SIZE);
      const ids = batch.map(({ row }) => String(row.id));
      const speedCeilingById = new Map(
        batch.map(({ row, sportGroup }) => [
          String(row.id),
          MAX_SPEED_MPS[sportGroup],
        ])
      );
      const gpsById = new Map<string, SplitSample[]>();
      const seriesById = new Map<string, SplitSample[]>();
      if (batch.some(({ row }) => row.has_gps_track === true)) {
        const gpsResult = await client.query(
          `SELECT exercise_entry_id, points
           FROM public.exercise_entry_gps_points
           WHERE exercise_entry_id = ANY($1::uuid[])`,
          [ids]
        );
        for (const track of gpsResult.rows as SqlRow[]) {
          const id = String(track.exercise_entry_id);
          const samples = samplesFromGpsPoints(
            track.points as GpsTrackPoint[],
            speedCeilingById.get(id)
          );
          if (samples) gpsById.set(id, samples);
        }
      }
      // An indoor run has a distance series instead of a track. It is read for
      // every activity that has one, not only those without a usable track: a
      // track that stops short of a standard can still be covered by the series.
      if (batch.some(({ row }) => row.has_distance_series === true)) {
        const seriesResult = await client.query(
          `SELECT exercise_entry_id, points
           FROM public.exercise_entry_distance_series
           WHERE exercise_entry_id = ANY($1::uuid[])`,
          [ids]
        );
        for (const row of seriesResult.rows as SqlRow[]) {
          const samples = samplesFromDistanceSeries(
            row.points as [number, number][]
          );
          if (samples) seriesById.set(String(row.exercise_entry_id), samples);
        }
      }
      for (const id of ids) {
        const gps = gpsById.get(id);
        const series = seriesById.get(id);
        if (!gps && !series) continue;
        // The track decides a standard when it yields a split; the series only
        // answers the standards the track does not cover.
        const splits: Record<string, number | null> = {};
        for (const [stdKey, standardKm] of Object.entries(
          STANDARD_DISTANCE_KM
        )) {
          const meters = standardKm * 1000;
          splits[stdKey] =
            (gps ? bestSplitSeconds(gps, meters) : null) ??
            (series ? bestSplitSeconds(series, meters) : null);
        }
        splitsById.set(id, splits);
        const cacheKey = cacheKeys.get(id);
        const version = batch.find(({ row }) => String(row.id) === id)?.row
          .track_version;
        if (cacheKey && version) rememberSplits(cacheKey, splits);
      }
    }

    // Fastest time for the exact standard distance per (sport group, standard).
    // Comparing times, all for one distance, picks the real record whatever
    // order the rows arrived in.
    const bestBySportAndStandard = new Map<string, PrCandidate>();
    for (const {
      row,
      sport,
      confidence,
      sportGroup,
      distKm,
      durSecs,
    } of classified) {
      const splits = splitsById.get(String(row.id));
      for (const [stdKey] of standardEntries) {
        const standardKm = STANDARD_DISTANCE_KM[stdKey];
        if (standardKm === undefined) continue;
        let seconds: number | null = null;
        let basis: PrTimeBasis = 'best_split';
        if (splits) seconds = splits[stdKey] ?? null;
        if (
          seconds === null &&
          distKm >= standardKm * UNTRACKED_MIN_RATIO &&
          distKm <= standardKm * UNTRACKED_MAX_RATIO
        ) {
          // No measured split (no track, or too short a one): the activity's
          // own pace over this distance, for an activity that nearly matches it.
          seconds = (durSecs / distKm) * standardKm;
          basis = 'activity_pace';
        }
        if (seconds === null) continue;
        const key = `${sportGroup}:${stdKey}`;
        const current = bestBySportAndStandard.get(key);
        if (!current || seconds < current.seconds) {
          bestBySportAndStandard.set(key, {
            row,
            sport,
            confidence,
            seconds,
            basis,
          });
        }
      }
    }

    for (const sportGroup of PR_SPORT_GROUPS) {
      // The bands are running distances. A sport with no distance standard of
      // its own (skiing, rowing machines, anything classified as 'other') would
      // otherwise be ranked against them: a fast downhill run becomes a
      // marathon record. Such efforts only ever surface as the single
      // best-effort card below.
      if (sportGroup === 'other') continue;
      for (const [stdKey, stdConfig] of standardEntries) {
        const candidate = bestBySportAndStandard.get(`${sportGroup}:${stdKey}`);
        if (!candidate) continue;
        const bestRow = candidate.row;
        const standardKm = STANDARD_DISTANCE_KM[stdKey] ?? 0;
        const totalSecs = Math.round(candidate.seconds);
        const paceSecs = Math.round(candidate.seconds / standardKm);
        const entryDateStr =
          bestRow.entry_date instanceof Date
            ? toDayString(bestRow.entry_date)
            : String(bestRow.entry_date);

        const prLabel =
          unitSystem === 'imperial'
            ? stdKey === '5k'
              ? '5K Best (3.1 mi)'
              : stdKey === '10k'
                ? '10K Best (6.2 mi)'
                : stdKey === '15k'
                  ? '15K Best (9.3 mi)'
                  : stdKey === 'half_marathon'
                    ? 'Half Marathon (13.1 mi)'
                    : stdKey === 'marathon'
                      ? 'Marathon (26.2 mi)'
                      : stdConfig.label
            : stdConfig.label;

        cardioPRs.push({
          id: `pr-${sportGroup}-${stdKey}`,
          category: candidate.sport,
          sport: candidate.sport,
          sportGroup,
          sportConfidence: candidate.confidence,
          distanceStandard:
            stdKey as ExercisePersonalRecordItem['distanceStandard'],
          label: prLabel,
          bestTimeSeconds: totalSecs,
          formattedTime: formatTimeDuration(totalSecs),
          avgPaceSecondsPerKm: paceSecs,
          formattedPace: formatPace(paceSecs, unitSystem),
          timeBasis: candidate.basis,
          activityId: String(bestRow.id),
          activityName: String(
            bestRow.exercise_name || activitySportLabel(candidate.sport)
          ),
          achievedAt: entryDateStr,
        });
      }
    }

    // Stays a single global card rather than one per sport: a user whose
    // activities all fall outside every band wants one "longest effort", not
    // five empty-ish sections.
    if (cardioPRs.length === 0) {
      const fallbackSql = `
        SELECT ee.id, ee.exercise_name, ee.category, ee.notes, ee.entry_date,
               ee.duration_minutes, ee.distance,
               d.provider_name, d.detail_data,
               x.source_id AS exercise_source_id
        FROM public.exercise_entries ee
        LEFT JOIN public.exercises x ON x.id = ee.exercise_id
        LEFT JOIN LATERAL (
          SELECT provider_name, detail_data
          FROM public.exercise_entry_activity_details
          WHERE exercise_entry_id = ee.id
          ORDER BY CASE WHEN detail_type LIKE '%activity_data%' THEN 0 ELSE 1 END
          LIMIT 1
        ) d ON TRUE
        WHERE ee.user_id = $1 AND ee.distance > 0.5 AND ee.duration_minutes > 0
          AND ee.exercise_name != 'Active Calories'
        ORDER BY ee.distance DESC, ee.duration_minutes ASC
        LIMIT 1
      `;
      const fallbackRes = await client.query(fallbackSql, [targetUserId]);
      if (fallbackRes.rows.length > 0) {
        const bestRow: PrCandidateRow = fallbackRes.rows[0];
        const { sport, confidence } = classifyActivitySport({
          exerciseName: bestRow.exercise_name,
          category: bestRow.category,
          notes: bestRow.notes,
          providerName: bestRow.provider_name,
          detailData: bestRow.detail_data,
          exerciseSourceId: bestRow.exercise_source_id,
        });
        const sportGroup = toPrSportGroup(sport);
        const distKm = parseFloat(String(bestRow.distance));
        const durMins = parseFloat(String(bestRow.duration_minutes));
        const totalSecs = Math.round(durMins * 60);
        const paceSecs = Math.round(totalSecs / distKm);
        const entryDateStr =
          bestRow.entry_date instanceof Date
            ? toDayString(bestRow.entry_date)
            : String(bestRow.entry_date);

        const distVal = convertDistance(distKm, unitSystem);
        const unitSuffix = unitSystem === 'imperial' ? 'mi' : 'km';

        cardioPRs.push({
          id: `pr-${sportGroup}-longest`,
          category: sport,
          sport,
          sportGroup,
          sportConfidence: confidence,
          distanceStandard: 'custom',
          label: `Best Effort (${distVal} ${unitSuffix})`,
          bestTimeSeconds: totalSecs,
          formattedTime: formatTimeDuration(totalSecs),
          avgPaceSecondsPerKm: paceSecs,
          formattedPace: formatPace(paceSecs, unitSystem),
          activityId: String(bestRow.id),
          activityName: String(
            bestRow.exercise_name || activitySportLabel(sport)
          ),
          achievedAt: entryDateStr,
        });
      }
    }

    // DISTINCT ON, not GROUP BY with independent MAX()s. Aggregating weight,
    // reps, and date separately reports a set that was never performed: the
    // heaviest weight paired with the highest rep count from some other set,
    // dated by the most recent session rather than the session the record was
    // set in. This picks the one real row with the best Epley estimate, so
    // weight, reps, and date all describe the same set.
    const strengthPrSql = `
      WITH best_set AS (
        SELECT DISTINCT ON (e.exercise_name)
          e.exercise_name,
          (${setLoadSql('e', 's')}) * (1 + s.reps / 30.0) as estimated_one_rm,
          -- The load moved: body weight plus the set's weight for a
          -- bodyweight exercise, so a weighted pull-up ranks on what it was.
          (${setLoadSql('e', 's')}) as weight_kg,
          s.reps as reps,
          e.entry_date as achieved_on
        FROM public.exercise_entry_sets s
        JOIN public.exercise_entries e ON s.exercise_entry_id = e.id
        ${bodyWeightJoinSql('e')}
        LEFT JOIN public.exercise_preset_entries epe ON epe.id = e.exercise_preset_entry_id
        WHERE e.user_id = $1 AND (${setLoadSql('e', 's')}) > 0 AND s.reps > 0
          -- Sets done inside interval/WOD sessions aren't comparable strength
          -- efforts; ad-hoc entries (no session) count as standard.
          AND COALESCE(epe.workout_format, 'standard') = 'standard'
        -- Ties broken by the earliest date: that is when the record was first
        -- reached, not the last time it was equalled.
        ORDER BY e.exercise_name, estimated_one_rm DESC, e.entry_date ASC
      )
      SELECT * FROM best_set
      ORDER BY estimated_one_rm DESC
      LIMIT 10
    `;
    const strengthResult = await client.query(strengthPrSql, [targetUserId]);

    const strength1RMs = strengthResult.rows.map((row: SqlRow) => ({
      exerciseName: String(row.exercise_name || 'Strength Exercise'),
      estimatedOneRMKg:
        Math.round(parseFloat(String(row.estimated_one_rm || '0')) * 10) / 10,
      weightKg: parseFloat(String(row.weight_kg || '0')),
      reps: parseInt(String(row.reps || '0'), 10),
      achievedAt:
        row.achieved_on instanceof Date
          ? toDayString(row.achieved_on)
          : String(row.achieved_on),
    }));

    return {
      cardioPRs,
      strength1RMs,
    };
  } finally {
    client.release();
  }
}

/**
 * Group activities that share similar geographic course titles/locations.
 */
async function getMatchedCourses(
  targetUserId: string,
  unitSystem: 'metric' | 'imperial' = 'metric'
): Promise<MatchedCoursesResponse> {
  const client = await getClient(targetUserId);
  try {
    const coursesSql = `
      SELECT 
        LOWER(exercise_name) as course_key,
        exercise_name,
        category,
        COUNT(id) as activity_count,
        AVG(distance) as avg_distance_km
      FROM public.exercise_entries
      WHERE user_id = $1 
        AND distance > 0.5 
        AND duration_minutes > 0
        AND exercise_name != 'Active Calories'
      GROUP BY LOWER(exercise_name), exercise_name, category
      HAVING COUNT(id) >= 2
      ORDER BY activity_count DESC
      LIMIT 10
    `;

    const coursesResult = await client.query(coursesSql, [targetUserId]);

    const courses: MatchedCourseGroup[] = [];

    for (const row of coursesResult.rows) {
      const avgDistKm = parseFloat(String(row.avg_distance_km || '0'));
      const courseKey = String(row.course_key);

      // Every activity of the course, newest first: the recent list shows the
      // first few, the best time is found across all of them.
      const activitiesSql = `
        SELECT id, exercise_name, entry_date, duration_minutes, distance, avg_heart_rate
        FROM public.exercise_entries
        WHERE user_id = $1 AND LOWER(exercise_name) = $2
        ORDER BY entry_date DESC
        LIMIT ${COURSE_MAX_ACTIVITIES}
      `;
      const activitiesRes = await client.query(activitiesSql, [
        targetUserId,
        courseKey,
      ]);

      const recentActivities = activitiesRes.rows
        .slice(0, 5)
        .map((act: SqlRow) => {
          const dKm = parseFloat(String(act.distance || '0'));
          const dMins = parseFloat(String(act.duration_minutes || '0'));
          const roundedDMins = Math.round(dMins * 10) / 10;
          const paceSecs = dKm > 0 ? Math.round((dMins * 60) / dKm) : 0;
          return {
            activityId: String(act.id),
            activityName: String(act.exercise_name || 'Activity'),
            entryDate:
              act.entry_date instanceof Date
                ? toDayString(act.entry_date)
                : String(act.entry_date),
            durationMinutes: roundedDMins,
            avgPaceFormatted: formatPace(paceSecs, unitSystem),
            avgHeartRate: act.avg_heart_rate
              ? Math.round(parseFloat(String(act.avg_heart_rate)))
              : null,
          };
        });

      // A course is matched by name, so its activities can differ in length (a
      // shortened loop, an extended one). The best time is only compared across
      // activities close to the course's own distance, as the pace over that
      // distance, so a short version can never post a faster "course time".
      const measured: { distKm: number; paceSecs: number }[] = [];
      for (const act of activitiesRes.rows) {
        const dKm = parseFloat(String(act.distance || '0'));
        const dMins = parseFloat(String(act.duration_minutes || '0'));
        if (dKm > 0 && dMins > 0) {
          measured.push({ distKm: dKm, paceSecs: (dMins * 60) / dKm });
        }
      }
      // The reference is the median of the measured distances, not the SQL
      // average: a few shortened runs drag the average away from every real run
      // of the course and leave nothing comparable.
      const sortedDistances = measured
        .map((m) => m.distKm)
        .sort((x, y) => x - y);
      const referenceKm =
        sortedDistances.length === 0
          ? avgDistKm
          : sortedDistances.length % 2 === 1
            ? (sortedDistances[(sortedDistances.length - 1) / 2] as number)
            : ((sortedDistances[sortedDistances.length / 2 - 1] as number) +
                (sortedDistances[sortedDistances.length / 2] as number)) /
              2;
      let comparable = measured.filter(
        ({ distKm }) =>
          Math.abs(distKm - referenceKm) <=
          referenceKm * COURSE_DISTANCE_TOLERANCE
      );
      if (comparable.length === 0 && measured.length > 0) {
        // A course whose runs are all different lengths: use the one nearest
        // the reference rather than showing no time.
        const nearest = measured.reduce((best, m) =>
          Math.abs(m.distKm - referenceKm) < Math.abs(best.distKm - referenceKm)
            ? m
            : best
        );
        comparable = [nearest];
      }
      const bestPaceSecs =
        comparable.length > 0
          ? Math.round(Math.min(...comparable.map((m) => m.paceSecs)))
          : 0;

      courses.push({
        courseId: `course-${courseKey.replace(/\s+/g, '-')}`,
        courseName: String(row.exercise_name || 'Course Loop'),
        category: row.category ? String(row.category) : 'running',
        // Courses group by LOWER(exercise_name), so the group name is the best
        // signal available here; notes are not in the GROUP BY.
        sport: classifyActivitySport({
          exerciseName: row.exercise_name ? String(row.exercise_name) : null,
          category: row.category ? String(row.category) : null,
        }).sport,
        totalDistanceMeters: Math.round(referenceKm * 1000),
        avgDistanceFormatted: convertDistance(referenceKm, unitSystem),
        activityCount: parseInt(String(row.activity_count), 10),
        bestTimeSeconds: Math.round(bestPaceSecs * referenceKm),
        bestPaceFormatted: formatPace(bestPaceSecs, unitSystem),
        recentActivities,
      });
    }

    return { courses };
  } finally {
    client.release();
  }
}

export default {
  getExerciseStatsSummary,
  queryExerciseActivities,
  getPersonalRecordMatrix,
  getMatchedCourses,
};
