import { log } from '../../config/logging.js';
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
} from './garminTelemetryExtractors.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

/**
 * Distributes extracted laps/GPS points across the exercise entries created for a
 * strength session, by matching each item's timestamp to the entry whose active-set
 * time window contains it (falling back to the first entry). Then bulk-inserts each
 * telemetry type in a single call rather than once per entry.
 */
async function attachSessionTelemetry(
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
    await workoutTelemetryRepo.bulkInsertExerciseEntryLaps(
      userId,
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
    await workoutTelemetryRepo.bulkInsertExerciseEntryGpsPoints(
      userId,
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
  userId: string,
  entryDate: string,
  exerciseEntryId: string,
  payload: AnyRecord
) {
  const zones = extractGarminHrZones(payload);
  if (zones.length === 0) return;
  await workoutTelemetryRepo.bulkInsertExerciseEntryHrZones(
    userId,
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
  await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(
    userId,
    startDate,
    endDate,
    'garmin'
  );
  await exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDate(
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
          activityData,
          startDate,
          endDate,
          timezone
        );
      } else if (act.activity) {
        await processGarminSimpleActivity(userId, activityData, timezone);
      }
      processedCount++;
    }
  }

  // Process standalone Workouts (definitions)
  if (workouts && Array.isArray(workouts)) {
    for (const workoutData of workouts) {
      await processGarminWorkoutDefinition(userId, workoutData);
      processedCount++;
    }
  }
  return { processedEntries: processedCount };
}

export async function processGarminWorkoutSession(
  userId: string,
  sessionData: any,
  _startDate?: string,
  _endDate?: string,
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
    (desc: any) => desc.key === 'directHeartRate'
  );
  const timestampIndex = metricDescriptors.findIndex(
    (desc: any) => desc.key === 'directTimestamp'
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
    await exercisePresetEntryRepository.createExercisePresetEntry(
      userId,
      exercisePresetEntryData,
      userId
    );

  await activityDetailsRepository.createActivityDetail(userId, {
    exercise_preset_entry_id: newExercisePresetEntry.id,
    provider_name: 'garmin',
    detail_type: 'full_activity_data',
    detail_data: sessionData,
    created_by_user_id: userId,
  });

  if (exercise_sets && Array.isArray(exercise_sets.exerciseSets)) {
    const groupedExercises: any[] = [];
    let currentGroup: any = null;
    let totalActiveDurationSeconds = 0;
    const activeSetsWithStartAndEndTimes: any[] = [];

    for (let i = 0; i < exercise_sets.exerciseSets.length; i++) {
      const garminSet = exercise_sets.exerciseSets[i];
      let garminExerciseName: string | null = null;
      let garminCategory = 'Uncategorized';

      if (garminSet.exercises && garminSet.exercises.length > 0) {
        garminExerciseName =
          garminSet.exercises[0].name || garminSet.exercises[0].category;
        garminCategory = garminSet.exercises[0].category || 'Uncategorized';
      } else if (garminSet.category) {
        garminExerciseName = garminSet.category;
        garminCategory = garminSet.category;
      }

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
        const setType = setTypeMapping[garminSet.setType] || 'Working Set';

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
            const setStartTime = new Date(garminSet.startTime).getTime();
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
            potentialNextGarminSet.startTime
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
          const metricTimestamp = metric.metrics[timestampIndex];
          const heartRate = metric.metrics[hrIndex];
          if (
            metricTimestamp >= startTime &&
            metricTimestamp <= endTime &&
            heartRate !== undefined &&
            heartRate !== null
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
      const newEntry = await exerciseEntryRepository.createExerciseEntry(
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
      userId,
      entryDate,
      createdGroups,
      sessionLaps,
      sessionGpsPoints
    );
    if (createdGroups.length > 0) {
      await attachHrZones(userId, entryDate, createdGroups[0].id, sessionData);
    }
  }
}

export async function processGarminWorkoutDefinition(
  userId: string,
  workoutData: any
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
            step.type === 'RepeatGroupDTO' ? step.workoutSteps : [step];
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

              const sets = [
                {
                  set_number: 1,
                  set_type: individualStep.stepType?.stepTypeKey,
                  reps: individualStep.endConditionValue || 0,
                  weight: individualStep.weightValue
                    ? individualStep.weightValue * 0.453592
                    : 0,
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
  activityData: any,
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

  const rawExerciseSets =
    activityData.exercise_sets?.exerciseSets ||
    activityData.exerciseSets ||
    activityData.exercise_sets ||
    [];
  let extractedSets: any[] = [];
  if (Array.isArray(rawExerciseSets) && rawExerciseSets.length > 0) {
    const setTypeMapping: Record<string, string> = {
      ACTIVE: 'Working Set',
      REST: 'Rest',
      WARM_UP: 'Warm-up Set',
      COOL_DOWN: 'Cool-down Set',
    };
    extractedSets = rawExerciseSets
      .filter((s: any) => s && s.setType !== 'REST')
      .map((s: any, idx: number) => ({
        set_number: idx + 1,
        set_type: setTypeMapping[s.setType] || 'Working Set',
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
            activity.averageHR || activity.averageHeartRateInBeatsPerMinute
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
  const newEntry = await exerciseEntryRepository.createExerciseEntry(
    userId,
    exerciseEntryData,
    userId,
    'garmin'
  );
  await activityDetailsRepository.createActivityDetail(userId, {
    exercise_entry_id: newEntry.id,
    provider_name: 'garmin',
    detail_type: 'full_activity_data',
    detail_data: activityData,
    created_by_user_id: userId,
  });

  const laps = extractGarminLaps(activityData);
  if (laps.length > 0) {
    await workoutTelemetryRepo.bulkInsertExerciseEntryLaps(
      userId,
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
    await workoutTelemetryRepo.bulkInsertExerciseEntryGpsPoints(
      userId,
      userId,
      gpsPoints.map(({ timestampMs: _timestampMs, ...pt }) => ({
        user_id: userId,
        exercise_entry_id: newEntry.id,
        entry_date: entryDate,
        ...pt,
      }))
    );
  }

  await attachHrZones(userId, entryDate, newEntry.id, activityData);
}
