import { isDayString } from '@workspace/shared';
import weeklyGoalPlanRepository, {
  WeeklyGoalPlanOverlapError,
  type WeeklyGoalPlanInput,
} from '../models/weeklyGoalPlanRepository.js';
import { ValidationError } from '../utils/errors.js';
import { log } from '../config/logging.js';
/** The plan fields a save uses, checked; dates as 'YYYY-MM-DD'. */
function toPlanInput(planData: Record<string, unknown>): WeeklyGoalPlanInput {
  const startDate = planData.start_date;
  const endDate = planData.end_date ?? null;
  if (typeof startDate !== 'string' || !isDayString(startDate)) {
    throw new ValidationError('A start date is required.');
  }
  if (
    endDate !== null &&
    (typeof endDate !== 'string' || !isDayString(endDate))
  ) {
    throw new ValidationError('The end date is not a valid date.');
  }
  if (endDate !== null && endDate < startDate) {
    throw new ValidationError('The end date cannot be before the start date.');
  }
  return {
    ...planData,
    plan_name: String(planData.plan_name ?? ''),
    start_date: startDate,
    end_date: endDate,
    is_active: planData.is_active === true,
  };
}

async function createWeeklyGoalPlan(
  userId: string,
  planData: Record<string, unknown>
) {
  const plan = toPlanInput(planData);
  try {
    return await weeklyGoalPlanRepository.saveWeeklyGoalPlan(
      userId,
      null,
      plan
    );
  } catch (error) {
    if (error instanceof WeeklyGoalPlanOverlapError) throw error;
    log('error', `Error creating weekly goal plan for user ${userId}:`, error);
    throw new Error('Failed to create weekly goal plan.', { cause: error });
  }
}
async function getWeeklyGoalPlans(userId: string) {
  try {
    const plans =
      await weeklyGoalPlanRepository.getWeeklyGoalPlansByUserId(userId);
    return plans;
  } catch (error) {
    log('error', `Error fetching weekly goal plans for user ${userId}:`, error);
    throw new Error('Failed to fetch weekly goal plans.', { cause: error });
  }
}
async function getActiveWeeklyGoalPlan(userId: string, date: string) {
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
async function updateWeeklyGoalPlan(
  planId: string,
  userId: string,
  planData: Record<string, unknown>
) {
  const plan = toPlanInput(planData);
  try {
    return await weeklyGoalPlanRepository.saveWeeklyGoalPlan(
      userId,
      planId,
      plan
    );
  } catch (error) {
    if (error instanceof WeeklyGoalPlanOverlapError) throw error;
    log(
      'error',
      `Error updating weekly goal plan ${planId} for user ${userId}:`,
      error
    );
    throw new Error('Failed to update weekly goal plan.', { cause: error });
  }
}
async function deleteWeeklyGoalPlan(planId: string, userId: string) {
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
