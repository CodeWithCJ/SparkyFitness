import { useCallback, useEffect, useRef } from 'react';

/**
 * Saves a practice run at most once, for a Finish button that stays on screen
 * while its save is pending.
 *
 * Presses are dropped while the save is pending and after it succeeds, until
 * the practice is back to no run in progress: taps replayed from a blocked JS
 * thread reach the tree from before the reset renders (#2191), so a latch
 * released as soon as the save resolved would let one of them log the run
 * again. A failed save frees it right away so Finish can retry.
 *
 * A save still pending when the practice is reset or closed belongs to a run
 * that is over: when it settles, `onSaved` is skipped so it cannot reset and
 * close a run started since.
 */
export function useSaveOncePerRun(
  runInProgress: boolean
): (save: () => void | Promise<unknown>, onSaved: () => void) => Promise<void> {
  const runRef = useRef(0);
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!runInProgress) {
      runRef.current += 1;
      lockedRef.current = false;
    }
  }, [runInProgress]);

  return useCallback(
    async (save: () => void | Promise<unknown>, onSaved: () => void) => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      const run = runRef.current;
      try {
        await save();
      } catch {
        // The practice stays open with its run, so Finish can try again.
        if (run === runRef.current) lockedRef.current = false;
        return;
      }
      if (run === runRef.current) onSaved();
    },
    []
  );
}
