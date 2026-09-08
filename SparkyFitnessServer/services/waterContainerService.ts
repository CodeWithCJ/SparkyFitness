import waterContainerRepository, {
  type CreateWaterContainerData,
  type UpdateWaterContainerData,
} from '../models/waterContainerRepository.js';
import foodRepository from '../models/food.js';
import foodVariantRepository from '../models/foodVariant.js';
import { log } from '../config/logging.js';
import { WATER_CONTAINER_UNITS } from '../schemas/waterContainerSchemas.js';
import {
  getDrinkPresetCatalogEntry,
  type WaterContainerResponse,
} from '@workspace/shared';

const VALID_UNITS: readonly string[] = WATER_CONTAINER_UNITS;

// #2115: when a container is linked to a food, resolve/validate the variant
// so "+" always has a real variant to snapshot from.
async function resolveLinkedVariantId<
  T extends CreateWaterContainerData | UpdateWaterContainerData,
>(userId: string, containerData: T): Promise<T> {
  if (!('linked_food_id' in containerData)) {
    return containerData;
  }
  const resolved = { ...containerData };
  if (!containerData.linked_food_id) {
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
    const defaultVariantId = food.default_variant?.id;
    if (!defaultVariantId) {
      throw new Error('Linked food has no default variant to attach.');
    }
    resolved.linked_variant_id = defaultVariantId;
  }
  return resolved;
}

function convertToMl(volume: number, unit: string): number {
  if (!VALID_UNITS.includes(unit as (typeof VALID_UNITS)[number])) {
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

async function createWaterContainer(
  userId: string,
  containerData: CreateWaterContainerData
): Promise<WaterContainerResponse> {
  if (
    !VALID_UNITS.includes(containerData.unit as (typeof VALID_UNITS)[number])
  ) {
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

async function getWaterContainersByUserId(
  userId: string
): Promise<WaterContainerResponse[]> {
  try {
    return await waterContainerRepository.getWaterContainersByUserId(userId);
  } catch (error) {
    log('error', `Error fetching water containers for user ${userId}:`, error);
    throw error;
  }
}

async function updateWaterContainer(
  id: number,
  userId: string,
  updateData: UpdateWaterContainerData
): Promise<WaterContainerResponse | null> {
  if (
    updateData.unit &&
    !VALID_UNITS.includes(updateData.unit as (typeof VALID_UNITS)[number])
  ) {
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

async function deleteWaterContainer(
  id: number,
  userId: string
): Promise<{ message: string }> {
  try {
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

async function setPrimaryWaterContainer(
  id: number,
  userId: string
): Promise<WaterContainerResponse | null> {
  try {
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

async function getPrimaryWaterContainerByUserId(
  userId: string
): Promise<WaterContainerResponse | null> {
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

async function materializeDrinkPreset(
  userId: string,
  catalogId: string
): Promise<WaterContainerResponse> {
  const preset = getDrinkPresetCatalogEntry(catalogId);
  if (!preset) {
    throw new Error(`Drink preset '${catalogId}' not found in catalog.`);
  }

  // Idempotency: check if the user already has a quick-add preset for this drink
  const existingContainers =
    await waterContainerRepository.getWaterContainersByUserId(userId);
  const existing = existingContainers.find(
    (c) =>
      c.is_quick_add &&
      c.name.toLowerCase() === preset.defaultName.toLowerCase()
  );
  if (existing) {
    return existing;
  }

  const maxSortOrder = existingContainers.reduce(
    (max, c) => Math.max(max, c.sort_order ?? 0),
    0
  );

  // 1. Reuse the user's own food of this name, or create it.
  //
  // The idempotency check above only sees containers, so deleting a preset and
  // adding it again created a fresh food every time and orphaned the last one.
  // Reusing by name also means a user who already keeps their own "Latte" gets
  // their numbers rather than a second entry competing with them in search.
  const existingFood = await foodRepository.findVisibleFoodByName(
    userId,
    preset.defaultName
  );

  const createdFood =
    existingFood ??
    (await foodRepository.createFood({
      user_id: userId,
      name: preset.defaultName,
      is_custom: true,
      shared_with_public: false,
      serving_size: preset.volumeMl,
      serving_unit: preset.servingUnit,
      calories: preset.caloriesKcal ?? 0,
      protein: preset.proteinG ?? 0,
      carbs: preset.carbsG ?? 0,
      fat: preset.fatG ?? 0,
      sugars: preset.sugarsG ?? 0,
      saturated_fat: preset.saturatedFatG ?? 0,
      caffeine_mg: preset.caffeineMg ?? 0,
      abv_percent: preset.abvPercent ?? 0,
      alcohol_g: preset.alcoholG ?? 0,
      // The food's water content is a fact about the drink; the container's
      // hydration factor is a preference about how much of it counts. Deriving
      // one from the other made an espresso claim to be dry, so its entry
      // showed 0 ml of water in a 60 ml cup.
      water_ml: preset.waterMl ?? preset.volumeMl,
    }));

  const defaultVariant = createdFood?.default_variant;
  const variantId =
    defaultVariant?.id || createdFood?.default_variant_id || null;

  // A reused food is whatever the user already had under this name, and one
  // without a default variant carries no serving to measure. Linking the
  // container to it anyway produced a preset that logged nothing when pressed,
  // so fail loudly here instead.
  if (!variantId) {
    throw new Error(
      `"${preset.defaultName}" already exists without a default serving, so it cannot back a quick-add drink. Give that food a serving size, or rename it, and try again.`
    );
  }

  // One whole serving of whatever food we ended up with -- a reused food may
  // be sized differently from the catalog entry.
  const servingSize =
    Number(defaultVariant?.serving_size) ||
    Number(createdFood?.serving_size) ||
    preset.volumeMl;

  // 2. Create water container linked to this food.
  // volume stays 0: the preset's volume already lives on the variant it just
  // created (serving_size/water_ml), and on a linked container volume means
  // "the glass holds more than the food" -- setting it here would override the
  // food with a duplicate of its own number.
  //
  // linked_quantity is one whole serving, expressed in the variant's own unit
  // as the diary expresses it. It must be the serving size, not 1: nutrients
  // are stored per serving_size and consumed as value * quantity / serving_size,
  // so quantity 1 against a 60 ml espresso logged one millilitre of it --
  // 2 mg of its 126 mg of caffeine.
  return await waterContainerRepository.createWaterContainer(userId, {
    name: preset.defaultName,
    volume: 0,
    unit: 'ml',
    is_primary: false,
    servings_per_container: 1,
    linked_quantity: servingSize,
    hydration_factor: preset.hydrationFactor,
    linked_food_id: createdFood.id,
    linked_variant_id: variantId,
    is_quick_add: true,
    sort_order: maxSortOrder + 1,
  });
}

async function reorderWaterContainers(
  userId: string,
  containerIds: number[]
): Promise<void> {
  await waterContainerRepository.reorderWaterContainers(userId, containerIds);
}

export {
  createWaterContainer,
  getWaterContainersByUserId,
  updateWaterContainer,
  deleteWaterContainer,
  setPrimaryWaterContainer,
  getPrimaryWaterContainerByUserId,
  materializeDrinkPreset,
  reorderWaterContainers,
  convertToMl,
};

export default {
  createWaterContainer,
  getWaterContainersByUserId,
  updateWaterContainer,
  deleteWaterContainer,
  setPrimaryWaterContainer,
  getPrimaryWaterContainerByUserId,
  materializeDrinkPreset,
  reorderWaterContainers,
  convertToMl,
};
