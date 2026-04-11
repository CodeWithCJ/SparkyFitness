import { log } from '../config/logging.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import exerciseRepository from '../models/exercise.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import measurementService from './measurementService.js';
import moodRepository from '../models/moodRepository.js';
import garminConnectService from '../integrations/garminconnect/garminConnectService.js';
import garminMeasurementMapping from '../integrations/garminconnect/garminMeasurementMapping.js';
import moment from 'moment';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone, addDays } from '@workspace/shared';
import sleepRepository from '../models/sleepRepository.js';
async function processActivitiesAndWorkouts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  timezone = 'UTC'
) {
  const { activities, workouts } = data;
  let processedCount = 0;
  // Comprehensive cleanup for Garmin-sourced data for the date range
  // This ensures a clean slate for the current sync, preventing duplicates and stale data.
  log(
    'info',
    `[garminService] Performing comprehensive cleanup for Garmin data for user ${userId} from ${startDate} to ${endDate}.`
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
      // Determine if it's a workout session (with summarizedExerciseSets or exercise_sets)
      // or a simple activity.
      if (
        activityData.activity?.summarizedExerciseSets?.length > 0 ||
        activityData.exercise_sets?.exerciseSets?.length > 0
      ) {
        await processGarminWorkoutSession(
          userId,
          activityData,
          startDate,
          endDate,
          timezone
        );
      } else if (activityData.activity) {
        await processGarminSimpleActivity(userId, activityData, timezone);
      }
      processedCount++; // Increment for each activity processed
    }
  }
  // Process standalone Workouts (definitions)
  if (workouts && Array.isArray(workouts)) {
    for (const workoutData of workouts) {
      await processGarminWorkoutDefinition(userId, workoutData);
      processedCount++; // Increment for each workout definition processed
    }
  }
  return { processedEntries: processedCount };
}
async function processGarminHealthAndWellnessData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  healthData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  log(
    'info',
    `[garminService] Processing Garmin health and wellness data for user ${userId} from ${startDate} to ${endDate}.`
  );
  const processedResults = [];
  const errors = [];
  try {
    // Process Stress Data
    if (healthData.stress && Array.isArray(healthData.stress)) {
      for (const stressEntry of healthData.stress) {
        const {
          date,
          raw_stress_data,
          derived_mood_value,
          derived_mood_notes,
        } = stressEntry;
        // Store raw stress data as a custom measurement
        if (raw_stress_data) {
          try {
            const customCategory =
              await measurementService.getOrCreateCustomCategory(
                userId,
                actingUserId,
                'Raw Stress Data',
                'text',
                'JSON'
              );
            await measurementService.upsertCustomMeasurementEntry(
              userId,
              actingUserId,
              {
                category_id: customCategory.id,
                value: raw_stress_data,
                entry_date: date,
                notes: 'Source: Garmin',
                source: 'garmin',
              }
            );
            processedResults.push({
              type: 'raw_stress_data',
              status: 'success',
              date,
            });
          } catch (error) {
            log(
              'error',
              `Error storing raw stress data for user ${userId} on ${date}:`,
              error
            );
            errors.push({
              type: 'raw_stress_data',
              status: 'error',
              date,
              // @ts-expect-error TS(2571): Object is of type 'unknown'.
              message: error.message,
            });
          }
        }
        // Store derived mood value
        if (derived_mood_value !== null && derived_mood_value !== undefined) {
          try {
            await moodRepository.createOrUpdateMoodEntry(
              userId,
              derived_mood_value,
              derived_mood_notes,
              date
            );
            processedResults.push({
              type: 'derived_mood_value',
              status: 'success',
              date,
            });
          } catch (error) {
            log(
              'error',
              `Error storing derived mood value for user ${userId} on ${date}:`,
              error
            );
            errors.push({
              type: 'derived_mood_value',
              status: 'error',
              date,
              // @ts-expect-error TS(2571): Object is of type 'unknown'.
              message: error.message,
            });
          }
        }
      }
    }
    // Add processing for other health metrics here as needed in the future
    // For example:
    // if (healthData.heart_rates && Array.isArray(healthData.heart_rates)) {
    //   for (const hrEntry of healthData.heart_rates) {
    //     // Process heart rate data
    //   }
    // }
  } catch (error) {
    log(
      'error',
      `[garminService] Unexpected error in processGarminHealthAndWellnessData for user ${userId}:`,
      error
    );
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    errors.push({ type: 'general', status: 'error', message: error.message });
  }
  if (errors.length > 0) {
    throw new Error(
      JSON.stringify({
        message:
          'Some Garmin health and wellness data entries could not be processed.',
        processed: processedResults,
        errors: errors,
      })
    );
  } else {
    return {
      message: 'All Garmin health and wellness data successfully processed.',
      processed: processedResults,
    };
  }
}
// Helper function to process a Garmin workout session (e.g., Wokroutv2.txt)
async function processGarminWorkoutSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any,
  timezone = 'UTC'
) {
  const { activity, exercise_sets } = sessionData;
  const workoutName = activity.activityName || 'Garmin Workout Session';
  const entryDate = activity.startTimeLocal
    ? activity.startTimeLocal.substring(0, 10)
    : todayInZone(timezone);
  // Data from sessionData should already be parsed objects if coming from the microservice
  const details = sessionData.details || {};
  const activityDetailMetrics = details.activityDetailMetrics || [];
  const metricDescriptors = details.metricDescriptors || [];
  // Find the index for heart rate in activityDetailMetrics
  const hrIndex = metricDescriptors.findIndex(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (desc: any) => desc.key === 'directHeartRate'
  );
  const timestampIndex = metricDescriptors.findIndex(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    source: 'garmin', // Add source to exercise_preset_entries
    steps: activity.steps || activity.totalSteps || activity.stepCount || 0,
  };
  const newExercisePresetEntry =
    await exercisePresetEntryRepository.createExercisePresetEntry(
      userId,
      exercisePresetEntryData,
      userId
    );
  await activityDetailsRepository.createActivityDetail(userId, {
    exercise_preset_entry_id: newExercisePresetEntry.id, // Link to preset entry
    provider_name: 'garmin',
    detail_type: 'full_activity_data',
    detail_data: sessionData,
    created_by_user_id: userId,
  });
  if (exercise_sets && Array.isArray(exercise_sets.exerciseSets)) {
    const groupedExercises = [];
    let currentGroup = null;
    let totalActiveDurationSeconds = 0;
    const activeSetsWithStartAndEndTimes = []; // Store active sets with their calculated start and end times
    // First pass to group sets by exercise and calculate total active duration
    for (let i = 0; i < exercise_sets.exerciseSets.length; i++) {
      const garminSet = exercise_sets.exerciseSets[i];
      // We need to look further ahead to find the next ACTIVE set for rest time calculation
      let garminExerciseName = null;
      let garminCategory = 'Uncategorized';
      if (garminSet.exercises && garminSet.exercises.length > 0) {
        garminExerciseName =
          garminSet.exercises[0].name || garminSet.exercises[0].category;
        garminCategory = garminSet.exercises[0].category || 'Uncategorized';
      } else if (garminSet.category) {
        garminExerciseName = garminSet.category;
        garminCategory = garminSet.category;
      }
      // If we still don't have an exercise name (e.g. an unnamed REST or WARM_UP set),
      // inherit it from the current group to prevent breaking the exercise into multiple 1-set entries.
      // We ONLY inherit for non-ACTIVE sets. An ACTIVE set without a name is a new, unrecognized exercise.
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
        // @ts-expect-error TS(7022): 'exerciseName' implicitly has type 'any' because i... Remove this comment to see the full error message
        const exerciseName = garminExerciseName
          .replace(/_/g, ' ')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .replace(/\b\w/g, (l: any) => l.toUpperCase());
        const stepIndex = garminSet.stepIndex || garminSet.wktStepId || null;
        if (
          !currentGroup ||
          currentGroup.name !== exerciseName ||
          (stepIndex !== null &&
            currentGroup.stepIndex !== null &&
            currentGroup.stepIndex !== stepIndex)
        ) {
          currentGroup = {
            name: exerciseName,
            stepIndex: stepIndex,
            exerciseDetails: { category: garminCategory },
            sets: [],
            totalDuration: 0,
            activeDuration: 0,
            startTime: null, // To store the start time of the first active set for this exercise
            endTime: null, // To store the end time of the last active set for this exercise
          };
          groupedExercises.push(currentGroup);
        }
        const setTypeMapping = {
          ACTIVE: 'Working Set',
          REST: 'Rest Set',
          WARM_UP: 'Warm-up Set',
          // Add other mappings as needed
        };
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        const setType = setTypeMapping[garminSet.setType] || 'Working Set'; // Default to 'Working Set' if not mapped
        const durationSeconds = garminSet.duration
          ? Math.round(garminSet.duration)
          : 0;
        const weightKg = garminSet.weight
          ? parseFloat((garminSet.weight * 0.001).toFixed(2))
          : 0; // Assuming weight is in grams, convert to kg and round to 2 decimal places
        if (garminSet.setType !== 'REST') {
          const currentSet = {
            set_number: currentGroup.sets.length + 1, // Incremental set number
            set_type: setType,
            reps: Math.round(garminSet.repetitionCount || 0),
            weight: weightKg,
            duration: Math.round(durationSeconds / 60),
            rest_time: 0, // Default rest time
            notes: garminSet.notes || '',
          };
          // @ts-expect-error TS(2345): Argument of type '{ set_number: number; set_type: ... Remove this comment to see the full error message
          currentGroup.sets.push(currentSet);
          if (garminSet.setType === 'ACTIVE') {
            currentGroup.totalDuration += durationSeconds;
            currentGroup.activeDuration += durationSeconds;
            totalActiveDurationSeconds += durationSeconds;
            const setStartTime = new Date(garminSet.startTime).getTime(); // Convert to milliseconds
            const setEndTime = setStartTime + durationSeconds * 1000;
            if (
              !currentGroup.startTime ||
              setStartTime < currentGroup.startTime
            ) {
              // @ts-expect-error TS(2322): Type 'number' is not assignable to type 'null'.
              currentGroup.startTime = setStartTime;
            }
            if (!currentGroup.endTime || setEndTime > currentGroup.endTime) {
              // @ts-expect-error TS(2322): Type 'number' is not assignable to type 'null'.
              currentGroup.endTime = setEndTime;
            }
            // Store active set details for later rest time calculation
            activeSetsWithStartAndEndTimes.push({
              set: currentSet,
              startTime: setStartTime,
              endTime: setEndTime,
              garminSetIndex: i, // Store original index to find next active set
            });
          }
        } else {
          // It's a REST set, just add its duration to the group's total duration
          currentGroup.totalDuration += durationSeconds;
        }
      }
    }
    // Second pass to calculate rest times based on consecutive active sets
    for (let i = 0; i < activeSetsWithStartAndEndTimes.length; i++) {
      const currentActiveSetInfo = activeSetsWithStartAndEndTimes[i];
      const currentSet = currentActiveSetInfo.set;
      // Find the next active set in the original garmin exerciseSets array
      let nextActiveSetInfo = null;
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
          // Found the next active set
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
          // If there's a REST set immediately following, and it has a duration, use that
          const restDuration = potentialNextGarminSet.duration
            ? Math.round(potentialNextGarminSet.duration)
            : 0;
          if (restDuration > 0) {
            currentSet.rest_time = restDuration;
            break; // Rest time assigned, move to next active set
          }
        }
      }
      if (nextActiveSetInfo) {
        const timeBetweenSets =
          (nextActiveSetInfo.startTime - currentActiveSetInfo.endTime) / 1000; // in seconds
        if (timeBetweenSets > 0) {
          currentSet.rest_time = Math.round(timeBetweenSets);
        }
      }
    }
    let exerciseSortOrder = 0;
    for (const group of groupedExercises) {
      const exerciseName = group.name;
      const {
        exerciseDetails,
        sets,
        totalDuration,
        activeDuration,
        startTime,
        endTime,
      } = group;
      let exercise = await exerciseRepository.findExerciseByNameAndUserId(
        exerciseName,
        userId
      );
      if (!exercise) {
        exercise = await exerciseRepository.createExercise({
          user_id: userId,
          name: exerciseName,
          category: exerciseDetails.category || 'Uncategorized',
          source: 'garmin',
          is_custom: true,
          shared_with_public: false,
          force: null,
          level: null,
          mechanic: null,
          equipment: null,
          primary_muscles: null,
          secondary_muscles: null,
          instructions: null,
          images: null,
        });
      }
      let perExerciseCaloriesBurned = 0;
      if (totalActiveDurationSeconds > 0 && activity.active_calories) {
        perExerciseCaloriesBurned =
          (activeDuration / totalActiveDurationSeconds) *
          activity.active_calories;
      }
      let perExerciseAvgHeartRate = null;
      if (hrIndex !== -1 && timestampIndex !== -1 && startTime && endTime) {
        let heartRateSum = 0;
        let heartRateCount = 0;
        for (const metric of activityDetailMetrics) {
          const metricTimestamp = metric.metrics[timestampIndex];
          const heartRate = metric.metrics[hrIndex];
          // Garmin timestamps are in milliseconds, convert to seconds for comparison with startTime/endTime
          // startTime and endTime are already in milliseconds
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
          perExerciseAvgHeartRate = Math.round(heartRateSum / heartRateCount); // Round to nearest whole number
        }
      }
      const exerciseEntryData = {
        exercise_id: exercise.id,
        duration_minutes: totalDuration / 60, // Convert total seconds to minutes
        calories_burned: Math.round(perExerciseCaloriesBurned), // Round calories to nearest whole number
        entry_date: entryDate,
        notes: `Garmin Exercise: ${exerciseName}`,
        sets: sets,
        exercise_preset_entry_id: newExercisePresetEntry.id, // Link to preset entry
        avg_heart_rate: perExerciseAvgHeartRate
          ? Math.round(perExerciseAvgHeartRate)
          : null, // Round to nearest whole number or keep null
        source_id: activity.activityId
          ? `${activity.activityId}_${exerciseSortOrder}`
          : null,
        steps: activity.steps || activity.totalSteps || activity.stepCount || 0,
      };
      await exerciseEntryRepository.createExerciseEntry(
        userId,
        { ...exerciseEntryData, sort_order: exerciseSortOrder },
        userId,
        'garmin',
        newExercisePresetEntry.id
      );
      const existingExerciseInPreset = workoutPreset.exercises?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any) => e.exercise_id === exercise.id
      );
      if (isNewWorkoutPreset || !existingExerciseInPreset) {
        await workoutPresetRepository.addExerciseToWorkoutPreset(
          userId,
          workoutPreset.id,
          exercise.id,
          null, // image_url
          isNewWorkoutPreset ? sets : [], // Only add sets to the preset if it's a new preset
          exerciseSortOrder
        );
      }
      exerciseSortOrder++;
    }
  }
}
// Helper function to process a Garmin workout definition (e.g., workout training.txt)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processGarminWorkoutDefinition(userId: any, workoutData: any) {
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
              const exerciseName = garminExerciseName
                .replace(/_/g, ' ')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .replace(/\b\w/g, (l: any) => l.toUpperCase());
              let exercise =
                await exerciseRepository.findExerciseByNameAndUserId(
                  exerciseName,
                  userId
                );
              if (!exercise) {
                exercise = await exerciseRepository.createExercise({
                  user_id: userId,
                  name: exerciseName,
                  category: individualStep.category || 'Uncategorized',
                  source: 'garmin',
                  is_custom: true,
                  shared_with_public: false,
                });
              }
              const sets = [
                {
                  set_number: 1,
                  set_type: individualStep.stepType?.stepTypeKey,
                  reps: individualStep.endConditionValue || 0,
                  weight: individualStep.weightValue
                    ? individualStep.weightValue * 0.453592
                    : 0, // Assuming weight is in pounds, convert to kg
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
// Helper function to process a simple Garmin activity
async function processGarminSimpleActivity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activityData: any,
  timezone = 'UTC'
) {
  const { activity } = activityData;
  const exerciseName = activity.activityType?.typeKey
    ? activity.activityType.typeKey
        .replace(/_/g, ' ')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .replace(/\b\w/g, (l: any) => l.toUpperCase())
    : 'Garmin Activity';
  let exercise = await exerciseRepository.findExerciseByNameAndUserId(
    exerciseName,
    userId
  );
  if (!exercise) {
    exercise = await exerciseRepository.createExercise({
      user_id: userId,
      name: exerciseName,
      category: activity.activityType?.typeKey || 'Uncategorized',
      source: 'garmin',
      is_custom: true,
      shared_with_public: false,
    });
  }
  const entryDate = activity.startTimeLocal
    ? activity.startTimeLocal.substring(0, 10)
    : todayInZone(timezone);
  const exerciseEntryData = {
    exercise_id: exercise.id,
    duration_minutes: activity.duration || 0,
    calories_burned: activity.active_calories || 0,
    entry_date: entryDate,
    notes: `Garmin Activity: ${activity.activityName} (${activity.activityType?.typeKey})`,
    distance: activity.distance,
    avg_heart_rate:
      activity.averageHR || activity.averageHeartRateInBeatsPerMinute || null,
    source_id: activity.activityId?.toString() ?? null,
    steps: activity.steps || activity.totalSteps || activity.stepCount || 0,
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
    detail_data: {
      activity: activityData.activity,
      details: activityData.details || {
        activityDetailMetrics: [],
        metricDescriptors: [],
      },
      splits: activityData.splits || { lapDTOs: [] },
      hr_in_timezones: activityData.hr_in_timezones || [],
    },
    created_by_user_id: userId,
  });
}
async function processGarminSleepData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sleepDataArray: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  const processedResults = [];
  const errors = [];
  // Comprehensive cleanup for Garmin-sourced sleep data for the date range
  log(
    'info',
    `[garminService] Performing comprehensive cleanup for Garmin sleep data for user ${userId} from ${startDate} to ${endDate}.`
  );
  await sleepRepository.deleteSleepEntriesByEntrySourceAndDate(
    userId,
    'garmin',
    startDate,
    endDate
  );
  for (const sleepEntry of sleepDataArray) {
    try {
      const result = await measurementService.processSleepEntry(
        userId,
        actingUserId,
        sleepEntry
      );
      processedResults.push({ status: 'success', data: result });
    } catch (error) {
      log(
        'error',
        `Error processing Garmin sleep entry for user ${userId}:`,
        error
      );
      errors.push({
        status: 'error',
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        message: error.message,
        entry: sleepEntry,
      });
    }
  }
  if (errors.length > 0) {
    throw new Error(
      JSON.stringify({
        message: 'Some Garmin sleep entries could not be processed.',
        processed: processedResults,
        errors: errors,
      })
    );
  } else {
    return {
      message: 'All Garmin sleep data successfully processed.',
      processed: processedResults,
    };
  }
}
async function syncGarminData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  syncType = 'manual',
  customStartDate = null,
  customEndDate = null
) {
  let startDate, endDate;
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);
  if (customStartDate) {
    startDate = customStartDate;
    endDate = customEndDate || today;
  } else if (syncType === 'manual') {
    endDate = today;
    startDate = addDays(today, -7);
  } else if (syncType === 'scheduled') {
    endDate = today;
    startDate = today;
  } else {
    throw new Error("Invalid syncType. Must be 'manual' or 'scheduled'.");
  }
  log(
    'info',
    `[garminService] Starting Garmin sync (${syncType}) for user ${userId} from ${startDate} to ${endDate}.`
  );
  const results = {
    health: null,
    activities: null,
  };
  // Phase 1: Health and Wellness — runs independently so a failure here does not skip activities
  try {
    // 1. Sync Health and Wellness
    log('info', '[garminService] Fetching Health and Wellness data...');
    const healthWellnessData =
      await garminConnectService.syncGarminHealthAndWellness(
        userId,
        startDate,
        endDate,
        []
      );
    // 2. Process Health and Wellness (Stress, Mood, etc.)
    const processedGarminHealthData = await processGarminHealthAndWellnessData(
      userId,
      userId,
      healthWellnessData.data,
      startDate,
      endDate
    );
    // 3. Map and Process other Health Metrics (Steps, Weight, etc.)
    const processedHealthData = [];
    for (const metric in healthWellnessData.data) {
      if (metric === 'stress') continue; // Already processed
      const dailyEntries = healthWellnessData.data[metric];
      if (Array.isArray(dailyEntries)) {
        for (const entry of dailyEntries) {
          const calendarDateRaw = entry.date;
          if (!calendarDateRaw) continue;
          const calendarDate = moment(calendarDateRaw).format('YYYY-MM-DD');
          for (const key in entry) {
            if (key === 'date') continue;
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            let mapping = garminMeasurementMapping[key];
            if (!mapping && key === 'value') {
              // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
              mapping = garminMeasurementMapping[metric];
            }
            if (mapping) {
              const value = entry[key];
              if (value === null || value === undefined) continue;
              const type =
                mapping.targetType === 'check_in'
                  ? mapping.field
                  : mapping.name;
              processedHealthData.push({
                type: type,
                value: value,
                date: calendarDate,
                source: 'garmin',
                dataType: mapping.dataType,
                measurementType: mapping.measurementType,
              });
            }
          }
        }
      }
    }
    let measurementServiceResult = {};
    if (processedHealthData.length > 0) {
      measurementServiceResult = await measurementService.processHealthData(
        processedHealthData,
        userId,
        userId
      );
    }
    // 4. Process Sleep
    let processedSleepData = {};
    if (
      healthWellnessData.data &&
      healthWellnessData.data.sleep &&
      healthWellnessData.data.sleep.length > 0
    ) {
      processedSleepData = await processGarminSleepData(
        userId,
        userId,
        healthWellnessData.data.sleep,
        startDate,
        endDate
      );
    }
    // @ts-expect-error TS(2322): Type '{ processedGarminHealthData: { message: stri... Remove this comment to see the full error message
    results.health = {
      processedGarminHealthData,
      measurementServiceResult,
      processedSleepData,
    };
  } catch (healthError) {
    log(
      'error',
      `[garminService] Error during health sync for user ${userId}:`,
      healthError
    );
    // @ts-expect-error TS(2322): Type '{ error: string; }' is not assignable to typ... Remove this comment to see the full error message
    results.health = {
      error:
        healthError instanceof Error
          ? healthError.message
          : String(healthError),
    };
  }
  // Phase 2: Activities and Workouts — always runs even if Phase 1 failed
  try {
    // 5. Sync Activities and Workouts
    log('info', '[garminService] Fetching Activities and Workouts data...');
    const activitiesData =
      // @ts-expect-error TS(2554): Expected 4 arguments, but got 3.
      await garminConnectService.fetchGarminActivitiesAndWorkouts(
        userId,
        startDate,
        endDate
      );
    // 6. Process Activities and Workouts
    const processedActivities = await processActivitiesAndWorkouts(
      userId,
      activitiesData,
      startDate,
      endDate,
      tz
    );
    // @ts-expect-error TS(2322): Type '{ processedEntries: number; }' is not assign... Remove this comment to see the full error message
    results.activities = processedActivities;
  } catch (activitiesError) {
    log(
      'error',
      `[garminService] Error during activities sync for user ${userId}:`,
      activitiesError
    );
    // @ts-expect-error TS(2322): Type '{ error: string; }' is not assignable to typ... Remove this comment to see the full error message
    results.activities = {
      error:
        activitiesError instanceof Error
          ? activitiesError.message
          : String(activitiesError),
    };
  }
  log('info', `[garminService] Full Garmin sync completed for user ${userId}.`);
  return results;
}
export { processActivitiesAndWorkouts };
export { processGarminWorkoutSession };
export { processGarminWorkoutDefinition };
export { processGarminSimpleActivity };
export { processGarminSleepData };
export { processGarminHealthAndWellnessData };
export { syncGarminData };
export default {
  processActivitiesAndWorkouts,
  processGarminWorkoutSession,
  processGarminWorkoutDefinition,
  processGarminSimpleActivity,
  processGarminSleepData,
  processGarminHealthAndWellnessData,
  syncGarminData,
};
