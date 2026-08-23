import type { PoolClient } from 'pg';
import { log } from '../../config/logging.js';
import { getClient } from '../../db/poolManager.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import exercisePresetEntryRepository from '../../models/exercisePresetEntryRepository.js';
import workoutPresetRepository from '../../models/workoutPresetRepository.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import * as workoutTelemetryRepo from '../../models/workoutTelemetryRepository.js';
import { todayInZone } from '@workspace/shared';
import { getOrCreateGarminExercise } from './garminExerciseMapper.js';
import {
  extractGarminLaps,
  extractGarminGpsPoints,
  extractGarminHrZones,
  extractGarminTelemetryFields,
  findGroupForTimestamp,
  ExtractedLap,
  ExtractedGpsPoint,
  UnknownRecord,
} from './garminTelemetryExtractors.js';

// Minimal shapes for the Garmin Connect JSON this processor actually reads.
// Payloads arrive as untyped JSON from SparkyFitnessGarmin; anything not
// listed here flows through to the telemetry extractors untouched.
type GarminExerciseSetDto = {
  setType?: string;
  duration?: number;
  weight?: number;
  repetitionCount?: number;
  startTime?: string | number;
  notes?: string;
  exercises?: Array<{ name?: string; category?: string }>;
  category?: string;
  stepIndex?: number;
  wktStepId?: number;
};

type GarminActivityDto = {
  activityId?: number | string;
  activityName?: string;
  startTimeLocal?: string;
  notes?: string;
  active_calories?: number;
  calories?: number;
  duration?: number;
  steps?: number;
  totalSteps?: number;
  stepCount?: number;
  distance?: number;
  averageHR?: number;
  averageHeartRateInBeatsPerMinute?: number;
  waterEstimated?: number;
  activityType?: { typeKey?: string };
  summarizedExerciseSets?: unknown[];
};

export type GarminSessionData = {
  activity: GarminActivityDto;
  exercise_sets?: { exerciseSets?: GarminExerciseSetDto[] };
  details?: {
    activityDetailMetrics?: Array<{ metrics?: Array<number | null> }>;
    metricDescriptors?: Array<{ key?: string; metricsIndex?: number }>;
  };
};

export type GarminSimpleActivityData = {
  activity: GarminActivityDto;
  exercise_sets?:
    | { exerciseSets?: GarminExerciseSetDto[] }
    | GarminExerciseSetDto[];
  exerciseSets?: GarminExerciseSetDto[];
};

type GarminWorkoutStepDto = {
  type?: string;
  workoutSteps?: GarminWorkoutStepDto[];
  exerciseName?: string;
  category?: string;
  description?: string;
  stepType?: { stepTypeKey?: string };
  endConditionValue?: number;
  weightValue?: number;
  weightUnit?: { unitKey?: string };
};

export type GarminWorkoutDefinitionDto = {
  workoutName?: string;
  description?: string;
  workoutSegments?: Array<{ workoutSteps?: GarminWorkoutStepDto[] }>;
};

interface SessionSetRow {
  set_number: number;
  set_type: string;
  reps: number;
  weight: number;
  duration: number;
  rest_time: number;
  notes: string;
}

interface SessionExerciseGroup {
  name: string;
  stepIndex: number | null;
  exerciseDetails: { category: string };
  sets: SessionSetRow[];
  totalDuration: number;
  activeDuration: number;
  startTime: number | null;
  endTime: number | null;
}

/**
 * Distributes extracted laps/GPS points across the exercise entries created for a
 * strength session, by matching each item's timestamp to the entry whose active-set
 * time window contains it (falling back to the first entry). Then bulk-inserts each
 * telemetry type in a single call rather than once per entry.
 */
