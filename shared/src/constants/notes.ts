/**
 * Freeform markdown notes on foods, meals, and diary entries.
 *
 * `foods.notes` / `meals.notes` are library-level reference notes — the details
 * a user wants to remember every time they log an item (how they order a
 * particular bowl, a recipe). `food_entries.notes` / `food_entry_meals.notes`
 * are per-occurrence notes for a single diary entry, never derived from the
 * parent food or meal.
 */

/**
 * Maximum stored length of a note.
 *
 * The database column is plain unbounded TEXT, matching every other free-text
 * column in this schema, so this is the single place the bound is defined: the
 * editors cap input at it, and the server enforces it again on write. It also
 * bounds how much text a day's worth of diary rows can carry into a response
 * or into an AI tool's context.
 */
export const NOTES_MAX_LENGTH = 4000;

/**
 * Normalizes a note for storage.
 *
 * Trims, collapses empty text to `null` (an empty note is the absence of a
 * note, not an empty string), and truncates at `NOTES_MAX_LENGTH`. Returns
 * `undefined` only for `undefined` input, so callers can still distinguish
 * "field omitted, leave unchanged" from "field cleared to null".
 */
export function sanitizeNotes(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, NOTES_MAX_LENGTH);
}
