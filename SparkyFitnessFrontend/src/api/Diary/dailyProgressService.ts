import type { FoodEntry } from '@/types/food';
import type { GroupedExerciseEntry } from '../Exercises/exerciseEntryService';
import type { WorkoutPresetSet } from '@/types/workout';
import { loadGoals } from '@/api/Goals/goals';
import { loadFoodEntries } from '@/api/Diary/foodEntryService';
import { loadExistingCheckInMeasurements } from '@/api/CheckIn/checkInService';

export { getExerciseEntriesForDate } from '../Exercises/exerciseEntryService';

export interface Goals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_goal_ml: number;
  target_exercise_calories_burned?: number;
}

export interface ExerciseEntry {
  id: string;
  exercise_id: string;
  duration_minutes: number;
  calories_burned: number;
  entry_date: string;
  notes?: string;
  sets?: WorkoutPresetSet[];
  exercises: {
    id: string;
    name: string;
    user_id?: string;
    category: string;
    calories_per_hour: number;
  } | null;
}

export interface CheckInMeasurement {
  entry_date: string;
  weight?: number;
  neck?: number;
  waist?: number;
  hips?: number;
  steps?: number;
  height?: number;
  body_fat_percentage?: number;
}

export const getGoalsForDate = async (date: string): Promise<Goals> => {
  return loadGoals(date);
};

export const getFoodEntriesForDate = async (
  date: string
): Promise<FoodEntry[]> => {
  const data = await loadFoodEntries(date);
  return data || [];
};

export const getCheckInMeasurementsForDate = async (
  date: string
): Promise<CheckInMeasurement | null> => {
  try {
    const measurement = await loadExistingCheckInMeasurements(date);
    return measurement || null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.message.includes('404')) {
      return null;
    }
    throw error;
  }
};

// Re-export GroupedExerciseEntry so existing consumers don't break
export type { GroupedExerciseEntry };
