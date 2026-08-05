/**
 * How many workouts the current read may enrich with telemetry.
 *
 * Collecting a route and the per-workout sample series costs on the order of a
 * second per workout. A background task gets only a few tens of seconds before
 * the OS kills it, and being killed mid-read loses the entire sync — so
 * background runs enrich just the newest few workouts and send the rest as
 * summaries. Because the server upserts workouts on (source, source_id), the
 * next foreground sync re-sends the skipped ones with telemetry and upgrades
 * the existing entries in place rather than duplicating them.
 *
 * Lives in `shared/` rather than beside either provider so the background
 * service can set it without importing a platform-specific module.
 */

/** Workouts to enrich per background read. */
export const BACKGROUND_TELEMETRY_BUDGET = 3;

let remaining = Number.POSITIVE_INFINITY;

/**
 * Caps telemetry collection for subsequent reads. Foreground callers reset this
 * to Infinity, where there is no execution deadline to respect.
 */
export const setWorkoutTelemetryBudget = (budget: number): void => {
  remaining = budget;
};

/**
 * Claims one unit of budget, returning whether the caller may collect. Callers
 * that skip collection do not consume budget.
 */
export const claimTelemetryBudget = (): boolean => {
  if (remaining <= 0) return false;
  remaining -= 1;
  return true;
};

let interactive = true;

/**
 * Whether collection may show UI.
 *
 * Android route access can require a per-session system consent dialog, which
 * a headless background task cannot present — attempting it there fails or
 * hangs. Background runs therefore mark themselves non-interactive and skip
 * routes; the next foreground sync collects them.
 */
export const isTelemetryInteractive = (): boolean => interactive;

export const setTelemetryInteractive = (value: boolean): void => {
  interactive = value;
};
