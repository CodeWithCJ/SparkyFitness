import type { WorkoutPresetSet } from './workoutPresets';

export type WorkoutPlanScheduleType = 'weekly' | 'sequential';

export interface WorkoutPlanAssignment {
  id: string;
  template_id: string;
  day_of_week: number | null;
  session_index?: number | null;
  session_name?: string | null;
  sort_order: number | null;
  workout_preset_id?: string | null;
  workout_preset_name?: string | null;
  exercise_id?: string | null;
  exercise_name?: string | null;
  sets: WorkoutPresetSet[];
  created_at?: string;
  updated_at?: string;
  category?: string | null;
  modality?: string | null;
}

export interface WorkoutPlanTemplate {
  id: string;
  user_id: string;
  plan_name: string;
  description?: string | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  schedule_type: WorkoutPlanScheduleType;
  entry_mode?: 'prompt' | 'prefill';
  created_at?: string;
  updated_at?: string;
  assignments?: WorkoutPlanAssignment[];
  next_assignment?: WorkoutPlanAssignment | null;
  next_assignments?: WorkoutPlanAssignment[];
  sequence_position?: {
    current: number;
    total: number;
    session_name?: string | null;
  } | null;
}

/** What the plan form edits: the saved plan's fields as plain strings. */
export interface WorkoutPlanDraftAssignment {
  /** Server id when this row already exists. Omitted for a new assignment. */
  id?: string;
  /** Local key, so rows can be told apart before they have a server id. */
  key: string;
  /** 0 (Sunday) to 6 for a weekly plan; null for a sequential one. */
  day_of_week: number | null;
  /** 1-based session number for a sequential plan; null for a weekly one. */
  session_index: number | null;
  workout_preset_id: string | null;
  workout_preset_name: string | null;
  /**
   * A single-exercise assignment made elsewhere (the web app). Kept as it is
   * and sent back unchanged, since this form only adds saved workouts.
   */
  exercise_id: string | null;
  exercise_name: string | null;
  sets: WorkoutPresetSet[];
}

export interface WorkoutPlanDraft {
  planName: string;
  description: string;
  scheduleType: WorkoutPlanScheduleType;
  entryMode: 'prompt' | 'prefill';
  startDate: string;
  endDate: string;
  isActive: boolean;
  /** Names of the sessions of a sequential plan, by session number. */
  sessionNames: Record<number, string>;
  /** How many sessions a sequential plan has, even while some are empty. */
  sessionCount: number;
  assignments: WorkoutPlanDraftAssignment[];
}

export interface WorkoutPlanValidationErrors {
  planName?: boolean;
  startDate?: boolean;
  endDate?: boolean;
  assignments?: boolean;
}

export interface SaveWorkoutPlanPayload {
  plan_name: string;
  description: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  schedule_type: WorkoutPlanScheduleType;
  entry_mode: 'prompt' | 'prefill';
  assignments: {
    /** Existing assignment id. Omitted so a new row is inserted. */
    id?: string;
    day_of_week: number | null;
    session_index: number | null;
    session_name: string | null;
    sort_order: number;
    workout_preset_id?: string;
    exercise_id?: string;
    sets: Omit<WorkoutPresetSet, 'id'>[];
  }[];
}
