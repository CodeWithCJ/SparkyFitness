import { getExerciseById } from '@/api/Exercises/exerciseService';
import type { Exercise } from '@/types/exercises';

/** The full library row for a slot's backup exercise, or null if it can't load. */
export const fetchBackupExercise = (id: string): Promise<Exercise | null> =>
  getExerciseById(id).catch(() => null);
