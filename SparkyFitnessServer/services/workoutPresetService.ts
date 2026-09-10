import { getClient } from '../db/poolManager.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';
import exerciseRepository from '../models/exerciseRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { resolveExerciseIdToUuid } from '../utils/uuidUtils.js';
import {
  evaluateProgression,
  type ExerciseProgressionConfig,
  type LastExercisePerformance,
} from '@workspace/shared';

/**
 * Helper to dynamically evaluate progression overload on preset exercises
 * from the user's completed history before returning to mobile/web clients.
 */
async function applyProgressionToPreset(userId: string, preset: any) {
  if (!preset || !preset.exercises || preset.exercises.length === 0) {
    return preset;
  }

  const client = await getClient(userId);
  try {
    const enrichedExercises = await Promise.all(
      preset.exercises.map(async (ex: any) => {
        if (
          !ex.rep_goal &&
          ex.progression_mode !== 'fixed' &&
          ex.progression_mode !== 'step_load'
        ) {
          return ex;
        }

        try {
          // Query the most recent completed workout sets for this exercise
          const historyResult = await client.query(
            `SELECT ees.weight, ees.reps, ees.set_number, ee.entry_date
             FROM exercise_entry_sets ees
             JOIN exercise_entries ee ON ees.exercise_entry_id = ee.id
             WHERE ee.user_id = $1 
               AND ee.exercise_id = $2
               AND ees.reps IS NOT NULL 
               AND ees.reps > 0
             ORDER BY ee.entry_date DESC, ee.created_at DESC, ees.set_number ASC
             LIMIT 50`,
            [userId, ex.exercise_id]
          );

          if (historyResult.rows.length > 0) {
            const latestDate = historyResult.rows[0].entry_date;
            const lastSessionRows = historyResult.rows.filter(
              (r: any) => String(r.entry_date) === String(latestDate)
            );

            const rawKg = lastSessionRows[0].weight
              ? Number(lastSessionRows[0].weight)
              : 0;
            const baseWeightInLbs = rawKg > 0 ? rawKg * 2.20462 : 0;

            const lastPerf: LastExercisePerformance = {
              baseWeight: baseWeightInLbs,
              sets: lastSessionRows.map((r: any) => ({
                setNumber: r.set_number,
                reps: Number(r.reps) || 0,
                weight: r.weight ? Number(r.weight) * 2.20462 : 0,
              })),
            };

            const config: ExerciseProgressionConfig = {
              progressionMode: ex.progression_mode || 'rep_goal',
              targetSets: ex.sets?.length || 5,
              repGoal: ex.rep_goal,
              incrementType: ex.increment_type || 'weight',
              incrementValue: Number(ex.increment_value) || 2.5,
              equipmentBrand: ex.equipment_brand,
            };

            const progression = evaluateProgression(config, lastPerf);

            if (progression.goalAchieved) {
              // Case A: Weight Progression
              if (config.incrementType === 'weight' && baseWeightInLbs > 0) {
                const newWeightKg = progression.suggestedWeight / 2.20462;
                return {
                  ...ex,
                  sets: (ex.sets || []).map((s: any) => ({
                    ...s,
                    weight: newWeightKg,
                  })),
                };
              }

              // Case B: Rep Progression
              if (
                config.incrementType === 'reps' ||
                ex.progression_mode === 'step_load'
              ) {
                const numSets = ex.sets?.length || 5;
                const baseReps = Math.floor(
                  progression.suggestedRepGoal / numSets
                );
                const remainder = progression.suggestedRepGoal % numSets;

                return {
                  ...ex,
                  rep_goal: progression.suggestedRepGoal,
                  sets: (ex.sets || []).map((s: any, idx: number) => ({
                    ...s,
                    reps: baseReps + (idx < remainder ? 1 : 0),
                  })),
                };
              }
            }
          }
        } catch {
          // Graceful fallback to static blueprint
        }
        return ex;
      })
    );

    return {
      ...preset,
      exercises: enrichedExercises,
    };
  } finally {
    client.release();
  }
}

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
  return applyProgressionToPreset(userId, created);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkoutPresets(userId: any, page: any, limit: any) {
  const result = await workoutPresetRepository.getWorkoutPresets(
    userId,
    page,
    limit
  );
  const enrichedPresets = await Promise.all(
    result.presets.map((preset: any) =>
      applyProgressionToPreset(userId, preset)
    )
  );
  return {
    ...result,
    presets: enrichedPresets,
  };
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
  return applyProgressionToPreset(userId, preset);
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
  return applyProgressionToPreset(userId, updated);
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
  return Promise.all(
    presets.map((preset: any) => applyProgressionToPreset(userId, preset))
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
