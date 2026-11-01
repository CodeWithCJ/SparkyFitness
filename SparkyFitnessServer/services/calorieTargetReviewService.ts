import {
  getClinicalCalorieMinimum,
  isAdaptiveTdeeMature,
  reviewCalorieTarget,
  todayInZone,
} from '@workspace/shared';
import type { CalorieTargetReview } from '@workspace/shared';
import userRepository from '../models/userRepository.js';
import adaptiveTdeeService from './AdaptiveTdeeService.js';
import goalService from './goalService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

/**
 * Checks the saved calorie goal against what the body did, for the AI
 * assistant. The maintenance estimate is the app's adaptive TDEE (the same
 * number the Goals screen shows), the target is the saved goal, and the
 * arithmetic is the shared `reviewCalorieTarget`, so the assistant only
 * explains it. Read-only: changing the goal is `sparky_manage_goals`.
 *
 * @param desiredKgPerWeek - Weekly change the person wants, negative for loss.
 */
async function getCalorieTargetReview(
  userId: string,
  desiredKgPerWeek?: number | null
): Promise<CalorieTargetReview> {
  const timezone = await loadUserTimezone(userId);
  const today = todayInZone(timezone);
  const [tdee, goals, profile] = await Promise.all([
    adaptiveTdeeService.calculateAdaptiveTdee(userId, today),
    goalService.getUserGoals(userId, today) as Promise<Record<string, unknown>>,
    userRepository.getUserProfile(userId),
  ]);
  const target = Number(goals?.calories);
  const gender =
    profile?.gender?.toLowerCase() === 'female' ? 'female' : 'male';
  return reviewCalorieTarget({
    maintenanceKcal: tdee.tdee,
    // A clamped estimate was pulled to a plausible range, so it is not the
    // maintenance the weight trend implies and cannot judge a followed target.
    maintenanceReliable:
      isAdaptiveTdeeMature(tdee.tdee, tdee.isFallback, tdee.daysOfData) &&
      !tdee.wasClamped,
    daysLogged: tdee.daysOfData,
    windowDays: tdee.daysInWindow ?? 28,
    averageIntakeKcal: tdee.avgIntake ?? null,
    dailyWeightChangeKg: tdee.dailyWeightChangeKg ?? null,
    currentTargetKcal: Number.isFinite(target) && target > 0 ? target : null,
    desiredKgPerWeek,
    floorKcal: getClinicalCalorieMinimum(gender),
  });
}

export { getCalorieTargetReview };
export default { getCalorieTargetReview };
