// Tool response types
export interface ToolResponse {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

// Pagination
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  has_more: boolean;
  next_offset: number | null;
  total_count: number;
}

// Exercise domain
export interface Exercise {
  id: string;
  name: string;
  category?: string;
  muscle_groups?: string[];
  equipment?: string[];
  level?: string;
  calories_per_hour?: number;
  description?: string;
  is_custom?: boolean;
}

export interface ExerciseSet {
  reps?: number;
  weight?: number;
  duration?: number;
  rest_time?: number;
  set_type: "Working Set" | "Warmup" | "Drop Set" | "Failure";
}

export interface ExerciseEntry {
  id: string;
  user_id: string;
  exercise_id: string;
  exercise_name: string;
  entry_date: string;
  sets: ExerciseSet[];
  duration_minutes?: number;
  calories_burned?: number;
  notes?: string;
  created_at: string;
}

// Food domain
export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  variants: FoodVariant[];
}

export interface FoodVariant {
  id: string;
  food_id: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  glycemic_index?: string;
}

export interface FoodEntry {
  id: string;
  user_id: string;
  food_id: string;
  variant_id?: string;
  food_name: string;
  quantity: number;
  unit: string;
  meal_type: string;
  entry_date: string;
  nutritional_values?: Partial<FoodVariant>;
}

export interface MealTemplate {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  foods: Array<{
    food_id: string;
    food_name: string;
    variant_id?: string;
    quantity: number;
    unit: string;
  }>;
}

// Check-in domain
export interface BiometricEntry {
  id: string;
  user_id: string;
  entry_date: string;
  weight?: number;
  weight_unit?: string;
  steps?: number;
  height?: number;
  height_unit?: string;
  neck?: number;
  waist?: number;
  hips?: number;
  measurements_unit?: string;
  body_fat?: number;
}

export interface CustomCategory {
  id: string;
  user_id: string;
  category_name: string;
  unit?: string;
}

export interface MoodEntry {
  id: string;
  user_id: string;
  entry_date: string;
  mood_value: number;
  notes?: string;
}

export interface FastingEntry {
  id: string;
  user_id: string;
  start_time: string;
  end_time?: string;
  fasting_status?: string;
  fasting_type?: string;
}

export interface SleepEntry {
  id: string;
  user_id: string;
  entry_date: string;
  duration_seconds?: number;
  sleep_score?: number;
  bedtime?: string;
  wake_time?: string;
  source?: string;
}

// Workout preset
export interface WorkoutPreset {
  id: string;
  user_id: string;
  name: string;
  exercises: Array<{
    exercise_id: string;
    exercise_name: string;
    sets: ExerciseSet[];
  }>;
}
