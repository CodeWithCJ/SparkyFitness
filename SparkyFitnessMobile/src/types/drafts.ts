export interface WorkoutDraftSet {
  clientId: string;
  /** Populated only when the set originated from an existing server session. */
  serverId?: string | number;
  /** Rest time in seconds, populated from the server session. */
  restTime?: number | null;
  weight: string;
  reps: string;
  /** Editable in the card forms via long-press (set type) and the RPE column. */
  setType?: string;
  rpe?: number | null;
  /** Round-tripped from the preset/session on edit; the form has no UI for these. */
  duration?: number | null;
  notes?: string | null;
  /** Round-tripped opaquely; the form has no completion UI. */
  completedAt?: string | null;
  /** Round-tripped opaquely; the form has no PR UI. Preserves earned PRs on edit. */
  isPr?: boolean;
}

/** Patch shape for the form hooks' `updateSetMeta` action. */
export interface WorkoutSetMetaPatch {
  setType?: string;
  rpe?: number | null;
  /** ISO string to mark the set complete, null to clear it. */
  completedAt?: string | null;
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
  /** Superset group id; edited via the form lists' grouping actions. */
  supersetGroup?: number | null;
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
