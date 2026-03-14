import { ActivityDetailKeyValuePair } from '@/components/ExerciseActivityDetailsEditor';
import { ExercisesResponse, ExerciseEntriesResponse } from '@workspace/shared';
import { WorkoutPresetSet } from './workout';

/**
 * Frontend representation of an Exercise - extends the API response schema
 * but overrides JSON-serialized fields (equipment, muscles, etc.) with
 * their parsed array equivalents after `parseJsonArray` processing.
 */
export type Exercise = Omit<
  ExercisesResponse,
  | 'id'
  | 'equipment'
  | 'primary_muscles'
  | 'secondary_muscles'
  | 'instructions'
  | 'images'
  | 'created_at'
  | 'updated_at'
  | 'description'
> & {
  id: string;
  equipment?: string[];
  primary_muscles?: string[];
  secondary_muscles?: string[];
  instructions?: string[];
  images?: string[];
  created_at?: string;
  updated_at?: string;
  description?: string | null;
  // Frontend-only fields
  duration_min?: number;
  tags?: string[];
};

/**
 * Frontend representation of an ExerciseEntry - derives from the API schema
 * but uses the parsed Exercise snapshot and WorkoutPresetSet[] for sets.
 */
export type ExerciseEntry = Omit<
  ExerciseEntriesResponse,
  | 'id'
  | 'entry_date'
  | 'created_at'
  | 'updated_at'
  | 'sets'
  | 'activity_details'
  | 'workout_plan_assignment_id'
  | 'created_by_user_id'
  | 'updated_by_user_id'
  | 'exercise_id'
  | 'exercise_preset_entry_id'
  | 'user_id'
> & {
  id: string;
  exercise_id: string;
  entry_date: string;
  created_at: string;
  updated_at?: string;
  exercise_preset_entry_id?: string;
  sets: WorkoutPresetSet[];
  exercise_snapshot: Exercise;
  activity_details?: ActivityDetailKeyValuePair[];
};

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
  activity_details?: ActivityDetailKeyValuePair[];
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

export interface LapDTO {
  distance: number;
  duration: number;
  movingDuration: number;
  averageMovingSpeed: number;
}
