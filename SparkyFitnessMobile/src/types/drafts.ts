import type {
  ExerciseModality,
  ExerciseSnapshotResponse,
} from '@workspace/shared';

export type DraftSetType = 'warmup' | 'normal' | 'drop' | 'failure';

export interface WorkoutDraftSet {
  clientId: string;
  serverId?: number;
  weight: string;
  reps: string;
  duration?: number | null;
  distance?: string;
  restTime?: number | null;
  setType?: DraftSetType;
  notes?: string | null;
  rpe?: number | null;
  completedAt?: string | null;
  isPr?: boolean;
}

export interface WorkoutSetMetaPatch {
  setType?: DraftSetType;
  restTime?: number | null;
  notes?: string | null;
  rpe?: number | null;
  completedAt?: string | null;
}

export interface WorkoutDraftExercise {
  clientId: string;
  /** Populated only when the exercise row originated from an existing server session. */
  serverId?: string;
  exerciseId: string;
  exerciseName: string;
  /** Absent/null on pre-modality servers; resolve via `resolveSnapshotModality`. */
  exerciseCategory?: string | null;
  exerciseModality?: ExerciseModality | null;
  images: string[];
  sets: WorkoutDraftSet[];
  /** Round-tripped from the session on edit; the form has no duration UI. */
  durationMinutes?: number | null;
  /** Calories input text; seeded from the session's calories_burned on edit. */
  calories?: string;
  /** Sent as a manual server override only when the user edited the field. */
  caloriesManuallySet?: boolean;
  /** Per-exercise note; edited in the workout card forms via the "Notes" field. */
  notes?: string | null;
  /** Superset group id; edited via the form lists' grouping actions. */
  supersetGroup?: number | null;
  /** Present only when editing an existing session — not persisted to drafts. */
  snapshot?: ExerciseSnapshotResponse | null;

  // Progression & Equipment Fields
  progressionMode?: 'rep_goal' | 'fixed' | 'step_load' | 'manual' | null;
  repGoal?: number | null;
  incrementType?: 'weight' | 'reps' | null;
  incrementValue?: number | null;
  equipmentBrand?: string | null;
}
