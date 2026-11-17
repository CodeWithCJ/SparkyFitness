import type { WorkoutCardExercise } from '../utils/workoutSession';

/**
 * What the reorder screen edits when it is opened from a form list (workout
 * add / detail), whose exercises live in the opening screen's own state and so
 * cannot travel in route params. The active workout needs none of this: its
 * exercises are in the store.
 */
export interface WorkoutReorderSource {
  exercises: WorkoutCardExercise[];
  /** Item-index move, same convention as `onReorderExercises`. */
  onMove: (fromItemIndex: number, toItemIndex: number) => void;
}

let source: WorkoutReorderSource | null = null;

export function setWorkoutReorderSource(next: WorkoutReorderSource | null) {
  source = next;
}

export function getWorkoutReorderSource(): WorkoutReorderSource | null {
  return source;
}
