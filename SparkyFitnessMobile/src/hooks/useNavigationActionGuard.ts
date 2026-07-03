import { useCallback, useEffect, useRef, useState } from 'react';

type FocusAwareNavigation = {
  addListener?: (event: 'focus', callback: () => void) => () => void;
};

// Fallback: if the source screen is never re-focused (e.g. an action that fails
// asynchronously or navigates without blurring the screen), force-release the
// lock after this long so the guarded controls can't stay disabled forever.
const SAFETY_UNLOCK_MS = 5000;

/**
 * Prevents multiple stack actions from being queued while a native navigation
 * transition is still running. The guard unlocks when the source screen is
 * focused again and React Native has finished the return transition, or after a
 * safety timeout if that focus event never arrives.
 */
export function useNavigationActionGuard(navigation: FocusAwareNavigation) {
  const lockedRef = useRef(false);
  const unlockIdleRef = useRef<number | null>(null);
  const unlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const clearPendingTimers = useCallback(() => {
    if (unlockIdleRef.current != null) {
      cancelIdleCallback(unlockIdleRef.current);
      unlockIdleRef.current = null;
    }
    if (unlockTimeoutRef.current != null) {
      clearTimeout(unlockTimeoutRef.current);
      unlockTimeoutRef.current = null;
    }
    if (safetyTimeoutRef.current != null) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, []);

  const releaseLock = useCallback(() => {
    clearPendingTimers();
    lockedRef.current = false;
    setIsLocked(false);
  }, [clearPendingTimers]);

  const scheduleUnlock = useCallback(() => {
    clearPendingTimers();
    // Defer past any in-flight interactions/animations before unlocking. The
    // `timeout` guarantees the callback still fires if the JS thread never goes
    // idle (replaces the deprecated InteractionManager.runAfterInteractions).
    unlockIdleRef.current = requestIdleCallback(
      () => {
        unlockIdleRef.current = null;
        // Native-stack focus can be emitted just before the closing animation
        // has fully released its transition state.
        unlockTimeoutRef.current = setTimeout(releaseLock, 100);
      },
      { timeout: 500 },
    );
  }, [clearPendingTimers, releaseLock]);

  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', scheduleUnlock);
    return () => {
      unsubscribe?.();
      clearPendingTimers();
    };
  }, [navigation, scheduleUnlock, clearPendingTimers]);

  const runNavigationAction = useCallback(
    (action: () => void) => {
      if (lockedRef.current) return false;

      lockedRef.current = true;
      setIsLocked(true);
      // Recover the lock even if the screen is never re-focused to run scheduleUnlock.
      safetyTimeoutRef.current = setTimeout(releaseLock, SAFETY_UNLOCK_MS);
      try {
        action();
        return true;
      } catch (error) {
        releaseLock();
        throw error;
      }
    },
    [releaseLock],
  );

  return { isNavigationLocked: isLocked, runNavigationAction };
}
