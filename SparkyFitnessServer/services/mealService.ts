import mealRepository from '../models/mealRepository.js';
import foodRepository from '../models/foodRepository.js';
import foodEntryRepository from '../models/foodEntry.js';
import mealPlanTemplateRepository from '../models/mealPlanTemplateRepository.js';
import mealPlanTemplateService from './mealPlanTemplateService.js';
import mealTypeRepository from '../models/mealType.js';
import { log } from '../config/logging.js';
import { ValidationError } from '../utils/errors.js';
import type { MealTypes } from '@workspace/shared';

interface ServingFields {
  serving_unit?: string;
  total_servings?: unknown;
  serving_size?: unknown;
  [key: string]: unknown;
}

interface CreateMealData {
  name: string;
  description?: string | null;
  is_public?: boolean;
  serving_size?: unknown;
  serving_unit?: string;
  total_servings?: unknown;
  foods?: Array<{
    food_id?: string;
    child_meal_id?: string;
    item_type?: 'food' | 'meal';
    variant_id?: string;
    quantity: number;
    unit: string;
    [key: string]: unknown;
  }>;
  user_id?: string;
  [key: string]: unknown;
}

interface UpdateMealData {
  name?: string;
  description?: string | null;
  is_public?: boolean;
  serving_size?: unknown;
  serving_unit?: string;
  total_servings?: unknown;
  [key: string]: unknown;
}

interface CreateMealPlanData {
  user_id?: string;
  meal_id?: string | null;
  food_id?: string | null;
  variant_id?: string | null;
  quantity?: number | null;
  unit?: string | null;
  plan_date: string | Date;
  meal_type_id: string;
  [key: string]: unknown;
}

interface UpdateMealPlanData {
  quantity?: number | null;
  unit?: string | null;
  plan_date?: string | Date;
  meal_type_id?: string;
  [key: string]: unknown;
}

function normalizeServingFields(
  data: ServingFields,
  options: { mode: 'create' | 'update' }
) {
  // Backwards compatibility (issue #1023): old clients didn't know about
  // total_servings and used serving_size as the yield count for serving-unit
  // meals. Detect that payload shape and rewrite to the new model BEFORE
  // validation runs.
  //
  // A new client would always send serving_size = 1 for serving-unit meals
  // (the UI hides the input and the client normalizes), so serving_size > 1
  // with serving_unit='serving' and no total_servings is an unambiguous
  // legacy signal.
  if (
    data.serving_unit === 'serving' &&
    data.total_servings === undefined &&
    typeof data.serving_size === 'number' &&
    data.serving_size > 1
  ) {
    data.total_servings = data.serving_size;
    data.serving_size = 1;
  }

  if (data.serving_size !== undefined) {
    const value = Number(data.serving_size);
    if (!Number.isFinite(value) || value <= 0) {
      throw new ValidationError('Meal serving_size must be a positive number.');
    }
    data.serving_size = value;
  } else if (options.mode === 'create') {
    data.serving_size = 1.0;
  }

  if (data.total_servings !== undefined) {
    const value = Number(data.total_servings);
    if (!Number.isFinite(value) || value <= 0) {
      throw new ValidationError(
        'Meal total_servings must be a positive number.'
      );
    }
    data.total_servings = value;
  } else if (options.mode === 'create') {
    data.total_servings = 1.0;
  }

  if (data.serving_unit !== undefined) {
    data.serving_unit = data.serving_unit || 'serving';
  } else if (options.mode === 'create') {
    data.serving_unit = 'serving';
  }

  // Consistency rule: serving_unit='serving' implies serving_size=1, since one
  // serving is tautologically one serving. The UI hides the serving_size input
  // in this case, but normalize defensively for any caller that doesn't.
  if (data.serving_unit === 'serving' && data.serving_size !== undefined) {
    data.serving_size = 1;
  }
}
// Maximum linked-sub-meal nesting depth. A meal that links other meals may be
// nested at most this many levels deep; deeper links are rejected to bound
// recursive resolution/flatten cost. See MEAL_COMPOSITION_PLAN.md.
const MAX_MEAL_NESTING_DEPTH = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMealIngredient(item: any): boolean {
  return (
    item?.item_type === 'meal' || (!!item?.child_meal_id && !item?.food_id)
  );
}

