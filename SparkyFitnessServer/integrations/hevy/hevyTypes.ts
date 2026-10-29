/** A single set within a Hevy exercise. */
export interface HevySet {
  index: number;
  type: string;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  custom_metric?: number | null;
}

/** One exercise within a Hevy workout. */
export interface HevyExercise {
  index: number;
  title: string;
  notes?: string | null;
  exercise_template_id?: string | null;
  superset_id?: string | number | null;
  sets?: HevySet[] | null;
}

/** A logged Hevy workout (one session). */
export interface HevyWorkout {
  id: string;
  title: string;
  routine_id?: string | null;
  description?: string | null;
  start_time: string;
  end_time: string;
  updated_at?: string | null;
  created_at?: string | null;
  exercises?: HevyExercise[] | null;
}

/** The template metadata used to classify a workout's exercises. */
export interface HevyExerciseTemplate {
  id: string;
  title?: string;
  primary_muscle_group?: string | null;
  secondary_muscle_groups?: string[] | null;
}

/** The Hevy user-info payload we read body metrics from. */
export interface HevyUserInfoResponse {
  user?: {
    weight_kg?: number | null;
    height_cm?: number | null;
    updated_at?: string | null;
  } | null;
}

export interface HevyWorkoutsResponse {
  page: number;
  page_count: number;
  workouts: HevyWorkout[];
}

export interface HevyExerciseTemplatesResponse {
  page: number;
  page_count: number;
  exercise_templates: HevyExerciseTemplate[];
}
