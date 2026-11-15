import { useEffect, useState } from 'react';

/**
 * A clock for a modeled intake curve (caffeine, blood alcohol). The level
 * changes continuously, so the client evaluates the curve against this clock
 * instead of refetching. It ticks every 30 s while `enabled`.
 */
export function useKineticsClock(enabled: boolean): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [enabled]);
  return nowMs;
}
