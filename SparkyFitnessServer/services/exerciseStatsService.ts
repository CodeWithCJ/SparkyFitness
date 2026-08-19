import { getClient } from '../db/poolManager.js';
import {
  addDays,
  daysBetween,
  classifyActivitySport,
  toPrSportGroup,
  activitySportLabel,
  PR_SPORT_GROUPS,
} from '@workspace/shared';
import type { ActivitySport, SportConfidence } from '@workspace/shared';
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

interface SqlRow {
  [key: string]: unknown;
}

/**
 * How many of the fastest entries per distance band the PR query returns.
 * Sport is derived per row rather than filtered in SQL, so the query cannot ask
 * for "the best run" directly — it returns a shortlist and the reduction below
 * picks the best of each sport out of it.
 */
const PR_CANDIDATES_PER_STANDARD = 25;

/** A PR-query row, with the columns needed to recover its sport. */
interface PrCandidateRow {
  std_key?: string;
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
}

interface PrCandidate {
  row: PrCandidateRow;
  sport: ActivitySport;
  confidence: SportConfidence;
  /** Seconds per km, unrounded — used to pick the winner within a band. */
  paceSeconds: number;
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
        COALESCE(SUM(s.weight * s.reps), 0) as total_volume,
        COALESCE(SUM(s.reps), 0) as total_reps
      FROM public.exercise_entry_sets s
      JOIN public.exercise_entries e ON s.exercise_entry_id = e.id
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
        COALESCE(SUM(s.weight * s.reps), 0) as total_volume
      FROM public.exercise_entry_sets s
      JOIN public.exercise_entries e ON s.exercise_entry_id = e.id
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
      whereClauses.push(`(
        (distance IS NOT NULL AND distance > 0)
        OR LOWER(COALESCE(category, '')) IN ('cardio', 'running', 'cycling', 'walking', 'swimming', 'endurance', 'garmin')
        OR LOWER(exercise_name) ~ '(run|walk|cycle|swim|hike|treadmill|elliptical|rower|garmin|cardio)'
      )`);
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
          source: row.source ? String(row.source) : null,
          notes: row.notes ? String(row.notes) : null,
          hasGpsTrack: row.has_gps_track === true,
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

    // One LATERAL query for every distance standard rather than a query per
    // standard in a loop — same best-per-band result, a single round trip.
    const standardEntries = Object.entries(DISTANCE_STANDARDS);
    const standardsValues = standardEntries
      .map(
        (_, i) =>
          `($${i * 3 + 2}, $${i * 3 + 3}::numeric, $${i * 3 + 4}::numeric)`
      )
      .join(', ');
    // Sport is not a column — it has to be recovered per row from the provider
    // blob, notes, or name (see classifyActivitySport). So the LATERAL returns
    // the fastest PR_CANDIDATES_PER_STANDARD rows per band instead of a single
    // winner, and the best-per-sport is reduced in TS below. A sport would need
    // that many faster efforts from other sports in the same band, with none of
    // its own, to be crowded out.
    const prSql = `
      WITH standards(std_key, min_km, max_km) AS (VALUES ${standardsValues})
      SELECT s.std_key, e.id, e.exercise_name, e.category, e.notes, e.entry_date,
             e.duration_minutes, e.distance, e.provider_name, e.detail_data,
             e.exercise_source_id
      FROM standards s
      CROSS JOIN LATERAL (
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
        WHERE ee.user_id = $1
          AND ee.distance >= s.min_km AND ee.distance <= s.max_km
          AND ee.duration_minutes > 0
          AND ee.exercise_name != 'Active Calories'
        ORDER BY (ee.duration_minutes * 60 / NULLIF(ee.distance, 0)) ASC
        LIMIT ${PR_CANDIDATES_PER_STANDARD}
      ) e
    `;
    const prResult = await client.query(prSql, [
      targetUserId,
      ...standardEntries.flatMap(([key, config]) => [
        key,
        config.min,
        config.max,
      ]),
    ]);

