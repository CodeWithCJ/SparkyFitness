const goalPresetRepository = require('../models/goalPresetRepository');
const { log } = require('../config/logging');

// Convert water_goal_ml to the correct repository field name
function mapWaterGoalMlToDb(presetData) {
  const { water_goal_ml, ...rest } = presetData;
  return {
    ...rest,
    water_goal: water_goal_ml,
  };
}

// Convert water_goal repository field name to water_goal_ml
function mapDbToWaterGoalMl(presetData) {
  const { water_goal, ...rest } = presetData;
  return {
    ...rest,
    water_goal_ml: water_goal,
  };
}

// Helper function to calculate grams from percentages
function calculateGramsFromPercentages(
  calories,
  protein_percentage,
  carbs_percentage,
  fat_percentage
) {
  const protein_grams = (calories * (protein_percentage / 100)) / 4;
  const carbs_grams = (calories * (carbs_percentage / 100)) / 4;
  const fat_grams = (calories * (fat_percentage / 100)) / 9;
  return { protein_grams, carbs_grams, fat_grams };
}

async function createGoalPreset(userId, presetData) {
  try {
    // If percentages are provided, calculate grams
    if (
      presetData.protein_percentage !== null &&
      presetData.carbs_percentage !== null &&
      presetData.fat_percentage !== null
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
    log('error', `Error creating goal preset for user ${userId}:`, error);
    throw new Error('Failed to create goal preset.', { cause: error });
  }
}

async function getGoalPresets(userId) {
  try {
    const presets = await goalPresetRepository.getGoalPresetsByUserId(userId);
    return presets.map(mapDbToWaterGoalMl);
  } catch (error) {
    log('error', `Error fetching goal presets for user ${userId}:`, error);
    throw new Error('Failed to fetch goal presets.', { cause: error });
  }
}

async function getGoalPreset(presetId, userId) {
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

async function updateGoalPreset(presetId, userId, presetData) {
  try {
    // If percentages are provided, calculate grams
    if (
      presetData.protein_percentage !== null &&
      presetData.carbs_percentage !== null &&
      presetData.fat_percentage !== null
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
    log(
      'error',
      `Error updating goal preset ${presetId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to update goal preset.', { cause: error });
  }
}

async function deleteGoalPreset(presetId, userId) {
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

module.exports = {
  createGoalPreset,
  getGoalPresets,
  getGoalPreset,
  updateGoalPreset,
  deleteGoalPreset,
};
