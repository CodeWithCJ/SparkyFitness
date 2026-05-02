import { getClient } from '../db/poolManager.js';
import exerciseRepository from '../models/exerciseRepository.js';
import exerciseDb from '../models/exercise.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import exercisePresetEntryRepository from '../models/exercisePresetEntryRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../config/logging.js';
import wgerService from '../integrations/wger/wgerService.js';
import nutritionixService from '../integrations/nutritionix/nutritionixService.js';
import { downloadImage } from '../utils/imageDownloader.js';
import calorieCalculationService from './CalorieCalculationService.js';
import fs from 'fs';
import path from 'path';
import { resolveExerciseIdToUuid } from '../utils/uuidUtils.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'papa... Remove this comment to see the full error message
import papa from 'papaparse';
import {
  getGroupedExerciseSessionById,
  getGroupedExerciseSessionByIdWithClient,
} from './exerciseEntryHistoryService.js';
import {
  forceMap,
  mechanicMap,
  createReverseMap,
  muscleNameMap,
  equipmentNameMap,
} from '../integrations/wger/wgerNameMapping.js';
import { ExternalProviderType } from 'types/externalProvider.ts';
async function getExercisesWithPagination(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  searchTerm: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categoryFilter: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ownershipFilter: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equipmentFilter: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  muscleGroupFilter: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentPage: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itemsPerPage: any
) {
  try {
    const limit = parseInt(itemsPerPage, 10) || 10;
    const offset = ((parseInt(currentPage, 10) || 1) - 1) * limit;
    const [exercises, totalCount] = await Promise.all([
      exerciseDb.getExercisesWithPagination(
        targetUserId,
        searchTerm,
        categoryFilter,
        ownershipFilter,
        equipmentFilter,
        muscleGroupFilter,
        limit,
        offset
      ),
      exerciseDb.countExercises(
        targetUserId,
        searchTerm,
        categoryFilter,
        ownershipFilter,
        equipmentFilter,
        muscleGroupFilter
      ),
    ]);
    const taggedExercises = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exercises.map(async (exercise: any) => {
        const tags = [];
        const isOwner = exercise.user_id === authenticatedUserId;
        if (isOwner) {
          tags.push('private');
        }
        if (exercise.shared_with_public) {
          tags.push('public');
        }
        if (!isOwner && !exercise.shared_with_public) {
          // If not owned and not public, it must be visible due to family access
          tags.push('family');
        }
        return { ...exercise, tags };
      })
    );
    return { exercises: taggedExercises, totalCount };
  } catch (error) {
    log(
      'error',
      `Error fetching exercises with pagination for user ${authenticatedUserId} and target ${targetUserId}:`,
      error
    );
    throw error;
  }
}
async function searchExercises(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  name: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equipmentFilter: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  muscleGroupFilter: any
) {
  try {
    const exercises = await exerciseDb.searchExercises(
      name,
      targetUserId,
      equipmentFilter,
      muscleGroupFilter
    );
    const taggedExercises = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exercises.map(async (exercise: any) => {
        const tags = [];
        const isOwner = exercise.user_id === authenticatedUserId;
        if (isOwner) {
          tags.push('private');
        }
        if (exercise.shared_with_public) {
          tags.push('public');
        }
        if (!isOwner && !exercise.shared_with_public) {
          tags.push('family');
        }
        return { ...exercise, tags };
      })
    );
    return taggedExercises;
  } catch (error) {
    log(
      'error',
      `Error searching exercises for user ${authenticatedUserId} with name "${name}":`,
      error
    );
    throw error;
  }
}
async function searchExercisesPaginated(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  name: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equipmentFilter: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  muscleGroupFilter: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  limit: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offset: any
) {
  try {
    const { exercises, totalCount } = await exerciseDb.searchExercisesPaginated(
      name,
      targetUserId,
      equipmentFilter,
      muscleGroupFilter,
      limit,
      offset
    );
    const taggedExercises = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exercises.map(async (exercise: any) => {
        const tags = [];
        const isOwner = exercise.user_id === authenticatedUserId;
        if (isOwner) {
          tags.push('private');
        }
        if (exercise.shared_with_public) {
          tags.push('public');
        }
        if (!isOwner && !exercise.shared_with_public) {
          tags.push('family');
        }
        return { ...exercise, tags };
      })
    );
    return { exercises: taggedExercises, totalCount };
  } catch (error) {
    log(
      'error',
      `Error searching exercises (paginated) for user ${authenticatedUserId} with name "${name}":`,
      error
    );
    throw error;
  }
}
async function getAvailableEquipment() {
  try {
    const equipment = await exerciseDb.getDistinctEquipment();
    return equipment;
  } catch (error) {
    log('error', 'Error fetching available equipment:', error);
    throw error;
  }
}
async function getAvailableMuscleGroups() {
  try {
    const muscleGroups = await exerciseDb.getDistinctMuscleGroups();
    return muscleGroups;
  } catch (error) {
    log('error', 'Error fetching available muscle groups:', error);
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createExercise(authenticatedUserId: any, exerciseData: any) {
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
    log(
      'error',
      `Error creating exercise for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function prepareExerciseEntryForCreate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryData: any
) {
  const resolvedExerciseId = await resolveExerciseIdToUuid(
    entryData.exercise_id,
    authenticatedUserId
  );
  const exercise = await exerciseDb.getExerciseById(
    resolvedExerciseId,
    authenticatedUserId
  );
  if (!exercise) {
    throw new Error('Exercise not found for snapshot.');
  }
  const durationFromSets = Array.isArray(entryData.sets)
    ? entryData.sets.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: any, set: any) =>
          sum + (set.duration || 0) + (set.rest_time || 0) / 60,
        0
      )
    : 0;
  const durationMinutes =
    typeof entryData.duration_minutes === 'number'
      ? entryData.duration_minutes
      : durationFromSets;
  let calculatedCaloriesBurned = entryData.calories_burned;
  if (
    calculatedCaloriesBurned === undefined ||
    calculatedCaloriesBurned === null
  ) {
    const caloriesPerHour =
      await calorieCalculationService.estimateCaloriesBurnedPerHour(
        exercise,
        authenticatedUserId,
        entryData.sets
      );
    calculatedCaloriesBurned = (caloriesPerHour / 60) * durationMinutes;
  }
  return {
    ...entryData,
    user_id: authenticatedUserId,
    exercise_id: resolvedExerciseId,
    exercise_name: exercise.name,
    calories_per_hour: exercise.calories_per_hour,
    calories_burned: calculatedCaloriesBurned ?? 0,
    duration_minutes: durationMinutes ?? 0,
    workout_plan_assignment_id: entryData.workout_plan_assignment_id || null,
    image_url: entryData.image_url || null,
    distance: entryData.distance ?? null,
    avg_heart_rate: entryData.avg_heart_rate ?? null,
  };
}
async function createExerciseEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryData: any
) {
  try {
    const snapshotEntryData = await prepareExerciseEntryForCreate(
      authenticatedUserId,
      entryData
    );
    // Use exerciseEntry module to create the entry (handles sets and snapshot inserts)
    const newEntry = await exerciseEntryDb.createExerciseEntry(
      authenticatedUserId,
      snapshotEntryData,
      actingUserId
    );
    // If activity_details are provided, create them
    if (entryData.activity_details && entryData.activity_details.length > 0) {
      for (const detail of entryData.activity_details) {
        await activityDetailsRepository.createActivityDetail(
          authenticatedUserId,
          {
            exercise_entry_id: newEntry.id,
            provider_name: detail.provider_name || 'Manual', // Default to Manual if not provided
            detail_type: detail.detail_type,
            detail_data: detail.detail_data,
            created_by_user_id: actingUserId,
            updated_by_user_id: actingUserId,
          }
        );
      }
    }
    return newEntry;
  } catch (error) {
    log(
      'error',
      `Error creating exercise entry for user ${authenticatedUserId} by ${actingUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExerciseEntryById(authenticatedUserId: any, id: any) {
  try {
    const entryOwnerId = await exerciseEntryDb.getExerciseEntryOwnerId(
      id,
      authenticatedUserId
    );
    if (!entryOwnerId) {
      throw new Error('Exercise entry not found.');
    }
    const entry = await exerciseEntryDb.getExerciseEntryById(
      id,
      authenticatedUserId
    );
    // Fetch activity details
    const activityDetails =
      await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(
        authenticatedUserId,
        id
      );
    return { ...entry, activity_details: activityDetails };
  } catch (error) {
    log(
      'error',
      `Error fetching exercise entry ${id} by user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function updateExerciseEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  try {
    const existingEntry = await exerciseEntryDb.getExerciseEntryById(
      id,
      authenticatedUserId
    );
    if (!existingEntry) {
      throw new Error('Exercise entry not found.');
    }
    // If a new image is being uploaded or the image is being cleared, delete the old one
    if (
      (updateData.image_url || updateData.image_url === null) &&
      existingEntry.image_url
    ) {
      const oldImagePath = path.join(__dirname, '..', existingEntry.image_url);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
        log('info', `Deleted old exercise entry image: ${oldImagePath}`);
      }
    }
    // If calories_burned is not provided, calculate it using the calorieCalculationService
    if (
      updateData.exercise_id &&
      updateData.duration_minutes !== null &&
      updateData.duration_minutes !== undefined &&
      updateData.calories_burned === undefined
    ) {
      const exercise = await exerciseDb.getExerciseById(
        updateData.exercise_id,
        authenticatedUserId
      );
      if (exercise) {
        const caloriesPerHour =
          await calorieCalculationService.estimateCaloriesBurnedPerHour(
            exercise,
            authenticatedUserId,
            updateData.sets
          );
        updateData.calories_burned =
          (caloriesPerHour / 60) * updateData.duration_minutes;
      } else {
        log(
          'warn',
          `Exercise ${updateData.exercise_id} not found. Cannot auto-calculate calories_burned.`
        );
        updateData.calories_burned = 0;
      }
    } else if (updateData.calories_burned === undefined) {
      // If calories_burned is not in updateData, use existing value or 0
      updateData.calories_burned = existingEntry.calories_burned || 0;
    }
    const updatedEntry = await exerciseEntryDb.updateExerciseEntry(
      id,
      authenticatedUserId,
      actingUserId,
      {
        ...updateData,
        duration_minutes: updateData.duration_minutes || 0,
        sets: updateData.sets || null,
        reps: updateData.reps || null,
        weight: updateData.weight || null,
        workout_plan_assignment_id:
          updateData.workout_plan_assignment_id || null,
        image_url:
          updateData.image_url === null
            ? null
            : updateData.image_url || existingEntry.image_url,
        distance: updateData.distance || null,
        avg_heart_rate: updateData.avg_heart_rate || null,
      }
    );
    if (!updatedEntry) {
      throw new Error('Exercise entry not found or not authorized to update.');
    }
    // Handle activity details updates
    if (updateData.activity_details !== undefined) {
      const existingActivityDetails =
        await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(
          authenticatedUserId,
          id
        );
      const incomingActivityDetails = updateData.activity_details || [];
      // Identify details to delete
      for (const existingDetail of existingActivityDetails) {
        const found = incomingActivityDetails.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (incomingDetail: any) => incomingDetail.id === existingDetail.id
        );
        if (!found) {
          await activityDetailsRepository.deleteActivityDetail(
            authenticatedUserId,
            existingDetail.id
          );
        }
      }
      // Identify details to create or update
      for (const incomingDetail of incomingActivityDetails) {
        if (incomingDetail.id) {
          // Update existing detail
          await activityDetailsRepository.updateActivityDetail(
            authenticatedUserId,
            incomingDetail.id,
            {
              ...incomingDetail,
              updated_by_user_id: actingUserId,
            }
          );
        } else {
          // Create new detail
          await activityDetailsRepository.createActivityDetail(
            authenticatedUserId,
            {
              ...incomingDetail,
              exercise_entry_id: id,
              created_by_user_id: actingUserId,
              updated_by_user_id: actingUserId,
            }
          );
        }
      }
    }
    return updatedEntry;
  } catch (error) {
    log(
      'error',
      `Error updating exercise entry ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteExerciseEntry(authenticatedUserId: any, id: any) {
  try {
    const entryOwnerId = await exerciseEntryDb.getExerciseEntryOwnerId(
      id,
      authenticatedUserId
    );
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
    log(
      'error',
      `Error deleting exercise entry ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExerciseById(authenticatedUserId: any, id: any) {
  try {
    const exerciseOwnerId = await exerciseDb.getExerciseOwnerId(
      id,
      authenticatedUserId
    );
    if (!exerciseOwnerId) {
      // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
      const publicExercise = await exerciseDb.getExerciseById(id);
      if (publicExercise && !publicExercise.is_custom) {
        return publicExercise;
      }
      throw new Error('Exercise not found.');
    }
    const exercise = await exerciseDb.getExerciseById(id, authenticatedUserId);
    return exercise;
  } catch (error) {
    log(
      'error',
      `Error fetching exercise ${id} by user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function updateExercise(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  try {
    const exerciseOwnerId = await exerciseDb.getExerciseOwnerId(
      id,
      authenticatedUserId
    );
    if (!exerciseOwnerId) {
      throw new Error('Exercise not found.');
    }
    // If images are provided, ensure they are stored as JSON string in the database
    if (updateData.images && Array.isArray(updateData.images)) {
      updateData.images = JSON.stringify(updateData.images);
    }
    const updatedExercise = await exerciseDb.updateExercise(
      id,
      authenticatedUserId,
      updateData
    );
    if (!updatedExercise) {
      throw new Error('Exercise not found or not authorized to update.');
    }
    return updatedExercise;
  } catch (error) {
    log(
      'error',
      `Error updating exercise ${id} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function deleteExercise(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseId: any,
  forceDelete = false
) {
  log(
    'info',
    `deleteExercise: Attempting to delete exercise ${exerciseId} by user ${authenticatedUserId}. Force delete: ${forceDelete}`
  );
  try {
    const exerciseOwnerId = await exerciseDb.getExerciseOwnerId(
      exerciseId,
      authenticatedUserId
    );
    if (!exerciseOwnerId) {
      log(
        'warn',
        `deleteExercise: Exercise ${exerciseId} not found for user ${authenticatedUserId}.`
      );
      throw new Error('Exercise not found.');
    }
    const deletionImpact = await exerciseDb.getExerciseDeletionImpact(
      exerciseId,
      authenticatedUserId
    );
    log(
      'info',
      `deleteExercise: Deletion impact for exercise ${exerciseId}: ${JSON.stringify(deletionImpact)}`
    );
    const {
      exerciseEntriesCount,
      workoutPlansCount,
      workoutPresetsCount,
      otherUserReferences,
    } = deletionImpact;
    const totalReferences =
      exerciseEntriesCount + workoutPlansCount + workoutPresetsCount;
    // Scenario 1: No references at all
    if (totalReferences === 0) {
      log(
        'info',
        `deleteExercise: Exercise ${exerciseId} has no references. Performing hard delete.`
      );
      const success = await exerciseDb.deleteExerciseAndDependencies(
        exerciseId,
        authenticatedUserId
      );
      if (!success) {
        throw new Error('Exercise not found or not authorized to delete.');
      }
      return { message: 'Exercise deleted permanently.', status: 'deleted' };
    }
    // Scenario 2: References only by the current user
    if (otherUserReferences === 0) {
      if (forceDelete) {
        log(
          'info',
          `deleteExercise: Exercise ${exerciseId} has references only by current user. Force deleting.`
        );
        const success = await exerciseDb.deleteExerciseAndDependencies(
          exerciseId,
          authenticatedUserId
        );
        if (!success) {
          throw new Error('Exercise not found or not authorized to delete.');
        }
        return {
          message: 'Exercise and all its references deleted permanently.',
          status: 'force_deleted',
        };
      } else {
        // Hide the exercise (mark as quick/hidden) so it won't appear in searches but existing references remain
        log(
          'info',
          `deleteExercise: Exercise ${exerciseId} has references only by current user. Hiding as quick exercise.`
        );
        await exerciseDb.updateExercise(exerciseId, exerciseOwnerId, {
          is_quick_exercise: true,
        });
        return {
          message:
            'Exercise hidden (marked as quick exercise). Existing references remain.',
          status: 'hidden',
        };
      }
    }
    // Scenario 3: References by other users
    if (otherUserReferences > 0) {
      // If other users reference this exercise, hide it (mark as quick exercise) so it's removed from searches
      log(
        'info',
        `deleteExercise: Exercise ${exerciseId} has references by other users. Hiding as quick exercise.`
      );
      await exerciseDb.updateExercise(exerciseId, exerciseOwnerId, {
        is_quick_exercise: true,
      });
      return {
        message:
          'Exercise hidden (marked as quick exercise). Existing references remain.',
        status: 'hidden',
      };
    }
    // Fallback for any unhandled cases (should not be reached)
    log(
      'warn',
      `deleteExercise: Unhandled deletion scenario for exercise ${exerciseId}.`
    );
    throw new Error('Could not delete exercise due to an unknown issue.');
  } catch (error) {
    log(
      'error',
      `Error deleting exercise ${exerciseId} by user ${authenticatedUserId} in exerciseService:`,
      error
    );
    throw error;
  }
}
async function getExerciseEntriesByDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedDate: any
) {
  try {
    if (!targetUserId) {
      log(
        'error',
        'getExerciseEntriesByDate: targetUserId is undefined. Returning empty array.'
      );
      return [];
    }
    // Use the exerciseEntryDb directly to avoid circular dependency where exerciseRepository
    // may not have fully exported its properties yet at runtime.
    const entries = await exerciseEntryDb.getExerciseEntriesByDate(
      targetUserId,
      selectedDate
    );
    if (!entries || entries.length === 0) {
      return [];
    }
    // For each entry, fetch and attach its activity details
    const entriesWithDetails = await Promise.all(
      entries.map(async (entry) => {
        const activityDetails =
          await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(
            authenticatedUserId,
            entry.id,
            entry.exercise_preset_entry_id
          );
        return { ...entry, activity_details: activityDetails };
      })
    );
    return entriesWithDetails;
  } catch (error) {
    log(
      'error',
      `Error fetching exercise entries for user ${targetUserId} on ${selectedDate} by ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOrCreateActiveCaloriesExercise(userId: any) {
  try {
    const exerciseId =
      await exerciseDb.getOrCreateActiveCaloriesExercise(userId);
    return exerciseId;
  } catch (error) {
    log(
      'error',
      `Error getting or creating active calories exercise for user ${userId}:`,
      error
    );
    throw error;
  }
}
async function upsertExerciseEntryData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  caloriesBurned: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  date: any
) {
  try {
    // @ts-expect-error TS(2554): Expected 5 arguments, but got 4.
    const entry = await exerciseEntryDb.upsertExerciseEntryData(
      userId,
      exerciseId,
      caloriesBurned,
      date
    );
    return entry;
  } catch (error) {
    log(
      'error',
      `Error upserting exercise entry data for user ${userId}, exercise ${exerciseId}:`,
      error
    );
    throw error;
  }
}

interface FreeExerciseDBResult {
  totalCount: number;
  exercises: {
    id: string;
    name: string;
    category: string;
    description: string;
    force: string | null;
    level: string | null;
    mechanic: string | null;
    equipment: string | string[];
    primaryMuscles: string | string[];
    secondaryMuscles: string | string[];
    instructions: string | string[];
    images: string[];
  }[];
}
async function searchExternalExercises(
  _authenticatedUserId: string,
  query: string,
  providerId: string,
  providerType: ExternalProviderType,
  equipmentFilter: string[],
  muscleGroupFilter: string[],
  language: string,
  page = 1,
  pageSize = 20
) {
  const { default: freeExerciseDBService } =
    await import('../integrations/freeexercisedb/FreeExerciseDBService.js');

  log(
    'info',
    `[exerciseService] searchExternalExercises called with: query='${query}', providerType='${providerType}', equipmentFilter='${equipmentFilter}', muscleGroupFilter='${muscleGroupFilter}', page=${page}, pageSize=${pageSize}`
  );

  const emptyResponse = {
    items: [],
    pagination: { page, pageSize, totalCount: 0, hasMore: false },
  };

  try {
    let items: unknown[] = [];
    let totalCount = 0;
    const offset = (page - 1) * pageSize;

    const hasFilters =
      equipmentFilter.length > 0 || muscleGroupFilter.length > 0;
    const hasQuery = query.trim().length > 0;

    if (!hasQuery && hasFilters && providerType === 'nutritionix') {
      log(
        'warn',
        `External search for provider ${providerType} received filters but no search query. Returning empty results.`
      );
      return emptyResponse;
    }

    if (providerType === 'wger') {
      const muscleIdMap = await wgerService.getWgerMuscleIdMap();
      const equipmentIdMap = await wgerService.getWgerEquipmentIdMap();

      const muscleIds = muscleGroupFilter.flatMap(
        (name) => muscleIdMap[name] ?? []
      );
      const equipmentIds = equipmentFilter.flatMap(
        (name) => equipmentIdMap[name] ?? []
      );

      const wgerResult = await wgerService.searchWgerExercises(
        query,
        muscleIds,
        equipmentIds,
        language ?? 'en',
        pageSize,
        offset
      );

      totalCount = wgerResult.totalCount;
      items = wgerResult.exercises.map((exercise) => ({
        id: exercise.id.toString(),
        name: exercise.name,
        category: exercise.category?.name ?? 'Uncategorized',
        calories_per_hour: 0,
        source: 'wger',
        description: exercise.instructions || exercise.name,
        force: exercise.force,
        mechanic: exercise.mechanic,
        instructions: exercise.instructions,
        images: exercise.images,
      }));
    } else if (providerType === 'nutritionix') {
      const nutritionixSearchResults =
        await nutritionixService.searchNutritionixExercises(query, providerId);
      totalCount = nutritionixSearchResults.length;
      items = nutritionixSearchResults.slice(offset, offset + pageSize);
    } else if (providerType === 'free-exercise-db') {
      const freeExerciseDBResult = (await freeExerciseDBService.searchExercises(
        query,
        equipmentFilter as never[],
        muscleGroupFilter as never[],
        pageSize,
        offset
      )) as FreeExerciseDBResult;
      totalCount = freeExerciseDBResult.totalCount;
      items = freeExerciseDBResult.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        category: exercise.category,
        calories_per_hour: 0,
        description: exercise.description,
        source: 'free-exercise-db',
        force: exercise.force,
        level: exercise.level,
        mechanic: exercise.mechanic,
        equipment: Array.isArray(exercise.equipment)
          ? exercise.equipment
          : exercise.equipment
            ? [exercise.equipment]
            : [],
        primary_muscles: Array.isArray(exercise.primaryMuscles)
          ? exercise.primaryMuscles
          : exercise.primaryMuscles
            ? [exercise.primaryMuscles]
            : [],
        secondary_muscles: Array.isArray(exercise.secondaryMuscles)
          ? exercise.secondaryMuscles
          : exercise.secondaryMuscles
            ? [exercise.secondaryMuscles]
            : [],
        instructions: Array.isArray(exercise.instructions)
          ? exercise.instructions
          : exercise.instructions
            ? [exercise.instructions]
            : [],
        images: exercise.images.map((img: string) =>
          freeExerciseDBService.getExerciseImageUrl(img)
        ),
      }));
    } else {
      throw new Error(
        `Unsupported external exercise provider: ${providerType}`
      );
    }

    return {
      items,
      pagination: {
        page,
        pageSize,
        totalCount,
        hasMore: page * pageSize < totalCount,
      },
    };
  } catch (error) {
    log(
      'error',
      `Error searching external exercises with query "${query}" from provider "${providerType}":`,
      error
    );
    throw error;
  }
}

async function addExternalExerciseToUserExercises(
  authenticatedUserId: string,
  wgerExerciseId: string | number,
  language: string = 'en'
) {
  try {
    const wgerExerciseDetails =
      await wgerService.getWgerExerciseDetails(wgerExerciseId);
    if (!wgerExerciseDetails) {
      throw new Error('Wger exercise not found.');
    }

    log(
      'info',
      `Raw wger exercise data for exercise ID ${wgerExerciseId}: ${JSON.stringify(wgerExerciseDetails, null, 2)}`
    );

    let caloriesPerHour = 0;

    // met and level are not in the wger /exerciseinfo schema, so we always fall back
    caloriesPerHour =
      await calorieCalculationService.estimateCaloriesBurnedPerHour(
        wgerExerciseDetails,
        authenticatedUserId,
        [{ reps: 10, weight: 0 }]
      );

    const { exerciseName, description: rawDescription } =
      wgerService.extractWgerText(wgerExerciseDetails.translations, language);

    const reverseMuscleMap = createReverseMap(muscleNameMap);
    const reverseEquipmentMap = createReverseMap(equipmentNameMap);

    const mappedForce = wgerExerciseDetails.force?.name
      ? (forceMap[
          wgerExerciseDetails.force.name.toLowerCase() as keyof typeof forceMap
        ] ?? null)
      : null;

    const mappedMechanic = wgerExerciseDetails.mechanic?.name
      ? (mechanicMap[
          wgerExerciseDetails.mechanic.name.toLowerCase() as keyof typeof mechanicMap
        ] ?? null)
      : null;

    const instructions = rawDescription
      .replace(/<li>/g, '\n- ')
      .replace(/<[^>]*>/g, '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const exerciseData = {
      name: exerciseName,
      category: wgerExerciseDetails.category?.name ?? 'general',
      calories_per_hour: caloriesPerHour,
      description: instructions[0] ?? exerciseName,
      user_id: authenticatedUserId,
      is_custom: true,
      shared_with_public: false,
      source_external_id: wgerExerciseDetails.id.toString(),
      source: 'wger',
      level: 'intermediate',
      force: mappedForce,
      mechanic: mappedMechanic,
      equipment: wgerExerciseDetails.equipment.map(
        (e) =>
          reverseEquipmentMap[
            e.name.toLowerCase() as keyof typeof reverseEquipmentMap
          ] ?? e.name
      ),
      primary_muscles: wgerExerciseDetails.muscles.map(
        (m) =>
          reverseMuscleMap[
            m.name.toLowerCase() as keyof typeof reverseMuscleMap
          ] ?? m.name
      ),
      secondary_muscles: wgerExerciseDetails.muscles_secondary.map(
        (m) =>
          reverseMuscleMap[
            m.name.toLowerCase() as keyof typeof reverseMuscleMap
          ] ?? m.name
      ),
      instructions,
      images: [] as string[],
    };

    if (wgerExerciseDetails.images.length > 0) {
      const exerciseFolderName = exerciseName.replace(/[^a-zA-Z0-9]/g, '_');
      const localImagePaths = await Promise.all(
        wgerExerciseDetails.images.map(async (img) => {
          try {
            if (img.image) {
              const fullPath = (await downloadImage(
                img.image,
                exerciseFolderName
              )) as string;
              return fullPath.replace('/uploads/exercises/', '');
            }
          } catch (imgError) {
            log(
              'error',
              `Failed to download image ${img.image} for exercise ${exerciseName}:`,
              imgError
            );
          }
          return null;
        })
      );
      exerciseData.images = localImagePaths.filter(
        (p): p is string => p !== null
      );
    }

    log(
      'info',
      `Mapped exercise data before insert: ${JSON.stringify(exerciseData, null, 2)}`
    );
    return await exerciseDb.createExercise(exerciseData);
  } catch (error) {
    log(
      'error',
      `Error adding external exercise ${wgerExerciseId} for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function addNutritionixExerciseToUserExercises(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nutritionixExerciseData: any
) {
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
    log(
      'error',
      `Error adding Nutritionix exercise for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function addFreeExerciseDBExerciseToUserExercises(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  freeExerciseDBId: any
) {
  const { default: freeExerciseDBService } =
    await import('../integrations/freeexercisedb/FreeExerciseDBService.js');
  try {
    const exerciseDetails =
      await freeExerciseDBService.getExerciseById(freeExerciseDBId);
    if (!exerciseDetails) {
      throw new Error('Free-Exercise-DB exercise not found.');
    }
    await Promise.all(
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exerciseDetails.images.map(async (imagePath: any) => {
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
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      source_id: exerciseDetails.id,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      name: exerciseDetails.name,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      force: exerciseDetails.force,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      level: exerciseDetails.level,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      mechanic: exerciseDetails.mechanic,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      equipment: exerciseDetails.equipment,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      primary_muscles: exerciseDetails.primaryMuscles,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      secondary_muscles: exerciseDetails.secondaryMuscles,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      instructions: exerciseDetails.instructions,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      category: exerciseDetails.category,
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      images: exerciseDetails.images, // Original relative paths — createExercise handles JSON.stringify
      calories_per_hour:
        // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
        await calorieCalculationService.estimateCaloriesBurnedPerHour(
          exerciseDetails,
          authenticatedUserId
        ), // Calculate calories
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      description: exerciseDetails.instructions[0] || exerciseDetails.name, // Use first instruction as description or name
      user_id: authenticatedUserId,
      is_custom: true, // Imported exercises are custom to the user
      shared_with_public: false, // Imported exercises are private by default
    };
    const newExercise = await exerciseDb.createExercise(exerciseData);
    return newExercise;
  } catch (error) {
    log(
      'error',
      `Error adding Free-Exercise-DB exercise ${freeExerciseDBId} for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSuggestedExercises(authenticatedUserId: any, limit: any) {
  try {
    const preferences =
      await preferenceRepository.getUserPreferences(authenticatedUserId);
    const displayLimit = preferences?.item_display_limit || limit;
    const recentExercises = await exerciseDb.getRecentExercises(
      authenticatedUserId,
      displayLimit
    );
    const topExercises = await exerciseDb.getTopExercises(
      authenticatedUserId,
      displayLimit
    );
    return { recentExercises, topExercises };
  } catch (error) {
    log(
      'error',
      `Error fetching suggested exercises for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRecentExercises(authenticatedUserId: any, limit: any) {
  try {
    const preferences =
      await preferenceRepository.getUserPreferences(authenticatedUserId);
    const displayLimit = preferences?.item_display_limit || limit;
    const recentExercises = await exerciseDb.getRecentExercises(
      authenticatedUserId,
      displayLimit
    );
    const taggedExercises = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentExercises.map(async (exercise: any) => {
        const tags = [];
        const isOwner = exercise.user_id === authenticatedUserId;
        if (isOwner) {
          tags.push('private');
        }
        if (exercise.shared_with_public) {
          tags.push('public');
        }
        if (!isOwner && !exercise.shared_with_public) {
          tags.push('family');
        }
        return { ...exercise, tags };
      })
    );
    return taggedExercises;
  } catch (error) {
    log(
      'error',
      `Error fetching recent exercises for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTopExercises(authenticatedUserId: any, limit: any) {
  try {
    const preferences =
      await preferenceRepository.getUserPreferences(authenticatedUserId);
    const displayLimit = preferences?.item_display_limit || limit;
    const topExercises = await exerciseDb.getTopExercises(
      authenticatedUserId,
      displayLimit
    );
    const taggedExercises = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      topExercises.map(async (exercise: any) => {
        const tags = [];
        const isOwner = exercise.user_id === authenticatedUserId;
        if (isOwner) {
          tags.push('private');
        }
        if (exercise.shared_with_public) {
          tags.push('public');
        }
        if (!isOwner && !exercise.shared_with_public) {
          tags.push('family');
        }
        return { ...exercise, tags };
      })
    );
    return taggedExercises;
  } catch (error) {
    log(
      'error',
      `Error fetching top exercises for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
async function getExerciseProgressData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  try {
    // getExerciseProgressData is implemented in the exerciseEntry module
    const progressData = await exerciseEntryDb.getExerciseProgressData(
      authenticatedUserId,
      exerciseId,
      startDate,
      endDate
    );
    return progressData;
  } catch (error) {
    log(
      'error',
      `Error fetching exercise progress data for user ${authenticatedUserId}, exercise ${exerciseId}:`,
      error
    );
    throw error;
  }
}

async function getExerciseHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  limit: any
) {
  try {
    const resolvedExerciseId = await resolveExerciseIdToUuid(
      exerciseId,
      authenticatedUserId
    );
    // getExerciseHistory is implemented in the exerciseEntry module
    const history = await exerciseEntryDb.getExerciseHistory(
      authenticatedUserId,
      resolvedExerciseId,
      limit
    );
    return history;
  } catch (error) {
    log(
      'error',
      `Error fetching exercise history for user ${authenticatedUserId}, exercise ${exerciseId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function importExercisesFromCSV(authenticatedUserId: any, filePath: any) {
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
        const primaryMuscles = row.primary_muscles
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            row.primary_muscles.split(',').map((m: any) => m.trim())
          : [];
        if (primaryMuscles.length === 0) {
          failedCount++;
          failedRows.push({ row, reason: 'Primary muscles are required.' });
          continue;
        }
        const sourceId = exerciseName.toLowerCase().replace(/\s/g, '_');
        const exerciseData = {
          name: exerciseName,
          description: row.description || null,
          instructions: row.instructions
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              row.instructions.split(',').map((i: any) => i.trim())
            : [],
          category: row.category || null,
          force: row.force || null,
          level: row.level || null,
          mechanic: row.mechanic || null,
          equipment: row.equipment
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              row.equipment.split(',').map((e: any) => e.trim())
            : [],
          primary_muscles: primaryMuscles,
          secondary_muscles: row.secondary_muscles
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              row.secondary_muscles.split(',').map((m: any) => m.trim())
            : [],
          calories_per_hour: row.calories_per_hour
            ? parseFloat(row.calories_per_hour)
            : null,
          user_id: authenticatedUserId,
          is_custom: true,
          shared_with_public: row.shared_with_public === 'true',
          source: 'CSV',
          source_id: sourceId,
        };
        // Handle images: download and store local paths
        if (row.images) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const imageUrls = row.images.split(',').map((url: any) => url.trim());
          const localImagePaths = [];
          const exerciseFolderName = exerciseName.replace(/[^a-zA-Z0-9]/g, '_');
          for (const imageUrl of imageUrls) {
            try {
              const localPath = await downloadImage(
                imageUrl,
                exerciseFolderName
              );
              localImagePaths.push(localPath);
            } catch (imgError) {
              log(
                'error',
                `Failed to download image ${imageUrl} for exercise ${exerciseName}:`,
                imgError
              );
              // Continue without this image, but log the error
            }
          }
          // @ts-expect-error TS(2339): Property 'images' does not exist on type '{ name: ... Remove this comment to see the full error message
          exerciseData.images = localImagePaths;
        } else {
          // @ts-expect-error TS(2339): Property 'images' does not exist on type '{ name: ... Remove this comment to see the full error message
          exerciseData.images = [];
        }
        const existingExercise = await exerciseDb.searchExercises(
          exerciseName,
          authenticatedUserId,
          [],
          []
        );
        if (existingExercise && existingExercise.length > 0) {
          // Assuming the first match is the one to update
          await exerciseDb.updateExercise(
            existingExercise[0].id,
            authenticatedUserId,
            exerciseData
          );
          updatedCount++;
        } else {
          await exerciseDb.createExercise(exerciseData);
          createdCount++;
        }
      } catch (rowError) {
        failedCount++;
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        failedRows.push({ row, reason: rowError.message });
        log(
          'error',
          `Error processing CSV row for user ${authenticatedUserId}:`,
          rowError
        );
      }
    }
  } catch (error) {
    log(
      'error',
      `Error importing exercises from CSV for user ${authenticatedUserId}:`,
      error
    );
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

async function getExerciseDeletionImpact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseId: any
) {
  log(
    'info',
    `getExerciseDeletionImpact: Checking deletion impact for exercise ${exerciseId} by user ${authenticatedUserId}`
  );
  try {
    const exerciseOwnerId = await exerciseDb.getExerciseOwnerId(
      exerciseId,
      authenticatedUserId
    );
    if (!exerciseOwnerId) {
      log(
        'warn',
        `getExerciseDeletionImpact: Exercise ${exerciseId} not found for user ${authenticatedUserId}.`
      );
      throw new Error('Exercise not found.');
    }
    // No need to check permission here, as exerciseRepository.getExerciseDeletionImpact handles it
    return await exerciseDb.getExerciseDeletionImpact(
      exerciseId,
      authenticatedUserId
    );
  } catch (error) {
    log(
      'error',
      `Error getting exercise deletion impact for exercise ${exerciseId} by user ${authenticatedUserId} in exerciseService:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createServiceError(status: any, message: any) {
  const error = new Error(message);
  // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
  error.status = status;
  return error;
}
function deriveDurationMinutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseData: any,
  { preserveLegacyPresetDurationFallback = false } = {}
) {
  const durationFromSets =
    exerciseData.sets?.reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: any, set: any) =>
        sum + (set.duration || 0) + (set.rest_time || 0) / 60,
      0
    ) || 0;
  if (typeof exerciseData.duration_minutes === 'number') {
    return exerciseData.duration_minutes;
  }
  if (preserveLegacyPresetDurationFallback && durationFromSets === 0) {
    return 30;
  }
  return durationFromSets;
}

async function createGroupedExerciseEntriesWithClient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presetEntryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exercises: any,
  options = {}
) {
  const {
    // @ts-expect-error TS(2339): Property 'entrySource' does not exist on type '{}'... Remove this comment to see the full error message
    entrySource = 'manual',
    // @ts-expect-error TS(2339): Property 'workoutPlanAssignmentId' does not exist ... Remove this comment to see the full error message
    workoutPlanAssignmentId = null,
    // @ts-expect-error TS(2339): Property 'preserveLegacyPresetDurationFallback' do... Remove this comment to see the full error message
    preserveLegacyPresetDurationFallback = false,
  } = options;
  const createdEntries = [];
  for (const exercise of exercises || []) {
    const durationMinutes = deriveDurationMinutes(exercise, {
      preserveLegacyPresetDurationFallback,
    });

    const preparedEntry = await prepareExerciseEntryForCreate(userId, {
      exercise_id: exercise.exercise_id,
      entry_date: entryDate,
      notes: exercise.notes ?? null,
      sets: exercise.sets || [],
      duration_minutes: durationMinutes,
      sort_order: exercise.sort_order ?? 0,
      workout_plan_assignment_id: workoutPlanAssignmentId,
      distance: exercise.distance,
      avg_heart_rate: exercise.avg_heart_rate,
    });
    const createdEntry = await exerciseEntryDb._createExerciseEntryWithClient(
      client,
      userId,
      preparedEntry,
      actingUserId,
      entrySource,
      presetEntryId
    );
    createdEntries.push(createdEntry);
  }
  return createdEntries;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getGroupedWorkoutSessionById(userId: any, presetEntryId: any) {
  return getGroupedExerciseSessionById(userId, presetEntryId);
}

async function createGroupedWorkoutSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionData: any
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const {
      workout_preset_id,
      entry_date,
      name,
      description,
      notes,
      source = 'manual',
      exercises,
      workoutPlanAssignmentId = null,
    } = sessionData;
    let presetEntry;
    let exerciseDefinitions;
    let childEntrySource = source;
    let preserveLegacyPresetDurationFallback = false;
    if (workout_preset_id !== undefined && workout_preset_id !== null) {
      const workoutPreset = await workoutPresetRepository.getWorkoutPresetById(
        workout_preset_id,
        userId
      );
      if (!workoutPreset) {
        throw createServiceError(404, 'Workout preset not found.');
      }
      presetEntry =
        await exercisePresetEntryRepository.createExercisePresetEntryWithClient(
          client,
          userId,
          {
            workout_preset_id,
            name: name || workoutPreset.name,
            description:
              description !== undefined
                ? description
                : workoutPreset.description,
            entry_date,
            notes,
            source,
          },
          actingUserId
        );
      exerciseDefinitions = workoutPreset.exercises || [];
      childEntrySource = 'Workout Preset';
      preserveLegacyPresetDurationFallback = true;
    } else {
      presetEntry =
        await exercisePresetEntryRepository.createExercisePresetEntryWithClient(
          client,
          userId,
          {
            workout_preset_id: null,
            name,
            description: description ?? null,
            entry_date,
            notes: notes ?? null,
            source,
          },
          actingUserId
        );
      exerciseDefinitions = exercises || [];
    }
    await createGroupedExerciseEntriesWithClient(
      client,
      userId,
      actingUserId,
      presetEntry.id,
      entry_date,
      exerciseDefinitions,
      {
        entrySource: childEntrySource,
        workoutPlanAssignmentId,
        preserveLegacyPresetDurationFallback,
      }
    );
    const groupedSession = await getGroupedExerciseSessionByIdWithClient(
      client,
      userId,
      presetEntry.id
    );
    await client.query('COMMIT');
    return groupedSession;
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'Error creating grouped workout session:', error);
    throw error;
  } finally {
    client.release();
  }
}
async function updateGroupedWorkoutSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presetEntryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const existingSession = await getGroupedExerciseSessionByIdWithClient(
      client,
      userId,
      presetEntryId
    );
    if (!existingSession) {
      throw createServiceError(404, 'Exercise preset entry not found.');
    }
    await exercisePresetEntryRepository.updateExercisePresetEntryWithClient(
      client,
      presetEntryId,
      userId,
      {
        name: updateData.name,
        description: updateData.description,
        notes: updateData.notes,
        entry_date: updateData.entry_date,
      }
    );
    const targetEntryDate = updateData.entry_date || existingSession.entry_date;
    if (updateData.exercises !== undefined) {
      if (!['manual', 'sparky'].includes(existingSession.source)) {
        throw createServiceError(
          409,
          'Nested exercise editing is only supported for manual or sparky workouts.'
        );
      }

      const incomingExercises = updateData.exercises;
      const withId = incomingExercises.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any) => e.id !== undefined && e.id !== null
      ).length;

      if (withId !== 0 && withId !== incomingExercises.length) {
        throw createServiceError(
          400,
          'exercises[].id must be provided for all entries or none.'
        );
      }

      const useReconcile =
        withId === incomingExercises.length && incomingExercises.length > 0;

      if (!useReconcile) {
        await exerciseEntryDb.deleteExerciseEntriesByPresetEntryIdWithClient(
          client,
          userId,
          presetEntryId
        );

        await createGroupedExerciseEntriesWithClient(
          client,
          userId,
          actingUserId,
          presetEntryId,
          targetEntryDate,
          incomingExercises,
          {
            entrySource: existingSession.source,
          }
        );
      } else {
        const existingExercises = existingSession.exercises || [];
        const existingById = new Map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          existingExercises.map((e: any) => [e.id, e])
        );

        for (const ex of incomingExercises) {
          if (!existingById.has(ex.id)) {
            log(
              'warn',
              `Rejected reconcile: exercise id ${ex.id} not in session ${presetEntryId} for user ${userId}`
            );
            throw createServiceError(
              400,
              'Exercise entry does not belong to this session.'
            );
          }
        }

        const incomingIdSet = new Set(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          incomingExercises.map((e: any) => e.id)
        );
        const toDelete = existingExercises.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e: any) => !incomingIdSet.has(e.id)
        );
        for (const e of toDelete) {
          await exerciseEntryDb._deleteExerciseEntryWithClient(
            client,
            userId,
            e.id
          );
        }

        for (const ex of incomingExercises) {
          // Reuse prepareExerciseEntryForCreate so calories_burned is
          // recomputed from the new duration/sets the same way the legacy
          // delete-and-recreate path does — otherwise the helper would
          // preserve the stale value.
          const preparedEntry = await prepareExerciseEntryForCreate(userId, {
            exercise_id: ex.exercise_id,
            entry_date: targetEntryDate,
            notes: ex.notes ?? null,
            sets: ex.sets || [],
            duration_minutes: deriveDurationMinutes(ex),
            sort_order: ex.sort_order ?? 0,
            distance: ex.distance,
            avg_heart_rate: ex.avg_heart_rate,
          });

          await exerciseEntryDb._updateExerciseEntryWithClient(
            client,
            ex.id,
            userId,
            {
              exercise_id: preparedEntry.exercise_id,
              notes: preparedEntry.notes,
              sort_order: preparedEntry.sort_order ?? 0,
              distance: preparedEntry.distance,
              avg_heart_rate: preparedEntry.avg_heart_rate,
              duration_minutes: preparedEntry.duration_minutes,
              calories_burned: preparedEntry.calories_burned,
              entry_date: targetEntryDate,
            },
            actingUserId,
            existingSession.source
          );

          await exerciseEntryDb._reconcileExerciseEntrySetsWithClient(
            client,
            ex.id,
            ex.sets || []
          );
        }
      }
    } else if (
      updateData.entry_date !== undefined &&
      updateData.entry_date !== existingSession.entry_date
    ) {
      await exerciseEntryDb.updateExerciseEntriesDateByPresetEntryIdWithClient(
        client,
        userId,
        presetEntryId,
        updateData.entry_date,
        actingUserId
      );
    }
    const groupedSession = await getGroupedExerciseSessionByIdWithClient(
      client,
      userId,
      presetEntryId
    );
    await client.query('COMMIT');
    return groupedSession;
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'Error updating grouped workout session:', error);
    throw error;
  } finally {
    client.release();
  }
}
async function logWorkoutPresetGrouped(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workoutPresetId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryDate: any,
  options = {}
) {
  return createGroupedWorkoutSession(userId, actingUserId, {
    workout_preset_id: workoutPresetId,
    entry_date: entryDate,
    ...options,
  });
}
async function getActivityDetailsByExerciseEntryIdAndProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerName: any
) {
  try {
    let activityDetails = [];
    // First, try to find an exercise entry with the given ID
    const exerciseEntry = await exerciseEntryDb.getExerciseEntryById(
      entryId,
      authenticatedUserId
    );
    let targetId = entryId; // Default to the provided entryId
    if (exerciseEntry) {
      // If it's an exercise entry and linked to a preset, use the preset ID
      if (exerciseEntry.exercise_preset_entry_id) {
        targetId = exerciseEntry.exercise_preset_entry_id;
        activityDetails =
          await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(
            authenticatedUserId,
            null,
            targetId
          );
      } else {
        // If it's an exercise entry but not linked to a preset, use its own ID
        activityDetails =
          await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(
            authenticatedUserId,
            targetId,
            null
          );
      }
    } else {
      // If not an exercise entry, try to find an exercise preset entry with the given ID
      const presetEntry =
        await exercisePresetEntryRepository.getExercisePresetEntryById(
          entryId,
          authenticatedUserId
        );
      if (presetEntry) {
        targetId = entryId; // The provided ID is already a preset entry ID
        activityDetails =
          await activityDetailsRepository.getActivityDetailsByEntryOrPresetId(
            authenticatedUserId,
            null,
            targetId
          );
      }
    }
    // Find the full_activity_data and full_workout_data for the given provider
    const activityData = activityDetails.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (detail: any) =>
        detail.provider_name === providerName &&
        detail.detail_type === 'full_activity_data'
    );
    const workoutData = activityDetails.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (detail: any) =>
        detail.provider_name === providerName &&
        detail.detail_type === 'full_workout_data'
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
    log(
      'error',
      `Error fetching activity details for entry ${entryId} from provider ${providerName} by user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getExercisesNeedingReview(authenticatedUserId: any) {
  try {
    const exercisesNeedingReview =
      await exerciseRepository.getExercisesNeedingReview(authenticatedUserId);
    return exercisesNeedingReview;
  } catch (error) {
    log(
      'error',
      `Error getting exercises needing review for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function updateExerciseEntriesSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseId: any
) {
  try {
    // Fetch the latest exercise details
    const exercise = await exerciseDb.getExerciseById(
      exerciseId,
      authenticatedUserId
    );
    if (!exercise) {
      throw new Error('Exercise not found.');
    }
    // Construct the new snapshot data
    const newSnapshotData = {
      exercise_name: exercise.name,
      calories_per_hour: exercise.calories_per_hour,
    };
    // Update all relevant exercise entries for the authenticated user
    await exerciseRepository.updateExerciseEntriesSnapshot(
      authenticatedUserId,
      exerciseId,
      newSnapshotData
    );
    // Clear any ignored updates for this exercise for this user
    await exerciseRepository.clearUserIgnoredUpdate(
      authenticatedUserId,
      exerciseId
    );
    return { message: 'Exercise entries updated successfully.' };
  } catch (error) {
    log(
      'error',
      `Error updating exercise entries snapshot for user ${authenticatedUserId}, exercise ${exerciseId}:`,
      error
    );
    throw error;
  }
}

async function importExercisesFromJson(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exercisesArray: any
) {
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
        failedRows.push({
          row: exerciseData,
          reason: 'Exercise name is required.',
        });
        continue;
      }
      const primaryMuscles = exerciseData.primary_muscles
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          exerciseData.primary_muscles.split(',').map((m: any) => m.trim())
        : [];
      if (primaryMuscles.length === 0) {
        failedCount++;
        failedRows.push({
          row: exerciseData,
          reason: 'Primary muscles are required.',
        });
        continue;
      }
      const sourceId = exerciseName.toLowerCase().replace(/\s/g, '_');
      const newExerciseData = {
        name: exerciseName,
        description: exerciseData.description || null,
        instructions: exerciseData.instructions
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            exerciseData.instructions.split(',').map((i: any) => i.trim())
          : [],
        category: exerciseData.category || null,
        force: exerciseData.force || null,
        level: exerciseData.level || null,
        mechanic: exerciseData.mechanic || null,
        equipment: exerciseData.equipment
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            exerciseData.equipment.split(',').map((e: any) => e.trim())
          : [],
        primary_muscles: primaryMuscles,
        secondary_muscles: exerciseData.secondary_muscles
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            exerciseData.secondary_muscles.split(',').map((m: any) => m.trim())
          : [],
        calories_per_hour: exerciseData.calories_per_hour
          ? parseFloat(exerciseData.calories_per_hour)
          : null,
        user_id: authenticatedUserId,
        is_custom: exerciseData.is_custom === true,
        shared_with_public: exerciseData.shared_with_public === true,
        source: 'CSV_Import', // Indicate that it came from a CSV import via the UI
        source_id: sourceId,
      };
      // Handle images: download and store local paths
      if (exerciseData.images) {
        const imageUrls = exerciseData.images
          .split(',')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((url: any) => url.trim());
        const localImagePaths = [];
        const exerciseFolderName = exerciseName.replace(/[^a-zA-Z0-9]/g, '_');
        for (const imageUrl of imageUrls) {
          try {
            const localPath = await downloadImage(imageUrl, exerciseFolderName);
            localImagePaths.push(localPath);
          } catch (imgError) {
            log(
              'error',
              `Failed to download image ${imageUrl} for exercise ${exerciseName}:`,
              imgError
            );
            // Continue without this image, but log the error
          }
        }
        // @ts-expect-error TS(2339): Property 'images' does not exist on type '{ name: ... Remove this comment to see the full error message
        newExerciseData.images = localImagePaths;
      } else {
        // @ts-expect-error TS(2339): Property 'images' does not exist on type '{ name: ... Remove this comment to see the full error message
        newExerciseData.images = [];
      }
      const existingExercise = await exerciseDb.searchExercises(
        exerciseName,
        authenticatedUserId,
        [],
        []
      );
      if (existingExercise && existingExercise.length > 0) {
        // Check for exact duplicate before updating
        const isDuplicate = existingExercise.some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ex: any) => ex.name.toLowerCase() === exerciseName.toLowerCase()
        );
        if (isDuplicate) {
          duplicates.push({
            name: exerciseName,
            reason: 'Exercise with this name already exists.',
          });
          failedCount++;
          failedRows.push({
            row: exerciseData,
            reason: 'Duplicate exercise name.',
          });
          continue;
        }
        // Assuming the first match is the one to update
        await exerciseDb.updateExercise(
          existingExercise[0].id,
          authenticatedUserId,
          newExerciseData
        );
        updatedCount++;
      } else {
        await exerciseDb.createExercise(newExerciseData);
        createdCount++;
      }
    } catch (rowError) {
      failedCount++;
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      failedRows.push({ row: exerciseData, reason: rowError.message });
      log(
        'error',
        `Error processing exercise data for user ${authenticatedUserId}:`,
        rowError
      );
    }
  }
  if (duplicates.length > 0) {
    const error = new Error('Duplicate exercises found.');
    // @ts-expect-error TS(2339): Property 'status' does not exist on type 'Error'.
    error.status = 409; // Conflict
    // @ts-expect-error TS(2339): Property 'data' does not exist on type 'Error'.
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
export { getExerciseById };
export { getOrCreateActiveCaloriesExercise };
export { upsertExerciseEntryData };
export { getExercisesWithPagination };
export { searchExercises };
export { searchExercisesPaginated };
export { getAvailableEquipment };
export { getAvailableMuscleGroups };
export { createExercise };
export { createExerciseEntry };
export { getExerciseEntryById };
export { updateExerciseEntry };
export { deleteExerciseEntry };
export { updateExercise };
export { deleteExercise };
export { getExerciseEntriesByDate };
export { addFreeExerciseDBExerciseToUserExercises };
export { getSuggestedExercises };
export { searchExternalExercises };
export { addExternalExerciseToUserExercises };
export { addNutritionixExerciseToUserExercises };
export { getExerciseDeletionImpact };
export { getExerciseProgressData };
export { getExerciseHistory };
export { getRecentExercises };
export { getTopExercises };
export { importExercisesFromCSV };
export { importExercisesFromJson };
export { getExercisesNeedingReview };
export { updateExerciseEntriesSnapshot };
export { getActivityDetailsByExerciseEntryIdAndProvider };
export { logWorkoutPresetGrouped };
export { createGroupedWorkoutSession };
export { updateGroupedWorkoutSession };
export { getGroupedWorkoutSessionById };
export default {
  getExerciseById,
  getOrCreateActiveCaloriesExercise,
  upsertExerciseEntryData,
  getExercisesWithPagination,
  searchExercises,
  searchExercisesPaginated,
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
  importExercisesFromJson,
  getExercisesNeedingReview,
  updateExerciseEntriesSnapshot,
  getActivityDetailsByExerciseEntryIdAndProvider,
  logWorkoutPresetGrouped,
  createGroupedWorkoutSession,
  updateGroupedWorkoutSession,
  getGroupedWorkoutSessionById,
};
