import { log } from '../config/logging.js';

/**
 * exercises.equipment/primary_muscles/secondary_muscles/instructions/images
 * (and the matching columns on exercise_entries) are TEXT columns holding a
 * JSON-array-encoded string by design (see
 * db/migrations/20250927180257_alter_exercises_table.sql). Some rows hold a
 * bare JSON string instead of a one-item array (free-exercise-db's raw JSON
 * uses a single string for a solo value, and imports have historically
 * passed that through unnormalized), and a JSON.parse of those returns a
 * non-array. Wrap it into a one-item array instead of returning it as-is, so
 * every caller can rely on the result always being an array.
 */
export function parseJsonArrayField(
  value: string | null | undefined,
  context?: string
): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    log(
      'error',
      `Error parsing exercise JSON array field${context ? ` (${context})` : ''}:`,
      error
    );
    return [];
  }
}
