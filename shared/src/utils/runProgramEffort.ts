import type { RunProgramEffort } from "../schemas/api/RunProgram.api.zod.ts";

/** Ratings at or above this felt hard; at or below `EASY_RATING`, easy. */
export const HARD_RATING = 8;
export const EASY_RATING = 3;

export type EffortSuggestion = "ease" | "advance";

/**
 * What the last two rated workouts say about the next one: two hard in a row
 * suggest easing off (repeat or lighten), two easy in a row suggest moving on.
 * Only workouts already done (before `nextIndex`) count, and only the latest
 * two of them, which must be consecutive. Null when there is no clear signal.
 */
export function suggestFromEffort(
  log: readonly RunProgramEffort[],
  nextIndex: number,
): EffortSuggestion | null {
  const byIndex = new Map(log.map((entry) => [entry.index, entry.rating]));
  const last = byIndex.get(nextIndex - 1);
  const before = byIndex.get(nextIndex - 2);
  if (last === undefined || before === undefined) return null;
  if (last >= HARD_RATING && before >= HARD_RATING) return "ease";
  if (last <= EASY_RATING && before <= EASY_RATING) return "advance";
  return null;
}
