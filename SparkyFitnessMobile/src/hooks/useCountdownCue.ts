import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAppPreferencesStore } from '../stores/appPreferencesStore';

/**
 * Seconds of audible lead-in before a rest or hold ends. Off (0), 3 or 5: the
 * watch's "Countdown" setting, which drives the phone too so one choice covers
 * both.
 */
export function useCountdownSeconds(): number {
  return useAppPreferencesStore((s) => s.watchWorkoutCountdown);
}

/**
 * Calls `onTick(secondsLeft)` once for each of the last `seconds` whole
 * seconds of a countdown. Lead-in beeps are for someone watching the screen,
 * so nothing sounds while the app is off screen (the single end-of-rest cue
 * stays with the rest chime and notification, never doubled here). `active`
 * false resets it for the next run. The caller re-renders about once a second
 * with a fresh `remainingMs` (the shared clock tick).
 */
export function useCountdownCue({
  active,
  remainingMs,
  seconds,
  onTick,
}: {
  active: boolean;
  remainingMs: number;
  seconds: number;
  onTick: (secondsLeft: number) => void;
}): void {
  const lastSecRef = useRef<number | null>(null);
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  });

  useEffect(() => {
    if (!active) {
      lastSecRef.current = null;
      return;
    }
    const remainingSec = Math.ceil(remainingMs / 1000);
    if (
      seconds > 0 &&
      remainingSec >= 1 &&
      remainingSec <= seconds &&
      lastSecRef.current !== remainingSec
    ) {
      lastSecRef.current = remainingSec;
      if (AppState.currentState === 'active') onTickRef.current(remainingSec);
    }
  }, [active, remainingMs, seconds]);
}
