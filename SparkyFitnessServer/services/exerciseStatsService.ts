import { getClient } from '../db/poolManager.js';
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

/** Distance standards in kilometers */
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
      endDateStr = now.toISOString().slice(0, 10);
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
      startDateStr = start.toISOString().slice(0, 10);
    }

    const totalSql = `
      SELECT 
        COALESCE(SUM(COALESCE(distance, 0)), 0) as total_distance_km,
        COALESCE(SUM(duration_minutes), 0) as total_duration_minutes,
        COALESCE(SUM(calories_burned), 0) as total_calories_burned,
        COUNT(DISTINCT id) as workout_count,
        AVG(avg_heart_rate) as avg_heart_rate
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
    `;
    const strengthResult = await client.query(strengthSql, [
      targetUserId,
      startDateStr,
      endDateStr,
    ]);
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
    const breakdownSql = `
      SELECT 
        DATE_TRUNC('${truncUnit}', entry_date) as period_start,
        COALESCE(SUM(COALESCE(distance, 0)), 0) as distance_km,
        COALESCE(SUM(duration_minutes), 0) as duration_minutes,
        COALESCE(SUM(calories_burned), 0) as calories_burned,
        COUNT(DISTINCT id) as workout_count,
        AVG(avg_heart_rate) as avg_heart_rate
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
    const intervalsBreakdown = breakdownResult.rows.map((row: SqlRow) => {
      const dKm = parseFloat(String(row.distance_km || '0'));
      const pDate = new Date(String(row.period_start));
      const label =
        interval === 'week'
          ? `Wk ${pDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : interval === 'month'
            ? pDate.toLocaleDateString('en-US', {
                month: 'short',
                year: '2-digit',
              })
            : pDate.toISOString().slice(0, 10);

      return {
        label,
        startDate: pDate.toISOString().slice(0, 10),
        endDate: pDate.toISOString().slice(0, 10),
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
        totalElevationGainMeters: 0,
        movingDurationMinutes: parseFloat(String(row.duration_minutes || '0')),
        totalLiftedVolumeKg: 0,
      };
    });

    const startDt = new Date(startDateStr);
    const endDt = new Date(endDateStr);
    const diffDays = Math.max(
      1,
      Math.ceil((endDt.getTime() - startDt.getTime()) / (1000 * 3600 * 24))
    );

    const prevEndDt = new Date(startDt);
    prevEndDt.setDate(prevEndDt.getDate() - 1);
    const prevStartDt = new Date(prevEndDt);
    prevStartDt.setDate(prevStartDt.getDate() - diffDays);

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
      ? [
          targetUserId,
          prevStartDt.toISOString().slice(0, 10),
          prevEndDt.toISOString().slice(0, 10),
          query.category,
        ]
      : [
          targetUserId,
          prevStartDt.toISOString().slice(0, 10),
          prevEndDt.toISOString().slice(0, 10),
        ];
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

    const avgHRVal = avgHeartRate || 140;
    const hrDistribution = {
      zone1RecoverySeconds: avgHRVal < 120 ? workoutCount * 1200 : 300,
      zone2EnduranceSeconds:
        avgHRVal >= 120 && avgHRVal < 140 ? workoutCount * 1500 : 600,
      zone3AerobicSeconds:
        avgHRVal >= 140 && avgHRVal < 160 ? workoutCount * 1800 : 900,
      zone4ThresholdSeconds:
        avgHRVal >= 160 && avgHRVal < 175 ? workoutCount * 1200 : 300,
      zone5AnaerobicSeconds: avgHRVal >= 175 ? workoutCount * 600 : 100,
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
        totalElevationGainMeters: 0,
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
    const itemsSql = `
      SELECT 
        id, user_id, exercise_name, category, entry_date, entry_time,
        duration_minutes, distance, avg_heart_rate, calories_burned, source, notes
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
            ? row.entry_date.toISOString().slice(0, 10)
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
          hasGpsTrack:
            row.source === 'garmin_fit' ||
            row.source === 'strava' ||
            row.source === 'garmin',
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

    for (const [stdKey, stdConfig] of Object.entries(DISTANCE_STANDARDS)) {
      const prSql = `
        SELECT id, exercise_name, entry_date, duration_minutes, distance
        FROM public.exercise_entries
        WHERE user_id = $1 
          AND distance >= $2 AND distance <= $3
          AND duration_minutes > 0
        ORDER BY (duration_minutes * 60 / NULLIF(distance, 0)) ASC
        LIMIT 1
      `;
      const prResult = await client.query(prSql, [
        targetUserId,
        stdConfig.min,
        stdConfig.max,
      ]);

      if (prResult.rows.length > 0) {
        const bestRow: SqlRow = prResult.rows[0];
        const distKm = parseFloat(String(bestRow.distance));
        const durMins = parseFloat(String(bestRow.duration_minutes));
        const totalSecs = Math.round(durMins * 60);
        const paceSecs = Math.round(totalSecs / distKm);
        const entryDateStr =
          bestRow.entry_date instanceof Date
            ? bestRow.entry_date.toISOString().slice(0, 10)
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
          id: `pr-${stdKey}`,
          category: 'running',
          distanceStandard:
            stdKey as ExercisePersonalRecordItem['distanceStandard'],
          label: prLabel,
          bestTimeSeconds: totalSecs,
          formattedTime: formatTimeDuration(totalSecs),
          avgPaceSecondsPerKm: paceSecs,
          formattedPace: formatPace(paceSecs, unitSystem),
          activityId: String(bestRow.id),
          activityName: String(bestRow.exercise_name || 'Run'),
          achievedAt: entryDateStr,
        });
      }
    }

    if (cardioPRs.length === 0) {
      const fallbackSql = `
        SELECT id, exercise_name, entry_date, duration_minutes, distance
        FROM public.exercise_entries
        WHERE user_id = $1 AND distance > 0.5 AND duration_minutes > 0
          AND exercise_name != 'Active Calories'
        ORDER BY distance DESC, duration_minutes ASC
        LIMIT 1
      `;
      const fallbackRes = await client.query(fallbackSql, [targetUserId]);
      if (fallbackRes.rows.length > 0) {
        const bestRow: SqlRow = fallbackRes.rows[0];
        const distKm = parseFloat(String(bestRow.distance));
        const durMins = parseFloat(String(bestRow.duration_minutes));
        const totalSecs = Math.round(durMins * 60);
        const paceSecs = Math.round(totalSecs / distKm);
        const entryDateStr =
          bestRow.entry_date instanceof Date
            ? bestRow.entry_date.toISOString().slice(0, 10)
            : String(bestRow.entry_date);

        const distVal = convertDistance(distKm, unitSystem);
        const unitSuffix = unitSystem === 'imperial' ? 'mi' : 'km';

        cardioPRs.push({
          id: 'pr-longest',
          category: 'running',
          distanceStandard: 'custom',
          label: `Best Effort (${distVal} ${unitSuffix})`,
          bestTimeSeconds: totalSecs,
          formattedTime: formatTimeDuration(totalSecs),
          avgPaceSecondsPerKm: paceSecs,
          formattedPace: formatPace(paceSecs, unitSystem),
          activityId: String(bestRow.id),
          activityName: String(bestRow.exercise_name || 'Run'),
          achievedAt: entryDateStr,
        });
      }
    }

    const strengthPrSql = `
      SELECT 
        e.exercise_name,
        MAX(s.weight * (1 + s.reps / 30.0)) as estimated_one_rm,
        MAX(s.weight) as max_weight,
        MAX(s.reps) as max_reps,
        MAX(e.entry_date) as last_date
      FROM public.exercise_entry_sets s
      JOIN public.exercise_entries e ON s.exercise_entry_id = e.id
      WHERE e.user_id = $1 AND s.weight > 0
      GROUP BY e.exercise_name
      ORDER BY estimated_one_rm DESC
      LIMIT 10
    `;
    const strengthResult = await client.query(strengthPrSql, [targetUserId]);

    const strength1RMs = strengthResult.rows.map((row: SqlRow) => ({
      exerciseName: String(row.exercise_name || 'Strength Exercise'),
      estimatedOneRMKg:
        Math.round(parseFloat(String(row.estimated_one_rm || '0')) * 10) / 10,
      weightKg: parseFloat(String(row.max_weight || '0')),
      reps: parseInt(String(row.max_reps || '0'), 10),
      achievedAt:
        row.last_date instanceof Date
          ? row.last_date.toISOString().slice(0, 10)
          : String(row.last_date),
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
              ? act.entry_date.toISOString().slice(0, 10)
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
