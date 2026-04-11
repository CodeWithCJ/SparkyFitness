import goalPresetRepository from '../models/goalPresetRepository.js';
import { log } from '../config/logging.js';
// Convert water_goal_ml to the correct repository field name
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapWaterGoalMlToDb(presetData: any) {
  const { water_goal_ml, ...rest } = presetData;
  return {
    ...rest,
    water_goal: water_goal_ml,
  };
}
// Convert water_goal repository field name to water_goal_ml
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbToWaterGoalMl(presetData: any) {
  const { water_goal, ...rest } = presetData;
  return {
    ...rest,
    water_goal_ml: water_goal,
  };
}
// Helper function to calculate grams from percentages
function calculateGramsFromPercentages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calories: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protein_percentage: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  carbs_percentage: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fat_percentage: any
) {
  const protein_grams = (calories * (protein_percentage / 100)) / 4;
  const carbs_grams = (calories * (carbs_percentage / 100)) / 4;
  const fat_grams = (calories * (fat_percentage / 100)) / 9;
  return { protein_grams, carbs_grams, fat_grams };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createGoalPreset(userId: any, presetData: any) {
  try {
    // If percentages are provided, calculate grams.
    // Also guard calories — without it the multiplication produces NaN.
    if (
      presetData.calories !== null &&
      presetData.calories !== undefined &&
      presetData.protein_percentage !== null &&
      presetData.protein_percentage !== undefined &&
      presetData.carbs_percentage !== null &&
      presetData.carbs_percentage !== undefined &&
      presetData.fat_percentage !== null &&
      presetData.fat_percentage !== undefined
    ) {
      const { protein_grams, carbs_grams, fat_grams } =
        calculateGramsFromPercentages(
          presetData.calories,
          presetData.protein_percentage,
          presetData.carbs_percentage,
          presetData.fat_percentage
        );
      presetData.protein = protein_grams;
      presetData.carbs = carbs_grams;
      presetData.fat = fat_grams;
    }
    const dbPresetData = mapWaterGoalMlToDb({ ...presetData, user_id: userId });
    const newPreset = await goalPresetRepository.createGoalPreset(dbPresetData);
    return newPreset;
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.code === '23505') {
      throw new Error('A goal preset with this name already exists.', {
        cause: error,
      });
    }
    log('error', `Error creating goal preset for user ${userId}:`, error);
    throw new Error('Failed to create goal preset.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getGoalPresets(userId: any) {
  try {
    const presets = await goalPresetRepository.getGoalPresetsByUserId(userId);
    return presets.map(mapDbToWaterGoalMl);
  } catch (error) {
    log('error', `Error fetching goal presets for user ${userId}:`, error);
    throw new Error('Failed to fetch goal presets.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getGoalPreset(presetId: any, userId: any) {
  try {
    const preset = await goalPresetRepository.getGoalPresetById(
      presetId,
      userId
    );
    return preset ? mapDbToWaterGoalMl(preset) : null;
  } catch (error) {
    log(
      'error',
      `Error fetching goal preset ${presetId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to fetch goal preset.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateGoalPreset(presetId: any, userId: any, presetData: any) {
  try {
    // If percentages are provided, calculate grams.
    // Also guard calories — without it the multiplication produces NaN.
    if (
      presetData.calories !== null &&
      presetData.calories !== undefined &&
      presetData.protein_percentage !== null &&
      presetData.protein_percentage !== undefined &&
      presetData.carbs_percentage !== null &&
      presetData.carbs_percentage !== undefined &&
      presetData.fat_percentage !== null &&
      presetData.fat_percentage !== undefined
    ) {
      const { protein_grams, carbs_grams, fat_grams } =
        calculateGramsFromPercentages(
          presetData.calories,
          presetData.protein_percentage,
          presetData.carbs_percentage,
          presetData.fat_percentage
        );
      presetData.protein = protein_grams;
      presetData.carbs = carbs_grams;
      presetData.fat = fat_grams;
    }
    const dbPresetData = mapWaterGoalMlToDb({ ...presetData, user_id: userId });
    const updatedPreset = await goalPresetRepository.updateGoalPreset(
      presetId,
      dbPresetData
    );
    return updatedPreset;
  } catch (error) {
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    if (error.code === '23505') {
      throw new Error('A goal preset with this name already exists.', {
        cause: error,
      });
    }
    log(
      'error',
      `Error updating goal preset ${presetId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to update goal preset.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteGoalPreset(presetId: any, userId: any) {
  try {
    const deletedPreset = await goalPresetRepository.deleteGoalPreset(
      presetId,
      userId
    );
    return deletedPreset;
  } catch (error) {
    log(
      'error',
      `Error deleting goal preset ${presetId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to delete goal preset.', { cause: error });
  }
}
export { createGoalPreset };
export { getGoalPresets };
export { getGoalPreset };
export { updateGoalPreset };
export { deleteGoalPreset };
export default {
  createGoalPreset,
  getGoalPresets,
  getGoalPreset,
  updateGoalPreset,
  deleteGoalPreset,
};
