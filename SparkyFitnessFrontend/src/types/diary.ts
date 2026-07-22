import { WorkoutPresetSet } from './workout';

export interface ExerciseEntry {
  id: string;
  exercise_id: string;
  duration_minutes: number;
  calories_burned: number;
  entry_date: string;
  entry_time?: string | null;
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
  default_time?: string | null;
}

export interface FoodEntryUpdateData {
  quantity?: number;
  unit?: string;
  variant_id?: string | null;
  meal_type_id?: string;
  entry_time?: string | null;
}

export interface FoodDiaryImportRow {
  date: string;
  meal_type: string;
  meal_name?: string;
  food_name?: string;
  brand?: string;
  quantity: string;
  unit: string;
  // Assembled client-side from the CSV's extra (non-standard) columns, keyed
  // by custom-nutrient name.
  custom_nutrients?: Record<string, number>;
  [key: string]: string | Record<string, number> | undefined;
}

export interface FoodDiaryImportScope {
  family?: boolean;
  public?: boolean;
}

export interface FoodDiaryImportResult {
  message: string;
  processed: unknown[];
  errors: { error: string; entry: unknown }[];
  skipped: unknown[];
}
