import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  StyleSheet,
} from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

/**
 * How close to its deadline a rest must end to count as finished rather than
 * skipped. The store's deadline timer can fire a little late, never early.
 */
const FINISHED_SLACK_MS = 1000;

/**
 * Whether a rest that just left the resting state ran out on its own. A skip
 * or a set completed early also leaves the rest, but before its deadline.
 */
export function restRanOut(endsAt: number | null, now: number): boolean {
  return endsAt != null && now >= endsAt - FINISHED_SLACK_MS;
}

/**
 * A full-screen tint that pulses when a rest runs out, for a lifter who is
 * not looking at the timer or cannot hear the chime. Off unless chosen in
 * Workout settings; one soft pulse instead of two with Reduce Motion on.
 * It never takes touches.
 */
function RestCompleteFlash() {
  const enabled = useAppPreferencesStore((s) => s.restFlashEnabled);
  const state = useActiveWorkoutStore((s) => s.rest.state);
  const endsAt = useActiveWorkoutStore((s) => s.rest.endsAt);
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];
  const [opacity] = useState(() => new Animated.Value(0));
  const previous = useRef({ state, endsAt });

  useEffect(() => {
    const before = previous.current;
    previous.current = { state, endsAt };
    if (!enabled || before.state !== 'resting' || state === 'resting') return;
    if (!restRanOut(before.endsAt, Date.now())) return;
    if (AppState.currentState !== 'active') return;

    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduceMotion) => {
        if (cancelled) return;
        const pulse = (peak: number, ms: number) => [
          Animated.timing(opacity, {
            toValue: peak,
            duration: ms,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: ms,
            useNativeDriver: true,
          }),
        ];
        Animated.sequence(
          reduceMotion
            ? pulse(0.25, 400)
            : [...pulse(0.45, 180), ...pulse(0.45, 180)]
        ).start();
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, state, endsAt, opacity]);

  if (!enabled) return null;
  return (
    <Animated.View
      testID="rest-complete-flash"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: accent, opacity }]}
    />
  );
}

export default React.memo(RestCompleteFlash);
