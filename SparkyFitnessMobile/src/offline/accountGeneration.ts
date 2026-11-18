/**
 * Counts the times the signed-in account changed in this run of the app.
 *
 * What the phone saves for offline use is keyed by the server configuration,
 * and an account switch on the same server keeps that configuration. A
 * request or a refresh that started before a switch can therefore finish
 * after the cache was cleared and write the previous account's answer under
 * the same key. Such work takes the number when it starts and writes only
 * while it is still the same.
 */
let generation = 0;

export function accountGeneration(): number {
  return generation;
}

/** Called when the signed-in account changes, before the cache is cleared. */
export function bumpAccountGeneration(): void {
  generation += 1;
}

let cleanup: Promise<void> | null = null;
let savedCopyTrusted = true;

/**
 * An account change: counts it, then runs `clear` (which empties what the
 * phone saved for the previous account and says whether it worked). Until it
 * has finished, and for good if it failed, the saved copy is not read for
 * the new account (`savedCopyReadable`), so a read can never answer from the
 * previous account's data.
 */
export function beginAccountChange(
  clear: () => Promise<boolean>
): Promise<void> {
  generation += 1;
  savedCopyTrusted = false;
  const run: Promise<void> = (async () => {
    let cleared = false;
    try {
      cleared = await clear();
    } catch {
      cleared = false;
    }
    savedCopyTrusted = cleared;
  })();
  cleanup = run;
  void run.then(() => {
    if (cleanup === run) cleanup = null;
  });
  return run;
}

/**
 * Waits for an account change in progress, then says whether the saved copy
 * may be read. False after a clean-up that failed: better no offline data
 * than the previous account's.
 */
export async function savedCopyReadable(): Promise<boolean> {
  if (cleanup) await cleanup;
  return savedCopyTrusted;
}
