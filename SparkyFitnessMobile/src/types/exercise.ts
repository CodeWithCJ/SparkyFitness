export interface ExerciseSnapshot {
  id: string;
  name: string;
  category: string;
  calories_per_hour: number;
  source: string;
}

export interface ExerciseEntry {
  id: string;
  calories_burned: number;
  exercise_snapshot?: ExerciseSnapshot;
  duration_minutes?: number;
}
