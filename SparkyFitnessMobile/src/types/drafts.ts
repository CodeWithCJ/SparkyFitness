import type { ExerciseModality } from '@workspace/shared';

export type DraftSetType = 'warmup' | 'normal' | 'drop' | 'failure' | string;

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
  /** Null when editing a session whose library exercise has since been deleted. */
  exerciseId: string | null;
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
  /**
   * Present only when editing an existing session - not persisted to drafts.
   * Entry-shaped, so its `id` is null once the library exercise is deleted.
   */
  snapshot?: import('@workspace/shared').EntryExerciseSnapshotResponse | null;

  // Progression & Equipment Fields
  progressionMode?: 'rep_goal' | 'fixed' | 'step_load' | 'manual' | null;
  repGoal?: number | null;
  incrementType?: 'weight' | 'reps' | null;
  incrementValue?: number | null;
  equipmentBrand?: string | null;
}

export interface WorkoutDraft {
  type: 'workout';
  name: string;
  nameManuallySet?: boolean;
  description?: string;
  entryDate: string;
  notes?: string;
  exercises: WorkoutDraftExercise[];
}

export interface ActivityDraft {
  type: 'activity';
  exerciseId: string | null;
  exerciseName: string;
  exerciseCategory?: string | null;
  exerciseImages?: string[];
  caloriesPerHour: number;
  name: string;
  nameManuallySet?: boolean;
  entryDate: string;
  duration: string;
  durationMinutes?: string;
  calories: string;
  caloriesBurned?: string;
  caloriesManuallySet?: boolean;
  distance: string;
  avgHeartRate: string;
  notes: string;
}

export type FormDraft = WorkoutDraft | ActivityDraft;
