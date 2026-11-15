import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every `intervalMs`. Lets a modeled curve (active
 * caffeine, estimated blood alcohol) move on without refetching its doses.
 */
export const useNowTicker = (intervalMs: number = 30000): number => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);
  return nowMs;
};
