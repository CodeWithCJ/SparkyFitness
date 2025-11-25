const { log } = require('../config/logging');
const exerciseRepository = require('../models/exercise');
const exerciseEntryRepository = require('../models/exerciseEntry');
const workoutPresetRepository = require('../models/workoutPresetRepository');
const activityDetailsRepository = require('../models/activityDetailsRepository');
const preferenceRepository = require('../models/preferenceRepository');
const { v4: uuidv4 } = require('uuid');
const { parseISO, isValid, format } = require('date-fns');

async function importExerciseEntriesFromCsv(authenticatedUserId, actingUserId, entries) {
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const failedEntries = [];

  for (const entryGroup of entries) {
    try {
      // 1. Validate and use the already formatted date
      const entryDate = entryGroup.entry_date;

      // Ensure the date string is valid by attempting to parse it as ISO.
      // The frontend now sends yyyy-MM-dd, which is a valid ISO subset.
      if (!isValid(parseISO(entryDate))) {
        throw new Error(`Invalid date: ${entryDate}. Expected yyyy-MM-dd format.`);
      }

      // 2. Lookup or Create Exercise
      let exercise = await exerciseRepository.findExerciseByNameAndUserId(entryGroup.exercise_name, authenticatedUserId);
      if (!exercise) {
        log('debug', `Creating new exercise from CSV for user ${authenticatedUserId}. entryGroup:`, entryGroup);
        const newExerciseData = {
          user_id: authenticatedUserId,
          name: entryGroup.exercise_name,
          is_custom: true,
          shared_with_public: false,
          source: entryGroup.exercise_source || 'CSV_Import', // Use provided source or default
          category: entryGroup.exercise_category,
          calories_per_hour: entryGroup.calories_per_hour ? parseFloat(entryGroup.calories_per_hour) : undefined,
          description: entryGroup.exercise_description,
          force: entryGroup.exercise_force,
          level: entryGroup.exercise_level,
          mechanic: entryGroup.exercise_mechanic,
          equipment: entryGroup.exercise_equipment && entryGroup.exercise_equipment.length > 0 ? entryGroup.exercise_equipment : undefined,
          primary_muscles: entryGroup.primary_muscles && entryGroup.primary_muscles.length > 0 ? entryGroup.primary_muscles : undefined,
          secondary_muscles: entryGroup.secondary_muscles && entryGroup.secondary_muscles.length > 0 ? entryGroup.secondary_muscles : undefined,
          instructions: entryGroup.instructions && entryGroup.instructions.length > 0 ? entryGroup.instructions : undefined,
          // Images are not typically imported via CSV for exercise definitions
        };
        log('debug', `Calling createExercise with newExerciseData:`, newExerciseData);
        exercise = await exerciseRepository.createExercise(newExerciseData);
      }

      // 3. Lookup or Create Workout Preset (if preset_name is provided)
      // 3. Convert Distance and Weight based on user preferences and process sets
      const preferences = await preferenceRepository.getUserPreferences(authenticatedUserId);
      const distanceUnit = preferences?.distance_unit || 'km'; // Default to km
      const weightUnit = preferences?.weight_unit || 'kg';     // Default to kg

      let distanceInKm = entryGroup.distance;
      if (distanceInKm !== undefined && distanceInKm !== null) {
        if (distanceUnit === 'miles') {
          distanceInKm = parseFloat(distanceInKm) * 1.60934; // Convert miles to km
        } else {
          distanceInKm = parseFloat(distanceInKm);
        }
      }

      const setsWithConvertedWeight = entryGroup.sets.map(set => {
        let weightInKg = set.weight;
        if (weightInKg !== undefined && weightInKg !== null) {
          if (weightUnit === 'lbs') {
            weightInKg = parseFloat(weightInKg) * 0.453592; // Convert lbs to kg
          } else {
            weightInKg = parseFloat(weightInKg);
          }
        }
        return {
          ...set,
          weight: weightInKg,
          duration: set.duration_min, // Map frontend duration_min to backend duration
          rest_time: set.rest_time_sec, // Map frontend rest_time_sec to backend rest_time
        };
      });

      // Calculate total duration from sets
      const totalDurationMinutes = setsWithConvertedWeight.reduce((sum, set) => sum + (set.duration || 0), 0);

      // 4. Lookup or Create Workout Preset (if preset_name is provided)
      let workoutPresetId = null; // Initialize workoutPresetId once
      if (entryGroup.preset_name) {
        let workoutPreset = await workoutPresetRepository.getWorkoutPresetByName(authenticatedUserId, entryGroup.preset_name);
        if (!workoutPreset) {
          log('debug', `Creating new workout preset from CSV for user ${authenticatedUserId}. preset_name: ${entryGroup.preset_name}`);
          // Create new workout preset and its exercises/sets from current entryGroup
          workoutPreset = await workoutPresetRepository.createWorkoutPreset({
            user_id: authenticatedUserId,
            name: entryGroup.preset_name,
            description: `Auto-created from CSV import`,
            is_public: false,
            exercises: [{
              exercise_id: exercise.id,
              image_url: null, // CSV doesn't provide exercise image for preset def
              sets: setsWithConvertedWeight.map(set => ({ // Use the processed sets
                set_number: set.set_number,
                set_type: set.set_type,
                reps: set.reps,
                weight: set.weight,
                duration: set.duration,
                rest_time: set.rest_time,
                notes: set.notes,
              }))
            }]
          });
        } else {
          log('debug', `Linking to existing workout preset from CSV for user ${authenticatedUserId}. preset_name: ${entryGroup.preset_name}`);
        }
        workoutPresetId = workoutPreset.id;
      }

      // 5. Create Exercise Entry
      const newEntry = await exerciseEntryRepository.createExerciseEntry(authenticatedUserId, {
        exercise_id: exercise.id,
        duration_minutes: totalDurationMinutes || 0, // Sum of set durations
        calories_burned: entryGroup.calories_burned || 0, // Default to 0 if not provided
        entry_date: entryDate,
        notes: entryGroup.entry_notes,
        sets: setsWithConvertedWeight,
        distance: distanceInKm,
        avg_heart_rate: entryGroup.avg_heart_rate,
        exercise_preset_entry_id: workoutPresetId, // Link to preset if created/found
      }, actingUserId, 'CSV_Import'); // Add source and actingUserId

      // 6. Create Activity Details
      if (entryGroup.activity_details && entryGroup.activity_details.length > 0) {
        for (const detail of entryGroup.activity_details) {
          await activityDetailsRepository.createActivityDetail(authenticatedUserId, {
            exercise_entry_id: newEntry.id,
            provider_name: 'CSV_Import_Custom',
            detail_type: detail.field_name,
            detail_data: detail.value,
            created_by_user_id: actingUserId,
            updated_by_user_id: actingUserId,
          });
        }
      }
      createdCount++;
    } catch (error) {
      log('error', `Error processing imported exercise entry for user ${authenticatedUserId}: ${entryGroup.exercise_name} on ${entryGroup.entry_date}`, error);
      failedCount++;
      failedEntries.push({ entry: entryGroup, reason: error.message });
    }
  }

  if (failedEntries.length > 0) {
    const error = new Error('Some entries failed to import.');
    error.status = 409; // Conflict or Partial Content
    error.details = { createdCount, updatedCount, failedCount, failedEntries };
    throw error;
  }

  return {
    message: 'Historical exercise entries imported successfully.',
    created: createdCount,
    updated: updatedCount,
    failed: failedCount,
  };
}

module.exports = {
  importExerciseEntriesFromCsv,
};