    // Reduce to the fastest row per (sport group, standard) by comparing paces
    // rather than trusting arrival order. The ORDER BY inside the LATERAL only
    // decides which rows that invocation returns; the outer query has no
    // ORDER BY, so Postgres may emit them in any order under a parallel or
    // materialized plan. Taking "first row seen" would then record a slower
    // effort as the PR — the exact class of wrong record this endpoint exists
    // to stop.
    const bestBySportAndStandard = new Map<string, PrCandidate>();
    for (const row of prResult.rows as PrCandidateRow[]) {
      const distKm = parseFloat(String(row.distance));
      const durMins = parseFloat(String(row.duration_minutes));
      // The SQL already excludes non-positive values; this also drops any row
      // whose numerics fail to parse, so a NaN pace can never win a band.
      if (!(distKm > 0) || !(durMins > 0)) continue;
      const paceSeconds = (durMins * 60) / distKm;
      const { sport, confidence } = classifyActivitySport({
        exerciseName: row.exercise_name,
        category: row.category,
        notes: row.notes,
        providerName: row.provider_name,
        detailData: row.detail_data,
        exerciseSourceId: row.exercise_source_id,
      });
      const key = `${toPrSportGroup(sport)}:${String(row.std_key)}`;
      const current = bestBySportAndStandard.get(key);
      if (!current || paceSeconds < current.paceSeconds) {
        bestBySportAndStandard.set(key, {
          row,
          sport,
          confidence,
          paceSeconds,
        });
      }
    }

    for (const sportGroup of PR_SPORT_GROUPS) {
      for (const [stdKey, stdConfig] of standardEntries) {
        const candidate = bestBySportAndStandard.get(`${sportGroup}:${stdKey}`);
        if (!candidate) continue;
        const bestRow = candidate.row;
        const distKm = parseFloat(String(bestRow.distance));
        const durMins = parseFloat(String(bestRow.duration_minutes));
        const totalSecs = Math.round(durMins * 60);
        const paceSecs = Math.round(totalSecs / distKm);
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
          s.weight * (1 + s.reps / 30.0) as estimated_one_rm,
          s.weight as weight_kg,
          s.reps as reps,
          e.entry_date as achieved_on
        FROM public.exercise_entry_sets s
        JOIN public.exercise_entries e ON s.exercise_entry_id = e.id
        WHERE e.user_id = $1 AND s.weight > 0 AND s.reps > 0
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
        AVG(distance) as avg_distance_km,
        MIN(duration_minutes) as min_duration
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
      const minDurMins = parseFloat(String(row.min_duration || '0'));
      const courseKey = String(row.course_key);

      const recentSql = `
        SELECT id, exercise_name, entry_date, duration_minutes, distance, avg_heart_rate
        FROM public.exercise_entries
        WHERE user_id = $1 AND LOWER(exercise_name) = $2
        ORDER BY entry_date DESC
        LIMIT 5
      `;
      const recentRes = await client.query(recentSql, [
        targetUserId,
        courseKey,
      ]);

      const recentActivities = recentRes.rows.map((act: SqlRow) => {
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

      // bestPace: find the best (fastest) pace across recent activities
      // using each activity's own duration and distance so it's a real pace
      let bestPaceSecs = 0;
      for (const act of recentRes.rows) {
        const dKm = parseFloat(String(act.distance || '0'));
        const dMins = parseFloat(String(act.duration_minutes || '0'));
        if (dKm > 0) {
          const pace = Math.round((dMins * 60) / dKm);
          if (bestPaceSecs === 0 || pace < bestPaceSecs) {
            bestPaceSecs = pace;
          }
        }
      }

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
        totalDistanceMeters: Math.round(avgDistKm * 1000),
        avgDistanceFormatted: convertDistance(avgDistKm, unitSystem),
        activityCount: parseInt(String(row.activity_count), 10),
        bestTimeSeconds: Math.round(minDurMins * 60),
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
