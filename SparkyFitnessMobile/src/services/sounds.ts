import { AppState } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { addLog } from './LogService';

let restChimePlayer: AudioPlayer | null = null;
let audioModeConfigured = false;

/**
 * Whether the rest-timer chime should play. Also consulted by the foreground
 * notification handler: while the chime owns the foreground cue, the
 * rest-complete notification's default sound is suppressed so the two never
 * ding on top of each other.
 */
export function isRestTimerSoundEnabled(): boolean {
  // Independent of `soundsEnabled`, which the settings UI presents as the
  // camera-shutter toggle.
  return useAppPreferencesStore.getState().restTimerSoundEnabled;
}

/**
 * Plays the rest-complete chime. Foreground-only by design — in the background
 * the scheduled notification's sound is the cue. Fire-and-forget: playback
 * failures log but never propagate into rest-state transitions.
 */
export function playRestCompleteSound(): void {
  if (!isRestTimerSoundEnabled()) return;
  if (AppState.currentState !== 'active') return;
  void (async () => {
    try {
      if (!audioModeConfigured) {
        try {
          // Short UI cue: mix with (never duck) the user's music, and stay
          // silent when the ringer/silent switch is off — the haptic still fires.
          await setAudioModeAsync({
            playsInSilentMode: false,
            interruptionMode: 'mixWithOthers',
          });
          audioModeConfigured = true;
        } catch (err) {
          // Retry on the next chime; a config failure must not mute the cue.
          addLog(`rest chime audio mode config failed: ${(err as Error).message}`, 'WARNING');
        }
      }
      if (restChimePlayer == null) {
        restChimePlayer = createAudioPlayer(require('../../assets/sounds/rest-chime.wav'));
      }
      await restChimePlayer.seekTo(0);
      restChimePlayer.play();
    } catch (err) {
      addLog(`playRestCompleteSound failed: ${(err as Error).message}`, 'ERROR');
    }
  })();
}

/** Test-only helper — drops the cached player and audio-mode flag. */
export function __resetSoundsForTests(): void {
  restChimePlayer = null;
  audioModeConfigured = false;
}
