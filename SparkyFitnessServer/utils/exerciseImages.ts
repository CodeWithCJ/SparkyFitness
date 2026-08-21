/**
 * Normalizes a stored `exercises.images` value into a flat list of usable paths.
 *
 * The column is written as JSON text, and some legacy rows were written with an
 * already-serialized array as their only element:
 *
 *   ["[\"Ab_Roller/0.jpg\",\"Ab_Roller/1.jpg\"]"]
 *
 * A single `JSON.parse` leaves that inner array as one opaque string, which the
 * clients then append to `/uploads/exercises/`, producing a 404. Parsing
 * recursively unwraps it instead, so a bad row renders correctly without a
 * backfill. Mirrors the mobile client's `parseStringArrayValue`, which already
 * did this — normalizing here means clients no longer have to.
 */
function parseImageEntry(value: unknown, depth = 0): string[] {
  // Bounded: a self-referential or deeply nested value must not recurse forever.
  if (depth > 4) return [];

  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseImageEntry(entry, depth + 1));
  }
  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  // '[]' is the sentinel an image-less exercise was historically stored as.
  if (trimmed === '' || trimmed === '[]') return [];

  // Only re-parse values that actually look like nested JSON; a plain path such
  // as `Ab_Roller/0.jpg` must be returned untouched.
  if (trimmed.startsWith('[') || trimmed.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.flatMap((entry) => parseImageEntry(entry, depth + 1));
      }
      if (typeof parsed === 'string' && parsed !== trimmed) {
        return parseImageEntry(parsed, depth + 1);
      }
    } catch {
      // Not JSON after all — fall through and treat it as a literal path.
    }
  }

  return [trimmed];
}

export function normalizeExerciseImages(raw: unknown): string[] {
  return parseImageEntry(raw);
}

export default { normalizeExerciseImages };
