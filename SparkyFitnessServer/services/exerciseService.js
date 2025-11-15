const { getClient, getSystemClient } = require('../db/poolManager'); // Import the database connection pool
const exerciseRepository = require('../models/exerciseRepository');
// Require concrete exercise and exerciseEntry modules directly to avoid circular export issues
const exerciseDb = require('../models/exercise');
const exerciseEntryDb = require('../models/exerciseEntry');
const activityDetailsRepository = require('../models/activityDetailsRepository'); // New import
const exercisePresetEntryRepository = require('../models/exercisePresetEntryRepository'); // New import
const userRepository = require('../models/userRepository');
const preferenceRepository = require('../models/preferenceRepository');
const { v4: uuidv4 } = require('uuid'); // New import for UUID generation
const { log } = require('../config/logging');
const wgerService = require('../integrations/wger/wgerService');
const nutritionixService = require('../integrations/nutritionix/nutritionixService');
const freeExerciseDBService = require('../integrations/freeexercisedb/FreeExerciseDBService'); // New import
const measurementRepository = require('../models/measurementRepository');
const { downloadImage } = require('../utils/imageDownloader'); // Import image downloader
const calorieCalculationService = require('./CalorieCalculationService'); // Import calorie calculation service
const fs = require('fs'); // Import file system module
const path = require('path'); // Import path module
const { isValidUuid, resolveExerciseIdToUuid } = require('../utils/uuidUtils'); // Import uuidUtils
const papa = require('papaparse');
const {
  checkFamilyAccessPermission,
} = require("../models/familyAccessRepository");

async function getExercisesWithPagination(authenticatedUserId, targetUserId, searchTerm, categoryFilter, ownershipFilter, equipmentFilter, muscleGroupFilter, currentPage, itemsPerPage) {
  try {
    const limit = parseInt(itemsPerPage, 10) || 10;
    const offset = ((parseInt(currentPage, 10) || 1) - 1) * limit;

    const [exercises, totalCount] = await Promise.all([
      exerciseDb.getExercisesWithPagination(targetUserId, searchTerm, categoryFilter, ownershipFilter, equipmentFilter, muscleGroupFilter, limit, offset),
      exerciseDb.countExercises(targetUserId, searchTerm, categoryFilter, ownershipFilter, equipmentFilter, muscleGroupFilter)
    ]);
    const taggedExercises = await Promise.all(
        exercises.map(async (exercise) => {
            const tags = [];
            const isOwner = exercise.user_id === authenticatedUserId;

            if (isOwner) {
                tags.push("private");
            }
            
            if (exercise.shared_with_public) {
                tags.push("public");
            }

            if (!isOwner && !exercise.shared_with_public) {
                // If not owned and not public, it must be visible due to family access
                tags.push("family");
            }

            return { ...exercise, tags };
        })
    );
    return { exercises: taggedExercises, totalCount };
  } catch (error) {
    log('error', `Error fetching exercises with pagination for user ${authenticatedUserId} and target ${targetUserId}:`, error);
    throw error;
  }
}

async function searchExercises(authenticatedUserId, name, targetUserId, equipmentFilter, muscleGroupFilter) {
  try {
  const exercises = await exerciseDb.searchExercises(name, targetUserId, equipmentFilter, muscleGroupFilter);
    const taggedExercises = await Promise.all(
      exercises.map(async (exercise) => {
        const tags = [];
        const isOwner = exercise.user_id === authenticatedUserId;

        if (isOwner) {
          tags.push("private");
        }

        if (exercise.shared_with_public) {
          tags.push("public");
        }

        if (!isOwner && !exercise.shared_with_public) {
            tags.push("family");
        }

        return { ...exercise, tags };
      })
    );
    return taggedExercises;
  } catch (error) {
    log('error', `Error searching exercises for user ${authenticatedUserId} with name "${name}":`, error);
    throw error;
  }
}

async function getAvailableEquipment() {
  try {
  const equipment = await exerciseDb.getDistinctEquipment();
    return equipment;
  } catch (error) {
    log('error', `Error fetching available equipment:`, error);
    throw error;
  }
}

async function getAvailableMuscleGroups() {
  try {
  const muscleGroups = await exerciseDb.getDistinctMuscleGroups();
    return muscleGroups;
  } catch (error) {
    log('error', `Error fetching available muscle groups:`, error);
    throw error;
  }
}

