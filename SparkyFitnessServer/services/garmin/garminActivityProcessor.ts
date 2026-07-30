import { log } from '../../config/logging.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import exercisePresetEntryRepository from '../../models/exercisePresetEntryRepository.js';
import workoutPresetRepository from '../../models/workoutPresetRepository.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import * as workoutTelemetryRepo from '../../models/workoutTelemetryRepository.js';
import { todayInZone } from '@workspace/shared';
import { getOrCreateGarminExercise } from './garminExerciseMapper.js';

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
        calories_burned: Math.round(perExerciseCaloriesBurned),
        entry_date: entryDate,
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

      // Ingest laps for this entry if present in sessionData
      if (exerciseSortOrder === 0) {
        const rawLaps = sessionData.laps || sessionData.splits?.lapDTOs || [];
        if (Array.isArray(rawLaps) && rawLaps.length > 0) {
          const lapEntries = rawLaps.map((lap: any, index: number) => ({
            user_id: userId,
            exercise_entry_id: newEntry.id,
            entry_date: entryDate,
            lap_index: lap.lap_index ?? lap.lapIndex ?? index + 1,
            start_time: lap.startTimeLocal
              ? new Date(lap.startTimeLocal)
              : lap.startTimeGMT
                ? new Date(lap.startTimeGMT)
                : new Date(),
            end_time: lap.endTimeLocal
              ? new Date(lap.endTimeLocal)
              : lap.endTimeGMT
                ? new Date(lap.endTimeGMT)
                : new Date(),
            duration_seconds: Math.round(
              Number(
                lap.duration_seconds ?? lap.duration ?? lap.elapsedDuration ?? 0
              )
            ),
            distance_meters:
              lap.distance_meters !== undefined && lap.distance_meters !== null
                ? Number(lap.distance_meters)
                : lap.distance !== undefined && lap.distance !== null
                  ? Number(lap.distance) * (lap.distance < 100 ? 1000 : 1)
                  : null,
            calories:
              lap.calories !== undefined && lap.calories !== null
                ? Number(lap.calories)
                : null,
            avg_heart_rate:
              lap.avg_heart_rate !== undefined && lap.avg_heart_rate !== null
                ? Math.round(Number(lap.avg_heart_rate))
                : lap.averageHR !== undefined && lap.averageHR !== null
                  ? Math.round(Number(lap.averageHR))
                  : null,
            max_heart_rate:
              lap.max_heart_rate !== undefined && lap.max_heart_rate !== null
                ? Math.round(Number(lap.max_heart_rate))
                : lap.maxHR !== undefined && lap.maxHR !== null
                  ? Math.round(Number(lap.maxHR))
                  : null,
            avg_speed_mps:
              lap.avg_speed_mps !== undefined && lap.avg_speed_mps !== null
                ? Number(lap.avg_speed_mps)
                : lap.averageSpeed !== undefined && lap.averageSpeed !== null
                  ? Number(lap.averageSpeed)
                  : null,
            max_speed_mps:
              lap.max_speed_mps !== undefined && lap.max_speed_mps !== null
                ? Number(lap.max_speed_mps)
                : lap.maxSpeed !== undefined && lap.maxSpeed !== null
                  ? Number(lap.maxSpeed)
                  : null,
            avg_cadence:
              lap.avg_cadence !== undefined && lap.avg_cadence !== null
                ? Math.round(Number(lap.avg_cadence))
                : lap.averageRunCadence !== undefined &&
                    lap.averageRunCadence !== null
                  ? Math.round(Number(lap.averageRunCadence))
                  : null,
            avg_power_watts:
              lap.avg_power_watts !== undefined && lap.avg_power_watts !== null
                ? Number(lap.avg_power_watts)
                : null,
            elevation_gain_meters:
              lap.elevation_gain_meters !== undefined &&
              lap.elevation_gain_meters !== null
                ? Number(lap.elevation_gain_meters)
                : lap.elevationGain !== undefined && lap.elevationGain !== null
                  ? Number(lap.elevationGain)
                  : null,
            elevation_loss_meters:
              lap.elevation_loss_meters !== undefined &&
              lap.elevation_loss_meters !== null
                ? Number(lap.elevation_loss_meters)
                : lap.elevationLoss !== undefined && lap.elevationLoss !== null
                  ? Number(lap.elevationLoss)
                  : null,
          }));
          await workoutTelemetryRepo.bulkInsertExerciseEntryLaps(
            userId,
            userId,
            lapEntries
          );
        }

        // Ingest GPS trackpoints for this entry if present
        let extractedGpsPoints: any[] = [];
        if (Array.isArray(sessionData.gps_points)) {
          extractedGpsPoints = sessionData.gps_points.map((pt: any) => ({
            user_id: userId,
            exercise_entry_id: newEntry.id,
            entry_date: entryDate,
            timestamp: pt.timestamp ? new Date(pt.timestamp) : new Date(),
            latitude: pt.latitude ?? 0,
            longitude: pt.longitude ?? 0,
            altitude_meters: pt.altitude_meters ?? null,
            speed_mps: pt.speed_mps ?? null,
            heart_rate_bpm: pt.heart_rate_bpm ?? null,
            respiration_rate_brpm: pt.respiration_rate_brpm ?? null,
            cadence: pt.cadence ?? null,
            power_watts: pt.power_watts ?? null,
          }));
        } else if (
          sessionData.details?.activityDetailMetrics &&
          Array.isArray(sessionData.details.activityDetailMetrics)
        ) {
          const descriptors: any[] =
            sessionData.details.metricDescriptors || [];
          const getMetricIdx = (key: string, altKey?: string) => {
            const desc = descriptors.find(
              (d: any) => d.key === key || (altKey && d.key === altKey)
            );
            return desc && desc.metricsIndex !== undefined
              ? desc.metricsIndex
              : -1;
          };

          const latIdx = getMetricIdx('directLatitude', 'latitude');
          const lonIdx = getMetricIdx('directLongitude', 'longitude');
          const altIdx = getMetricIdx('directElevation', 'elevation');
          const hrIdx = getMetricIdx('directHeartRate', 'heartRate');
          const speedIdx = getMetricIdx('directSpeed', 'speed');
          const cadIdx = getMetricIdx('directRunCadence', 'cadence');
          const tsIdx = getMetricIdx('directTimestamp', 'timestamp');

          extractedGpsPoints = sessionData.details.activityDetailMetrics
            .map((metricRow: any) => {
              const metrics = metricRow.metrics || [];
              const lat =
                latIdx >= 0 &&
                metrics[latIdx] !== null &&
                metrics[latIdx] !== undefined
                  ? metrics[latIdx]
                  : 0;
              const lon =
                lonIdx >= 0 &&
                metrics[lonIdx] !== null &&
                metrics[lonIdx] !== undefined
                  ? metrics[lonIdx]
                  : 0;
              return {
                user_id: userId,
                exercise_entry_id: newEntry.id,
                entry_date: entryDate,
                timestamp:
                  tsIdx >= 0 && metrics[tsIdx]
                    ? new Date(metrics[tsIdx])
                    : new Date(),
                latitude: lat,
                longitude: lon,
                altitude_meters: altIdx >= 0 ? metrics[altIdx] : null,
                speed_mps: speedIdx >= 0 ? metrics[speedIdx] : null,
                heart_rate_bpm:
                  hrIdx >= 0 &&
                  metrics[hrIdx] !== null &&
                  metrics[hrIdx] !== undefined
                    ? Math.round(Number(metrics[hrIdx]))
                    : null,
                cadence:
                  cadIdx >= 0 &&
                  metrics[cadIdx] !== null &&
                  metrics[cadIdx] !== undefined
                    ? Math.round(Number(metrics[cadIdx]))
                    : null,
              };
            })
            .filter(Boolean);
        } else if (
          sessionData.details?.geoPolylineDTO?.polyline &&
          Array.isArray(sessionData.details.geoPolylineDTO.polyline)
        ) {
          extractedGpsPoints = sessionData.details.geoPolylineDTO.polyline.map(
            (pt: any) => ({
              user_id: userId,
              exercise_entry_id: newEntry.id,
              entry_date: entryDate,
              timestamp: pt.time ? new Date(pt.time) : new Date(),
              latitude: pt.lat ?? pt.latitude ?? 0,
              longitude: pt.lon ?? pt.longitude ?? 0,
              altitude_meters: pt.altitude ?? pt.altitude_meters ?? null,
              speed_mps: pt.speed ?? null,
              heart_rate_bpm: pt.heartRate ?? pt.bpm ?? null,
              respiration_rate_brpm: pt.respiration ?? null,
              cadence: pt.cadence ?? null,
              power_watts: pt.power ?? null,
            })
          );
        }

        if (extractedGpsPoints.length > 0) {
          await workoutTelemetryRepo.bulkInsertExerciseEntryGpsPoints(
            userId,
            userId,
            extractedGpsPoints
          );
        }
      }

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
  const maxHR =
    activity.maxHR || activity.maxHeartRateInBeatsPerMinute
      ? Math.round(activity.maxHR || activity.maxHeartRateInBeatsPerMinute)
      : null;
  const avgSpeedMps = activity.averageSpeed ?? null;
  const maxSpeedMps = activity.maxSpeed ?? null;
  const avgCadence = activity.averageRunningCadenceInStepsPerMinute
    ? Math.round(activity.averageRunningCadenceInStepsPerMinute)
    : activity.averageCadence
      ? Math.round(activity.averageCadence)
      : null;
  const maxCadence = activity.maxRunningCadenceInStepsPerMinute
    ? Math.round(activity.maxRunningCadenceInStepsPerMinute)
    : activity.maxCadence
      ? Math.round(activity.maxCadence)
      : null;
  const elevationGain =
    activity.elevationGain ?? activity.elevationCorrectedGain ?? null;
  const elevationLoss =
    activity.elevationLoss ?? activity.elevationCorrectedLoss ?? null;
  const floorsClimbed = activity.floorsClimbed ?? null;
  const vo2Max = activity.vo2MaxEstimate ?? activity.vO2MaxValue ?? null;

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
    notes: `Garmin Activity: ${activity.activityName} (${activity.activityType?.typeKey})`,
    distance: activity.distance,
    avg_heart_rate:
      activity.averageHR || activity.averageHeartRateInBeatsPerMinute
        ? Math.round(
            activity.averageHR || activity.averageHeartRateInBeatsPerMinute
          )
        : null,
    max_heart_rate: maxHR,
    avg_speed_mps: avgSpeedMps,
    max_speed_mps: maxSpeedMps,
    avg_cadence: avgCadence,
    max_cadence: maxCadence,
    elevation_gain_meters: elevationGain,
    elevation_loss_meters: elevationLoss,
    floors_climbed: floorsClimbed,
    vo2_max_estimate: vo2Max,
    source_id: activity.activityId?.toString() ?? null,
    steps: Math.round(
      activity.steps || activity.totalSteps || activity.stepCount || 0
    ),
    water_estimated: activity.waterEstimated
      ? Math.round(activity.waterEstimated)
      : null,
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

  // Save Laps if present
  const rawLaps = activityData.laps || activityData.splits?.lapDTOs || [];
  if (Array.isArray(rawLaps) && rawLaps.length > 0) {
    const lapEntries = rawLaps.map((lap: any, index: number) => ({
      user_id: userId,
      exercise_entry_id: newEntry.id,
      entry_date: entryDate,
      lap_index: lap.lap_index ?? lap.lapIndex ?? index + 1,
      start_time: lap.startTimeLocal
        ? new Date(lap.startTimeLocal)
        : lap.startTimeGMT
          ? new Date(lap.startTimeGMT)
          : new Date(),
      end_time: lap.endTimeLocal
        ? new Date(lap.endTimeLocal)
        : lap.endTimeGMT
          ? new Date(lap.endTimeGMT)
          : new Date(),
      duration_seconds: Math.round(
        Number(lap.duration_seconds ?? lap.duration ?? lap.elapsedDuration ?? 0)
      ),
      distance_meters:
        lap.distance_meters !== undefined && lap.distance_meters !== null
          ? Number(lap.distance_meters)
          : lap.distance !== undefined && lap.distance !== null
            ? Number(lap.distance) * (lap.distance < 100 ? 1000 : 1)
            : null,
      calories:
        lap.calories !== undefined && lap.calories !== null
          ? Number(lap.calories)
          : null,
      avg_heart_rate:
        lap.avg_heart_rate !== undefined && lap.avg_heart_rate !== null
          ? Math.round(Number(lap.avg_heart_rate))
          : lap.averageHR !== undefined && lap.averageHR !== null
            ? Math.round(Number(lap.averageHR))
            : lap.averageHeartRateInBeatsPerMinute !== undefined &&
                lap.averageHeartRateInBeatsPerMinute !== null
              ? Math.round(Number(lap.averageHeartRateInBeatsPerMinute))
              : null,
      max_heart_rate:
        lap.max_heart_rate !== undefined && lap.max_heart_rate !== null
          ? Math.round(Number(lap.max_heart_rate))
          : lap.maxHR !== undefined && lap.maxHR !== null
            ? Math.round(Number(lap.maxHR))
            : lap.maxHeartRateInBeatsPerMinute !== undefined &&
                lap.maxHeartRateInBeatsPerMinute !== null
              ? Math.round(Number(lap.maxHeartRateInBeatsPerMinute))
              : null,
      avg_speed_mps:
        lap.avg_speed_mps !== undefined && lap.avg_speed_mps !== null
          ? Number(lap.avg_speed_mps)
          : lap.averageSpeed !== undefined && lap.averageSpeed !== null
            ? Number(lap.averageSpeed)
            : null,
      max_speed_mps:
        lap.max_speed_mps !== undefined && lap.max_speed_mps !== null
          ? Number(lap.max_speed_mps)
          : lap.maxSpeed !== undefined && lap.maxSpeed !== null
            ? Number(lap.maxSpeed)
            : null,
      avg_cadence:
        lap.avg_cadence !== undefined && lap.avg_cadence !== null
          ? Math.round(Number(lap.avg_cadence))
          : lap.averageRunCadence !== undefined &&
              lap.averageRunCadence !== null
            ? Math.round(Number(lap.averageRunCadence))
            : lap.averageCadence !== undefined && lap.averageCadence !== null
              ? Math.round(Number(lap.averageCadence))
              : null,
      avg_power_watts:
        lap.avg_power_watts !== undefined && lap.avg_power_watts !== null
          ? Number(lap.avg_power_watts)
          : lap.averagePower !== undefined && lap.averagePower !== null
            ? Number(lap.averagePower)
            : null,
      elevation_gain_meters:
        lap.elevation_gain_meters !== undefined &&
        lap.elevation_gain_meters !== null
          ? Number(lap.elevation_gain_meters)
          : lap.elevationGain !== undefined && lap.elevationGain !== null
            ? Number(lap.elevationGain)
            : null,
      elevation_loss_meters:
        lap.elevation_loss_meters !== undefined &&
        lap.elevation_loss_meters !== null
          ? Number(lap.elevation_loss_meters)
          : lap.elevationLoss !== undefined && lap.elevationLoss !== null
            ? Number(lap.elevationLoss)
            : null,
    }));
    await workoutTelemetryRepo.bulkInsertExerciseEntryLaps(
      userId,
      userId,
      lapEntries
    );
  }

  // Save GPS Points if present
  let extractedGpsPoints: any[] = [];
  if (Array.isArray(activityData.gps_points)) {
    extractedGpsPoints = activityData.gps_points.map((pt: any) => ({
      user_id: userId,
      exercise_entry_id: newEntry.id,
      entry_date: entryDate,
      timestamp: pt.timestamp ? new Date(pt.timestamp) : new Date(),
      latitude: pt.latitude ?? 0,
      longitude: pt.longitude ?? 0,
      altitude_meters: pt.altitude_meters ?? null,
      speed_mps: pt.speed_mps ?? null,
      heart_rate_bpm: pt.heart_rate_bpm ?? null,
      respiration_rate_brpm: pt.respiration_rate_brpm ?? null,
      cadence: pt.cadence ?? null,
      power_watts: pt.power_watts ?? null,
    }));
  } else if (
    activityData.details?.activityDetailMetrics &&
    Array.isArray(activityData.details.activityDetailMetrics)
  ) {
    const descriptors: any[] = activityData.details.metricDescriptors || [];
    const getMetricIdx = (key: string, altKey?: string) => {
      const desc = descriptors.find(
        (d: any) => d.key === key || (altKey && d.key === altKey)
      );
      return desc && desc.metricsIndex !== undefined ? desc.metricsIndex : -1;
    };

    const latIdx = getMetricIdx('directLatitude', 'latitude');
    const lonIdx = getMetricIdx('directLongitude', 'longitude');
    const altIdx = getMetricIdx('directElevation', 'elevation');
    const hrIdx = getMetricIdx('directHeartRate', 'heartRate');
    const speedIdx = getMetricIdx('directSpeed', 'speed');
    const cadIdx = getMetricIdx('directRunCadence', 'cadence');
    const tsIdx = getMetricIdx('directTimestamp', 'timestamp');

    extractedGpsPoints = activityData.details.activityDetailMetrics
      .map((metricRow: any) => {
        const metrics = metricRow.metrics || [];
        const lat =
          latIdx >= 0 &&
          metrics[latIdx] !== null &&
          metrics[latIdx] !== undefined
            ? metrics[latIdx]
            : 0;
        const lon =
          lonIdx >= 0 &&
          metrics[lonIdx] !== null &&
          metrics[lonIdx] !== undefined
            ? metrics[lonIdx]
            : 0;
        return {
          user_id: userId,
          exercise_entry_id: newEntry.id,
          entry_date: entryDate,
          timestamp:
            tsIdx >= 0 && metrics[tsIdx]
              ? new Date(metrics[tsIdx])
              : new Date(),
          latitude: lat,
          longitude: lon,
          altitude_meters: altIdx >= 0 ? metrics[altIdx] : null,
          speed_mps: speedIdx >= 0 ? metrics[speedIdx] : null,
          heart_rate_bpm:
            hrIdx >= 0 &&
            metrics[hrIdx] !== null &&
            metrics[hrIdx] !== undefined
              ? Math.round(Number(metrics[hrIdx]))
              : null,
          cadence:
            cadIdx >= 0 &&
            metrics[cadIdx] !== null &&
            metrics[cadIdx] !== undefined
              ? Math.round(Number(metrics[cadIdx]))
              : null,
        };
      })
      .filter(Boolean);
  } else if (
    activityData.details?.geoPolylineDTO?.polyline &&
    Array.isArray(activityData.details.geoPolylineDTO.polyline)
  ) {
    extractedGpsPoints = activityData.details.geoPolylineDTO.polyline.map(
      (pt: any) => ({
        user_id: userId,
        exercise_entry_id: newEntry.id,
        entry_date: entryDate,
        timestamp: pt.time ? new Date(pt.time) : new Date(),
        latitude: pt.lat ?? pt.latitude ?? 0,
        longitude: pt.lon ?? pt.longitude ?? 0,
        altitude_meters: pt.altitude ?? pt.altitude_meters ?? null,
        speed_mps: pt.speed ?? null,
        heart_rate_bpm: pt.heartRate ?? pt.bpm ?? null,
        respiration_rate_brpm: pt.respiration ?? null,
        cadence: pt.cadence ?? null,
        power_watts: pt.power ?? null,
      })
    );
  }

  if (extractedGpsPoints.length > 0) {
    await workoutTelemetryRepo.bulkInsertExerciseEntryGpsPoints(
      userId,
      userId,
      extractedGpsPoints
    );
  }
}
