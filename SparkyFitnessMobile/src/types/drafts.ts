export interface WorkoutDraftSet {
  clientId: string;
  /** Populated only when the set originated from an existing server session. */
  serverId?: string | number;
  /** Rest time in seconds, populated from the server session. */
  restTime?: number | null;
  weight: string;
  reps: string;
  /**
   * Display-unit text (km/mi), converted at payload build like `weight`.
   * Meaningful only on cardio sets; drafts persisted before the field
   * existed surface it as undefined at runtime.
   */
  distance: string;
  /** Editable in the card forms via long-press (set type) and the RPE column. */
  setType?: string;
  rpe?: number | null;
  /** Integer seconds; edited in the card forms when the exercise is duration-modality. */
  duration?: number | null;
  /** Edited in the workout card forms via the long-press set-note panel. */
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
  notes?: string | null;
  /** Rest time in seconds for this set. */
  restTime?: number | null;
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
  /** Absent/null on pre-modality servers; resolve via `resolveSnapshotModality`. */
  exerciseModality?: import('@workspace/shared').ExerciseModality | null;
  images: string[];
  sets: WorkoutDraftSet[];
  /** Round-tripped from the session on edit; the form has no duration UI. */
  durationMinutes?: number | null;
  /** Calories input text; seeded from the session's calories_burned on edit. */
  calories?: string;
  /** Sent as a manual server override only when the user edited the field. */
  caloriesManuallySet?: boolean;
  /** Per-exercise note; edited in the workout card forms via the ⋮ "Notes" field. */
  notes?: string | null;
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
