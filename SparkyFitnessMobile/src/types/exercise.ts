export interface Exercise {
  id: string;
  name: string;
  category: string | null;
  equipment: string[];
  primary_muscles: string[];
  secondary_muscles: string[];
  calories_per_hour: number;
  source: string;
  images: string[];
  tags: string[];
  force?: string | null;
  level?: string | null;
  mechanic?: string | null;
  instructions?: string[];
  description?: string | null;
  userId?: string | null;
  isCustom?: boolean;
}

export interface SuggestedExercisesResponse {
  recentExercises: Exercise[];
  topExercises: Exercise[];
}
