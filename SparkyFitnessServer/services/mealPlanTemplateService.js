const mealPlanTemplateRepository = require('../models/mealPlanTemplateRepository');
const mealRepository = require('../models/mealRepository');
const foodRepository = require('../models/foodRepository');
const { log } = require('../config/logging');

async function createMealPlanTemplate(userId, planData, currentClientDate = null) {
    log('info', `createMealPlanTemplate service - received planData:`, planData);
    try {
        if (planData.is_active) {
            log('info', `createMealPlanTemplate service - Deactivating all other meal plan templates for user ${userId}`);
            await mealPlanTemplateRepository.deactivateAllMealPlanTemplates(userId);
        }
        const newPlan = await mealPlanTemplateRepository.createMealPlanTemplate({ ...planData, user_id: userId });
        log('info', 'createMealPlanTemplate service - newPlan created:', newPlan);
        if (newPlan.is_active) {
            log('info', `createMealPlanTemplate service - New plan is active, creating food entries from template ${newPlan.id}`);
            await foodRepository.createFoodEntriesFromTemplate(newPlan.id, userId, planData.currentClientDate || currentClientDate);
        } else {
            log('info', `createMealPlanTemplate service - New plan is not active, skipping food entry creation.`);
        }
        return newPlan;
    } catch (error) {
        log('error', `Error creating meal plan template for user ${userId}: ${error.message}`, error);
        throw new Error('Failed to create meal plan template.');
    }
}

async function getMealPlanTemplates(userId) {
    try {
        const templates = await mealPlanTemplateRepository.getMealPlanTemplatesByUserId(userId);
        const templatesWithAssignments = await Promise.all(templates.map(async (template) => {
            const assignments = await mealPlanTemplateRepository.getMealPlanTemplateAssignments(template.id, userId);
            return { ...template, assignments };
        }));
        return templatesWithAssignments;
    } catch (error) {
        log('error', `Error fetching meal plan templates for user ${userId}:`, error);
        throw new Error('Failed to fetch meal plan templates.');
    }
}

async function updateMealPlanTemplate(planId, userId, planData, currentClientDate = null) {
    log('info', `updateMealPlanTemplate service - received planData for plan ${planId}:`, planData);
    try {
        // When a plan is updated, remove the old food entries that were created from it.
        // The new entries will be generated on-the-fly when the diary is viewed.
        log('info', `updateMealPlanTemplate service - Deleting old food entries for template ${planId}`);
        await foodRepository.deleteFoodEntriesByTemplateId(planId, userId, currentClientDate);

        if (planData.is_active) {
            log('info', `updateMealPlanTemplate service - Deactivating all other meal plan templates for user ${userId}`);
            await mealPlanTemplateRepository.deactivateAllMealPlanTemplates(userId);
        }
        const updatedPlan = await mealPlanTemplateRepository.updateMealPlanTemplate(planId, { ...planData, user_id: userId });
        log('info', 'updateMealPlanTemplate service - updatedPlan:', updatedPlan);
        

        if (updatedPlan.is_active) {
            log('info', `updateMealPlanTemplate service - Updated plan is active, creating food entries from template ${updatedPlan.id}`);
            await foodRepository.createFoodEntriesFromTemplate(updatedPlan.id, userId, planData.currentClientDate || currentClientDate);
        } else {
            log('info', `updateMealPlanTemplate service - Updated plan is not active, skipping food entry creation.`);
        }
        
        return updatedPlan;
    } catch (error) {
        log('error', `Error updating meal plan template ${planId} for user ${userId}: ${error.message}`, error);
        throw new Error('Failed to update meal plan template.');
    }
}

async function deleteMealPlanTemplate(planId, userId) {
    try {
        return await mealPlanTemplateRepository.deleteMealPlanTemplate(planId, userId);
    } catch (error) {
        log('error', `Error deleting meal plan template ${planId} for user ${userId}: ${error.message}`, error);
        throw new Error('Failed to delete meal plan template.');
    }
}

module.exports = {
    createMealPlanTemplate,
    getMealPlanTemplates,
    updateMealPlanTemplate,
    deleteMealPlanTemplate,
};