async function attachSessionTelemetry(
  client: PoolClient,
  userId: string,
  entryDate: string,
  groups: Array<{ id: string; startMs: number | null; endMs: number | null }>,
  laps: ExtractedLap[],
  gpsPoints: ExtractedGpsPoint[]
) {
  if (groups.length === 0) return;

  if (laps.length > 0) {
    const lapRows = laps.map((lap) => {
      const group = findGroupForTimestamp(groups, lap.startMs);
      const { startMs: _startMs, endMs: _endMs, ...lapFields } = lap;
      return {
        user_id: userId,
        exercise_entry_id: (group ?? groups[0]).id,
        entry_date: entryDate,
        ...lapFields,
      };
    });
    await workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient(
      client,
      userId,
      lapRows
    );
  }

  if (gpsPoints.length > 0) {
    const gpsRows = gpsPoints.map((pt) => {
      const group = findGroupForTimestamp(groups, pt.timestampMs);
      const { timestampMs: _timestampMs, ...ptFields } = pt;
      return {
        user_id: userId,
        exercise_entry_id: (group ?? groups[0]).id,
        entry_date: entryDate,
        ...ptFields,
      };
    });
    await workoutTelemetryRepo._bulkInsertExerciseEntryGpsPointsWithClient(
      client,
      userId,
      gpsRows
    );
  }
}

/**
 * Writes HR time-in-zone splits. Garmin only reports this per whole activity, not per
 * exercise, so it's attached to the first exercise entry of the session (or the single
 * entry for a simple activity) rather than duplicated or arbitrarily split.
 */
async function attachHrZones(
  client: PoolClient,
  userId: string,
  entryDate: string,
  exerciseEntryId: string,
  payload: UnknownRecord
) {
  const zones = extractGarminHrZones(payload);
  if (zones.length === 0) return;
  await workoutTelemetryRepo._bulkInsertExerciseEntryHrZonesWithClient(
    client,
    userId,
    zones.map((zone) => ({
      user_id: userId,
      exercise_entry_id: exerciseEntryId,
      entry_date: entryDate,
      ...zone,
    }))
  );
}

