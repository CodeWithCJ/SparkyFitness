export interface WorkoutPresetSet {
  id: string;
  set_number: number;
  set_type: string;
  reps: number | null;
  weight: number | null;
  duration: number | null;
  rest_time: number | null;
  notes: string | null;
}

export interface WorkoutPresetExercise {
  id: string;
  exercise_id: string;
  image_url: string | null;
  exercise_name: string;
  category?: string | null;
  sets: WorkoutPresetSet[];
}

export interface WorkoutPreset {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  exercises: WorkoutPresetExercise[];
}

export interface WorkoutPresetsResponse {
  presets: WorkoutPreset[];
  total: number;
  page: number;
  limit: number;
}