// Validates a meal's ingredient list (foods and linked sub-meals). Ensures each
// row references exactly one of food/meal, and that linked meals are accessible,
// non-self-referential, cycle-free, and within the nesting-depth limit.
// `currentMealId` is null on create (a brand-new meal has no incoming links yet,
// so it cannot be part of a cycle).
async function validateMealIngredients(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foods: any,
  currentMealId: string | null
) {
  if (!Array.isArray(foods)) return;
  for (const item of foods) {
    if (isMealIngredient(item)) {
      if (!item.child_meal_id) {
        // Allow deleted/unlinked sub-meals to remain as static snapshots
        continue;
      }
      if (item.food_id) {
        throw new ValidationError(
          'An ingredient cannot reference both a food and a meal.'
        );
      }
      if (currentMealId && item.child_meal_id === currentMealId) {
        throw new ValidationError('A meal cannot contain itself.');
      }
      const child = await mealRepository.getMealById(
        item.child_meal_id,
        userId
      );
      if (!child) {
        throw new ValidationError(
          `Linked meal ${item.child_meal_id} was not found or is not accessible.`
        );
      }
      if (currentMealId) {
        const createsCycle = await mealRepository.mealContainsMeal(
          item.child_meal_id,
          currentMealId,
          userId
        );
        if (createsCycle) {
          throw new ValidationError(
            `Linking meal "${child.name}" would create a cycle.`
          );
        }
      }
      const ancestorHeight = currentMealId
        ? await mealRepository.getMealAncestryHeight(currentMealId, userId)
        : 0;
      const childDepth = await mealRepository.getMealSubtreeDepth(
        item.child_meal_id,
        userId
      );
      if (ancestorHeight + 1 + childDepth > MAX_MEAL_NESTING_DEPTH) {
        throw new ValidationError(
          `Meal nesting is too deep (max ${MAX_MEAL_NESTING_DEPTH} levels).`
        );
      }
    } else if (!item.food_id) {
      throw new ValidationError('A food ingredient requires food_id.');
    }
  }
}
// Recursively flattens a meal's ingredient list into leaf food items for
// meal-plan -> diary logging, composing quantities through any linked sub-meals
// (a child meal contributes its foods scaled by its own serving yield).
async function flattenMealFoodsForPlan(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foods: any,
  factor: number,
  depth = 0
): Promise<
  Array<{ food_id: string; variant_id: string; quantity: number; unit: string }>
> {
  const leaves: Array<{
    food_id: string;
    variant_id: string;
    quantity: number;
    unit: string;
  }> = [];
  if (depth > MAX_MEAL_NESTING_DEPTH + 1) return leaves;
  for (const item of foods || []) {
    if (isMealIngredient(item) && item.child_meal_id) {
      const child = await mealRepository.getMealById(
        item.child_meal_id,
        userId
      );
      if (child) {
        const servingSize = Number(child.serving_size) || 1.0;
        const totalServings = Number(child.total_servings) || 1.0;
        const denominator = servingSize * totalServings;
        const quantityInBaseUnit =
          item.unit === 'serving' &&
          child.serving_unit &&
          child.serving_unit !== 'serving'
            ? (Number(item.quantity) || 0) * servingSize
            : Number(item.quantity) || 0;
        const childFactor =
          denominator > 0 ? quantityInBaseUnit / denominator : 1.0;
        leaves.push(
          ...(await flattenMealFoodsForPlan(
            userId,
            child.foods,
            factor * childFactor,
            depth + 1
          ))
        );
        continue;
      }
    }
    leaves.push({
      food_id: item.food_id,
      variant_id: item.variant_id,
      quantity: (Number(item.quantity) || 0) * factor,
      unit: item.unit,
    });
  }
  return leaves;
}
// Nutrient columns carried on meal_foods rows and aggregated for linked meals.
const RESOLVED_NUTRIENT_KEYS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
] as const;

interface ResolvedChildSnapshot {
  serving_size: number;
  serving_unit: string;
  name: string;
  custom_nutrients: Record<string, number>;
  [key: string]: number | string | Record<string, number>;
}

