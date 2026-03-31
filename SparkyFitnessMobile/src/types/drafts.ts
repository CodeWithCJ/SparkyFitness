export interface WorkoutDraftSet {
  clientId: string;
  weight: string;
  reps: string;
}

export interface WorkoutDraftExercise {
  clientId: string;
  exerciseId: string;
  exerciseName: string;
  exerciseCategory: string | null;
  sets: WorkoutDraftSet[];
}

export interface WorkoutDraft {
  type: 'workout';
  name: string;
  nameManuallySet?: boolean;
  entryDate: string;
  exercises: WorkoutDraftExercise[];
}

export interface ActivityDraft {
  type: 'activity';
  name: string;
  nameManuallySet?: boolean;
  exerciseId: string | null;
  exerciseName: string;
  exerciseCategory: string | null;
  caloriesPerHour: number;
  duration: string;
  distance: string;
  calories: string;
  caloriesManuallySet: boolean;
  avgHeartRate: string;
  entryDate: string;
  notes: string;
}

export type FormDraft = WorkoutDraft | ActivityDraft;
