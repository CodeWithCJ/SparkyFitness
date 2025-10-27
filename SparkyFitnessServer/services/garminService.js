const { log } = require('../config/logging');
const exerciseEntryRepository = require('../models/exerciseEntry');
const exerciseRepository = require('../models/exercise');
const activityDetailsRepository = require('../models/activityDetailsRepository');

async function processActivitiesAndWorkouts(userId, data, startDate, endDate) {
  const { activities, workouts } = data;
  let processedCount = 0;

  // Delete all existing Garmin-sourced exercise entries for the date range
  // This ensures a clean slate for the current sync, preventing duplicates and stale data.
  await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(userId, startDate, endDate, 'garmin');

  // Process Activities
  if (activities && Array.isArray(activities)) {
    for (const activityData of activities) {
      const { activity } = activityData;
      if (!activity) continue;

      try {
        const exerciseName = activity.activityName || 'Garmin Activity';
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
          avg_heart_rate: activity.averageHeartRateInBeatsPerMinute || null, // Extract average heart rate
        };

        const newEntry = await exerciseEntryRepository.createExerciseEntry(userId, exerciseEntryData, userId, 'garmin');

        // Delete all existing activity details for this exercise entry and provider to prevent duplicates
        await activityDetailsRepository.deleteActivityDetailsByEntryIdAndProvider(userId, newEntry.id, 'garmin');

        // Now create the activity details for full activity data
        await activityDetailsRepository.createActivityDetail(userId, {
          exercise_entry_id: newEntry.id,
          provider_name: 'garmin',
          detail_type: 'full_activity_data',
          detail_data: activityData, // Pass as object
          created_by_user_id: userId,
        });


        processedCount++;
      } catch (error) {
        log('error', `Failed to process Garmin activity for user ${userId}: ${error.message}`, { activity, error });
      }
    }
  }

  // Process Workouts
  if (workouts && Array.isArray(workouts)) {
    for (const workout of workouts) {
        if (!workout.workoutSegments) continue;

        for (const segment of workout.workoutSegments) {
            if (!segment.workoutSteps) continue;

            for (const step of segment.workoutSteps) {
                const stepsToProcess = step.type === 'RepeatGroupDTO' ? step.workoutSteps : [step];

                for (const individualStep of stepsToProcess) {
                    if (individualStep.type !== 'ExecutableStepDTO' || !individualStep.exerciseName) continue;

                    try {
                        let exercise = await exerciseRepository.findExerciseByNameAndUserId(individualStep.exerciseName, userId);

                        if (!exercise) {
                            exercise = await exerciseRepository.createExercise({
                                user_id: userId,
                                name: individualStep.exerciseName,
                                category: individualStep.category || 'Uncategorized',
                                source: 'garmin',
                                is_custom: true,
                                shared_with_public: false,
                            });
                        }

                        const entryDate = workout.createdDate ? new Date(workout.createdDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
                        
                        let weightInKg = 0;
                        if (individualStep.weightValue && individualStep.weightUnit?.unitKey === 'pound') {
                            weightInKg = individualStep.weightValue * 0.453592; // Convert pounds to kilograms
                        } else if (individualStep.weightValue) {
                            weightInKg = individualStep.weightValue; // Assume it's already in kg or no conversion needed
                        }

                        const sets = [{
                            set_number: 1,
                            set_type: individualStep.stepType?.stepTypeKey,
                            reps: individualStep.endConditionValue || 0,
                            weight: weightInKg,
                            duration: 0,
                            rest_time: 0,
                            notes: ''
                        }];

                        const exerciseEntryData = {
                            exercise_id: exercise.id,
                            duration_minutes: (workout.estimatedDurationInSecs || 0) / 60,
                            calories_burned: 0, // Not provided per exercise
                            entry_date: entryDate,
                            notes: `Garmin Workout: ${workout.workoutName} - ${individualStep.exerciseName}`,
                            sets: sets,
                        };

                        const newEntry = await exerciseEntryRepository.createExerciseEntry(userId, exerciseEntryData, userId, 'garmin');

                        // Delete all existing activity details for this exercise entry and provider to prevent duplicates
                        await activityDetailsRepository.deleteActivityDetailsByEntryIdAndProvider(userId, newEntry.id, 'garmin');

                        // Now create the activity details for full workout data
                        const fullWorkoutDetailData = { ...workout, workout_step: individualStep };
                        if (workout.sportType) {
                            fullWorkoutDetailData.sportType = workout.sportType;
                        }
                        await activityDetailsRepository.createActivityDetail(userId, {
                            exercise_entry_id: newEntry.id,
                            provider_name: 'garmin',
                            detail_type: 'full_workout_data',
                            detail_data: fullWorkoutDetailData, // Pass as object
                            created_by_user_id: userId,
                        });

                        processedCount++;
                    } catch (error) {
                        log('error', `Failed to process Garmin workout step for user ${userId}: ${error.message}`, { step: individualStep, error });
                    }
                }
            }
        }
    }
  }

  return { processedEntries: processedCount };
}

module.exports = {
  processActivitiesAndWorkouts,
};