import { useEffect, useState } from 'react';

import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';

export interface RestCountdown {
  state: 'ready' | 'resting' | 'paused';
  /** Ms left on the rest — live while resting, frozen while paused, 0 when ready. */
  remainingMs: number;
  /** Fraction of the rest remaining, clamped to 0..1. */
  progress: number;
}

/**
 * Rest-timer display state shared by every surface that renders the countdown
 * (the workout HUD and the active-workout screen). `remainingMs` reads
 * `Date.now()` fresh at render time so the first render after a rest starts is
 * never stale; the hook's 1s interval exists only to force re-renders. The
 * resting → ready transition itself is owned by the store's deadline timer,
 * not by consumers of this hook.
 *
 * Pass `selfTick: false` when the calling component already re-renders at
 * least once per second (the active-workout screen's elapsed clock) so a
 * second interval isn't stacked on top of it.
 */
export function useRestCountdown(opts?: { selfTick?: boolean }): RestCountdown {
  const selfTick = opts?.selfTick ?? true;
  const state = useActiveWorkoutStore((s) => s.rest.state);
  const endsAt = useActiveWorkoutStore((s) => s.rest.endsAt);
  const pausedRemainingMs = useActiveWorkoutStore((s) => s.rest.pausedRemainingMs);
  const durationSec = useActiveWorkoutStore((s) => s.rest.durationSec);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!selfTick || state !== 'resting') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [selfTick, state]);

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const remainingMs =
    state === 'resting' && endsAt != null
      ? Math.max(0, endsAt - now)
      : state === 'paused' && pausedRemainingMs != null
        ? pausedRemainingMs
        : 0;
  const progress =
    durationSec > 0 ? Math.max(0, Math.min(1, remainingMs / (durationSec * 1000))) : 0;

  return { state, remainingMs, progress };
}
