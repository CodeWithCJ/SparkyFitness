import workoutPresetRepository from '../models/workoutPresetRepository.js';
import exerciseRepository from '../models/exerciseRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { resolveExerciseIdToUuid } from '../utils/uuidUtils.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createWorkoutPreset(userId: any, presetData: any) {
  // Validate and resolve exercise_ids
  for (const ex of presetData.exercises) {
    ex.exercise_id = await resolveExerciseIdToUuid(ex.exercise_id, userId); // Resolve to UUID
    const exercise = await exerciseRepository.getExerciseById(
      ex.exercise_id,
      userId
    );
    if (!exercise) {
      throw new Error(`Exercise with ID ${ex.exercise_id} not found.`);
    }
    // Ensure duration and notes are numbers/strings if they exist
    if (ex.duration !== undefined && typeof ex.duration !== 'number') {
      throw new Error(
        `Duration for exercise ${ex.exercise_id} must be a number.`
      );
    }
    if (ex.notes !== undefined && typeof ex.notes !== 'string') {
      throw new Error(`Notes for exercise ${ex.exercise_id} must be a string.`);
    }
  }
  return workoutPresetRepository.createWorkoutPreset(presetData);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkoutPresets(userId: any, page: any, limit: any) {
  return workoutPresetRepository.getWorkoutPresets(userId, page, limit);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkoutPresetById(userId: any, presetId: any) {
  const preset = await workoutPresetRepository.getWorkoutPresetById(
    presetId,
    userId
  );
  if (!preset) {
    throw new Error('Workout preset not found.');
  }
  const ownerId = await workoutPresetRepository.getWorkoutPresetOwnerId(
    userId,
    presetId
  );
  if (ownerId !== userId && !preset.is_public) {
    throw new Error(
      'Forbidden: You do not have access to this workout preset.'
    );
  }
  return preset;
}

async function updateWorkoutPreset(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presetId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  const ownerId = await workoutPresetRepository.getWorkoutPresetOwnerId(
    userId,
    presetId
  );
  if (ownerId !== userId) {
    throw new Error(
      'Forbidden: You do not have permission to update this workout preset.'
    );
  }
  // Validate and resolve exercise_ids if exercises are being updated
  if (updateData.exercises) {
    for (const ex of updateData.exercises) {
      ex.exercise_id = await resolveExerciseIdToUuid(ex.exercise_id, userId); // Resolve to UUID
      const exercise = await exerciseRepository.getExerciseById(
        ex.exercise_id,
        userId
      );
      if (!exercise) {
        throw new Error(`Exercise with ID ${ex.exercise_id} not found.`);
      }
      // Ensure duration and notes are numbers/strings if they exist
      if (ex.duration !== undefined && typeof ex.duration !== 'number') {
        throw new Error(
          `Duration for exercise ${ex.exercise_id} must be a number.`
        );
      }
      if (ex.notes !== undefined && typeof ex.notes !== 'string') {
        throw new Error(
          `Notes for exercise ${ex.exercise_id} must be a string.`
        );
      }
    }
  }
  return workoutPresetRepository.updateWorkoutPreset(
    presetId,
    userId,
    updateData
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteWorkoutPreset(userId: any, presetId: any) {
  const ownerId = await workoutPresetRepository.getWorkoutPresetOwnerId(
    userId,
    presetId
  );
  if (ownerId !== userId) {
    throw new Error(
      'Forbidden: You do not have permission to delete this workout preset.'
    );
  }
  const deleted = await workoutPresetRepository.deleteWorkoutPreset(
    presetId,
    userId
  );
  if (!deleted) {
    throw new Error('Workout preset not found or could not be deleted.');
  }
  return { message: 'Workout preset deleted successfully.' };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchWorkoutPresets(searchTerm: any, userId: any, limit: any) {
  if (limit === null || limit === undefined) {
    const preferences = await preferenceRepository.getUserPreferences(userId);
    limit = preferences ? preferences.item_display_limit : 10;
  }
  return workoutPresetRepository.searchWorkoutPresets(
    searchTerm,
    userId,
    limit
  );
}
export { createWorkoutPreset };
export { getWorkoutPresets };
export { getWorkoutPresetById };
export { updateWorkoutPreset };
export { deleteWorkoutPreset };
export { searchWorkoutPresets };
export default {
  createWorkoutPreset,
  getWorkoutPresets,
  getWorkoutPresetById,
  updateWorkoutPreset,
  deleteWorkoutPreset,
  searchWorkoutPresets,
};
