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
}

export interface SuggestedExercisesResponse {
  recentExercises: Exercise[];
  topExercises: Exercise[];
}
