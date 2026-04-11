import weeklyGoalPlanRepository from '../models/weeklyGoalPlanRepository.js';
import { log } from '../config/logging.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createWeeklyGoalPlan(userId: any, planData: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWeeklyGoalPlans(userId: any) {
  try {
    const plans =
      await weeklyGoalPlanRepository.getWeeklyGoalPlansByUserId(userId);
    return plans;
  } catch (error) {
    log('error', `Error fetching weekly goal plans for user ${userId}:`, error);
    throw new Error('Failed to fetch weekly goal plans.', { cause: error });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getActiveWeeklyGoalPlan(userId: any, date: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateWeeklyGoalPlan(planId: any, userId: any, planData: any) {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteWeeklyGoalPlan(planId: any, userId: any) {
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
export { createWeeklyGoalPlan };
export { getWeeklyGoalPlans };
export { getActiveWeeklyGoalPlan };
export { updateWeeklyGoalPlan };
export { deleteWeeklyGoalPlan };
export default {
  createWeeklyGoalPlan,
  getWeeklyGoalPlans,
  getActiveWeeklyGoalPlan,
  updateWeeklyGoalPlan,
  deleteWeeklyGoalPlan,
};
