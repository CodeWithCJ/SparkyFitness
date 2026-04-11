import mealPlanTemplateRepository from '../models/mealPlanTemplateRepository.js';
import foodRepository from '../models/foodRepository.js';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { todayInZone } from '@workspace/shared';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveToday(userId: any, clientDate: any) {
  if (clientDate) return clientDate;
  const tz = await loadUserTimezone(userId);
  return todayInZone(tz);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createMealPlanTemplate(userId: any, planData: any) {
  log('info', 'createMealPlanTemplate service - received planData:', planData);
  try {
    if (planData.is_active) {
      log(
        'info',
        `createMealPlanTemplate service - Deactivating all other meal plan templates for user ${userId}`
      );
      await mealPlanTemplateRepository.deactivateAllMealPlanTemplates(userId);
    }
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
      const today = await resolveToday(userId, planData.currentClientDate);
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
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error creating meal plan template for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to create meal plan template.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealPlanTemplates(userId: any) {
  try {
    const templates =
      await mealPlanTemplateRepository.getMealPlanTemplatesByUserId(userId);
    const templatesWithAssignments = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      templates.map(async (template: any) => {
        const assignments =
          await mealPlanTemplateRepository.getMealPlanTemplateAssignments(
            template.id,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateMealPlanTemplate(planId: any, userId: any, planData: any) {
  log(
    'info',
    `updateMealPlanTemplate service - received planData for plan ${planId}:`,
    planData
  );
  try {
    const today = await resolveToday(userId, planData.currentClientDate);
    // When a plan is updated, remove the old food entries that were created from it.
    // The new entries will be generated on-the-fly when the diary is viewed.
    log(
      'info',
      `updateMealPlanTemplate service - Deleting old food entries for template ${planId}`
    );
    await foodRepository.deleteFoodEntriesByTemplateId(planId, userId, today);
    if (planData.is_active) {
      log(
        'info',
        `updateMealPlanTemplate service - Deactivating all other meal plan templates for user ${userId}`
      );
      await mealPlanTemplateRepository.deactivateAllMealPlanTemplates(userId);
    }
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
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error updating meal plan template ${planId} for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to update meal plan template.', { cause: error });
  }
}

async function deleteMealPlanTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  planId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentClientDate: any
) {
  try {
    const today = await resolveToday(userId, currentClientDate);
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
    log(
      'error',
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      `Error deleting meal plan template ${planId} for user ${userId}: ${error.message}`,
      error
    );
    throw new Error('Failed to delete meal plan template.', { cause: error });
  }
}
export { createMealPlanTemplate };
export { getMealPlanTemplates };
export { updateMealPlanTemplate };
export { deleteMealPlanTemplate };
export default {
  createMealPlanTemplate,
  getMealPlanTemplates,
  updateMealPlanTemplate,
  deleteMealPlanTemplate,
};
