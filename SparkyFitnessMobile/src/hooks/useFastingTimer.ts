import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { computeFastTimerValues, type FastTimerValues } from '../utils/fasting';

export type { FastTimerValues } from '../utils/fasting';

/**
 * UI tick hook. Runs a 1s interval (only while the screen is focused and a fast
 * is active) and returns derived timer values. `Date.now()` is read fresh at
 * render — the `tick` state only forces a re-render, so the first frame after a
 * fast starts never shows a stale value (mirrors `ActiveWorkoutBar`).
 */
export function useFastingTimer(
  startTime: string | null | undefined,
  targetEndTime: string | null | undefined,
  active: boolean,
): FastTimerValues {
  const [, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!active || !startTime) return;
      const id = setInterval(() => setTick((t) => t + 1), 1000);
      return () => clearInterval(id);
    }, [active, startTime]),
  );

  const now = Date.now();
  // When idle (no fast) the consuming component ignores these values; fall back
  // to a zero-elapsed result rather than computing from the epoch.
  if (!startTime) {
    return computeFastTimerValues(new Date(now).toISOString(), null, now);
  }
  return computeFastTimerValues(startTime, targetEndTime, now);
}
