import { ExerciseEntry } from './exercise';
import type { FoodEntry } from './foodEntries';

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
  exerciseMinutes: number;
  exerciseMinutesGoal: number;
  exerciseCaloriesGoal: number;
  waterConsumed: number;
  waterGoal: number;
  foodEntries: FoodEntry[];
  exerciseEntries: ExerciseEntry[];
}
