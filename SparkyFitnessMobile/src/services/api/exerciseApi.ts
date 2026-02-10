import { apiFetch } from './apiClient';
import type { ExerciseEntry } from '../../types/exercise';

/**
 * Fetches exercise entries for a given date.
 */
export const fetchExerciseEntries = async (date: string): Promise<ExerciseEntry[]> => {
  return apiFetch<ExerciseEntry[]>({
    endpoint: `/api/exercise-entries/by-date?selectedDate=${date}`,
    serviceName: 'Exercise API',
    operation: 'fetch exercise entries',
  });
};

/**
 * Calculates total calories burned from exercise entries.
 */
export const calculateCaloriesBurned = (entries: ExerciseEntry[]): number => {
  return entries.reduce((total, entry) => total + (entry.calories_burned || 0), 0);
};

/**
 * Calculates calories from "Active Calories" exercises (e.g., from watch/fitness tracker).
 */
export const calculateActiveCalories = (entries: ExerciseEntry[]): number => {
  return entries
    .filter(entry => entry.exercise_snapshot?.name === 'Active Calories')
    .reduce((total, entry) => total + (entry.calories_burned || 0), 0);
};

/**
 * Calculates calories from non-"Active Calories" exercises.
 */
export const calculateOtherExerciseCalories = (entries: ExerciseEntry[]): number => {
  return entries
    .filter(entry => entry.exercise_snapshot?.name !== 'Active Calories')
    .reduce((total, entry) => total + (entry.calories_burned || 0), 0);
};

/**
 * Calculates total exercise duration in minutes, excluding "Active Calories" entries.
 */
export const calculateExerciseDuration = (entries: ExerciseEntry[]): number => {
  return entries
    .filter(entry => entry.exercise_snapshot?.name !== 'Active Calories')
    .reduce((total, entry) => total + (entry.duration_minutes ?? 0), 0);
};
