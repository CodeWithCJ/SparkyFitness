import type {
  ExerciseSessionResponse,
  CalorieBalance,
  SupplementTotals,
} from '@workspace/shared';
import type { FoodEntry } from './foodEntries';
import type { DailyGoals } from './goals';

export interface MacroSummary {
  consumed: number;
  goal: number;
}

export interface DailySummary {
  date: string;
  calorieGoal: number;
  caloriesConsumed: number;
  caloriesBurned: number;
  activeCalories: number;        // From "Active Calories" exercises (watch/tracker)
  otherExerciseCalories: number; // From all other exercises
  netCalories: number;           // consumed - burned
  remainingCalories: number;     // goal - net
  protein: MacroSummary;
  carbs: MacroSummary;
  fat: MacroSummary;
  fiber: MacroSummary;
  stepCalories: number;        // Server-computed step calories using stride formula
  exerciseMinutes: number;
  exerciseMinutesGoal: number;
  exerciseCaloriesGoal: number;
  waterConsumed: number;
  waterGoal: number;
  foodEntries: FoodEntry[];
  /**
   * The day's supplement contribution, already folded into the macro and calorie figures
   * above. Kept separately because "was any of this from a supplement" is a question the
   * surfaces that gate on foodEntries have to be able to ask: a supplement-only day has
   * nutrition and no food rows.
   */
  supplementTotals: SupplementTotals;
  exerciseEntries: ExerciseSessionResponse[];
  calorieBalance: CalorieBalance;
  goals: DailyGoals;
  /** Pre-aggregated custom nutrient totals for the day (name → consumed value). */
  customNutrientTotals: Record<string, number>;
  /** Per-custom-nutrient goals (name → goal value); empty when none are set. */
  customNutrientGoals: Record<string, number>;
}
