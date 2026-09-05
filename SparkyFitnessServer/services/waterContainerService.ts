import waterContainerRepository from '../models/waterContainerRepository.js';
import foodRepository from '../models/food.js';
import foodVariantRepository from '../models/foodVariant.js';
import { log } from '../config/logging.js';
import { WATER_CONTAINER_UNITS } from '../schemas/waterContainerSchemas.js';
const VALID_UNITS: readonly string[] = WATER_CONTAINER_UNITS;

// #2115: when a container is linked to a food, resolve/validate the variant
// so "+" always has a real variant to snapshot from. A variant explicitly
// given must actually belong to the linked food -- otherwise a stale or
// mismatched variant id would silently attach the wrong nutrition profile to
// every future drink logged through this container.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveLinkedVariantId(userId: any, containerData: any) {
  if (!('linked_food_id' in containerData)) {
    return containerData;
  }
  const resolved = { ...containerData };
  if (!containerData.linked_food_id) {
    // Unlinking the food also clears any variant/meal-type left over from
    // a previous link -- a stale variant id pointing at nothing useful.
    resolved.linked_variant_id = null;
    resolved.linked_meal_type_id = resolved.linked_meal_type_id ?? null;
    return resolved;
  }
  const food = await foodRepository.getFoodById(
    containerData.linked_food_id,
    userId
  );
  if (!food) {
    throw new Error('Linked food not found.');
  }
  if (containerData.linked_variant_id) {
    const variant = await foodVariantRepository.getFoodVariantById(
      containerData.linked_variant_id,
      userId
    );
    if (!variant || variant.food_id !== containerData.linked_food_id) {
      throw new Error('Linked variant does not belong to the linked food.');
    }
  } else {
    // No variant specified: fall back to the food's default variant.
    const defaultVariantId = food.default_variant?.id;
    if (!defaultVariantId) {
      throw new Error('Linked food has no default variant to attach.');
    }
    resolved.linked_variant_id = defaultVariantId;
  }
  return resolved;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertToMl(volume: any, unit: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createWaterContainer(userId: any, containerData: any) {
  if (!VALID_UNITS.includes(containerData.unit)) {
    throw new Error('Invalid unit provided.');
  }
  try {
    const volumeInMl = convertToMl(containerData.volume, containerData.unit);
    const withResolvedLink = await resolveLinkedVariantId(
      userId,
      containerData
    );
    const dataToSave = { ...withResolvedLink, volume: volumeInMl };
    return await waterContainerRepository.createWaterContainer(
      userId,
      dataToSave
    );
  } catch (error) {
    log('error', `Error creating water container for user ${userId}:`, error);
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWaterContainersByUserId(userId: any) {
  try {
    return await waterContainerRepository.getWaterContainersByUserId(userId);
  } catch (error) {
    log('error', `Error fetching water containers for user ${userId}:`, error);
    throw error;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateWaterContainer(id: any, userId: any, updateData: any) {
  if (updateData.unit && !VALID_UNITS.includes(updateData.unit)) {
    throw new Error('Invalid unit provided.');
  }
  try {
    const dataToSave = await resolveLinkedVariantId(userId, updateData);
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteWaterContainer(id: any, userId: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setPrimaryWaterContainer(id: any, userId: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPrimaryWaterContainerByUserId(userId: any) {
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