// Computes a child meal's FULL-recipe nutrition (recursively resolving nested
// sub-meals), shaped so the standard per-food formula (value * quantity /
// serving_size) reproduces the correctly-scaled contribution when applied to
// the parent's linked-meal row. serving_size is the child's total yield
// (serving_size × total_servings). Results are memoized per request via `cache`.
async function resolveChildMealSnapshot(
  userId: string,
  childMealId: string,
  cache: Map<string, ResolvedChildSnapshot | null>,
  depth: number
): Promise<ResolvedChildSnapshot | null> {
  if (cache.has(childMealId)) return cache.get(childMealId) ?? null;
  if (depth > MAX_MEAL_NESTING_DEPTH + 1) return null;
  // Reserve the slot up front so a cyclic structure (should be prevented at
  // write time) cannot recurse infinitely here.
  cache.set(childMealId, null);
  const child = await mealRepository.getMealById(childMealId, userId);
  if (!child) return null;
  const totals: Record<string, number> = {};
  for (const key of RESOLVED_NUTRIENT_KEYS) totals[key] = 0;
  const custom: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addCustom = (source: any, factor: number) => {
    if (!source) return;
    for (const [name, value] of Object.entries(source)) {
      custom[name] = (custom[name] || 0) + (Number(value) || 0) * factor;
    }
  };
  for (const row of child.foods || []) {
    if (isMealIngredient(row) && row.child_meal_id) {
      const sub = await resolveChildMealSnapshot(
        userId,
        row.child_meal_id,
        cache,
        depth + 1
      );
      if (sub) {
        const subServing = Number(sub.serving_size) || 1;
        const quantityInBaseUnit =
          row.unit === 'serving' &&
          sub.serving_unit &&
          sub.serving_unit !== 'serving'
            ? (Number(row.quantity) || 0) *
              (Number(row.child_meal_serving_size) || 1)
            : Number(row.quantity) || 0;
        const factor = subServing > 0 ? quantityInBaseUnit / subServing : 0;
        for (const key of RESOLVED_NUTRIENT_KEYS) {
          totals[key] += (Number(sub[key]) || 0) * factor;
        }
        addCustom(sub.custom_nutrients, factor);
        continue;
      }
    }

    // Fallback for foods or deleted sub-meals (where child_meal_id is null or not found)
    const serving = Number(row.serving_size) || 1;
    const quantityInBaseUnit =
      row.unit === 'serving' &&
      row.serving_unit &&
      row.serving_unit !== 'serving'
        ? (Number(row.quantity) || 0) *
          (Number(row.child_meal_serving_size) || 1)
        : Number(row.quantity) || 0;
    const per = serving > 0 ? quantityInBaseUnit / serving : 0;
    for (const key of RESOLVED_NUTRIENT_KEYS) {
      totals[key] += (Number(row[key]) || 0) * per;
    }
    addCustom(row.custom_nutrients, per);
  }
  const servingSize =
    (Number(child.serving_size) || 1) * (Number(child.total_servings) || 1);
  const snapshot: ResolvedChildSnapshot = {
    ...totals,
    custom_nutrients: custom,
    serving_size: servingSize,
    serving_unit: child.serving_unit || 'serving',
    name: child.name,
  };
  cache.set(childMealId, snapshot);
  return snapshot;
}

