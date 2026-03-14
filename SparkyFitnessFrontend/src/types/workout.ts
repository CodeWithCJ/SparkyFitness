import { Exercise } from './exercises';
import {
  WorkoutPresetsResponse,
  WorkoutPlanTemplatesResponse,
  WorkoutPlanTemplateAssignmentsResponse,
} from '@workspace/shared';

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
  set_type:
    | 'Working Set'
    | 'Warm-up'
    | 'Drop Set'
    | 'Failure'
    | 'AMRAP'
    | 'Back-off'
    | 'Rest-Pause'
    | 'Cluster'
    | 'Technique';
  reps?: number;
  weight?: number;
  duration?: number; // in minutes
  rest_time?: number; // in seconds
  notes?: string;
  rpe?: number;
}

export interface WorkoutPresetExercise {
  id?: string;
  exercise_id: string;
  image_url?: string;
  exercise_name: string; // Populated from backend join
  exercise: Exercise; // Full exercise object
  sets: WorkoutPresetSet[];
}

export type WorkoutPreset = Omit<
  WorkoutPresetsResponse,
  'id' | 'user_id' | 'exercises'
> & {
  id: number | string;
  user_id: string;
  exercises: WorkoutPresetExercise[];
};

export interface PaginatedWorkoutPresets {
  presets: WorkoutPreset[];
  total: number;
  page: number;
  limit: number;
}

export type WorkoutPlanAssignment = Omit<
  WorkoutPlanTemplateAssignmentsResponse,
  | 'id'
  | 'template_id'
  | 'workout_preset_id'
  | 'exercise_id'
  | 'sets'
  | 'workout_preset'
  | 'exercise'
  | 'created_at'
  | 'updated_at'
  | 'sort_order'
> & {
  id?: string;
  template_id: string;
  workout_preset_id?: string;
  workout_preset_name?: string; // Populated from backend join
  exercise_id?: string;
  exercise_name?: string; // Populated from backend join
  sets: WorkoutPresetSet[];
  created_at?: string | null;
  updated_at?: string | null;
  sort_order?: number | null;
};

export type WorkoutPlanTemplate = Omit<
  WorkoutPlanTemplatesResponse,
  'id' | 'user_id' | 'assignments' | 'created_at' | 'updated_at'
> & {
  id: string;
  user_id: string;
  assignments?: WorkoutPlanAssignment[];
  created_at?: string | null;
  updated_at?: string | null;
};

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
