import { getClient } from '../db/poolManager.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import exerciseRepository from '../models/exerciseRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { resolveExerciseIdToUuid } from '../utils/uuidUtils.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createWorkoutPreset(userId: any, presetData: any) {
  for (const ex of presetData.exercises) {
    ex.exercise_id = await resolveExerciseIdToUuid(ex.exercise_id, userId);
    const exercise = await exerciseRepository.getExerciseById(
      ex.exercise_id,
      userId
    );
    if (!exercise) {
      throw new Error(`Exercise with ID ${ex.exercise_id} not found.`);
    }
  }
  const created = await workoutPresetRepository.createWorkoutPreset({
    ...presetData,
    user_id: userId,
  });
  return created;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkoutPresets(userId: any, page = 1, limit = 10) {
  const client = await getClient(userId);
  try {
    const result = await workoutPresetRepository.getWorkoutPresets(
      userId,
      page,
      limit
    );

    return result;
  } finally {
    client.release();
  }
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
  return preset;
}

async function updateWorkoutPreset(
  userId: any,
  presetId: any,
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
  if (updateData.exercises) {
    for (const ex of updateData.exercises) {
      ex.exercise_id = await resolveExerciseIdToUuid(ex.exercise_id, userId);
      const exercise = await exerciseRepository.getExerciseById(
        ex.exercise_id,
        userId
      );
      if (!exercise) {
        throw new Error(`Exercise with ID ${ex.exercise_id} not found.`);
      }
    }
  }
  const updated = await workoutPresetRepository.updateWorkoutPreset(
    presetId,
    userId,
    updateData
  );
  return updated;
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
  const presets = await workoutPresetRepository.searchWorkoutPresets(
    searchTerm,
    userId,
    limit
  );
  return presets;
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
