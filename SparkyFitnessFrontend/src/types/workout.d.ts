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
  set_number: number;
  reps: number;
  weight: number;
  set_type: 'Working Set' | 'Warm-up' | 'Drop Set' | 'Failure' | 'AMRAP' | 'Back-off' | 'Rest-Pause' | 'Cluster' | 'Technique';
  duration?: number;
  rest_time?: number;
  notes?: string;
}

export interface WorkoutPreset {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  exercises?: PresetExercise[];
}

export interface WorkoutPlanTemplate {
  id: string;
  user_id: string;
  plan_name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  assignments?: WorkoutPlanTemplateAssignment[];
}

export interface WorkoutPlanTemplateAssignment {
  id: string;
  template_id: string;
  day_of_week: number;
  workout_preset_id?: string;
  exercise_id?: string;
  created_at: string;
  updated_at: string;
}