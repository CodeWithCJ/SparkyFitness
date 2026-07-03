import { WorkoutPresetSet } from './workout';

export interface ExerciseEntry {
  id: string;
  exercise_id: string;
  duration_minutes: number;
  calories_burned: number;
  entry_date: string;
  notes?: string;
  sets?: WorkoutPresetSet[]; // Add sets property
  image_url?: string;
  exercises: {
    id: string;
    name: string;
    user_id?: string;
    category: string;
    calories_per_hour: number;
  } | null;
}

export interface DayData {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
}

export interface MealTypeDefinition {
  id: string;
  name: string;
  sort_order: number;
  user_id: string | null;
  is_visible?: boolean;
  show_in_quick_log?: boolean;
}

export interface FoodEntryUpdateData {
  quantity?: number;
  unit?: string;
  variant_id?: string | null;
  meal_type_id?: string;
}
