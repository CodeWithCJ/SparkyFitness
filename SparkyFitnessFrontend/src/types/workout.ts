export interface PresetExercise {
  id: string;
  exercise_id: string;
  sets: number;
  reps: number;
  weight: number;
  image_url?: string;
  exercise_name: string;
}

export interface WorkoutPresetSet {
  id?: string;
  set_number: number;
  set_type: 'Working Set' | 'Warm-up' | 'Drop Set' | 'Failure' | 'AMRAP' | 'Back-off' | 'Rest-Pause' | 'Cluster' | 'Technique';
  reps?: number;
  weight?: number;
  duration?: number; // in minutes
  rest_time?: number; // in seconds
  notes?: string;
}

export interface ExerciseInPreset {
  id?: string;
  exercise_id: string;
  image_url?: string;
  exercise_name: string; // Populated from backend join
}

export interface WorkoutPresetExercise extends ExerciseInPreset {
  exercise: any; // Full exercise object
  sets: WorkoutPresetSet[];
}

export interface WorkoutPreset {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
  exercises: WorkoutPresetExercise[];
}

export interface PaginatedWorkoutPresets {
  presets: WorkoutPreset[];
  total: number;
  page: number;
  limit: number;
}

export interface WorkoutPlanAssignment {
  id?: string;
  template_id: string;
  day_of_week: number;
  workout_preset_id?: string;
  workout_preset_name?: string; // Populated from backend join
  exercise_id?: string;
  exercise_name?: string; // Populated from backend join
  sets: WorkoutPresetSet[];
  created_at?: string;
  updated_at?: string;
}

export interface WorkoutPlanTemplate {
  id: string;
  user_id: string;
  plan_name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  assignments?: WorkoutPlanAssignment[];
}