import { registerFoodCreateHandlers } from './foodCreate';
import { registerFoodEntryDeleteHandlers } from './foodEntryDelete';
import { registerFoodEntryUpdateHandlers } from './foodEntryUpdate';
import { registerFoodEntryHandlers } from './foodEntry';
import { registerFoodEntryMealDeleteHandlers } from './foodEntryMealDelete';
import { registerFoodEntryMealUpdateHandlers } from './foodEntryMealUpdate';
import { registerFoodEntryMealHandlers } from './foodEntryMeal';
import { registerFollowUpHandlers } from './followUps';
import { registerWaterIntakeHandlers } from './waterIntake';
import { registerWorkoutSessionHandlers } from './workoutSession';

let registered = false;

/**
 * Makes every kind of queued offline work sendable. Safe to call more than
 * once. Called wherever uploads can start: the app root and the background
 * task, which can run without the app's screens ever mounting.
 */
export function registerAllOutboxHandlers(): void {
  if (registered) return;
  registered = true;
  registerWorkoutSessionHandlers();
  registerFollowUpHandlers();
  registerWaterIntakeHandlers();
  registerFoodEntryHandlers();
  registerFoodCreateHandlers();
  registerFoodEntryMealHandlers();
  registerFoodEntryDeleteHandlers();
  registerFoodEntryMealDeleteHandlers();
  registerFoodEntryMealUpdateHandlers();
  registerFoodEntryUpdateHandlers();
}
