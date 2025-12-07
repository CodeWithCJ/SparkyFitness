import { apiCall } from './api';

export interface Goals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water_goal_ml: number;
}

import { FoodEntry } from '@/types/food'; // Import FoodEntry from the central types file
import { GroupedExerciseEntry } from './exerciseEntryService'; // Import GroupedExerciseEntry

export interface ExerciseEntry {
  id: string;
  exercise_id: string;
  duration_minutes: number;
  calories_burned: number;
  entry_date: string;
  notes?: string;
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
  const params = new URLSearchParams({ date });
  const data = await apiCall(`/goals/for-date?${params.toString()}`, {
    method: 'GET',
    suppress404Toast: true, // Suppress toast for 404
  });
  // Ensure a default Goals object is returned if no data is found
  return data || {
    calories: 2000,
    protein: 150,
    carbs: 250,
    fat: 67,
    water_goal_ml: 1920, // Default to 8 glasses * 240ml
  };
};

export const getFoodEntriesForDate = async (date: string): Promise<FoodEntry[]> => {
  const data = await apiCall(`/food-entries/by-date/${date}`, {
    method: 'GET',
    suppress404Toast: true, // Suppress toast for 404
  });
  return data || []; // Return empty array if 404 (no food entries found)
};

export const getExerciseEntriesForDate = async (date: string): Promise<GroupedExerciseEntry[]> => {
  const params = new URLSearchParams({ selectedDate: date });
  const data = await apiCall(`/exercise-entries/by-date?${params.toString()}`, {
    method: 'GET',
    suppress404Toast: true, // Suppress toast for 404
  });
  return data || []; // Return empty array if 404 (no exercise entries found)
};

export const getCheckInMeasurementsForDate = async (date: string): Promise<CheckInMeasurement | null> => {
  try {
    // For daily metrics like steps we must fetch the measurement for the exact date only.
    // Use the exact-date endpoint so older measurements (e.g. previous-days' steps) are not reused.
    const measurement = await apiCall(`/measurements/check-in/${encodeURIComponent(date)}`, {
      method: 'GET',
      suppress404Toast: true,
    });
    return measurement || null; // Normalize to null when not found
  } catch (error: any) { // Explicitly type error as any
    // If it's a 404 and we suppressed the toast, it means no measurement was found.
    // Return null as expected by the component.
    if (error.message.includes('404')) {
      return null;
    }
    // For other errors, we re-throw them to be handled by the calling component.
    throw error;
  }
};