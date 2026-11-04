import type { Exercise } from '@/types/exercises';

/**
 * The array columns of an exercise row (images, instructions, equipment,
 * muscles) reach the web client either parsed or as the JSON text the server
 * stored: `POST /freeexercisedb/add` and `POST /exercises` return the stored
 * row, for example `images: '["Squat/0.jpg"]'`. Reading an element of that
 * text gives a single character (`'["Squat/0.jpg"]'[0]` is `'['`), so decode
 * before indexing.
 */
function toStringArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    try {
      return toStringArray(JSON.parse(value));
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }
  return null;
}

/**
 * Decodes the JSON-text array columns of an exercise row so its consumers
 * (workout drafts, thumbnails, guided narration) get the arrays its type
 * promises.
 */
export function normalizeExerciseArrays(exercise: Exercise): Exercise {
  const raw = exercise as Exercise & Record<string, unknown>;
  return {
    ...exercise,
    images: toStringArray(raw.images),
    instructions: toStringArray(raw.instructions),
    equipment: toStringArray(raw.equipment),
    primary_muscles: toStringArray(raw.primary_muscles),
    secondary_muscles: toStringArray(raw.secondary_muscles),
  };
}
