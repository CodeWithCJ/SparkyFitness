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
 * External/synchronized sources that should NOT allow nested editing.
 * These are read-only sources from external integrations.
 */
const EXTERNAL_SOURCES = new Set([
  'healthkit',
  'health connect',
  'garmin',
  'garmin_fit',
  'strava',
  'fitbit',
  'withings',
  'myfitnesspal',
]);

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
 *
 * Returns false for:
 * - null/undefined sources
 * - external synchronization sources (HealthKit, Garmin, Strava, etc.)
 * - any other unknown source
 *
 * @param source - The workout session source string
 * @returns true if the source supports nested editing, false otherwise
 */
export function canEditGroupedWorkout(source: string | null | undefined): boolean {
  const normalized = normalizeSource(source);
  if (normalized == null) return false;
  return EDITABLE_SOURCES.has(normalized);
}

/**
 * Check if a source is from an external synchronization provider.
 *
 * @param source - The workout session source string
 * @returns true if the source is from an external provider
 */
export function isExternalSource(source: string | null | undefined): boolean {
  const normalized = normalizeSource(source);
  if (normalized == null) return false;
  return EXTERNAL_SOURCES.has(normalized);
}

/**
 * Legacy alias for canEditGroupedWorkout - use canEditGroupedWorkout instead.
 * This exists for backwards compatibility during migration.
 * @deprecated Use canEditGroupedWorkout instead
 */
export function supportsNestedEditing(source: string | null | undefined): boolean {
  return canEditGroupedWorkout(source);
}
