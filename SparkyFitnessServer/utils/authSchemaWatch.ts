import { log } from '../config/logging.js';

const CHECK_INTERVAL_MS = 30_000;
const GIVE_UP_AFTER_MS = 60_000;

function isSchemaMismatch(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'SCHEMA_MISMATCH'
  );
}

/**
 * Better Auth remembers a schema mismatch for the life of the process, and
 * only its own migrations clear it, never the SQL migrations this server runs.
 * Readiness already keeps such a server out of rotation; this ends the process
 * once the mismatch has lasted a minute, so the orchestrator (or Docker's
 * restart policy) starts a fresh one that checks the schema again. A clean
 * check is cached by Better Auth, so watching costs nothing once it passes.
 */
export function watchAuthSchema(
  check: () => Promise<void> | void,
  onStuck: () => void,
  now: () => number = Date.now
): () => void {
  let mismatchSince: number | undefined;
  const timer = setInterval(() => {
    void (async () => {
      try {
        await check();
        mismatchSince = undefined;
      } catch (error) {
        // An unreachable database is not a mismatch; readiness reports it.
        if (!isSchemaMismatch(error)) return;
        mismatchSince ??= now();
        if (now() - mismatchSince < GIVE_UP_AFTER_MS) return;
        clearInterval(timer);
        log(
          'error',
          'Better Auth still reports a database schema mismatch; restarting the server so it checks the schema again.',
          error
        );
        onStuck();
      }
    })();
  }, CHECK_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
