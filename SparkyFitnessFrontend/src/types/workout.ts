import { ExerciseEntrySetRequest } from '@workspace/shared';
import { Exercise } from './exercises';

export type WorkoutPresetSet = ExerciseEntrySetRequest;
export interface PresetExercise {
  id: string;
  exercise_id: string;
  sets: number;
  reps: number;
  weight: number;
  image_url?: string;
  exercise_name: string;
}

export interface WorkoutPresetExercise {
  id?: string;
  exercise_id: string;
  image_url?: string;
  exercise_name: string; // Populated from backend join
  exercise: Exercise; // Full exercise object
  sets: WorkoutPresetSet[];
}

export interface WorkoutPreset {
  id: number | string;
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
  end_date?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  assignments?: WorkoutPlanAssignment[];
}

// New interface for exercises coming from presets, where sets, reps, and weight are guaranteed
export interface ExerciseToLog extends Exercise {
  // Export the interface
  sets?: WorkoutPresetSet[];
  reps?: number;
  weight?: number;
  duration?: number; // Duration in minutes (optional) - Changed from duration_minutes
  notes?: string;
  image_url?: string;
  exercise_name?: string; // Added to match PresetExercise
  distance?: number; // New field
  avg_heart_rate?: number; // New field
}
