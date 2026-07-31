/**
 * Workout source constants and validation utilities.
 *
 * These functions determine which workout sources support nested exercise editing
 * (i.e., can have their exercises and sets modified after creation).
 */

/**
 * Normalized workout sources that support nested exercise editing.
 * These sources allow modification of exercises and sets within a grouped workout session.
 */
const EDITABLE_SOURCES = new Set(['manual', 'sparky', 'workout plan']);

/**
 * Normalize a source string by trimming whitespace and converting to lowercase.
 */
function normalizeSource(source: string | null | undefined): string | null {
  if (source == null) return null;
  return source.trim().toLowerCase();
}

/**
 * Check if a workout source supports nested exercise editing.
 *
 * Returns true for:
 * - manual
 * - sparky
 * - workout plan
 * - null/undefined (legacy local Sparky records)
 *
 * Returns false for:
 * - external synchronization sources (HealthKit, Garmin, Strava, etc.)
 * - any other unknown, non-empty source
 *
 * @param source - The workout session source string
 * @returns true if the source supports nested editing, false otherwise
 */
export function canEditGroupedWorkout(
  source: string | null | undefined
): boolean {
  const normalized = normalizeSource(source);
  if (normalized == null) {
    return true;
  }
  return EDITABLE_SOURCES.has(normalized);
}
