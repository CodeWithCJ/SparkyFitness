const { log } = require('../config/logging');
const exerciseEntryRepository = require('../models/exerciseEntry');
const exerciseRepository = require('../models/exercise');
const activityDetailsRepository = require('../models/activityDetailsRepository');
const exercisePresetEntryRepository = require('../models/exercisePresetEntryRepository');
const workoutPresetRepository = require('../models/workoutPresetRepository'); // New import
const measurementService = require('./measurementService'); // Import measurementService
const moodRepository = require('../models/moodRepository'); // Import moodRepository

async function processActivitiesAndWorkouts(userId, data, startDate, endDate) {
  const { activities, workouts } = data;
  let processedCount = 0;

  // Comprehensive cleanup for Garmin-sourced data for the date range
  // This ensures a clean slate for the current sync, preventing duplicates and stale data.
  log('info', `[garminService] Performing comprehensive cleanup for Garmin data for user ${userId} from ${startDate} to ${endDate}.`);
  await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(userId, startDate, endDate, 'garmin');
  await exercisePresetEntryRepository.deleteExercisePresetEntriesByEntrySourceAndDate(userId, startDate, endDate, 'garmin');

  // Process Activities and Workouts
  if (activities && Array.isArray(activities)) {
    for (const activityData of activities) {
      // Determine if it's a workout session (with summarizedExerciseSets or exercise_sets)
      // or a simple activity.
      if (activityData.activity?.summarizedExerciseSets?.length > 0 || activityData.exercise_sets?.exerciseSets?.length > 0) {
        await processGarminWorkoutSession(userId, activityData, startDate, endDate);
      } else if (activityData.activity) {
        await processGarminSimpleActivity(userId, activityData);
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

async function processGarminHealthAndWellnessData(userId, actingUserId, healthData, startDate, endDate) {
  log('info', `[garminService] Processing Garmin health and wellness data for user ${userId} from ${startDate} to ${endDate}.`);
  const processedResults = [];
  const errors = [];

  try {
    // Process Stress Data
    if (healthData.stress && Array.isArray(healthData.stress)) {
      for (const stressEntry of healthData.stress) {
        const { date, raw_stress_data, derived_mood_value, derived_mood_notes } = stressEntry;

        // Store raw stress data as a custom measurement
        if (raw_stress_data) {
          try {
            const customCategory = await measurementService.getOrCreateCustomCategory(
              userId,
              actingUserId,
              "Raw Stress Data",
              "text",
              "JSON"
            );

            await measurementService.upsertCustomMeasurementEntry(
              userId,
              actingUserId,
              {
                category_id: customCategory.id,
                value: raw_stress_data,
                entry_date: date,
                notes: `Source: Garmin`,
                source: 'garmin',
              }
            );
            processedResults.push({ type: 'raw_stress_data', status: 'success', date });
          } catch (error) {
            log('error', `Error storing raw stress data for user ${userId} on ${date}:`, error);
            errors.push({ type: 'raw_stress_data', status: 'error', date, message: error.message });
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
            processedResults.push({ type: 'derived_mood_value', status: 'success', date });
          } catch (error) {
            log('error', `Error storing derived mood value for user ${userId} on ${date}:`, error);
            errors.push({ type: 'derived_mood_value', status: 'error', date, message: error.message });
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
    log('error', `[garminService] Unexpected error in processGarminHealthAndWellnessData for user ${userId}:`, error);
    errors.push({ type: 'general', status: 'error', message: error.message });
  }

  if (errors.length > 0) {
    throw new Error(JSON.stringify({
      message: "Some Garmin health and wellness data entries could not be processed.",
      processed: processedResults,
      errors: errors
    }));
  } else {
    return {
      message: "All Garmin health and wellness data successfully processed.",
      processed: processedResults
    };
  }
}

// Helper function to process a Garmin workout session (e.g., Wokroutv2.txt)
async function processGarminWorkoutSession(userId, sessionData, startDate, endDate) {
  const { activity, exercise_sets } = sessionData;
  const workoutName = activity.activityName || 'Garmin Workout Session';
  const entryDate = activity.startTimeLocal ? new Date(activity.startTimeLocal).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  // Data from sessionData should already be parsed objects if coming from the microservice
  const details = sessionData.details || {};
  const hrInTimezones = sessionData.hr_in_timezones || [];
  const activityDetailMetrics = details.activityDetailMetrics || [];
  const metricDescriptors = details.metricDescriptors || [];

  // Find the index for heart rate in activityDetailMetrics
  const hrIndex = metricDescriptors.findIndex(desc => desc.key === 'directHeartRate');
  const timestampIndex = metricDescriptors.findIndex(desc => desc.key === 'directTimestamp');

  let workoutPreset = await workoutPresetRepository.getWorkoutPresetByName(userId, workoutName);
  const isNewWorkoutPreset = !workoutPreset;

  if (isNewWorkoutPreset) {
    workoutPreset = await workoutPresetRepository.createWorkoutPreset({
      user_id: userId,
      name: workoutName,
      description: activity.notes || `Workout session from Garmin: ${workoutName}`,
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
  };
  const newExercisePresetEntry = await exercisePresetEntryRepository.createExercisePresetEntry(userId, exercisePresetEntryData, userId);

  await activityDetailsRepository.createActivityDetail(userId, {
    exercise_preset_entry_id: newExercisePresetEntry.id, // Link to preset entry
    provider_name: 'garmin',
    detail_type: 'full_activity_data',
    detail_data: sessionData,
    created_by_user_id: userId,
  });

  if (exercise_sets && Array.isArray(exercise_sets.exerciseSets)) {
    const groupedExercises = {};
    let totalActiveDurationSeconds = 0;
    let lastActiveSet = null; // To store the last active set for assigning rest time
    const activeSetsWithStartAndEndTimes = []; // Store active sets with their calculated start and end times

    // First pass to group sets by exercise and calculate total active duration
    for (let i = 0; i < exercise_sets.exerciseSets.length; i++) {
      const garminSet = exercise_sets.exerciseSets[i];
      // We need to look further ahead to find the next ACTIVE set for rest time calculation

      if (garminSet.exercises && garminSet.exercises.length > 0) {
        const garminExerciseName = garminSet.exercises[0].name || garminSet.exercises[0].category;
        const exerciseName = garminExerciseName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        if (!groupedExercises[exerciseName]) {
          groupedExercises[exerciseName] = {
            exerciseDetails: garminSet.exercises[0],
            sets: [],
            totalDuration: 0,
            startTime: null, // To store the start time of the first active set for this exercise
            endTime: null,   // To store the end time of the last active set for this exercise
          };
        }

        const setTypeMapping = {
          'ACTIVE': 'Working Set',
          'REST': 'Rest Set',
          'WARM_UP': 'Warm-up Set',
          // Add other mappings as needed
        };

        const setType = setTypeMapping[garminSet.setType] || 'Working Set'; // Default to 'Working Set' if not mapped

        const durationSeconds = garminSet.duration ? Math.round(garminSet.duration) : 0;
        const weightKg = garminSet.weight ? parseFloat((garminSet.weight * 0.001).toFixed(2)) : 0; // Assuming weight is in grams, convert to kg and round to 2 decimal places

        const currentSet = {
          set_number: groupedExercises[exerciseName].sets.length + 1, // Incremental set number
          set_type: setType,
          reps: Math.round(garminSet.repetitionCount || 0),
          weight: weightKg,
          duration: durationSeconds,
          rest_time: 0, // Default rest time
          notes: garminSet.notes || '',
        };
        groupedExercises[exerciseName].sets.push(currentSet);

        if (garminSet.setType === 'ACTIVE') {
          groupedExercises[exerciseName].totalDuration += durationSeconds;
          totalActiveDurationSeconds += durationSeconds;

          const setStartTime = new Date(garminSet.startTime).getTime(); // Convert to milliseconds
          const setEndTime = setStartTime + (durationSeconds * 1000);

          if (!groupedExercises[exerciseName].startTime || setStartTime < groupedExercises[exerciseName].startTime) {
            groupedExercises[exerciseName].startTime = setStartTime;
          }
          if (!groupedExercises[exerciseName].endTime || setEndTime > groupedExercises[exerciseName].endTime) {
            groupedExercises[exerciseName].endTime = setEndTime;
          }
          lastActiveSet = currentSet; // Store this active set for potential rest time assignment

          // Store active set details for later rest time calculation
          activeSetsWithStartAndEndTimes.push({
            set: currentSet,
            startTime: setStartTime,
            endTime: setEndTime,
            garminSetIndex: i // Store original index to find next active set
          });
        }
      }
    }

    // Second pass to calculate rest times based on consecutive active sets
    for (let i = 0; i < activeSetsWithStartAndEndTimes.length; i++) {
      const currentActiveSetInfo = activeSetsWithStartAndEndTimes[i];
      const currentSet = currentActiveSetInfo.set;

      // Find the next active set in the original garmin exerciseSets array
      let nextActiveSetInfo = null;
      for (let j = currentActiveSetInfo.garminSetIndex + 1; j < exercise_sets.exerciseSets.length; j++) {
        const potentialNextGarminSet = exercise_sets.exerciseSets[j];
        if (potentialNextGarminSet.setType === 'ACTIVE' && potentialNextGarminSet.exercises && potentialNextGarminSet.exercises.length > 0) {
          // Found the next active set
          const nextSetStartTime = new Date(potentialNextGarminSet.startTime).getTime();
          const nextSetDuration = potentialNextGarminSet.duration ? Math.round(potentialNextGarminSet.duration / 1000) : 0;
          nextActiveSetInfo = {
            startTime: nextSetStartTime,
            duration: nextSetDuration
          };
          break;
        } else if (potentialNextGarminSet.setType === 'REST') {
          // If there's a REST set immediately following, and it has a duration, use that
          const restDuration = potentialNextGarminSet.duration ? Math.round(potentialNextGarminSet.duration / 1000) : 0;
          if (restDuration > 0) {
            currentSet.rest_time = restDuration;
            break; // Rest time assigned, move to next active set
          }
        }
      }

      if (nextActiveSetInfo) {
        const timeBetweenSets = (nextActiveSetInfo.startTime - currentActiveSetInfo.endTime) / 1000; // in seconds
        if (timeBetweenSets > 0) {
          currentSet.rest_time = Math.round(timeBetweenSets);
        }
      }
    }

    for (const exerciseName in groupedExercises) {
      const { exerciseDetails, sets, totalDuration, startTime, endTime } = groupedExercises[exerciseName];

      let exercise = await exerciseRepository.findExerciseByNameAndUserId(exerciseName, userId);
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
      if (totalActiveDurationSeconds > 0 && activity.calories) {
        perExerciseCaloriesBurned = (totalDuration / totalActiveDurationSeconds) * activity.calories;
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
          if (metricTimestamp >= startTime && metricTimestamp <= endTime && heartRate !== undefined && heartRate !== null) {
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
       avg_heart_rate: perExerciseAvgHeartRate ? Math.round(perExerciseAvgHeartRate) : null, // Round to nearest whole number or keep null
     };
      await exerciseEntryRepository.createExerciseEntry(userId, exerciseEntryData, userId, 'garmin', newExercisePresetEntry.id);

      const existingExerciseInPreset = workoutPreset.exercises?.find(e => e.exercise_id === exercise.id);

      if (isNewWorkoutPreset || !existingExerciseInPreset) {
        await workoutPresetRepository.addExerciseToWorkoutPreset(
          userId,
          workoutPreset.id,
          exercise.id,
          null, // image_url
          isNewWorkoutPreset ? sets : [] // Only add sets to the preset if it's a new preset
        );
      }
    }
  }
}

// Helper function to process a Garmin workout definition (e.g., workout training.txt)
async function processGarminWorkoutDefinition(userId, workoutData) {
  const workoutName = workoutData.workoutName || 'Garmin Workout Definition';
  const description = workoutData.description || `Workout definition from Garmin: ${workoutName}`;

  let workoutPreset = await workoutPresetRepository.getWorkoutPresetByName(userId, workoutName);
  if (!workoutPreset) {
    workoutPreset = await workoutPresetRepository.createWorkoutPreset({
      user_id: userId,
      name: workoutName,
      description: description,
      is_public: false,
    });
  }

  if (workoutData.workoutSegments && Array.isArray(workoutData.workoutSegments)) {
    for (const segment of workoutData.workoutSegments) {
      if (segment.workoutSteps && Array.isArray(segment.workoutSteps)) {
        for (const step of segment.workoutSteps) {
          const stepsToProcess = step.type === 'RepeatGroupDTO' ? step.workoutSteps : [step];

          for (const individualStep of stepsToProcess) {
            if (individualStep.type === 'ExecutableStepDTO' && individualStep.exerciseName) {
              const garminExerciseName = individualStep.exerciseName;
              const exerciseName = garminExerciseName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

              let exercise = await exerciseRepository.findExerciseByNameAndUserId(exerciseName, userId);
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

              const sets = [{
                set_number: 1,
                set_type: individualStep.stepType?.stepTypeKey,
                reps: individualStep.endConditionValue || 0,
                weight: individualStep.weightValue ? individualStep.weightValue * 0.453592 : 0, // Assuming weight is in pounds, convert to kg
                duration: 0,
                rest_time: 0,
                notes: individualStep.description || '',
              }];

              await workoutPresetRepository.addExerciseToWorkoutPreset(userId, workoutPreset.id, exercise.id, null, sets);
            }
          }
        }
      }
    }
  }
}

// Helper function to process a simple Garmin activity
async function processGarminSimpleActivity(userId, activityData) {
  const { activity } = activityData;
  const exerciseName = activity.activityType?.typeKey ? activity.activityType.typeKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Garmin Activity';
  let exercise = await exerciseRepository.findExerciseByNameAndUserId(exerciseName, userId);

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

  const entryDate = activity.startTimeLocal ? new Date(activity.startTimeLocal).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  const exerciseEntryData = {
    exercise_id: exercise.id,
    duration_minutes: activity.duration || 0,
    calories_burned: activity.calories || 0,
    entry_date: entryDate,
    notes: `Garmin Activity: ${activity.activityName} (${activity.activityType?.typeKey})`,
    distance: activity.distance,
    avg_heart_rate: activity.averageHeartRateInBeatsPerMinute || null,
  };

  const newEntry = await exerciseEntryRepository.createExerciseEntry(userId, exerciseEntryData, userId, 'garmin');

  await activityDetailsRepository.createActivityDetail(userId, {
    exercise_entry_id: newEntry.id,
    provider_name: 'garmin',
    detail_type: 'full_activity_data',
    detail_data: {
      activity: activityData.activity,
      details: activityData.details || { activityDetailMetrics: [], metricDescriptors: [] },
      splits: activityData.splits || { lapDTOs: [] },
      hr_in_timezones: activityData.hr_in_timezones || [],
    },
    created_by_user_id: userId,
  });
}

const sleepRepository = require('../models/sleepRepository'); // Import sleepRepository

async function processGarminSleepData(userId, actingUserId, sleepDataArray, startDate, endDate) {
    const processedResults = [];
    const errors = [];

    // Comprehensive cleanup for Garmin-sourced sleep data for the date range
    log('info', `[garminService] Performing comprehensive cleanup for Garmin sleep data for user ${userId} from ${startDate} to ${endDate}.`);
    await sleepRepository.deleteSleepEntriesByEntrySourceAndDate(userId, 'garmin', startDate, endDate);

    for (const sleepEntry of sleepDataArray) {
        try {
            const result = await measurementService.processSleepEntry(userId, actingUserId, sleepEntry);
            processedResults.push({ status: 'success', data: result });
        } catch (error) {
            log('error', `Error processing Garmin sleep entry for user ${userId}:`, error);
            errors.push({ status: 'error', message: error.message, entry: sleepEntry });
        }
    }

    if (errors.length > 0) {
        throw new Error(JSON.stringify({
            message: "Some Garmin sleep entries could not be processed.",
            processed: processedResults,
            errors: errors
        }));
    } else {
        return {
            message: "All Garmin sleep data successfully processed.",
            processed: processedResults
        };
    }
}

module.exports = {
  processActivitiesAndWorkouts,
  processGarminWorkoutSession,
  processGarminWorkoutDefinition,
  processGarminSimpleActivity,
  processGarminSleepData,
  processGarminHealthAndWellnessData,
};