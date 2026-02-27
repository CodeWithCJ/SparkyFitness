import { ActivityDetailKeyValuePair } from '@/components/ExerciseActivityDetailsEditor';
import { WorkoutPresetSet } from './workout';

export interface GroupedExerciseEntry {
  type: 'individual' | 'preset';
  id: string; // UUID for individual exercise entry or exercise preset entry
  created_at: string; // For sorting
  // Common fields for individual exercise entries
  exercise_id?: string;
  duration_minutes?: number;
  calories_burned?: number;
  entry_date?: string;
  notes?: string;
  workout_plan_assignment_id?: number;
  image_url?: string;
  created_by_user_id?: string;
  exercise_name?: string;
  calories_per_hour?: number;
  updated_by_user_id?: string;
  category?: string;
  source?: string;
  source_id?: string;
  force?: string;
  level?: string;
  mechanic?: string;
  equipment?: string[];
  primary_muscles?: string[];
  secondary_muscles?: string[];
  instructions?: string[];
  images?: string[];
  distance?: number;
  avg_heart_rate?: number;
  sets?: WorkoutPresetSet[];
  exercise_snapshot?: Exercise; // Snapshot of exercise details

  // Fields specific to preset entries
  workout_preset_id?: number;
  name?: string; // Name of the preset entry
  description?: string;
  // Array of individual exercise entries within this preset
  exercises?: ExerciseEntry[]; // This will hold the individual exercise entries
}

export interface ExerciseEntry {
  id: string;
  exercise_id: string;
  duration_minutes?: number;
  calories_burned: number;
  entry_date: string;
  notes?: string;
  sets: WorkoutPresetSet[];
  image_url?: string;
  distance?: number;
  avg_heart_rate?: number;
  exercise_snapshot: Exercise; // Renamed from 'exercises' to 'exercise_snapshot'
  activity_details?: ActivityDetailKeyValuePair[]; // New field
  exercise_preset_entry_id?: string; // New field
  created_at: string; // Add created_at for sorting
}

export interface Exercise {
  id: string;
  source?: string; // e.g., 'manual', 'wger', 'free-exercise-db'
  source_id?: string; // ID from the external source
  name: string;
  force?: string; // e.g., 'static', 'pull', 'push'
  level?: string; // e.g., 'beginner', 'intermediate', 'expert'
  mechanic?: string; // e.g., 'isolation', 'compound'
  equipment?: string[]; // Stored as JSON array of strings
  primary_muscles?: string[]; // Stored as JSON array of strings
  secondary_muscles?: string[]; // Stored as JSON array of strings
  instructions?: string[]; // Stored as JSON array of strings
  category: string; // e.g., 'strength', 'cardio'
  images?: string[]; // Stored as JSON array of URLs (local paths after download)
  calories_per_hour: number;
  description?: string;
  duration_min?: number; // Added duration_min
  user_id?: string;
  is_custom?: boolean;
  shared_with_public?: boolean;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}

export interface HistoryImportEntry {
  entry_date: string;
  id: string;
  exercise_name: string;
  preset_name?: string;
  entry_notes?: string;
  calories_burned?: number;
  distance?: number;
  avg_heart_rate?: number;
  exercise_category?: string;
  calories_per_hour?: number;
  exercise_description?: string;
  exercise_source?: string;
  exercise_force?: string;
  exercise_level?: string;
  exercise_mechanic?: string;
  exercise_equipment?: string[];
  primary_muscles?: string[];
  secondary_muscles?: string[];
  instructions?: string[];
  sets?: {
    set_number: number;
    set_type?: string;
    reps?: number;
    weight?: number;
    duration_min?: number;
    rest_time_sec?: number;
    notes?: string;
  }[];
  activity_details?: unknown[];
}

export interface ExerciseDeletionImpact {
  exerciseEntriesCount: number;
  // server returns counts; normalize to a boolean for backward compatible UI use
  isUsedByOthers: boolean;
  otherUserReferences?: number;
}

export type ExerciseOwnershipFilter =
  | 'all'
  | 'own'
  | 'family'
  | 'public'
  | 'needs-review';