export async function processActivitiesAndWorkouts(
  userId: string,
  data: { activities?: unknown[]; workouts?: unknown[] },
  startDate: string,
  endDate: string,
  timezone = 'UTC'
) {
  const { activities, workouts } = data;
  let processedCount = 0;
  log(
    'info',
    `[garminActivityProcessor] Performing comprehensive cleanup for Garmin data for user ${userId} from ${startDate} to ${endDate}.`
  );
  // One transaction around the range delete and every re-created entry:
  // committing the delete first and then failing part-way through the
  // re-creates would wipe the user's whole synced range until the next
  // successful sync (fitImportService.ts follows the same unit-of-work rule
  // for FIT uploads). Library rows — exercises via getOrCreateGarminExercise
  // and workout presets — are written outside it: they are get-or-create
  // lookups whose survival after a rollback is harmless.
  const client = await getClient(userId, userId);
  try {
    await client.query('BEGIN');
    await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDateWithClient(
      client,
      userId,
      startDate,
      endDate,
      'garmin',
      'Active Calories'
    );
    await exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDateWithClient(
      client,
      userId,
      startDate,
      endDate,
      'garmin'
    );

    // Process Activities and Workouts
    if (activities && Array.isArray(activities)) {
      for (const activityData of activities) {
        const act = activityData as Record<string, Record<string, unknown>>;
        const hasSummarizedSets =
          Array.isArray(act.activity?.['summarizedExerciseSets']) &&
          (act.activity['summarizedExerciseSets'] as unknown[]).length > 0;
        const hasExerciseSets =
          Array.isArray(act.exercise_sets?.['exerciseSets']) &&
          (act.exercise_sets['exerciseSets'] as unknown[]).length > 0;

        if (hasSummarizedSets || hasExerciseSets) {
          await processGarminWorkoutSession(
            userId,
            activityData as GarminSessionData,
            client,
            timezone
          );
        } else if (act.activity) {
          await processGarminSimpleActivity(
            userId,
            activityData as GarminSimpleActivityData,
            client,
            timezone
          );
        }
        processedCount++;
      }
    }

    // Process standalone Workouts (definitions)
    if (workouts && Array.isArray(workouts)) {
      for (const workoutData of workouts) {
        await processGarminWorkoutDefinition(
          userId,
          workoutData as GarminWorkoutDefinitionDto
        );
        processedCount++;
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { processedEntries: processedCount };
}

export async function processGarminWorkoutSession(
  userId: string,
  sessionData: GarminSessionData,
  client: PoolClient,
  timezone = 'UTC'
) {
  const { activity, exercise_sets } = sessionData;
  const workoutName = activity.activityName || 'Garmin Workout Session';
  const entryDate = activity.startTimeLocal
    ? activity.startTimeLocal.substring(0, 10)
    : todayInZone(timezone);
  const entryTime =
    activity.startTimeLocal && activity.startTimeLocal.length >= 16
      ? activity.startTimeLocal.substring(11, 16)
      : null;

  const details = sessionData.details || {};
  const activityDetailMetrics = details.activityDetailMetrics || [];
  const metricDescriptors = details.metricDescriptors || [];

  const hrIndex = metricDescriptors.findIndex(
    (desc) => desc.key === 'directHeartRate'
  );
  const timestampIndex = metricDescriptors.findIndex(
    (desc) => desc.key === 'directTimestamp'
  );

  let workoutPreset = await workoutPresetRepository.getWorkoutPresetByName(
    userId,
    workoutName
  );
  const isNewWorkoutPreset = !workoutPreset;
  if (isNewWorkoutPreset) {
    workoutPreset = await workoutPresetRepository.createWorkoutPreset({
      user_id: userId,
      name: workoutName,
      description:
        activity.notes || `Workout session from Garmin: ${workoutName}`,
      is_public: false,
    });
  }

  const exercisePresetEntryData = {
    user_id: userId,
    workout_preset_id: workoutPreset.id,
    name: workoutName,
    description: activity.notes || `Logged session of ${workoutName}`,
    entry_date: entryDate,
    created_by_user_id: userId,
    notes: `Garmin Workout Session: ${workoutName}`,
    source: 'garmin',
    steps: activity.steps || activity.totalSteps || activity.stepCount || 0,
  };

  const newExercisePresetEntry =
    await exercisePresetEntryRepository.createExercisePresetEntryWithClient(
      client,
      userId,
      exercisePresetEntryData,
      userId
    );

  await activityDetailsRepository._createActivityDetailWithClient(client, {
    exercise_preset_entry_id: newExercisePresetEntry.id,
    provider_name: 'garmin',
    detail_type: 'full_activity_data',
    detail_data: sessionData,
    created_by_user_id: userId,
  });

  const rawSummarizedSets = Array.isArray(activity.summarizedExerciseSets)
    ? (activity.summarizedExerciseSets as Array<Record<string, unknown>>)
    : [];

  const groupedExercises: SessionExerciseGroup[] = [];
  let totalActiveDurationSeconds = 0;
  const activeSetsWithStartAndEndTimes: Array<{
    set: SessionSetRow;
    startTime: number;
    endTime: number;
    garminSetIndex: number;
  }> = [];

  if (
    exercise_sets &&
    Array.isArray(exercise_sets.exerciseSets) &&
    exercise_sets.exerciseSets.length > 0
  ) {
    let currentGroup: SessionExerciseGroup | null = null;

    for (let i = 0; i < exercise_sets.exerciseSets.length; i++) {
      const garminSet = exercise_sets.exerciseSets[i];
      let garminExerciseName: string | null = null;
      let garminCategory = 'Uncategorized';

      if (garminSet.exercises && garminSet.exercises.length > 0) {
        garminExerciseName =
          garminSet.exercises[0].name ||
          garminSet.exercises[0].category ||
          null;
        garminCategory = garminSet.exercises[0].category || 'Uncategorized';
      } else if (garminSet.category) {
        garminExerciseName = garminSet.category;
        garminCategory = garminSet.category;
      }

      // Fallback 1: check summarizedExerciseSets if available
      if (
        (!garminExerciseName ||
          garminExerciseName === garminCategory ||
          garminExerciseName === 'Uncategorized') &&
        rawSummarizedSets.length > 0
      ) {
        const setCategory =
          (garminSet.category as string | undefined) ||
          (garminSet.exercises?.[0]?.category as string | undefined) ||
          garminCategory;
        const setSubCategory =
          ((garminSet as Record<string, unknown>).subCategory as
            | string
            | undefined) ||
          (garminSet.exercises?.[0]?.name as string | undefined);

        const matchingSumSet =
          (rawSummarizedSets.length === 1
            ? rawSummarizedSets[0]
            : rawSummarizedSets.find((sum) => {
                if (!sum || typeof sum !== 'object') return false;
                const sumCat = (sum as Record<string, unknown>).category;
                const sumSubCat = (sum as Record<string, unknown>).subCategory;
                return (
                  (setSubCategory && sumSubCat === setSubCategory) ||
                  (setCategory && sumCat === setCategory)
                );
              })) || (currentGroup ? null : rawSummarizedSets[0]);

        if (matchingSumSet && typeof matchingSumSet === 'object') {
          const sumRecord = matchingSumSet as Record<string, unknown>;
          garminExerciseName =
            (typeof sumRecord.subCategory === 'string' &&
              sumRecord.subCategory) ||
            (typeof sumRecord.category === 'string' && sumRecord.category) ||
            (typeof sumRecord.exerciseName === 'string' &&
              sumRecord.exerciseName) ||
            (typeof sumRecord.name === 'string' && sumRecord.name) ||
            null;
          if (typeof sumRecord.category === 'string') {
            garminCategory = sumRecord.category;
          }
        }
      }

      // Fallback 2: currentGroup name for rest/transition sets
      if (
        !garminExerciseName &&
        currentGroup &&
        garminSet.setType !== 'ACTIVE'
      ) {
        garminExerciseName = currentGroup.name;
        garminCategory =
          currentGroup.exerciseDetails.category || 'Uncategorized';
      } else if (!garminExerciseName) {
        garminExerciseName = 'Unknown Exercise';
      }

      if (garminExerciseName) {
        const stepIndex = garminSet.stepIndex || garminSet.wktStepId || null;
        if (
          !currentGroup ||
          currentGroup.name !== garminExerciseName ||
          (stepIndex !== null &&
            currentGroup.stepIndex !== null &&
            currentGroup.stepIndex !== stepIndex)
        ) {
          currentGroup = {
            name: garminExerciseName,
            stepIndex: stepIndex,
            exerciseDetails: { category: garminCategory },
            sets: [],
            totalDuration: 0,
            activeDuration: 0,
            startTime: null,
            endTime: null,
          };
          groupedExercises.push(currentGroup);
        }

        const setTypeMapping: Record<string, string> = {
          ACTIVE: 'Working Set',
          REST: 'Rest Set',
          WARM_UP: 'Warm-up Set',
        };
        const setType =
          setTypeMapping[garminSet.setType ?? ''] || 'Working Set';

        const durationSeconds = garminSet.duration
          ? Math.round(garminSet.duration)
          : 0;
        // Garmin's raw exerciseSets[].weight is grams, as the field's shape suggests.
        // Verified directly against a real synced set: raw 12473 -> 12.47kg -> 27.5lbs,
        // matching Garmin Connect's own displayed volume (275lbs / 10 reps) exactly.
        // A previous version of this line incorrectly divided by 2.204622 again here,
        // based on comparing against WorkoutSessionBreakdown.tsx's display, which had
        // its own separate double-conversion bug (now fixed) — that made it look like
        // this raw value needed a second lb->kg correction when it didn't.
        const weightKg = garminSet.weight
          ? parseFloat((garminSet.weight * 0.001).toFixed(2))
          : 0;

        if (garminSet.setType !== 'REST') {
          const currentSet = {
            set_number: currentGroup.sets.length + 1,
            set_type: setType,
            reps: Math.round(garminSet.repetitionCount || 0),
            weight: weightKg,
            duration: durationSeconds,
            rest_time: 0,
            notes: garminSet.notes || '',
          };
          currentGroup.sets.push(currentSet);

          if (garminSet.setType === 'ACTIVE') {
            currentGroup.totalDuration += durationSeconds;
            currentGroup.activeDuration += durationSeconds;
            totalActiveDurationSeconds += durationSeconds;
            const setStartTime = new Date(garminSet.startTime ?? NaN).getTime();
            const setEndTime = setStartTime + durationSeconds * 1000;
            if (
              !currentGroup.startTime ||
              setStartTime < currentGroup.startTime
            ) {
              currentGroup.startTime = setStartTime;
            }
            if (!currentGroup.endTime || setEndTime > currentGroup.endTime) {
              currentGroup.endTime = setEndTime;
            }
            activeSetsWithStartAndEndTimes.push({
              set: currentSet,
              startTime: setStartTime,
              endTime: setEndTime,
              garminSetIndex: i,
            });
          }
        } else {
          currentGroup.totalDuration += durationSeconds;
        }
      }
    }

    for (let i = 0; i < activeSetsWithStartAndEndTimes.length; i++) {
      const currentActiveSetInfo = activeSetsWithStartAndEndTimes[i];
      const currentSet = currentActiveSetInfo.set;
      let nextActiveSetInfo: { startTime: number; duration: number } | null =
        null;
      for (
        let j = currentActiveSetInfo.garminSetIndex + 1;
        j < exercise_sets.exerciseSets.length;
        j++
      ) {
        const potentialNextGarminSet = exercise_sets.exerciseSets[j];
        if (
          potentialNextGarminSet.setType === 'ACTIVE' &&
          potentialNextGarminSet.exercises &&
          potentialNextGarminSet.exercises.length > 0
        ) {
          const nextSetStartTime = new Date(
            potentialNextGarminSet.startTime ?? NaN
          ).getTime();
          const nextSetDuration = potentialNextGarminSet.duration
            ? Math.round(potentialNextGarminSet.duration)
            : 0;
          nextActiveSetInfo = {
            startTime: nextSetStartTime,
            duration: nextSetDuration,
          };
          break;
        } else if (potentialNextGarminSet.setType === 'REST') {
          const restDuration = potentialNextGarminSet.duration
            ? Math.round(potentialNextGarminSet.duration)
            : 0;
          if (restDuration > 0) {
            currentSet.rest_time = restDuration;
            break;
          }
        }
      }
      if (nextActiveSetInfo) {
        const timeBetweenSets =
          (nextActiveSetInfo.startTime - currentActiveSetInfo.endTime) / 1000;
        if (timeBetweenSets > 0) {
          currentSet.rest_time = Math.round(timeBetweenSets);
        }
      }
    }
  } else if (rawSummarizedSets.length > 0) {
    // Fallback path: synthesize grouped exercises from summarizedExerciseSets
    for (let i = 0; i < rawSummarizedSets.length; i++) {
      const sumSet = rawSummarizedSets[i];
      const sumName =
        (typeof sumSet.subCategory === 'string' && sumSet.subCategory) ||
        (typeof sumSet.category === 'string' && sumSet.category) ||
        (typeof sumSet.name === 'string' && sumSet.name) ||
        (typeof sumSet.exerciseName === 'string' && sumSet.exerciseName) ||
        workoutName ||
        'Strength Exercise';
      const sumCategory =
        (typeof sumSet.category === 'string' && sumSet.category) || 'strength';
      const setsCount = Math.max(1, Number(sumSet.sets) || 1);
      const totalReps =
        Number(sumSet.reps) || Number(sumSet.repetitionCount) || 0;
      const repsPerSet =
        Math.max(1, Math.round(totalReps / setsCount)) ||
        (totalReps > 0 ? totalReps : 10);
      const totalDuration = Number(sumSet.duration) || 0;
      const durationPerSet = Math.round(totalDuration / setsCount);
      const volumeGrams = Number(sumSet.volume) || 0;
      const rawWeight = Number(sumSet.weight) || 0;
      let weightKg = 0;
      if (volumeGrams > 0 && totalReps > 0) {
        weightKg = parseFloat(((volumeGrams / totalReps) * 0.001).toFixed(2));
      } else if (rawWeight > 0) {
        weightKg = parseFloat((rawWeight * 0.001).toFixed(2));
      }

      const sets: SessionSetRow[] = [];
      for (let s = 1; s <= setsCount; s++) {
        sets.push({
          set_number: s,
          set_type: 'Working Set',
          reps: repsPerSet,
          weight: weightKg,
          duration: durationPerSet,
          rest_time: 0,
          notes: '',
        });
      }

      groupedExercises.push({
        name: sumName,
        stepIndex: i,
        exerciseDetails: { category: sumCategory },
        sets,
        totalDuration: totalDuration || setsCount * 60,
        activeDuration: totalDuration || setsCount * 60,
        startTime: null,
        endTime: null,
      });
      totalActiveDurationSeconds += totalDuration || setsCount * 60;
    }
  }

  if (groupedExercises.length > 0) {
    let exerciseSortOrder = 0;
    // Collected across the whole loop so laps/GPS/HR-zones can be attached once, after
    // every exercise entry in the session exists, instead of only ever landing on the
    // first exercise (exerciseSortOrder === 0) the way the previous implementation did.
    const createdGroups: Array<{
      id: string;
      startMs: number | null;
      endMs: number | null;
    }> = [];
    for (const group of groupedExercises) {
      const rawExerciseName = group.name;
      const {
        exerciseDetails,
        sets,
        totalDuration,
        activeDuration,
        startTime,
        endTime,
      } = group;

      const exercise = await getOrCreateGarminExercise(
        userId,
        rawExerciseName,
        exerciseDetails.category
      );

      const exerciseName = exercise.name;
      let perExerciseCaloriesBurned = 0;
      if (totalActiveDurationSeconds > 0 && activity.active_calories) {
        perExerciseCaloriesBurned =
          (activeDuration / totalActiveDurationSeconds) *
          activity.active_calories;
      }
      let perExerciseAvgHeartRate: number | null = null;
      if (hrIndex !== -1 && timestampIndex !== -1 && startTime && endTime) {
        let heartRateSum = 0;
        let heartRateCount = 0;
        for (const metric of activityDetailMetrics) {
          const metricTimestamp = metric.metrics?.[timestampIndex];
          const heartRate = metric.metrics?.[hrIndex];
          if (
            metricTimestamp !== undefined &&
            metricTimestamp !== null &&
            heartRate !== undefined &&
            heartRate !== null &&
            metricTimestamp >= startTime &&
            metricTimestamp <= endTime
          ) {
            heartRateSum += heartRate;
            heartRateCount++;
          }
        }
        if (heartRateCount > 0) {
          perExerciseAvgHeartRate = Math.round(heartRateSum / heartRateCount);
        }
      }
      const exerciseEntryData = {
        exercise_id: exercise.id,
        duration_minutes: totalDuration / 60,
        work_time_seconds: activeDuration || null,
        calories_burned: Math.round(perExerciseCaloriesBurned),
        entry_date: entryDate,
        entry_time: entryTime,
        notes: `Garmin Exercise: ${exerciseName}`,
        sets: sets,
        exercise_preset_entry_id: newExercisePresetEntry.id,
        avg_heart_rate: perExerciseAvgHeartRate
          ? Math.round(perExerciseAvgHeartRate)
          : null,
        source_id: activity.activityId
          ? `${activity.activityId}_${exerciseSortOrder}`
          : null,
        steps: Math.round(
          activity.steps || activity.totalSteps || activity.stepCount || 0
        ),
      };
      const { entry: newEntry } =
        await exerciseEntryRepository._createExerciseEntryWithClient(
          client,
          userId,
          { ...exerciseEntryData, sort_order: exerciseSortOrder },
          userId,
          'garmin',
          newExercisePresetEntry.id
        );

      if (!newEntry || !newEntry.id) {
        log(
          'warn',
          `[garminActivityProcessor] Could not create exercise entry for exercise ${exerciseName} in workout session.`
        );
        continue;
      }

      createdGroups.push({
        id: newEntry.id,
        startMs: startTime ?? null,
        endMs: endTime ?? null,
      });

      await workoutPresetRepository.addExerciseToWorkoutPreset(
        userId,
        workoutPreset.id,
        exercise.id,
        null,
        sets,
        exerciseSortOrder
      );
      exerciseSortOrder++;
    }

    const sessionLaps = extractGarminLaps(sessionData);
    const sessionGpsPoints = extractGarminGpsPoints(sessionData);
    await attachSessionTelemetry(
      client,
      userId,
      entryDate,
      createdGroups,
      sessionLaps,
      sessionGpsPoints
    );
    if (createdGroups.length > 0) {
      await attachHrZones(
        client,
        userId,
        entryDate,
        createdGroups[0].id,
        sessionData
      );
    }
  }
}

export async function processGarminWorkoutDefinition(
  userId: string,
  workoutData: GarminWorkoutDefinitionDto
) {
  const workoutName = workoutData.workoutName || 'Garmin Workout Definition';
  const description =
    workoutData.description || `Workout definition from Garmin: ${workoutName}`;
  let workoutPreset = await workoutPresetRepository.getWorkoutPresetByName(
    userId,
    workoutName
  );
  if (!workoutPreset) {
    workoutPreset = await workoutPresetRepository.createWorkoutPreset({
      user_id: userId,
      name: workoutName,
      description: description,
      is_public: false,
    });
  }
  if (
    workoutData.workoutSegments &&
    Array.isArray(workoutData.workoutSegments)
  ) {
    let exerciseSortOrder = 0;
    for (const segment of workoutData.workoutSegments) {
      if (segment.workoutSteps && Array.isArray(segment.workoutSteps)) {
        for (const step of segment.workoutSteps) {
          const stepsToProcess =
            step.type === 'RepeatGroupDTO' ? (step.workoutSteps ?? []) : [step];
          for (const individualStep of stepsToProcess) {
            if (
              individualStep.type === 'ExecutableStepDTO' &&
              individualStep.exerciseName
            ) {
              const garminExerciseName = individualStep.exerciseName;
              const exercise = await getOrCreateGarminExercise(
                userId,
                garminExerciseName,
                individualStep.category
              );

              // Workout *preset* steps carry their own unit on weightUnit.unitKey,
              // unlike the raw exerciseSets[].weight paths above/below (which are
              // always grams). Only convert when Garmin actually says pounds —
              // converting unconditionally stored ~45% of the true load for
              // accounts configured in kilograms. WorkoutReportVisualizer.tsx
              // reads the same DTO shape and must stay in sync with this.
              const stepWeightKg = individualStep.weightValue
                ? individualStep.weightUnit?.unitKey === 'pound'
                  ? individualStep.weightValue * 0.453592
                  : individualStep.weightValue
                : 0;

              const sets = [
                {
                  set_number: 1,
                  set_type: individualStep.stepType?.stepTypeKey,
                  reps: individualStep.endConditionValue || 0,
                  weight: stepWeightKg,
                  duration: 0,
                  rest_time: 0,
                  notes: individualStep.description || '',
                },
              ];
              await workoutPresetRepository.addExerciseToWorkoutPreset(
                userId,
                workoutPreset.id,
                exercise.id,
                null,
                sets,
                exerciseSortOrder
              );
              exerciseSortOrder++;
            }
          }
        }
      }
    }
  }
}

export async function processGarminSimpleActivity(
  userId: string,
  activityData: GarminSimpleActivityData,
  client: PoolClient,
  timezone = 'UTC'
) {
  const { activity } = activityData;
  const garminExerciseName =
    activity.activityType?.typeKey || 'Garmin Activity';

  const exercise = await getOrCreateGarminExercise(
    userId,
    garminExerciseName,
    activity.activityType?.typeKey
  );

  const entryDate = activity.startTimeLocal
    ? activity.startTimeLocal.substring(0, 10)
    : todayInZone(timezone);
  const entryTime =
    activity.startTimeLocal && activity.startTimeLocal.length >= 16
      ? activity.startTimeLocal.substring(11, 16)
      : null;
  const telemetryFields = extractGarminTelemetryFields(activityData);

  const rawExerciseSets = Array.isArray(activityData.exercise_sets)
    ? activityData.exercise_sets
    : activityData.exercise_sets?.exerciseSets ||
      activityData.exerciseSets ||
      [];
  let extractedSets: SessionSetRow[] = [];
  if (Array.isArray(rawExerciseSets) && rawExerciseSets.length > 0) {
    const setTypeMapping: Record<string, string> = {
      ACTIVE: 'Working Set',
      REST: 'Rest',
      WARM_UP: 'Warm-up Set',
      COOL_DOWN: 'Cool-down Set',
    };
    extractedSets = rawExerciseSets
      .filter((s) => s && s.setType !== 'REST')
      .map((s, idx) => ({
        set_number: idx + 1,
        set_type: setTypeMapping[s.setType ?? ''] || 'Working Set',
        reps: Math.round(s.repetitionCount || 0),
        // See the matching comment on the workout-session path above: Garmin's raw
        // weight field is grams, no further lb->kg correction needed.
        weight: s.weight ? parseFloat((s.weight * 0.001).toFixed(2)) : 0,
        duration: s.duration ? Math.round(s.duration) : 0,
        rest_time: 0,
        notes: s.notes || '',
      }));
  }

  const exerciseEntryData = {
    exercise_id: exercise.id,
    exercise_name: activity.activityName || garminExerciseName,
    duration_minutes: activity.duration || 0,
    calories_burned: Math.round(
      activity.active_calories || activity.calories || 0
    ),
    entry_date: entryDate,
    entry_time: entryTime,
    notes: `Garmin Activity: ${activity.activityName} (${activity.activityType?.typeKey})`,
    distance: activity.distance,
    avg_heart_rate:
      activity.averageHR || activity.averageHeartRateInBeatsPerMinute
        ? Math.round(
            activity.averageHR || activity.averageHeartRateInBeatsPerMinute || 0
          )
        : null,
    source_id: activity.activityId?.toString() ?? null,
    steps: Math.round(
      activity.steps || activity.totalSteps || activity.stepCount || 0
    ),
    water_estimated: activity.waterEstimated
      ? Math.round(activity.waterEstimated)
      : null,
    ...telemetryFields,
    sets: extractedSets,
  };
  const { entry: newEntry } =
    await exerciseEntryRepository._createExerciseEntryWithClient(
      client,
      userId,
      exerciseEntryData,
      userId,
      'garmin'
    );
  await activityDetailsRepository._createActivityDetailWithClient(client, {
    exercise_entry_id: newEntry.id,
    provider_name: 'garmin',
    detail_type: 'full_activity_data',
    detail_data: activityData,
    created_by_user_id: userId,
  });

  const laps = extractGarminLaps(activityData);
  if (laps.length > 0) {
    await workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient(
      client,
      userId,
      laps.map(({ startMs: _startMs, endMs: _endMs, ...lap }) => ({
        user_id: userId,
        exercise_entry_id: newEntry.id,
        entry_date: entryDate,
        ...lap,
      }))
    );
  }

  const gpsPoints = extractGarminGpsPoints(activityData);
  if (gpsPoints.length > 0) {
    await workoutTelemetryRepo._bulkInsertExerciseEntryGpsPointsWithClient(
      client,
      userId,
      gpsPoints.map(({ timestampMs: _timestampMs, ...pt }) => ({
        user_id: userId,
        exercise_entry_id: newEntry.id,
        entry_date: entryDate,
        ...pt,
      }))
    );
  }

  await attachHrZones(client, userId, entryDate, newEntry.id, activityData);
}