// Fills each linked-meal row (item_type='meal') with a food-shaped nutrition
// snapshot (aggregated child totals + serving metadata) so existing per-food
// nutrition/report/UI math treats it like any other ingredient row.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attachResolvedMealNutrition(userId: string, meals: any) {
  const list = Array.isArray(meals) ? meals : meals ? [meals] : [];
  const cache = new Map<string, ResolvedChildSnapshot | null>();
  for (const meal of list) {
    for (const row of meal?.foods || []) {
      if (!isMealIngredient(row) || !row.child_meal_id) continue;
      const snap = await resolveChildMealSnapshot(
        userId,
        row.child_meal_id,
        cache,
        0
      );
      if (!snap) continue;
      for (const key of RESOLVED_NUTRIENT_KEYS) row[key] = snap[key];
      row.custom_nutrients = snap.custom_nutrients;
      row.serving_size = snap.serving_size;
      row.serving_unit = snap.serving_unit;
      if (!row.food_name) row.food_name = row.child_meal_name || snap.name;
    }
  }
  return meals;
}
// --- Meal Template Service Functions ---
async function resolveMealTypeId(userId: string, mealTypeName: string) {
  try {
    const types = (await mealTypeRepository.getAllMealTypes(
      userId
    )) as MealTypes[];
    const match = types.find(
      (t) => t.name.toLowerCase() === mealTypeName.toLowerCase()
    );
    return match ? match.id : null;
  } catch (error) {
    log('error', 'Error in resolveMealTypeId:', error);
    return null;
  }
}
async function createMeal(userId: string, mealData: CreateMealData) {
  try {
    mealData.user_id = userId;
    normalizeServingFields(mealData, { mode: 'create' });
    await validateMealIngredients(userId, mealData.foods, null);
    const newMeal = await mealRepository.createMeal(mealData);
    log(
      'info',
      `Meal ${newMeal.id} created with serving: ${newMeal.serving_size} ${newMeal.serving_unit}, total_servings: ${newMeal.total_servings}`
    );
    return newMeal;
  } catch (error) {
    log('error', `Error in mealService.createMeal for user ${userId}:`, error);
    throw error;
  }
}
async function getMeals(userId: string, filter = 'all', searchTerm = '') {
  try {
    let meals;
    if (searchTerm) {
      meals = await mealRepository.searchMeals(searchTerm, userId);
    } else {
      switch (filter) {
        case 'all':
          meals = await mealRepository.getMeals(userId, 'all'); // Get all meals (user's and public)
          break;
        case 'mine':
          meals = await mealRepository.getMeals(userId, 'mine'); // Get only user's meals
          break;
        case 'family':
          meals = await mealRepository.getFamilyMeals(userId);
          break;
        case 'public':
          meals = await mealRepository.getPublicMeals(userId);
          break;
        case 'needs-review':
          meals = await mealRepository.getMealsNeedingReview(userId);
          break;
        default:
          meals = await mealRepository.getMeals(userId, 'all');
          break;
      }
    }
    await attachResolvedMealNutrition(userId, meals);
    return meals;
  } catch (error) {
    log(
      'error',
      `Error in mealService.getMeals for user ${userId} with filter ${filter} and searchTerm ${searchTerm}:`,
      error
    );
    throw error;
  }
}
async function getRecentMeals(userId: string, limit = 3) {
  try {
    const meals = await mealRepository.getRecentMeals(userId, limit);
    await attachResolvedMealNutrition(userId, meals);
    return meals;
  } catch (error) {
    log(
      'error',
      `Error in mealService.getRecentMeals for user ${userId}:`,
      error
    );
    throw error;
  }
}
async function getTopMeals(userId: string, limit = 3) {
  try {
    const meals = await mealRepository.getTopMeals(userId, limit);
    await attachResolvedMealNutrition(userId, meals);
    return meals;
  } catch (error) {
    log('error', `Error in mealService.getTopMeals for user ${userId}:`, error);
    throw error;
  }
}
async function getMealById(userId: string, mealId: string) {
  try {
    log(
      'info',
      `Attempting to retrieve meal with ID: ${mealId} for user: ${userId}`
    );
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      log(
        'warn',
        `Meal with ID: ${mealId} not found in repository for user ${userId}.`
      );
      throw new Error('Meal not found.');
    }
    log(
      'info',
      `Meal found: ${meal.name}, User ID: ${meal.user_id}, Is Public: ${meal.is_public}`
    );
    // Authorization check: User can access their own meals or public meals
    log('info', `Access granted for meal ${mealId} to user ${userId}.`);
    await attachResolvedMealNutrition(userId, meal);
    return meal;
  } catch (error) {
    log(
      'error',
      `Error in mealService.getMealById for user ${userId}, meal ${mealId}:`,
      error
    );
    throw error;
  }
}
async function updateMeal(
  userId: string,
  mealId: string,
  updateData: UpdateMealData
) {
  try {
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // If serving_unit is being updated to 'serving' but serving_size isn't supplied,
    // normalize it to 1 based on the new unit. Otherwise normalizeServingFields only
    // sees the partial payload and can't enforce the consistency rule.
    if (
      updateData.serving_unit === 'serving' &&
      updateData.serving_size === undefined
    ) {
      updateData.serving_size = 1;
    }
    normalizeServingFields(updateData, { mode: 'update' });
    if (updateData.foods !== undefined) {
      await validateMealIngredients(userId, updateData.foods, mealId);
    }
    // Authorization check: User can only update their own meals
    const updatedMeal = await mealRepository.updateMeal(
      mealId,
      userId,
      updateData
    );
    let confirmationMessage = null;
    if (updateData.is_public) {
      const mealWithFoods = await mealRepository.getMealById(mealId, userId);
      const foodIds = mealWithFoods.foods.map(
        (f: { food_id: string }) => f.food_id
      );
      if (foodIds.length > 0) {
        log(
          'info',
          `Updating ${foodIds.length} foods to be public as part of sharing meal ${mealId}`
        );
        const updatePromises = foodIds.map((foodId: string) =>
          foodRepository.updateFood(foodId, userId, {
            shared_with_public: true,
          })
        );
        await Promise.all(updatePromises);
        // Also update custom_nutrients for each food to be shared
        const customNutrientUpdatePromises = foodIds.map(
          (foodId: string) =>
            foodRepository.updateFood(foodId, userId, { custom_nutrients: {} }) // Clear custom nutrients when sharing publicly
        );
        await Promise.all(customNutrientUpdatePromises);
        confirmationMessage = `Meal shared successfully. ${foodIds.length} associated foods have also been made public.`;
      }
    }
    // After updating the meal, re-sync any meal plan templates that use this meal
    const affectedTemplates =
      await mealPlanTemplateRepository.getMealPlanTemplatesByMealId(mealId);
    for (const template of affectedTemplates) {
      // Only re-sync active templates
      if (template.is_active) {
        log(
          'info',
          `Re-syncing meal plan template ${template.id} due to meal update.`
        );
        // Pass null for currentClientDate as this is a backend-triggered sync
        await mealPlanTemplateService.updateMealPlanTemplate(
          template.id,
          template.user_id,
          template,
          // @ts-expect-error TS(2554): Expected 3 arguments, but got 4.
          null
        );
      }
    }
    return { ...updatedMeal, confirmationMessage };
  } catch (error) {
    log(
      'error',
      `Error in mealService.updateMeal for user ${userId}, meal ${mealId}:`,
      error
    );
    throw error;
  }
}
async function deleteMeal(userId: string, mealId: string) {
  try {
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Authorization check: User can only delete their own meals
    // Check if this meal is used in any meal plans or food entries by other users
    // Assuming a getMealDeletionImpact function exists in mealRepository
    const deletionImpact = await mealRepository.getMealDeletionImpact(
      mealId,
      userId
    );
    if (deletionImpact.usedByOtherUsers) {
      // Soft delete (hide) if used by other users
      await mealRepository.updateMeal(mealId, userId, { is_public: false });
      return { message: 'Meal hidden successfully.' };
    } else if (deletionImpact.usedByCurrentUser) {
      // Force delete if used only by the current user
      await mealRepository.deleteMealPlanEntriesByMealId(mealId, userId); // Assuming this function exists
      const success = await mealRepository.deleteMeal(mealId, userId);
      if (!success) {
        throw new Error('Failed to delete meal.');
      }
      return {
        message: 'Meal and associated meal plan entries deleted permanently.',
      };
    } else {
      // Hard delete if not used by anyone
      const success = await mealRepository.deleteMeal(mealId, userId);
      if (!success) {
        throw new Error('Failed to delete meal.');
      }
      return { message: 'Meal deleted permanently.' };
    }
  } catch (error) {
    log(
      'error',
      `Error in mealService.deleteMeal for user ${userId}, meal ${mealId}:`,
      error
    );
    throw error;
  }
}
async function getMealDeletionImpact(userId: string, mealId: string) {
  try {
    const meal = await mealRepository.getMealById(mealId, userId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Authorization check: User can only get deletion impact for their own meals or public meals
    const deletionImpact = await mealRepository.getMealDeletionImpact(
      mealId,
      userId
    );
    return deletionImpact;
  } catch (error) {
    log(
      'error',
      `Error in mealService.getMealDeletionImpact for user ${userId}, meal ${mealId}:`,
      error
    );
    throw error;
  }
}
// --- Meal Plan Service Functions ---
async function createMealPlanEntry(
  userId: string,
  planData: CreateMealPlanData
) {
  try {
    planData.user_id = userId;
    const newMealPlanEntry = await mealRepository.createMealPlanEntry(planData);
    return newMealPlanEntry;
  } catch (error) {
    log(
      'error',
      `Error in mealService.createMealPlanEntry for user ${userId}:`,
      error
    );
    throw error;
  }
}
async function getMealPlanEntries(
  userId: string,
  startDate: unknown,
  endDate: unknown
) {
  try {
    const mealPlanEntries = await mealRepository.getMealPlanEntries(
      userId,
      startDate,
      endDate
    );
    return mealPlanEntries;
  } catch (error) {
    log(
      'error',
      `Error in mealService.getMealPlanEntries for user ${userId} from ${startDate} to ${endDate}:`,
      error
    );
    throw error;
  }
}
async function updateMealPlanEntry(
  userId: string,
  planId: string,
  updateData: UpdateMealPlanData
) {
  try {
    // First, verify ownership by fetching the entry by its ID for the specific user
    const mealPlanEntry = await mealRepository.getMealPlanEntryById(
      planId,
      userId
    );
    if (!mealPlanEntry) {
      throw new Error('Meal plan entry not found or not authorized.');
    }
    // If ownership is confirmed, proceed with the update
    const updatedMealPlanEntry = await mealRepository.updateMealPlanEntry(
      planId,
      userId,
      updateData
    );
    return updatedMealPlanEntry;
  } catch (error) {
    log(
      'error',
      `Error in mealService.updateMealPlanEntry for user ${userId}, plan ${planId}:`,
      error
    );
    throw error;
  }
}
async function deleteMealPlanEntry(userId: string, planId: string) {
  try {
    // First, verify ownership by fetching the entry by its ID for the specific user
    const mealPlanEntry = await mealRepository.getMealPlanEntryById(
      planId,
      userId
    );
    if (!mealPlanEntry) {
      throw new Error('Meal plan entry not found or not authorized.');
    }
    // If ownership is confirmed, proceed with the deletion
    const success = await mealRepository.deleteMealPlanEntry(planId, userId);
    if (!success) {
      throw new Error('Failed to delete meal plan entry.');
    }
    return true;
  } catch (error) {
    log(
      'error',
      `Error in mealService.deleteMealPlanEntry for user ${userId}, plan ${planId}:`,
      error
    );
    throw error;
  }
}
// --- Logging Meal Plan to Food Entries ---

async function logMealPlanEntryToDiary(
  userId: string,
  mealPlanId: string,
  targetDate: string | Date | null
) {
  try {
    const mealPlanEntry = await mealRepository.getMealPlanEntryById(
      mealPlanId,
      userId
    );
    if (!mealPlanEntry) {
      throw new Error('Meal plan entry not found or not authorized.');
    }
    let mealTypeId = mealPlanEntry.meal_type_id;
    if (!mealTypeId && mealPlanEntry.meal_type) {
      mealTypeId = await resolveMealTypeId(userId, mealPlanEntry.meal_type);
    }
    if (!mealTypeId) {
      throw new Error(
        `Invalid meal type configuration for plan entry ${mealPlanId}`
      );
    }
    const entriesToCreate = [];
    if (mealPlanEntry.meal_id) {
      // If it's a meal template, expand its foods
      const meal = await mealRepository.getMealById(
        mealPlanEntry.meal_id,
        userId
      );
      if (!meal) {
        throw new Error('Associated meal template not found.');
      }
      // Flatten the meal (including any linked sub-meals) to leaf foods so the
      // diary stores only atomic food entries.
      const leafFoods = await flattenMealFoodsForPlan(userId, meal.foods, 1.0);
      for (const leaf of leafFoods) {
        entriesToCreate.push({
          user_id: userId,
          food_id: leaf.food_id,
          meal_type_id: mealTypeId,
          quantity: leaf.quantity,
          unit: leaf.unit,
          entry_date: targetDate || mealPlanEntry.plan_date,
          variant_id: leaf.variant_id,
          meal_plan_id: mealPlanId,
        });
      }
    } else if (mealPlanEntry.food_id) {
      // If it's a direct food entry
      entriesToCreate.push({
        user_id: userId,
        food_id: mealPlanEntry.food_id,
        meal_type_id: mealTypeId,
        quantity: mealPlanEntry.quantity,
        unit: mealPlanEntry.unit,
        entry_date: targetDate || mealPlanEntry.plan_date,
        variant_id: mealPlanEntry.variant_id,
        meal_plan_id: mealPlanId,
      });
    } else {
      throw new Error('Meal plan entry is neither a meal nor a food.');
    }
    const createdFoodEntries = [];
    for (const entryData of entriesToCreate) {
      // @ts-expect-error TS(2554): Expected 2 arguments, but got 1.
      const newFoodEntry = await foodRepository.createFoodEntry(entryData);
      createdFoodEntries.push(newFoodEntry);
    }
    return createdFoodEntries;
  } catch (error) {
    log(
      'error',
      `Error in mealService.logMealPlanEntryToDiary for user ${userId}, plan ${mealPlanId}:`,
      error
    );
    throw error;
  }
}

async function logDayMealPlanToDiary(
  userId: string,
  planDate: string,
  targetDate: string
) {
  try {
    const mealPlanEntries = await mealRepository.getMealPlanEntries(
      userId,
      planDate,
      planDate
    );
    const createdFoodEntries = [];
    for (const entry of mealPlanEntries) {
      const newEntries = await logMealPlanEntryToDiary(
        userId,
        entry.id,
        targetDate
      );
      createdFoodEntries.push(...newEntries);
    }
    return createdFoodEntries;
  } catch (error) {
    log(
      'error',
      `Error in mealService.logDayMealPlanToDiary for user ${userId}, date ${planDate}:`,
      error
    );
    throw error;
  }
}
async function searchMeals(
  userId: string,
  searchTerm: unknown,
  limit: number | null = null
) {
  try {
    const meals = await mealRepository.searchMeals(searchTerm, userId, limit);
    await attachResolvedMealNutrition(userId, meals);
    return meals;
  } catch (error) {
    log(
      'error',
      `Error in mealService.searchMeals for user ${userId} with term "${searchTerm}":`,
      error
    );
    throw error;
  }
}
async function getMealsNeedingReview(authenticatedUserId: string) {
  try {
    const mealsNeedingReview =
      await mealRepository.getMealsNeedingReview(authenticatedUserId);
    return mealsNeedingReview;
  } catch (error) {
    log(
      'error',
      `Error getting meals needing review for user ${authenticatedUserId}:`,
      error
    );
    throw error;
  }
}

async function updateMealEntriesSnapshot(
  authenticatedUserId: string,
  mealId: string
) {
  try {
    // Fetch the latest meal details
    const meal = await mealRepository.getMealById(mealId, authenticatedUserId);
    if (!meal) {
      throw new Error('Meal not found.');
    }
    // Construct the new snapshot data
    const newSnapshotData = {
      // Assuming meal entries snapshot the meal name
      meal_name: meal.name,
    };
    // Update all relevant meal entries for the authenticated user
    await mealRepository.updateMealEntriesSnapshot(
      authenticatedUserId,
      mealId,
      newSnapshotData
    );
    // Clear any ignored updates for this meal for this user
    await mealRepository.clearUserIgnoredUpdate(authenticatedUserId, mealId);
    return { message: 'Meal entries updated successfully.' };
  } catch (error) {
    log(
      'error',
      `Error updating meal entries snapshot for user ${authenticatedUserId}, meal ${mealId}:`,
      error
    );
    throw error;
  }
}
async function createMealFromDiaryEntries(
  userId: string,
  date: string,
  mealType: string,
  mealName: string | null,
  description: string | null = null,
  isPublic = false
) {
  try {
    // 1. Retrieve food entries for the specified date and meal type
    const foodEntries =
      await foodEntryRepository.getFoodEntriesByDateAndMealType(
        userId,
        date,
        mealType
      );
    if (foodEntries.length === 0) {
      throw new Error(`No food entries found for ${mealType} on ${date}.`);
    }
    const mealFoods = [];
    const missingFoods = [];
    // 2. Validate existence of food_id and variant_id for each retrieved food entry
    for (const entry of foodEntries) {
      const food = await foodRepository.getFoodById(entry.food_id, userId);
      if (!food) {
        missingFoods.push(`${entry.food_name} (ID: ${entry.food_id})`);
        continue; // Skip this entry and continue to the next
      }
      // Ensure the variant exists. Food entries store variant_id which links to food_variants
      // For simplicity, we'll re-fetch the food to ensure all variant details are current
      // (though foodEntry stores a snapshot, meal creation should use current data)
      const variantExists =
        food.default_variant && food.default_variant.id === entry.variant_id;
      if (!variantExists && entry.variant_id) {
        // Only check if a variant_id was explicitly recorded
        // Attempt to find the specific variant, if not the default
        const allFoodVariants = ((await foodRepository.getFoodVariantsByFoodId(
          entry.food_id,
          userId
        )) || []) as { id: string }[];
        if (!allFoodVariants.some((v) => v.id === entry.variant_id)) {
          missingFoods.push(
            `${entry.food_name} (Variant ID: ${entry.variant_id})`
          );
          continue;
        }
      } else if (!food.default_variant && !entry.variant_id) {
        // If there's no default variant and no specific variant_id recorded, this is an issue.
        missingFoods.push(`${entry.food_name} (No variant found)`);
        continue;
      }
      // 3. Transform food entries into meal template format, carrying the
      // per-entry nutrition snapshot so adjusted values survive in the template.
      mealFoods.push({
        food_id: entry.food_id,
        variant_id: entry.variant_id || food.default_variant.id,
        quantity: entry.quantity,
        unit: entry.unit,
        serving_size: entry.serving_size,
        serving_unit: entry.serving_unit,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        saturated_fat: entry.saturated_fat,
        polyunsaturated_fat: entry.polyunsaturated_fat,
        monounsaturated_fat: entry.monounsaturated_fat,
        trans_fat: entry.trans_fat,
        cholesterol: entry.cholesterol,
        sodium: entry.sodium,
        potassium: entry.potassium,
        dietary_fiber: entry.dietary_fiber,
        sugars: entry.sugars,
        vitamin_a: entry.vitamin_a,
        vitamin_c: entry.vitamin_c,
        calcium: entry.calcium,
        iron: entry.iron,
        glycemic_index: entry.glycemic_index,
        custom_nutrients: entry.custom_nutrients || {},
      });
    }
    if (missingFoods.length > 0) {
      throw new Error(
        `Cannot create meal. The following foods or their variants are missing: ${missingFoods.join(', ')}. Please ensure they exist.`
      );
    }
    const defaultMealName = `${mealType} on ${date}`;
    const mealData = {
      user_id: userId,
      name: mealName || defaultMealName,
      description: description,
      is_public: isPublic,
      serving_size: 1.0,
      serving_unit: 'serving',
      total_servings: 1.0,
      foods: mealFoods,
    };
    // Route through the service create path so serving-model normalization and
    // future create-time defaults stay consistent with the rest of the app.
    const newMeal = await createMeal(userId, mealData);
    return newMeal;
  } catch (error) {
    log(
      'error',
      `Error in mealService.createMealFromDiaryEntries for user ${userId}:`,
      error
    );
    throw error;
  }
}
export { createMeal };
export { getMeals };
export { getRecentMeals };
export { getTopMeals };
export { getMealById };
export { updateMeal };
export { deleteMeal };
export { createMealPlanEntry };
export { getMealPlanEntries };
export { updateMealPlanEntry };
export { deleteMealPlanEntry };
export { logMealPlanEntryToDiary };
export { logDayMealPlanToDiary };
export { searchMeals };
export { getMealsNeedingReview };
export { updateMealEntriesSnapshot };
export { getMealDeletionImpact };
export { createMealFromDiaryEntries };
export default {
  createMeal,
  getMeals,
  getRecentMeals,
  getTopMeals,
  getMealById,
  updateMeal,
  deleteMeal,
  createMealPlanEntry,
  getMealPlanEntries,
  updateMealPlanEntry,
  deleteMealPlanEntry,
  logMealPlanEntryToDiary,
  logDayMealPlanToDiary,
  searchMeals,
  getMealsNeedingReview,
  updateMealEntriesSnapshot,
  getMealDeletionImpact,
  createMealFromDiaryEntries,
};
