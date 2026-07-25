import mealPlanTemplateRepository from '../models/mealPlanTemplateRepository.js';
import foodRepository from '../models/foodRepository.js';
import { log } from '../config/logging.js';
import { resolveTemplateStartDay } from '../utils/timezoneLoader.js';

export interface MealPlanAssignmentData {
  id?: string;
  day_of_week: number;
  meal_type_id?: string;
  meal_type?: string;
  item_type: 'meal' | 'food';
  meal_id?: string | null;
  food_id?: string | null;
  variant_id?: string | null;
  quantity?: number;
  unit?: string;
}

export interface MealPlanTemplateData {
  id?: string;
  user_id?: string;
  plan_name: string;
  description?: string;
  start_date?: Date | string;
  end_date?: Date | string | null;
  is_active?: boolean;
  assignments?: MealPlanAssignmentData[];
  day_presets?: MealPlanAssignmentData[];
  currentClientDate?: string;
}

async function createMealPlanTemplate(
  userId: string,
  planData: MealPlanTemplateData
) {
  log('info', 'createMealPlanTemplate service - received planData:', planData);
  try {
    const newPlan = await mealPlanTemplateRepository.createMealPlanTemplate({
      ...planData,
      user_id: userId,
    });
    log('info', 'createMealPlanTemplate service - newPlan created:', newPlan);
    if (newPlan.is_active) {
      log(
        'info',
        `createMealPlanTemplate service - New plan is active, creating food entries from template ${newPlan.id}`
      );
      const today = await resolveTemplateStartDay(
        userId,
        planData.currentClientDate
      );
      await foodRepository.createFoodEntriesFromTemplate(
        newPlan.id,
        userId,
        today
      );
    } else {
      log(
        'info',
        'createMealPlanTemplate service - New plan is not active, skipping food entry creation.'
      );
    }
    return newPlan;
  } catch (error) {
    const err = error as Error;
    log(
      'error',
      `Error creating meal plan template for user ${userId}: ${err.message}`,
      error
    );
    throw new Error('Failed to create meal plan template.', { cause: error });
  }
}

async function getMealPlanTemplates(userId: string) {
  try {
    const templates =
      await mealPlanTemplateRepository.getMealPlanTemplatesByUserId(userId);
    const templatesWithAssignments = await Promise.all(
      templates.map(async (template: MealPlanTemplateData) => {
        const assignments =
          await mealPlanTemplateRepository.getMealPlanTemplateAssignments(
            template.id!,
            userId
          );
        return { ...template, assignments };
      })
    );
    return templatesWithAssignments;
  } catch (error) {
    log(
      'error',
      `Error fetching meal plan templates for user ${userId}:`,
      error
    );
    throw new Error('Failed to fetch meal plan templates.', { cause: error });
  }
}

async function updateMealPlanTemplate(
  planId: string,
  userId: string,
  planData: MealPlanTemplateData
) {
  log(
    'info',
    `updateMealPlanTemplate service - received planData for plan ${planId}:`,
    planData
  );
  try {
    const today = await resolveTemplateStartDay(
      userId,
      planData.currentClientDate
    );
    // When a plan is updated, remove the old food entries that were created from it.
    // The new entries will be generated on-the-fly when the diary is viewed.
    log(
      'info',
      `updateMealPlanTemplate service - Deleting old food entries for template ${planId}`
    );
    await foodRepository.deleteFoodEntriesByTemplateId(planId, userId, today);
    const updatedPlan = await mealPlanTemplateRepository.updateMealPlanTemplate(
      planId,
      { ...planData, user_id: userId }
    );
    log('info', 'updateMealPlanTemplate service - updatedPlan:', updatedPlan);
    if (updatedPlan.is_active) {
      log(
        'info',
        `updateMealPlanTemplate service - Updated plan is active, creating food entries from template ${updatedPlan.id}`
      );
      await foodRepository.createFoodEntriesFromTemplate(
        updatedPlan.id,
        userId,
        today
      );
    } else {
      log(
        'info',
        'updateMealPlanTemplate service - Updated plan is not active, skipping food entry creation.'
      );
    }
    return updatedPlan;
  } catch (error) {
    const err = error as Error;
    log(
      'error',
      `Error updating meal plan template ${planId} for user ${userId}: ${err.message}`,
      error
    );
    throw new Error('Failed to update meal plan template.', { cause: error });
  }
}

async function deleteMealPlanTemplate(
  planId: string,
  userId: string,
  currentClientDate?: string
) {
  try {
    const today = await resolveTemplateStartDay(userId, currentClientDate);
    log(
      'info',
      `deleteMealPlanTemplate service - Deleting food entries for template ${planId} starting from ${today}`
    );
    await foodRepository.deleteFoodEntriesByTemplateId(planId, userId, today);
    return await mealPlanTemplateRepository.deleteMealPlanTemplate(
      planId,
      userId
    );
  } catch (error) {
    const err = error as Error;
    log(
      'error',
      `Error deleting meal plan template ${planId} for user ${userId}: ${err.message}`,
      error
    );
    throw new Error('Failed to delete meal plan template.', { cause: error });
  }
}

async function duplicateMealPlanTemplate(
  planId: string,
  userId: string,
  currentClientDate?: string
) {
  try {
    log(
      'info',
      `duplicateMealPlanTemplate service - duplicating template ${planId} for user ${userId}`
    );
    const templates = await getMealPlanTemplates(userId);
    const sourceTemplate = templates.find(
      (t: MealPlanTemplateData) => t.id === planId
    );
    if (!sourceTemplate) {
      throw new Error(`Meal plan template ${planId} not found.`);
    }

    const clonedPlanData: MealPlanTemplateData = {
      plan_name: `${sourceTemplate.plan_name} (Copy)`,
      description: sourceTemplate.description || '',
      start_date: new Date(),
      end_date: sourceTemplate.end_date || null,
      is_active: false,
      assignments: sourceTemplate.assignments || [],
      currentClientDate,
    };

    return await createMealPlanTemplate(userId, clonedPlanData);
  } catch (error) {
    const err = error as Error;
    log(
      'error',
      `Error duplicating meal plan template ${planId} for user ${userId}: ${err.message}`,
      error
    );
    throw new Error('Failed to duplicate meal plan template.', {
      cause: error,
    });
  }
}

export { createMealPlanTemplate };
export { getMealPlanTemplates };
export { updateMealPlanTemplate };
export { deleteMealPlanTemplate };
export { duplicateMealPlanTemplate };
export default {
  createMealPlanTemplate,
  getMealPlanTemplates,
  updateMealPlanTemplate,
  deleteMealPlanTemplate,
  duplicateMealPlanTemplate,
};
