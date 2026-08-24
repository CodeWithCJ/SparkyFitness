/**
 * Per-run limits on workout telemetry collection.
 *
 * Collecting a route and the per-workout sample series costs on the order of a
 * second per workout. A background task gets only a few tens of seconds before
 * the OS kills it, and being killed mid-read loses the entire sync — so
 * background runs enrich just the newest few workouts and send the rest as
 * summaries. Because the server upserts workouts on (source, source_id), a
 * later interactive sync re-sends the skipped ones with telemetry and upgrades
 * the existing entries in place rather than duplicating them.
 *
 * Limits are carried by a per-run context rather than module state: background
 * tasks, manual syncs, and the iOS observer path are not mutually exclusive,
 * and a shared flag would let a capped background run silently strip the
 * budget (and route-consent UI) from a foreground sync running at the same
 * moment.
 *
 * Lives in `shared/` rather than beside either provider so run shells can
 * build a context without importing a platform-specific module.
 */

/** Workouts to enrich per background read. */
export const BACKGROUND_TELEMETRY_BUDGET = 3;

/**
 * Workouts to enrich per foreground read.
 *
 * Higher than the background budget — a user-present run has no OS deadline —
 * but not unlimited: the foreground window is the user's whole configured sync
 * range (up to 365 days), so an uncapped run enriches every workout in that
 * range on every single sync. At roughly a dozen native reads per workout, whose
 * results are deserialized and sorted on the JS thread, that starves the UI and
 * taps queue up for seconds (#2191). Sessions beyond the cap are picked up by
 * later syncs, which skip the ones already collected.
 */
export const FOREGROUND_TELEMETRY_BUDGET = 25;

export interface TelemetryRunContext {
  /**
   * Whether collection may show UI. Android route access can require a
   * per-session system consent dialog, which a headless task cannot present —
   * attempting it there fails or hangs. Non-interactive runs skip routes; a
   * later interactive sync collects them.
   */
  readonly interactive: boolean;
  /**
   * Claims one unit of budget, returning whether the caller may collect.
   * Callers that skip collection do not consume budget.
   */
  claim(): boolean;
  /**
   * Records a session whose telemetry this run collected, pending the upload
   * that will commit it to the reuse cache.
   *
   * Run-scoped for the same reason the budget is: overlapping runs would
   * otherwise share one staging area, and a successful upload in one run would
   * commit keys staged by another whose upload later failed — marking those
   * sessions collected when the server never received their telemetry.
   * Null keys (no stable record identity) are ignored.
   */
  stageCollected(key: string | null): void;
  /** Drains the staged keys, for the shell to commit after a successful upload. */
  drainCollected(): string[];
}

/**
 * Builds the limits for one sync run. Defaults are the interactive shape:
 * unlimited budget and UI allowed, for runs with a user present and no
 * execution deadline to respect.
 */
export const createTelemetryRunContext = (options?: {
  budget?: number;
  interactive?: boolean;
}): TelemetryRunContext => {
  let remaining = options?.budget ?? Number.POSITIVE_INFINITY;
  let collected: string[] = [];
  return {
    interactive: options?.interactive ?? true,
    claim: (): boolean => {
      if (remaining <= 0) return false;
      remaining -= 1;
      return true;
    },
    stageCollected: (key: string | null): void => {
      if (key) collected.push(key);
    },
    drainCollected: (): string[] => {
      const staged = collected;
      collected = [];
      return staged;
    },
  };
};
