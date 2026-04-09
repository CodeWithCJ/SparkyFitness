import waterContainerRepository from '../models/waterContainerRepository.js';
import { log } from '../config/logging.js';
const VALID_UNITS = ['ml', 'oz', 'liter']; // Changed 'cup' to 'liter'
function convertToMl(volume, unit) {
  if (!VALID_UNITS.includes(unit)) {
    throw new Error('Invalid unit for conversion.');
  }
  switch (unit) {
    case 'oz':
      return volume * 29.5735; // Standard US fluid ounce
    case 'liter':
      return volume * 1000; // 1 liter = 1000 ml
    case 'ml':
    default:
      return volume;
  }
}
async function createWaterContainer(userId, containerData) {
  if (!VALID_UNITS.includes(containerData.unit)) {
    throw new Error('Invalid unit provided.');
  }
  try {
    const volumeInMl = convertToMl(containerData.volume, containerData.unit);
    const dataToSave = { ...containerData, volume: volumeInMl };
    return await waterContainerRepository.createWaterContainer(
      userId,
      dataToSave
    );
  } catch (error) {
    log('error', `Error creating water container for user ${userId}:`, error);
    throw error;
  }
}
async function getWaterContainersByUserId(userId) {
  try {
    return await waterContainerRepository.getWaterContainersByUserId(userId);
  } catch (error) {
    log('error', `Error fetching water containers for user ${userId}:`, error);
    throw error;
  }
}
async function updateWaterContainer(id, userId, updateData) {
  if (updateData.unit && !VALID_UNITS.includes(updateData.unit)) {
    throw new Error('Invalid unit provided.');
  }
  try {
    const dataToSave = { ...updateData };
    if (updateData.volume !== undefined && updateData.unit !== undefined) {
      dataToSave.volume = convertToMl(updateData.volume, updateData.unit);
    } else if (
      updateData.volume !== undefined &&
      updateData.unit === undefined
    ) {
      // If volume is updated but unit is not, we need the original unit to convert
      // This scenario might require fetching the existing container first to get its unit
      // For simplicity, we'll assume unit is always provided if volume is updated, or handle it in the frontend
      // For now, we'll just pass the volume as is if unit is not provided, assuming it's already in ML or handled by frontend
      log(
        'warn',
        `Volume updated without unit for container ${id}. Assuming volume is already in ML.`
      );
    }
    return await waterContainerRepository.updateWaterContainer(
      id,
      userId,
      dataToSave
    );
  } catch (error) {
    log(
      'error',
      `Error updating water container ${id} for user ${userId}:`,
      error
    );
    throw error;
  }
}
async function deleteWaterContainer(id, userId) {
  try {
    // Add authorization check if needed
    const success = await waterContainerRepository.deleteWaterContainer(
      id,
      userId
    );
    if (!success) {
      throw new Error('Water container not found or not authorized to delete.');
    }
    return { message: 'Water container deleted successfully.' };
  } catch (error) {
    log(
      'error',
      `Error deleting water container ${id} for user ${userId}:`,
      error
    );
    throw error;
  }
}
async function setPrimaryWaterContainer(id, userId) {
  try {
    // Add authorization check if needed
    return await waterContainerRepository.setPrimaryWaterContainer(id, userId);
  } catch (error) {
    log(
      'error',
      `Error setting primary water container ${id} for user ${userId}:`,
      error
    );
    throw error;
  }
}
async function getPrimaryWaterContainerByUserId(userId) {
  try {
    return await waterContainerRepository.getPrimaryWaterContainerByUserId(
      userId
    );
  } catch (error) {
    log(
      'error',
      `Error fetching primary water container for user ${userId}:`,
      error
    );
    throw error;
  }
}
export { createWaterContainer };
export { getWaterContainersByUserId };
export { updateWaterContainer };
export { deleteWaterContainer };
export { setPrimaryWaterContainer };
export { getPrimaryWaterContainerByUserId };
export { convertToMl };
export default {
  createWaterContainer,
  getWaterContainersByUserId,
  updateWaterContainer,
  deleteWaterContainer,
  setPrimaryWaterContainer,
  getPrimaryWaterContainerByUserId,
  convertToMl,
};