async function createExercise(authenticatedUserId, exerciseData) {
  try {
    // Ensure the exercise is created for the authenticated user
    exerciseData.user_id = authenticatedUserId;
    // If images are provided, ensure they are stored as JSON string in the database
    if (exerciseData.images && Array.isArray(exerciseData.images)) {
      exerciseData.images = JSON.stringify(exerciseData.images);
    }
  const newExercise = await exerciseDb.createExercise(exerciseData);
    return newExercise;
  } catch (error) {
    log('error', `Error creating exercise for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function createExerciseEntry(authenticatedUserId, actingUserId, entryData) {
  try {
    // Resolve exercise_id to a UUID
    const resolvedExerciseId = await resolveExerciseIdToUuid(entryData.exercise_id);
    entryData.exercise_id = resolvedExerciseId;

    // Fetch exercise details to create the snapshot
    const exercise = await exerciseDb.getExerciseById(entryData.exercise_id, authenticatedUserId);
    if (!exercise) {
      throw new Error("Exercise not found for snapshot.");
    }

    // If calories_burned is not provided, calculate it using the calorieCalculationService
    let calculatedCaloriesBurned = entryData.calories_burned;
    if (!calculatedCaloriesBurned && entryData.exercise_id && entryData.duration_minutes !== null && entryData.duration_minutes !== undefined) {
      const caloriesPerHour = await calorieCalculationService.estimateCaloriesBurnedPerHour(exercise, authenticatedUserId, entryData.sets);
      calculatedCaloriesBurned = (caloriesPerHour / 60) * entryData.duration_minutes;
    } else if (!calculatedCaloriesBurned) {
      calculatedCaloriesBurned = 0;
    }

    // Populate snapshot fields
    const snapshotEntryData = {
      ...entryData,
      user_id: authenticatedUserId,
      created_by_user_id: actingUserId, // Use actingUserId for audit
      exercise_name: exercise.name,
      calories_per_hour: exercise.calories_per_hour, // Snapshot the exercise's base calories_per_hour
      calories_burned: calculatedCaloriesBurned,
      duration_minutes: typeof entryData.duration_minutes === 'number' ? entryData.duration_minutes : 0,
      workout_plan_assignment_id: entryData.workout_plan_assignment_id || null,
      image_url: entryData.image_url || null,
      distance: entryData.distance || null,
      avg_heart_rate: entryData.avg_heart_rate || null,
    };

  // Use exerciseEntry module to create the entry (handles sets and snapshot inserts)
  const newEntry = await exerciseEntryDb.createExerciseEntry(authenticatedUserId, snapshotEntryData, actingUserId);

   // If activity_details are provided, create them
   if (entryData.activity_details && entryData.activity_details.length > 0) {
     for (const detail of entryData.activity_details) {
       await activityDetailsRepository.createActivityDetail(authenticatedUserId, {
         exercise_entry_id: newEntry.id,
         provider_name: detail.provider_name || 'Manual', // Default to Manual if not provided
         detail_type: detail.detail_type,
         detail_data: detail.detail_data,
         created_by_user_id: actingUserId,
         updated_by_user_id: actingUserId,
       });
     }
   }
    return newEntry;
  } catch (error) {
    log('error', `Error creating exercise entry for user ${authenticatedUserId} by ${actingUserId}:`, error);
    throw error;
  }
}

async function getExerciseEntryById(authenticatedUserId, id) {
  try {
    const entryOwnerId = await exerciseEntryDb.getExerciseEntryOwnerId(id, authenticatedUserId);
    if (!entryOwnerId) {
      throw new Error('Exercise entry not found.');
    }
    const entry = await exerciseEntryDb.getExerciseEntryById(id, authenticatedUserId);
    // Fetch activity details
    const activityDetails = await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(authenticatedUserId, id);
    return { ...entry, activity_details: activityDetails };
   } catch (error) {
     log('error', `Error fetching exercise entry ${id} by user ${authenticatedUserId}:`, error);
     throw error;
   }
 }

async function updateExerciseEntry(authenticatedUserId, id, updateData) {
  try {
    const existingEntry = await exerciseEntryDb.getExerciseEntryById(id, authenticatedUserId);
    if (!existingEntry) {
      throw new Error('Exercise entry not found.');
    }

    // If a new image is being uploaded or the image is being cleared, delete the old one
    // If a new image is being uploaded or the image is being cleared, delete the old one
    if ((updateData.image_url || updateData.image_url === null) && existingEntry.image_url) {
      const oldImagePath = path.join(__dirname, '..', existingEntry.image_url);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
        log('info', `Deleted old exercise entry image: ${oldImagePath}`);
      }
    }
 
    // If calories_burned is not provided, calculate it using the calorieCalculationService
    if (updateData.exercise_id && updateData.duration_minutes !== null && updateData.duration_minutes !== undefined && updateData.calories_burned === undefined) {
  const exercise = await exerciseDb.getExerciseById(updateData.exercise_id, authenticatedUserId);
      if (exercise) {
        const caloriesPerHour = await calorieCalculationService.estimateCaloriesBurnedPerHour(exercise, authenticatedUserId, updateData.sets);
        updateData.calories_burned = (caloriesPerHour / 60) * updateData.duration_minutes;
      } else {
        log('warn', `Exercise ${updateData.exercise_id} not found. Cannot auto-calculate calories_burned.`);
        updateData.calories_burned = 0;
      }
    } else if (updateData.calories_burned === undefined) {
      // If calories_burned is not in updateData, use existing value or 0
      updateData.calories_burned = existingEntry.calories_burned || 0;
    }

    const updatedEntry = await exerciseEntryDb.updateExerciseEntry(id, authenticatedUserId, {
      ...updateData,
      duration_minutes: updateData.duration_minutes || 0,
      sets: updateData.sets || null,
      reps: updateData.reps || null,
      weight: updateData.weight || null,
      workout_plan_assignment_id: updateData.workout_plan_assignment_id || null,
      image_url: updateData.image_url === null ? null : (updateData.image_url || existingEntry.image_url),
      distance: updateData.distance || null,
      avg_heart_rate: updateData.avg_heart_rate || null,
    });
    if (!updatedEntry) {
      throw new Error('Exercise entry not found or not authorized to update.');
    }
    // Handle activity details updates
   if (updateData.activity_details !== undefined) {
     const existingActivityDetails = await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(authenticatedUserId, id);
     const incomingActivityDetails = updateData.activity_details || [];

     // Identify details to delete
     for (const existingDetail of existingActivityDetails) {
       const found = incomingActivityDetails.find(
         (incomingDetail) => incomingDetail.id === existingDetail.id
       );
       if (!found) {
         await activityDetailsRepository.deleteActivityDetail(authenticatedUserId, existingDetail.id);
       }
     }

     // Identify details to create or update
     for (const incomingDetail of incomingActivityDetails) {
       if (incomingDetail.id) {
         // Update existing detail
         await activityDetailsRepository.updateActivityDetail(authenticatedUserId, incomingDetail.id, {
           ...incomingDetail,
           updated_by_user_id: authenticatedUserId,
         });
       } else {
         // Create new detail
         await activityDetailsRepository.createActivityDetail(authenticatedUserId, {
           ...incomingDetail,
           exercise_entry_id: id,
           created_by_user_id: authenticatedUserId,
           updated_by_user_id: authenticatedUserId,
         });
       }
     }
   }
    return updatedEntry;
  } catch (error) {
    log('error', `Error updating exercise entry ${id} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function deleteExerciseEntry(authenticatedUserId, id) {
  try {
    const entryOwnerId = await exerciseEntryDb.getExerciseEntryOwnerId(id, authenticatedUserId);
    if (!entryOwnerId) {
      throw new Error('Exercise entry not found.');
    }
    const entry = await exerciseEntryDb.getExerciseEntryById(id, entryOwnerId);
    if (!entry) {
      throw new Error('Exercise entry not found.'); // Should not happen if entryOwnerId was found
    }

    // If an image is associated with the entry, delete it from the filesystem
    if (entry.image_url) {
      const imagePath = path.join(__dirname, '..', entry.image_url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        log('info', `Deleted exercise entry image: ${imagePath}`);
      }
    }

    const success = await exerciseEntryDb.deleteExerciseEntry(id, entryOwnerId);
    if (!success) {
      throw new Error('Exercise entry not found or not authorized to delete.');
    }
    return { message: 'Exercise entry deleted successfully.' };
  } catch (error) {
    log('error', `Error deleting exercise entry ${id} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getExerciseById(authenticatedUserId, id) {
  try {
    const exerciseOwnerId = await exerciseDb.getExerciseOwnerId(id, authenticatedUserId);
    if (!exerciseOwnerId) {
      const publicExercise = await exerciseDb.getExerciseById(id);
      if (publicExercise && !publicExercise.is_custom) {
        return publicExercise;
      }
      throw new Error('Exercise not found.');
    }
    const exercise = await exerciseDb.getExerciseById(id, authenticatedUserId);
    return exercise;
  } catch (error) {
    log('error', `Error fetching exercise ${id} by user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function updateExercise(authenticatedUserId, id, updateData) {
  try {
    const exerciseOwnerId = await exerciseDb.getExerciseOwnerId(id, authenticatedUserId);
    if (!exerciseOwnerId) {
      throw new Error('Exercise not found.');
    }
    // If images are provided, ensure they are stored as JSON string in the database
    if (updateData.images && Array.isArray(updateData.images)) {
      updateData.images = JSON.stringify(updateData.images);
    }
    const updatedExercise = await exerciseDb.updateExercise(id, authenticatedUserId, updateData);
    if (!updatedExercise) {
      throw new Error('Exercise not found or not authorized to update.');
    }
    return updatedExercise;
  } catch (error) {
    log('error', `Error updating exercise ${id} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function deleteExercise(authenticatedUserId, exerciseId, forceDelete = false) {
  log("info", `deleteExercise: Attempting to delete exercise ${exerciseId} by user ${authenticatedUserId}. Force delete: ${forceDelete}`);
  try {
    const exerciseOwnerId = await exerciseDb.getExerciseOwnerId(exerciseId, authenticatedUserId);
    if (!exerciseOwnerId) {
      log("warn", `deleteExercise: Exercise ${exerciseId} not found for user ${authenticatedUserId}.`);
      throw new Error("Exercise not found.");
    }

  const deletionImpact = await exerciseDb.getExerciseDeletionImpact(exerciseId, authenticatedUserId);
    log("info", `deleteExercise: Deletion impact for exercise ${exerciseId}: ${JSON.stringify(deletionImpact)}`);

    const {
      exerciseEntriesCount,
      workoutPlansCount,
      workoutPresetsCount,
      currentUserReferences,
      otherUserReferences,
      isPubliclyShared,
      familySharedUsers,
    } = deletionImpact;

    const totalReferences = exerciseEntriesCount + workoutPlansCount + workoutPresetsCount;

    // Scenario 1: No references at all
    if (totalReferences === 0) {
      log("info", `deleteExercise: Exercise ${exerciseId} has no references. Performing hard delete.`);
      const success = await exerciseDb.deleteExerciseAndDependencies(exerciseId, authenticatedUserId);
      if (!success) {
        throw new Error("Exercise not found or not authorized to delete.");
      }
      return { message: "Exercise deleted permanently.", status: "deleted" };
    }

    // Scenario 2: References only by the current user
    if (otherUserReferences === 0) {
      if (forceDelete) {
        log("info", `deleteExercise: Exercise ${exerciseId} has references only by current user. Force deleting.`);
        const success = await exerciseDb.deleteExerciseAndDependencies(exerciseId, authenticatedUserId);
        if (!success) {
          throw new Error("Exercise not found or not authorized to delete.");
        }
        return { message: "Exercise and all its references deleted permanently.", status: "force_deleted" };
      } else {
        // Hide the exercise (mark as quick/hidden) so it won't appear in searches but existing references remain
        log("info", `deleteExercise: Exercise ${exerciseId} has references only by current user. Hiding as quick exercise.`);
        await exerciseDb.updateExercise(exerciseId, exerciseOwnerId, { is_quick_exercise: true });
        return { message: "Exercise hidden (marked as quick exercise). Existing references remain.", status: "hidden" };
      }
    }

    // Scenario 3: References by other users
    if (otherUserReferences > 0) {
        // If other users reference this exercise, hide it (mark as quick exercise) so it's removed from searches
        log("info", `deleteExercise: Exercise ${exerciseId} has references by other users. Hiding as quick exercise.`);
        await exerciseDb.updateExercise(exerciseId, exerciseOwnerId, { is_quick_exercise: true });
        return { message: "Exercise hidden (marked as quick exercise). Existing references remain.", status: "hidden" };
    }

    // Fallback for any unhandled cases (should not be reached)
    log("warn", `deleteExercise: Unhandled deletion scenario for exercise ${exerciseId}.`);
    throw new Error("Could not delete exercise due to an unknown issue.");

  } catch (error) {
    log(
      "error",
      `Error deleting exercise ${exerciseId} by user ${authenticatedUserId} in exerciseService:`,
      error
    );
    throw error;
  }
}

async function getExerciseEntriesByDate(authenticatedUserId, targetUserId, selectedDate) {
  try {
    if (!targetUserId) {
      log('error', 'getExerciseEntriesByDate: targetUserId is undefined. Returning empty array.');
      return [];
    }
  // Use the exerciseEntryDb directly to avoid circular dependency where exerciseRepository
  // may not have fully exported its properties yet at runtime.
  const entries = await exerciseEntryDb.getExerciseEntriesByDate(targetUserId, selectedDate);
    if (!entries || entries.length === 0) {
      return [];
    }

    // For each entry, fetch and attach its activity details
    const entriesWithDetails = await Promise.all(entries.map(async (entry) => {
      const activityDetails = await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(authenticatedUserId, entry.id, entry.exercise_preset_entry_id);
      return { ...entry, activity_details: activityDetails };
    }));

    return entriesWithDetails;
  } catch (error) {
    log('error', `Error fetching exercise entries for user ${targetUserId} on ${selectedDate} by ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getOrCreateActiveCaloriesExercise(userId) {
  try {
    const exerciseId = await exerciseDb.getOrCreateActiveCaloriesExercise(userId);
    return exerciseId;
  } catch (error) {
    log('error', `Error getting or creating active calories exercise for user ${userId}:`, error);
    throw error;
  }
}

async function upsertExerciseEntryData(userId, exerciseId, caloriesBurned, date) {
  try {
    const entry = await exerciseEntryDb.upsertExerciseEntryData(userId, exerciseId, caloriesBurned, date);
    return entry;
  } catch (error) {
    log('error', `Error upserting exercise entry data for user ${userId}, exercise ${exerciseId}:`, error);
    throw error;
  }
}

async function searchExternalExercises(authenticatedUserId, query, providerId, providerType, equipmentFilter, muscleGroupFilter, limit = 50) {
  log('info', `[exerciseService] searchExternalExercises called with: query='${query}', providerType='${providerType}', equipmentFilter='${equipmentFilter}', muscleGroupFilter='${muscleGroupFilter}'`);
  try {
    let exercises = [];
    const latestMeasurement = await measurementRepository.getLatestMeasurement(authenticatedUserId);
    const userWeightKg = (latestMeasurement && latestMeasurement.weight) ? latestMeasurement.weight : 70; // Default to 70kg

    const hasFilters = equipmentFilter.length > 0 || muscleGroupFilter.length > 0;
    const hasQuery = query.trim().length > 0;

    // If there's no search query but filters are present, and the provider doesn't support filters,
    // return an empty array to avoid returning a large, unfiltered list.
    if (!hasQuery && hasFilters) {
      if (providerType === 'nutritionix') {
        log('warn', `External search for provider ${providerType} received filters but no search query. Filters are not supported for this provider without a search query. Returning empty results.`);
        return [];
      }
    }

    if (providerType === 'wger') {
      const muscleIdMap = await wgerService.getWgerMuscleIdMap();
      const equipmentIdMap = await wgerService.getWgerEquipmentIdMap();

      const muscleIds = muscleGroupFilter.flatMap(name => muscleIdMap[name] || []).filter(id => id);
      const equipmentIds = equipmentFilter.flatMap(name => equipmentIdMap[name] || []).filter(id => id);

      const wgerSearchResults = await wgerService.searchWgerExercises(query, muscleIds, equipmentIds, 'en', limit);

      exercises = wgerSearchResults.map(exercise => {
        let caloriesPerHour = 0;
        if (exercise.met && exercise.met > 0) {
          caloriesPerHour = Math.round((exercise.met * 3.5 * userWeightKg) / 200 * 60);
        }

        return {
          id: exercise.id.toString(),
          name: exercise.name,
          category: exercise.category ? exercise.category.name : 'Uncategorized',
          calories_per_hour: caloriesPerHour,
          description: exercise.description || exercise.name,
          force: exercise.force,
          mechanic: exercise.mechanic,
          instructions: exercise.instructions,
          images: exercise.images,
        };
      });
    } else if (providerType === 'nutritionix') {
      // For Nutritionix, we are not using user demographics for now, as per user feedback.
      const nutritionixSearchResults = await nutritionixService.searchNutritionixExercises(query, providerId);
      exercises = nutritionixSearchResults;
    } else if (providerType === 'free-exercise-db') {
      const freeExerciseDBSearchResults = await freeExerciseDBService.searchExercises(query, equipmentFilter, muscleGroupFilter, limit); // Pass filters and limit
      exercises = freeExerciseDBSearchResults.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        category: exercise.category,
        calories_per_hour: 0, // Will be calculated when added to user's exercises
        description: exercise.description,
        source: 'free-exercise-db',
        force: exercise.force,
        level: exercise.level,
        mechanic: exercise.mechanic,
        equipment: Array.isArray(exercise.equipment) ? exercise.equipment : (exercise.equipment ? [exercise.equipment] : []),
        primary_muscles: Array.isArray(exercise.primaryMuscles) ? exercise.primaryMuscles : (exercise.primaryMuscles ? [exercise.primaryMuscles] : []),
        secondary_muscles: Array.isArray(exercise.secondaryMuscles) ? exercise.secondaryMuscles : (exercise.secondaryMuscles ? [exercise.secondaryMuscles] : []),
        instructions: Array.isArray(exercise.instructions) ? exercise.instructions : (exercise.instructions ? [exercise.instructions] : []),
        images: exercise.images.map(img => freeExerciseDBService.getExerciseImageUrl(img)), // Convert to full URLs for search results
      }));
    } else {
      throw new Error(`Unsupported external exercise provider: ${providerType}`);
    }
    return exercises;
  } catch (error) {
    log('error', `Error searching external exercises with query "${query}" from provider "${providerType}":`, error);
    throw error;
  }
}

async function addExternalExerciseToUserExercises(authenticatedUserId, wgerExerciseId) {
  try {
    const wgerExerciseDetails = await wgerService.getWgerExerciseDetails(wgerExerciseId);

    if (!wgerExerciseDetails) {
      throw new Error('Wger exercise not found.');
    }

    log('info', `Raw wger exercise data for exercise ID ${wgerExerciseId}: ${JSON.stringify(wgerExerciseDetails, null, 2)}`);

    // Calculate calories_per_hour
    let caloriesPerHour = 0; // Default value if MET is not available or calculation fails
    if (wgerExerciseDetails.met && wgerExerciseDetails.met > 0) {
      let userWeightKg = 70; // Default to 70kg if user weight not found
      const latestMeasurement = await measurementRepository.getLatestMeasurement(authenticatedUserId);
      if (latestMeasurement && latestMeasurement.weight) {
        userWeightKg = latestMeasurement.weight;
      }

      // Formula: METs * 3.5 * body weight in kg / 200 = calories burned per minute
      // To get calories per hour: (METs * 3.5 * body weight in kg) / 200 * 60
      caloriesPerHour = (wgerExerciseDetails.met * 3.5 * userWeightKg) / 200 * 60;
      caloriesPerHour = Math.round(caloriesPerHour); // Round to nearest whole number
    } else {
      caloriesPerHour = await calorieCalculationService.estimateCaloriesBurnedPerHour(wgerExerciseDetails, authenticatedUserId);
    }

    // Use the name from translations if available, otherwise fallback to description or ID
    const exerciseName = (wgerExerciseDetails.translations && wgerExerciseDetails.translations.length > 0 && wgerExerciseDetails.translations[0].name)
      ? wgerExerciseDetails.translations[0].name
      : wgerExerciseDetails.description || `Wger Exercise ${wgerExerciseId}`;

    const { levelMap, forceMap, mechanicMap, createReverseMap, muscleNameMap, equipmentNameMap } = require('../integrations/wger/wgerNameMapping');
    const wgerLevelName = wgerExerciseDetails.level?.name || 'Intermediate';
    const mappedLevel = levelMap[wgerLevelName] || 'intermediate';

    const reverseMuscleMap = createReverseMap(muscleNameMap);
    const reverseEquipmentMap = createReverseMap(equipmentNameMap);

    const wgerForceName = wgerExerciseDetails.force?.name || null;
    const mappedForce = wgerForceName ? forceMap[wgerForceName.toLowerCase()] : null;

    const wgerMechanicName = wgerExerciseDetails.mechanic?.name || null;
    const mappedMechanic = wgerMechanicName ? mechanicMap[wgerMechanicName.toLowerCase()] : null;

    const rawDescription = (wgerExerciseDetails.translations && wgerExerciseDetails.translations.length > 0 && wgerExerciseDetails.translations[0].description) || '';
    
    // Sanitize and split instructions
    const instructions = rawDescription
      .replace(/<li>/g, '\n- ') // Add a marker for list items
      .replace(/<[^>]*>/g, '') // Remove all other HTML tags
      .split('\n')
      .map(s => s.trim())
      .filter(s => s);

    const exerciseData = {
      name: exerciseName,
      category: wgerExerciseDetails.category ? wgerExerciseDetails.category.name : 'general',
      calories_per_hour: caloriesPerHour,
      description: instructions[0] || exerciseName, // Use the first instruction as description
      user_id: authenticatedUserId,
      is_custom: true, // Mark as custom as it's imported by the user
      shared_with_public: false, // Imported exercises are private by default
      source_external_id: wgerExerciseDetails.id.toString(), // Store wger ID
      source: 'wger', // Explicitly set the source to 'wger'
      level: mappedLevel,
      force: mappedForce,
      mechanic: mappedMechanic,
      equipment: wgerExerciseDetails.equipment?.map(e => reverseEquipmentMap[e.name.toLowerCase()] || e.name) || [],
      primary_muscles: wgerExerciseDetails.muscles?.map(m => reverseMuscleMap[m.name.toLowerCase()] || m.name) || [],
      secondary_muscles: wgerExerciseDetails.muscles_secondary?.map(m => reverseMuscleMap[m.name.toLowerCase()] || m.name) || [],
      instructions: instructions,
      images: [], // Initialize as empty, will be populated after download
    };

    // Download images and update paths
    if (wgerExerciseDetails.images && wgerExerciseDetails.images.length > 0) {
      const exerciseFolderName = exerciseName.replace(/[^a-zA-Z0-9]/g, '_');
      const localImagePaths = await Promise.all(
        wgerExerciseDetails.images.map(async (img) => {
          try {
            const imageUrl = img.image;
            if (imageUrl) {
              const fullPath = await downloadImage(imageUrl, exerciseFolderName);
              // The frontend expects a path relative to the 'uploads/exercises' directory
              return fullPath.replace('/uploads/exercises/', '');
            }
          } catch (imgError) {
            log('error', `Failed to download image ${img.image} for exercise ${exerciseName}:`, imgError);
          }
          return null;
        })
      );
      exerciseData.images = localImagePaths.filter(p => p !== null);
    }


    log('info', `Mapped exercise data before insert: ${JSON.stringify(exerciseData, null, 2)}`);

  const newExercise = await exerciseDb.createExercise(exerciseData);
    return newExercise;
  } catch (error) {
    log('error', `Error adding external exercise ${wgerExerciseId} for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function addNutritionixExerciseToUserExercises(authenticatedUserId, nutritionixExerciseData) {
  try {
    const newExerciseId = uuidv4(); // Generate a new UUID for the local exercise

    const exerciseData = {
      id: newExerciseId,
      name: nutritionixExerciseData.name,
      category: nutritionixExerciseData.category || 'External',
      calories_per_hour: nutritionixExerciseData.calories_per_hour,
      description: nutritionixExerciseData.description,
      user_id: authenticatedUserId,
      is_custom: true, // Mark as custom as it's imported by the user
      shared_with_public: false, // Imported exercises are private by default
      source_external_id: nutritionixExerciseData.external_id.toString(), // Store original Nutritionix ID
      source: 'nutritionix',
    };

  const newExercise = await exerciseDb.createExercise(exerciseData);
    return newExercise;
  } catch (error) {
    log('error', `Error adding Nutritionix exercise for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function addFreeExerciseDBExerciseToUserExercises(authenticatedUserId, freeExerciseDBId) {
  try {
    const freeExerciseDBService = require('../integrations/freeexercisedb/FreeExerciseDBService'); // Lazy load to avoid circular dependency
    const exerciseDetails = await freeExerciseDBService.getExerciseById(freeExerciseDBId);

    if (!exerciseDetails) {
      throw new Error('Free-Exercise-DB exercise not found.');
    }

    // Download images and update paths
    const localImagePaths = await Promise.all(
      exerciseDetails.images.map(async (imagePath) => {
        const imageUrl = freeExerciseDBService.getExerciseImageUrl(imagePath); // This now correctly forms the external URL
        const exerciseIdFromPath = imagePath.split('/')[0]; // Extract exercise ID from path for download
        await downloadImage(imageUrl, exerciseIdFromPath); // Download the image
        return imagePath; // Store the original relative path in the database
      })
    );

    // Map free-exercise-db data to our generic Exercise model
    const exerciseData = {
      id: uuidv4(), // Generate a new UUID for the local exercise
      source: 'free-exercise-db',
      source_id: exerciseDetails.id,
      name: exerciseDetails.name,
      force: exerciseDetails.force,
      level: exerciseDetails.level,
      mechanic: exerciseDetails.mechanic,
      equipment: exerciseDetails.equipment,
      primary_muscles: exerciseDetails.primaryMuscles,
      secondary_muscles: exerciseDetails.secondaryMuscles,
      instructions: exerciseDetails.instructions,
      category: exerciseDetails.category,
      images: JSON.stringify(exerciseDetails.images), // Store original relative paths as JSON string
      calories_per_hour: await calorieCalculationService.estimateCaloriesBurnedPerHour(exerciseDetails, authenticatedUserId), // Calculate calories
      description: exerciseDetails.instructions[0] || exerciseDetails.name, // Use first instruction as description or name
      user_id: authenticatedUserId,
      is_custom: true, // Imported exercises are custom to the user
      shared_with_public: false, // Imported exercises are private by default
    };

  const newExercise = await exerciseDb.createExercise(exerciseData);
    return newExercise;
  } catch (error) {
    log('error', `Error adding Free-Exercise-DB exercise ${freeExerciseDBId} for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getSuggestedExercises(authenticatedUserId, limit) {
  try {
    const preferences = await preferenceRepository.getUserPreferences(authenticatedUserId);
    const displayLimit = preferences?.item_display_limit || limit;
  const recentExercises = await exerciseDb.getRecentExercises(authenticatedUserId, displayLimit);
  const topExercises = await exerciseDb.getTopExercises(authenticatedUserId, displayLimit);
    return { recentExercises, topExercises };
  } catch (error) {
    log('error', `Error fetching suggested exercises for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getRecentExercises(authenticatedUserId, limit) {
  try {
    const preferences = await preferenceRepository.getUserPreferences(authenticatedUserId);
    const displayLimit = preferences?.item_display_limit || limit;
  const recentExercises = await exerciseDb.getRecentExercises(authenticatedUserId, displayLimit);
    const taggedExercises = await Promise.all(
      recentExercises.map(async (exercise) => {
        const tags = [];
        const isOwner = exercise.user_id === authenticatedUserId;

        if (isOwner) {
          tags.push("private");
        }
        
        if (exercise.shared_with_public) {
          tags.push("public");
        }

        if (!isOwner && !exercise.shared_with_public) {
            tags.push("family");
        }

        return { ...exercise, tags };
      })
    );
    return taggedExercises;
  } catch (error) {
    log('error', `Error fetching recent exercises for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getTopExercises(authenticatedUserId, limit) {
  try {
    const preferences = await preferenceRepository.getUserPreferences(authenticatedUserId);
    const displayLimit = preferences?.item_display_limit || limit;
  const topExercises = await exerciseDb.getTopExercises(authenticatedUserId, displayLimit);
    const taggedExercises = await Promise.all(
      topExercises.map(async (exercise) => {
        const tags = [];
        const isOwner = exercise.user_id === authenticatedUserId;

        if (isOwner) {
          tags.push("private");
        }
        
        if (exercise.shared_with_public) {
          tags.push("public");
        }

        if (!isOwner && !exercise.shared_with_public) {
            tags.push("family");
        }

        return { ...exercise, tags };
      })
    );
    return taggedExercises;
  } catch (error) {
    log('error', `Error fetching top exercises for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getExerciseProgressData(authenticatedUserId, exerciseId, startDate, endDate) {
  try {
    // getExerciseProgressData is implemented in the exerciseEntry module
    const progressData = await exerciseEntryDb.getExerciseProgressData(authenticatedUserId, exerciseId, startDate, endDate);
    return progressData;
  } catch (error) {
    log('error', `Error fetching exercise progress data for user ${authenticatedUserId}, exercise ${exerciseId}:`, error);
    throw error;
  }
}
 
async function getExerciseHistory(authenticatedUserId, exerciseId, limit) {
  try {
    const resolvedExerciseId = await resolveExerciseIdToUuid(exerciseId);
    // getExerciseHistory is implemented in the exerciseEntry module
    const history = await exerciseEntryDb.getExerciseHistory(authenticatedUserId, resolvedExerciseId, limit);
    return history;
  } catch (error) {
    log('error', `Error fetching exercise history for user ${authenticatedUserId}, exercise ${exerciseId}:`, error);
    throw error;
  }
}

async function importExercisesFromCSV(authenticatedUserId, filePath) {
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const failedRows = [];

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data, errors } = papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
    });

    if (errors.length > 0) {
      log('error', 'CSV parsing errors:', errors);
      throw new Error('CSV parsing failed. Please check file format.');
    }

    for (const row of data) {
      try {
        const exerciseName = row.name ? row.name.trim() : null;
        if (!exerciseName) {
          failedCount++;
          failedRows.push({ row, reason: 'Exercise name is required.' });
          continue;
        }

        const primaryMuscles = row.primary_muscles ? row.primary_muscles.split(',').map(m => m.trim()) : [];
        if (primaryMuscles.length === 0) {
          failedCount++;
          failedRows.push({ row, reason: 'Primary muscles are required.' });
          continue;
        }

        const sourceId = exerciseName.toLowerCase().replace(/\s/g, '_');
        const exerciseData = {
          name: exerciseName,
          description: row.description || null,
          instructions: row.instructions ? row.instructions.split(',').map(i => i.trim()) : [],
          category: row.category || null,
          force: row.force || null,
          level: row.level || null,
          mechanic: row.mechanic || null,
          equipment: row.equipment ? row.equipment.split(',').map(e => e.trim()) : [],
          primary_muscles: primaryMuscles,
          secondary_muscles: row.secondary_muscles ? row.secondary_muscles.split(',').map(m => m.trim()) : [],
          calories_per_hour: row.calories_per_hour ? parseFloat(row.calories_per_hour) : null,
          user_id: authenticatedUserId,
          is_custom: true,
          shared_with_public: row.shared_with_public === 'true',
          source: 'CSV',
          source_id: sourceId,
        };

        // Handle images: download and store local paths
        if (row.images) {
          const imageUrls = row.images.split(',').map(url => url.trim());
          const localImagePaths = [];
          const exerciseFolderName = exerciseName.replace(/[^a-zA-Z0-9]/g, '_');
          for (const imageUrl of imageUrls) {
            try {
              const localPath = await downloadImage(imageUrl, exerciseFolderName);
              localImagePaths.push(localPath);
            } catch (imgError) {
              log('error', `Failed to download image ${imageUrl} for exercise ${exerciseName}:`, imgError);
              // Continue without this image, but log the error
            }
          }
          exerciseData.images = localImagePaths;
        } else {
          exerciseData.images = [];
        }

        const existingExercise = await exerciseDb.searchExercises(exerciseName, authenticatedUserId, [], []);
        if (existingExercise && existingExercise.length > 0) {
          // Assuming the first match is the one to update
          await exerciseDb.updateExercise(existingExercise[0].id, authenticatedUserId, exerciseData);
          updatedCount++;
        } else {
          await exerciseDb.createExercise(exerciseData);
          createdCount++;
        }
      } catch (rowError) {
        failedCount++;
        failedRows.push({ row, reason: rowError.message });
        log('error', `Error processing CSV row for user ${authenticatedUserId}:`, rowError);
      }
    }
  } catch (error) {
    log('error', `Error importing exercises from CSV for user ${authenticatedUserId}:`, error);
    throw error;
  } finally {
    // Clean up the uploaded file
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  return {
    message: 'CSV import complete.',
    created: createdCount,
    updated: updatedCount,
    failed: failedCount,
    failedRows: failedRows,
  };
}
 
async function getExerciseDeletionImpact(authenticatedUserId, exerciseId) {
  log("info", `getExerciseDeletionImpact: Checking deletion impact for exercise ${exerciseId} by user ${authenticatedUserId}`);
  try {
  const exerciseOwnerId = await exerciseDb.getExerciseOwnerId(exerciseId, authenticatedUserId);
    if (!exerciseOwnerId) {
      log("warn", `getExerciseDeletionImpact: Exercise ${exerciseId} not found for user ${authenticatedUserId}.`);
      throw new Error("Exercise not found.");
    }
    // No need to check permission here, as exerciseRepository.getExerciseDeletionImpact handles it
  return await exerciseDb.getExerciseDeletionImpact(exerciseId, authenticatedUserId);
  } catch (error) {
    log(
      "error",
      `Error getting exercise deletion impact for exercise ${exerciseId} by user ${authenticatedUserId} in exerciseService:`,
      error
    );
    throw error;
  }
}

module.exports = {
  getExerciseById,
  getOrCreateActiveCaloriesExercise,
  upsertExerciseEntryData,
  getExercisesWithPagination,
  searchExercises,
  getAvailableEquipment,
  getAvailableMuscleGroups,
  createExercise,
  createExerciseEntry,
  getExerciseEntryById,
  updateExerciseEntry,
  deleteExerciseEntry,
  updateExercise,
  deleteExercise,
  getExerciseEntriesByDate,
  addFreeExerciseDBExerciseToUserExercises,
  getSuggestedExercises,
  searchExternalExercises,
  addExternalExerciseToUserExercises,
  addNutritionixExerciseToUserExercises,
  getExerciseDeletionImpact,
  getExerciseProgressData,
  getExerciseHistory,
  getRecentExercises,
  getTopExercises,
  importExercisesFromCSV,
  importExercisesFromJson, // Export the new function
  getExercisesNeedingReview, // New export
  updateExerciseEntriesSnapshot, // New export
  getActivityDetailsByExerciseEntryIdAndProvider, // Renamed export
};

async function getActivityDetailsByExerciseEntryIdAndProvider(authenticatedUserId, entryId, providerName) {
  try {
    let activityDetails = [];

    // First, try to find an exercise entry with the given ID
    let exerciseEntry = await exerciseEntryDb.getExerciseEntryById(entryId, authenticatedUserId);
    let targetId = entryId; // Default to the provided entryId

    if (exerciseEntry) {
      // If it's an exercise entry and linked to a preset, use the preset ID
      if (exerciseEntry.exercise_preset_entry_id) {
        targetId = exerciseEntry.exercise_preset_entry_id;
        activityDetails = await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(authenticatedUserId, null, targetId);
      } else {
        // If it's an exercise entry but not linked to a preset, use its own ID
        activityDetails = await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(authenticatedUserId, targetId, null);
      }
    } else {
      // If not an exercise entry, try to find an exercise preset entry with the given ID
      let presetEntry = await exercisePresetEntryRepository.getExercisePresetEntryById(entryId, authenticatedUserId);
      if (presetEntry) {
        targetId = entryId; // The provided ID is already a preset entry ID
        activityDetails = await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(authenticatedUserId, null, targetId);
      }
    }
    
    // Find the full_activity_data and full_workout_data for the given provider
    const activityData = activityDetails.find(
      (detail) => detail.provider_name === providerName && detail.detail_type === 'full_activity_data'
    );
    const workoutData = activityDetails.find(
      (detail) => detail.provider_name === providerName && detail.detail_type === 'full_workout_data'
    );

    // Return a composite object containing both, if they exist
    if (activityData || workoutData) {
      return {
        activity: activityData ? activityData.detail_data : null,
        workout: workoutData ? workoutData.detail_data : null,
      };
    }
    return null;
  } catch (error) {
    log('error', `Error fetching activity details for entry ${entryId} from provider ${providerName} by user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function getExercisesNeedingReview(authenticatedUserId) {
  try {
  const exercisesNeedingReview = await exerciseDb.getExercisesNeedingReview(authenticatedUserId);
    return exercisesNeedingReview;
  } catch (error) {
    log("error", `Error getting exercises needing review for user ${authenticatedUserId}:`, error);
    throw error;
  }
}

async function updateExerciseEntriesSnapshot(authenticatedUserId, exerciseId) {
  try {
    // Fetch the latest exercise details
    const exercise = await exerciseDb.getExerciseById(exerciseId, authenticatedUserId);
    if (!exercise) {
      throw new Error("Exercise not found.");
    }

    // Construct the new snapshot data
    const newSnapshotData = {
      exercise_name: exercise.name,
      calories_per_hour: exercise.calories_per_hour,
    };

    // Update all relevant exercise entries for the authenticated user
  await exerciseDb.updateExerciseEntriesSnapshot(authenticatedUserId, exerciseId, newSnapshotData);

    // Clear any ignored updates for this exercise for this user
  await exerciseDb.clearUserIgnoredUpdate(authenticatedUserId, exerciseId);

    return { message: "Exercise entries updated successfully." };
  } catch (error) {
    log("error", `Error updating exercise entries snapshot for user ${authenticatedUserId}, exercise ${exerciseId}:`, error);
    throw error;
  }
}
 
async function importExercisesFromJson(authenticatedUserId, exercisesArray) {
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  const failedRows = [];
  const duplicates = [];
 
  for (const exerciseData of exercisesArray) {
    try {
      const exerciseName = exerciseData.name ? exerciseData.name.trim() : null;
      if (!exerciseName) {
        failedCount++;
        failedRows.push({ row: exerciseData, reason: 'Exercise name is required.' });
        continue;
      }
 
      const primaryMuscles = exerciseData.primary_muscles ? exerciseData.primary_muscles.split(',').map(m => m.trim()) : [];
      if (primaryMuscles.length === 0) {
        failedCount++;
        failedRows.push({ row: exerciseData, reason: 'Primary muscles are required.' });
        continue;
      }
 
      const sourceId = exerciseName.toLowerCase().replace(/\s/g, '_');
      const newExerciseData = {
        name: exerciseName,
        description: exerciseData.description || null,
        instructions: exerciseData.instructions ? exerciseData.instructions.split(',').map(i => i.trim()) : [],
        category: exerciseData.category || null,
        force: exerciseData.force || null,
        level: exerciseData.level || null,
        mechanic: exerciseData.mechanic || null,
        equipment: exerciseData.equipment ? exerciseData.equipment.split(',').map(e => e.trim()) : [],
        primary_muscles: primaryMuscles,
        secondary_muscles: exerciseData.secondary_muscles ? exerciseData.secondary_muscles.split(',').map(m => m.trim()) : [],
        calories_per_hour: exerciseData.calories_per_hour ? parseFloat(exerciseData.calories_per_hour) : null,
        user_id: authenticatedUserId,
        is_custom: exerciseData.is_custom === true,
        shared_with_public: exerciseData.shared_with_public === true,
        source: 'CSV_Import', // Indicate that it came from a CSV import via the UI
        source_id: sourceId,
      };
 
      // Handle images: download and store local paths
      if (exerciseData.images) {
        const imageUrls = exerciseData.images.split(',').map(url => url.trim());
        const localImagePaths = [];
        const exerciseFolderName = exerciseName.replace(/[^a-zA-Z0-9]/g, '_');
        for (const imageUrl of imageUrls) {
          try {
            const localPath = await downloadImage(imageUrl, exerciseFolderName);
            localImagePaths.push(localPath);
          } catch (imgError) {
            log('error', `Failed to download image ${imageUrl} for exercise ${exerciseName}:`, imgError);
            // Continue without this image, but log the error
          }
        }
        newExerciseData.images = localImagePaths;
      } else {
        newExerciseData.images = [];
      }
 
      const existingExercise = await exerciseDb.searchExercises(exerciseName, authenticatedUserId, [], []);
      if (existingExercise && existingExercise.length > 0) {
        // Check for exact duplicate before updating
        const isDuplicate = existingExercise.some(
          (ex) => ex.name.toLowerCase() === exerciseName.toLowerCase()
        );

        if (isDuplicate) {
          duplicates.push({ name: exerciseName, reason: 'Exercise with this name already exists.' });
          failedCount++;
          failedRows.push({ row: exerciseData, reason: 'Duplicate exercise name.' });
          continue;
        }

        // Assuming the first match is the one to update
        await exerciseDb.updateExercise(existingExercise[0].id, authenticatedUserId, newExerciseData);
        updatedCount++;
      } else {
        await exerciseDb.createExercise(newExerciseData);
        createdCount++;
      }
    } catch (rowError) {
      failedCount++;
      failedRows.push({ row: exerciseData, reason: rowError.message });
      log('error', `Error processing exercise data for user ${authenticatedUserId}:`, rowError);
    }
  }
 
  if (duplicates.length > 0) {
    const error = new Error('Duplicate exercises found.');
    error.status = 409; // Conflict
    error.data = { duplicates };
    throw error;
  }
 
  return {
    message: 'Exercise import complete.',
    created: createdCount,
    updated: updatedCount,
    failed: failedCount,
    failedRows: failedRows,
  };
}