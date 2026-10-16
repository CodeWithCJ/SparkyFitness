import type { LoadStatus } from "./trainingLoad.ts";

/** A plan change made this recently is not followed by another offer. */
export const LOAD_OFFER_COOLDOWN_HOURS = 72;

export interface LoadSuggestion {
  /** Change to the running in the next `count` workouts (negative eases). */
  percent: number;
  count: number;
}

/**
 * When the last seven days of training jumped well past the person's usual
 * (a spike), easing the next two program workouts by 15% is the safer way to
 * carry on. Null for any other status, a finished or unstarted program, or
 * when the plan was already changed in the last three days, so it is not
 * offered again right after the person said yes (or no by changing it
 * another way).
 */
export function suggestFromLoad(input: {
  status: LoadStatus;
  next: number;
  total: number;
  /** When the plan was last changed, as an ISO instant. */
  lastAdjustedAt?: string | null;
  nowMs: number;
}): LoadSuggestion | null {
  const { status, next, total, lastAdjustedAt, nowMs } = input;
  if (status !== "spike") return null;
  if (next <= 0 || next >= total) return null;
  if (lastAdjustedAt) {
    const at = Date.parse(lastAdjustedAt);
    if (
      Number.isFinite(at) &&
      nowMs - at < LOAD_OFFER_COOLDOWN_HOURS * 3_600_000
    ) {
      return null;
    }
  }
  return { percent: -15, count: 2 };
}
