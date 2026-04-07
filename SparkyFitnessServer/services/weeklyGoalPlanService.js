const weeklyGoalPlanRepository = require('../models/weeklyGoalPlanRepository');
const { log } = require('../config/logging');

async function createWeeklyGoalPlan(userId, planData) {
  try {
    // Deactivate all other active plans for this user if the new plan is active
    if (planData.is_active) {
      await weeklyGoalPlanRepository.deactivateAllWeeklyGoalPlans(userId);
    }
    const newPlan = await weeklyGoalPlanRepository.createWeeklyGoalPlan({
      ...planData,
      user_id: userId,
    });
    return newPlan;
  } catch (error) {
    log('error', `Error creating weekly goal plan for user ${userId}:`, error);
    throw new Error('Failed to create weekly goal plan.', { cause: error });
  }
}

async function getWeeklyGoalPlans(userId) {
  try {
    const plans =
      await weeklyGoalPlanRepository.getWeeklyGoalPlansByUserId(userId);
    return plans;
  } catch (error) {
    log('error', `Error fetching weekly goal plans for user ${userId}:`, error);
    throw new Error('Failed to fetch weekly goal plans.', { cause: error });
  }
}

async function getActiveWeeklyGoalPlan(userId, date) {
  try {
    const plan = await weeklyGoalPlanRepository.getActiveWeeklyGoalPlan(
      userId,
      date
    );
    return plan;
  } catch (error) {
    log(
      'error',
      `Error fetching active weekly goal plan for user ${userId} on date ${date}:`,
      error
    );
    throw new Error('Failed to fetch active weekly goal plan.', {
      cause: error,
    });
  }
}

async function updateWeeklyGoalPlan(planId, userId, planData) {
  try {
    // Deactivate all other active plans for this user if this plan is being set to active
    if (planData.is_active) {
      await weeklyGoalPlanRepository.deactivateAllWeeklyGoalPlans(userId);
    }
    const updatedPlan = await weeklyGoalPlanRepository.updateWeeklyGoalPlan(
      planId,
      { ...planData, user_id: userId }
    );
    return updatedPlan;
  } catch (error) {
    log(
      'error',
      `Error updating weekly goal plan ${planId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to update weekly goal plan.', { cause: error });
  }
}

async function deleteWeeklyGoalPlan(planId, userId) {
  try {
    const deletedPlan = await weeklyGoalPlanRepository.deleteWeeklyGoalPlan(
      planId,
      userId
    );
    return deletedPlan;
  } catch (error) {
    log(
      'error',
      `Error deleting weekly goal plan ${planId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to delete weekly goal plan.', { cause: error });
  }
}

module.exports = {
  createWeeklyGoalPlan,
  getWeeklyGoalPlans,
  getActiveWeeklyGoalPlan,
  updateWeeklyGoalPlan,
  deleteWeeklyGoalPlan,
};
