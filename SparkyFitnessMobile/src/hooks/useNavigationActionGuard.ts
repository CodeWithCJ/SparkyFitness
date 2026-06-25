import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

type FocusAwareNavigation = {
  addListener?: (event: 'focus', callback: () => void) => () => void;
};

/**
 * Prevents multiple stack actions from being queued while a native navigation
 * transition is still running. The guard unlocks only after the source screen
 * is focused again and React Native has finished the return transition.
 */
export function useNavigationActionGuard(navigation: FocusAwareNavigation) {
  const lockedRef = useRef(false);
  const unlockTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(
    null,
  );
  const unlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const cancelScheduledUnlock = useCallback(() => {
    unlockTaskRef.current?.cancel();
    unlockTaskRef.current = null;
    if (unlockTimeoutRef.current != null) {
      clearTimeout(unlockTimeoutRef.current);
      unlockTimeoutRef.current = null;
    }
  }, []);

  const scheduleUnlock = useCallback(() => {
    cancelScheduledUnlock();
    unlockTaskRef.current = InteractionManager.runAfterInteractions(() => {
      unlockTaskRef.current = null;
      // Native-stack focus can be emitted just before the closing animation
      // has fully released its transition state.
      unlockTimeoutRef.current = setTimeout(() => {
        unlockTimeoutRef.current = null;
        lockedRef.current = false;
        setIsLocked(false);
      }, 100);
    });
  }, [cancelScheduledUnlock]);

  useEffect(() => {
    const unsubscribe = navigation.addListener?.('focus', scheduleUnlock);
    return () => {
      unsubscribe?.();
      cancelScheduledUnlock();
    };
  }, [navigation, scheduleUnlock, cancelScheduledUnlock]);

  const runNavigationAction = useCallback((action: () => void) => {
    if (lockedRef.current) return false;

    lockedRef.current = true;
    setIsLocked(true);
    try {
      action();
      return true;
    } catch (error) {
      lockedRef.current = false;
      setIsLocked(false);
      throw error;
    }
  }, []);

  return { isNavigationLocked: isLocked, runNavigationAction };
}
