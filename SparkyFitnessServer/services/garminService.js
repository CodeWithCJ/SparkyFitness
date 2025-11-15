const { log } = require('../config/logging');
const exerciseEntryRepository = require('../models/exerciseEntry');
const exerciseRepository = require('../models/exercise');
const activityDetailsRepository = require('../models/activityDetailsRepository');
const exercisePresetEntryRepository = require('../models/exercisePresetEntryRepository');
const workoutPresetRepository = require('../models/workoutPresetRepository'); // New import

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

// Helper function to process a Garmin workout session (e.g., Wokroutv2.txt)
async function processGarminWorkoutSession(userId, sessionData, startDate, endDate) {
  const { activity, exercise_sets } = sessionData;
  const workoutName = activity.activityName || 'Garmin Workout Session';
  const entryDate = activity.startTimeLocal ? new Date(activity.startTimeLocal).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

  let workoutPreset = await workoutPresetRepository.getWorkoutPresetByName(userId, workoutName);
  if (!workoutPreset) {
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
    for (const garminSet of exercise_sets.exerciseSets) {
      if (garminSet.setType === 'ACTIVE' && garminSet.exercises && garminSet.exercises.length > 0) {
        const garminExerciseName = garminSet.exercises[0].name || garminSet.exercises[0].category;
        const exerciseName = garminExerciseName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

        let exercise = await exerciseRepository.findExerciseByNameAndUserId(exerciseName, userId);
        if (!exercise) {
          exercise = await exerciseRepository.createExercise({
            user_id: userId,
            name: exerciseName,
            category: garminSet.exercises[0].category || 'Uncategorized',
            source: 'garmin',
            is_custom: true,
            shared_with_public: false,
          });
        }

        const sets = [{
          set_number: 1, // Garmin provides sets as individual entries, so we treat each as set 1 for now
          set_type: garminSet.setType,
          reps: Math.round(garminSet.repetitionCount || 0), // Ensure reps is an integer
          weight: garminSet.weight ? garminSet.weight * 0.001 : 0, // Assuming weight is in grams, convert to kg
          duration: Math.round(garminSet.duration ? garminSet.duration / 1000 : 0), // Ensure duration is an integer (seconds)
          rest_time: 0,
          notes: '',
        }];

        const exerciseEntryData = {
          exercise_id: exercise.id,
          duration_minutes: garminSet.duration ? garminSet.duration / 60000 : 0, // Assuming duration is in milliseconds, convert to minutes
          calories_burned: 0, // Calories are at activity level, not per set
          entry_date: entryDate,
          notes: `Garmin Set: ${exerciseName}`,
          sets: sets,
          exercise_preset_entry_id: newExercisePresetEntry.id, // Link to preset entry
        };
        await exerciseEntryRepository.createExerciseEntry(userId, exerciseEntryData, userId, 'garmin', newExercisePresetEntry.id);

        // Add this exercise to the workout preset
        await workoutPresetRepository.addExerciseToWorkoutPreset(userId, workoutPreset.id, exercise.id, null, sets);
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
    detail_data: activityData,
    created_by_user_id: userId,
  });
}

module.exports = {
  processActivitiesAndWorkouts,
  processGarminWorkoutSession,
  processGarminWorkoutDefinition,
  processGarminSimpleActivity,
};