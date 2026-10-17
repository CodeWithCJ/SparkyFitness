import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { WorkoutFormat } from '@workspace/shared';
import {
  startIntervalAudioSession,
  stopIntervalAudioSession,
} from '../services/sounds';
import { stopGuidedSpeech } from '../services/speech';

/**
 * Manages interval audio session lifecycle (enabling audio mid-workout in silent mode).
 * The elapsed clock and the interval HUD tick on their own (`useClockTick`), so
 * the screen hosting this hook does not re-render every second.
 *
 * Guided mode (#1507) opts into the same session: turning it on is the user's
 * choice to hear cues with the phone pocketed on silent, exactly like picking
 * a clock-driven format. With neither, the audio mode is never touched.
 */
export function useActiveWorkoutIntervalLifecycle(
  workoutFormat?: WorkoutFormat | null,
  guidedWorkoutEnabled = false
): void {
  const needsAudioSession =
    (workoutFormat != null && workoutFormat !== 'standard') ||
    guidedWorkoutEnabled;

  // Interval audio session management: keep background/silent-mode audio active
  // for countdown beeps, phase cues and guided narration.
  useEffect(() => {
    if (!needsAudioSession) return;
    void startIntervalAudioSession();
    return () => {
      void stopIntervalAudioSession();
    };
  }, [needsAudioSession]);

  // Narration queued while backgrounded would play late and out of step with
  // the clock, so leaving the app drops it; the next cue resumes on return.
  useEffect(() => {
    if (!guidedWorkoutEnabled) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') stopGuidedSpeech();
    });
    return () => sub.remove();
  }, [guidedWorkoutEnabled]);
}
