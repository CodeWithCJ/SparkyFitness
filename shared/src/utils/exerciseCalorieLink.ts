/**
 * Linking a workout logged in SparkyFitness to the same session synced from a
 * watch or a health platform, so the session's calories count once (#2353).
 *
 * Both sides keep their own estimate in `calories_burned`. A link only decides
 * what each side adds to the daily balance (`calories_applied`, see
 * `entryCaloriesCounted`), so no estimate is ever lost.
 */

export const CALORIE_LINK_RESOLUTIONS = [
  'sparkyfitness',
  'synced',
  'higher',
  'lower',
  'average',
  'custom',
] as const;

export type CalorieLinkResolution = (typeof CALORIE_LINK_RESOLUTIONS)[number];

/**
 * Whether a workout was logged in SparkyFitness itself (typed in, or started
 * from the app's workout flow, or logged on the web with no source) rather
 * than synced from a watch or provider.
 */
export function isAppLoggedWorkoutSource(
  source: string | null | undefined
): boolean {
  const normalized = (source ?? '').trim().toLowerCase();
  return (
    normalized === '' || normalized === 'manual' || normalized === 'sparky'
  );
}

/** A set time this far outside the synced workout's window still matches. */
export const CALORIE_LINK_MATCH_SLACK_MS = 10 * 60 * 1000;

export interface LinkedCaloriesInput {
  /** Sum of `calories_burned` over the SparkyFitness workout's entries. */
  manualTotal: number;
  /** `calories_burned` of the synced entry. */
  syncedTotal: number;
  resolution: CalorieLinkResolution;
  /** Required for `custom`. */
  customCalories?: number;
}

export interface LinkedCalories {
  /**
   * Calories the SparkyFitness workout counts in total. Null means its own
   * estimate counts, unchanged.
   */
  manualCounted: number | null;
  /** Same for the synced entry. 0 means it counts nothing. */
  syncedCounted: number | null;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * Decides what each side of a link counts. The pair always counts one figure:
 * the side not chosen is set to 0, and `average` and `custom` put their figure
 * on the SparkyFitness side.
 */
export function resolveLinkedCalories({
  manualTotal,
  syncedTotal,
  resolution,
  customCalories,
}: LinkedCaloriesInput): LinkedCalories {
  const keepManual: LinkedCalories = {
    manualCounted: null,
    syncedCounted: 0,
  };
  const keepSynced: LinkedCalories = {
    manualCounted: 0,
    syncedCounted: null,
  };
  switch (resolution) {
    case 'sparkyfitness':
      return keepManual;
    case 'synced':
      return keepSynced;
    case 'higher':
      return manualTotal >= syncedTotal ? keepManual : keepSynced;
    case 'lower':
      return manualTotal <= syncedTotal ? keepManual : keepSynced;
    case 'average':
      return {
        manualCounted: round1((manualTotal + syncedTotal) / 2),
        syncedCounted: 0,
      };
    case 'custom':
      return {
        manualCounted: round1(Math.max(0, customCalories ?? 0)),
        syncedCounted: 0,
      };
  }
}

/**
 * Splits a workout's counted total over its exercise entries in proportion to
 * their own estimates (equally when they are all 0), so the parts add back up to
 * the total.
 */
export function distributeCountedCalories(
  estimates: readonly number[],
  total: number
): number[] {
  if (estimates.length === 0) return [];
  const sum = estimates.reduce((acc, value) => acc + Math.max(0, value), 0);
  const shares = estimates.map((value) =>
    sum > 0 ? (Math.max(0, value) / sum) * total : total / estimates.length
  );
  const rounded = shares.map(round1);
  // Rounding can drift the sum by a tenth; settle it on the largest share.
  const drift = round1(total - rounded.reduce((acc, value) => acc + value, 0));
  if (drift !== 0) {
    let largest = 0;
    rounded.forEach((value, index) => {
      if (value > (rounded[largest] ?? 0)) largest = index;
    });
    rounded[largest] = round1((rounded[largest] ?? 0) + drift);
  }
  return rounded;
}

export interface LinkWindow {
  startMs: number;
  endMs: number;
}

export type CalorieLinkMatch = 'sets_within' | 'overlap';

/**
 * Says whether a synced workout looks like the SparkyFitness one.
 *
 * `sets_within`: every set that has a completion time falls inside the synced
 * workout's window (plus slack). This needs no guess from exercise types.
 * `overlap`: the SparkyFitness workout has no set times, but its own window
 * overlaps the synced one. Null: no evidence either way, so the person decides.
 */
export function matchCalorieLink(
  manual: { setTimesMs: readonly number[]; window: LinkWindow | null },
  synced: LinkWindow | null,
  slackMs: number = CALORIE_LINK_MATCH_SLACK_MS
): CalorieLinkMatch | null {
  if (!synced) return null;
  const from = synced.startMs - slackMs;
  const to = synced.endMs + slackMs;
  const times = manual.setTimesMs.filter((ms) => Number.isFinite(ms));
  if (times.length > 0) {
    return times.every((ms) => ms >= from && ms <= to) ? 'sets_within' : null;
  }
  if (
    manual.window &&
    manual.window.startMs <= to &&
    manual.window.endMs >= from
  ) {
    return 'overlap';
  }
  return null;
}
