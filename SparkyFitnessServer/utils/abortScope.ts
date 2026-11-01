import { AsyncLocalStorage } from 'node:async_hooks';

const abortScopeStorage = new AsyncLocalStorage<AbortSignal>();
const activityStorage = new AsyncLocalStorage<() => void>();

/**
 * Runs `work` so that everything it calls, however deep, can see `signal`.
 * Long-running work (a provider sync) is stopped this way without threading a
 * signal through every service it touches. Inside another scope the work stops
 * when either signal aborts.
 */
export function runWithAbortSignal<T>(signal: AbortSignal, work: () => T): T {
  const outer = abortScopeStorage.getStore();
  return abortScopeStorage.run(
    outer ? AbortSignal.any([outer, signal]) : signal,
    work
  );
}

/**
 * Throws the abort reason when the surrounding work was stopped. The database
 * helpers call this before and after acquiring a connection, so stopped work
 * cannot start another write.
 */
export function throwIfWorkAborted(): void {
  abortScopeStorage.getStore()?.throwIfAborted();
}

/**
 * Runs `work` so that `onActivity` is called each time it, however deep, gets
 * a database connection or runs a query. A stalled sync is told apart from a
 * slow one this way. Inside another listener both are called.
 */
export function runWithActivityListener<T>(
  onActivity: () => void,
  work: () => T
): T {
  const outer = activityStorage.getStore();
  return activityStorage.run(
    outer
      ? () => {
          outer();
          onActivity();
        }
      : onActivity,
    work
  );
}

/** Reports progress to the surrounding work's activity listener, if any. */
export function noteWorkActivity(): void {
  activityStorage.getStore()?.();
}

/**
 * Runs `work` outside every abort scope: for cleanup that must still reach the
 * database after the work it cleans up after was stopped, such as releasing a
 * claim. Only for writes fenced by their own predicates, never for the
 * stopped work's own writes. Such cleanup is not progress of the work either.
 */
export function runOutsideAbortScope<T>(work: () => T): T {
  return abortScopeStorage.exit(() => activityStorage.exit(work));
}
