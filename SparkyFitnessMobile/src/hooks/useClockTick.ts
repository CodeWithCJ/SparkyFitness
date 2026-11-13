import { useEffect, useState } from 'react';

type TickListener = (now: number) => void;

/**
 * One 1s interval shared by every mounted `useClockTick`, running only while
 * something listens. Each tick hands all listeners the same timestamp in the
 * same task, so their re-renders batch together and every clock on screen
 * changes at the same moment.
 */
const tickListeners = new Set<TickListener>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

function subscribeToClockTick(listener: TickListener): () => void {
  tickListeners.add(listener);
  if (tickTimer == null) {
    tickTimer = setInterval(() => {
      const now = Date.now();
      tickListeners.forEach((notify) => notify(now));
    }, 1000);
  }
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0 && tickTimer != null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

/**
 * Epoch ms that advances once a second while `enabled`. The clocks on the
 * active workout screen (the header's elapsed time, the interval HUD, the rest
 * countdown) each re-render through it, so the screen around them does not
 * re-render every second, and they still tick together.
 */
export function useClockTick(enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    return subscribeToClockTick(setNow);
  }, [enabled]);
  return now;
}
