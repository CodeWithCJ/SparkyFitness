export interface WorkoutDraftSet {
  clientId: string;
  /** Populated only when the set originated from an existing server session. */
  serverId?: string | number;
  /** Rest time in seconds, populated from the server session. */
  restTime?: number | null;
  weight: string;
  reps: string;
  /** Round-tripped from the preset on edit; the form has no UI for these. */
  setType?: string;
  duration?: number | null;
  notes?: string | null;
}

export interface WorkoutDraftExercise {
  clientId: string;
  /** Populated only when the exercise row originated from an existing server session. */
  serverId?: string;
  exerciseId: string;
  exerciseName: string;
  exerciseCategory: string | null;
  images: string[];
  sets: WorkoutDraftSet[];
  /** Present only when editing an existing session — not persisted to drafts. */
  snapshot?: import('@workspace/shared').ExerciseSnapshotResponse | null;
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
  exerciseImages: string[];
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
