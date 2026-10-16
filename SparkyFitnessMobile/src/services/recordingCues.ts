import * as Speech from 'expo-speech';
import { getAppLocale } from '../localization';
import { addLog } from './LogService';
import {
  loadSpeechVoices,
  resolveSpeechVoice,
  speechVoicesReady,
} from './speechVoice';
import {
  beginCueDucking,
  endCueDucking,
  startRecordingCueSession,
  stopRecordingCueSession,
} from './sounds';

/**
 * Spoken cues for a GPS recording (split times, pauses). Separate from the
 * guided-workout narration in `speech.ts`, which is foreground-only and gated
 * on its own setting: a run is spoken with the screen locked.
 *
 * Fire-and-forget like the other cue services: a failure is logged and never
 * reaches the recording.
 */

// Bumped when a session ends, so a cue still waiting for the voices is dropped.
let sessionGeneration = 0;

/** Gets the audio session ready; call when a recording that speaks begins. */
export function beginRecordingCues(): void {
  void startRecordingCueSession();
  // Read the installed voices now so the first cue already uses the best one.
  void loadSpeechVoices(true);
}

/** Lets the audio session go; call when the recording ends. */
export function endRecordingCues(): void {
  sessionGeneration += 1;
  void stopRecordingCueSession();
}

/** Cuts off anything being said and lets the audio session go. */
export function stopRecordingCues(): void {
  try {
    void Speech.stop();
  } catch (error) {
    addLog(`stopRecordingCues failed: ${(error as Error).message}`, 'WARNING');
  }
  endRecordingCues();
}

/**
 * Says `text`, replacing anything still being read: a split announced behind a
 * stale "Paused" would be wrong by the time it was heard.
 */
export function speakRecordingCue(text: string, onFinished?: () => void): void {
  if (!text) return;
  // The first cue waits for the voices (the load beginRecordingCues started),
  // so it never falls back to the system voice while the pick is loading.
  if (speechVoicesReady()) {
    sayRecordingCue(text, onFinished);
    return;
  }
  const requested = sessionGeneration;
  void loadSpeechVoices().then(() => {
    if (requested === sessionGeneration) sayRecordingCue(text, onFinished);
  });
}

function sayRecordingCue(text: string, onFinished?: () => void): void {
  try {
    void Speech.stop();
    let ducked = false;
    const settle = () => {
      onFinished?.();
      if (ducked) {
        ducked = false;
        endCueDucking();
      }
    };
    const locale = getAppLocale();
    Speech.speak(text, {
      language: locale,
      voice: resolveSpeechVoice(locale),
      useApplicationAudioSession: true,
      onStart: () => {
        ducked = beginCueDucking();
      },
      onDone: settle,
      onStopped: settle,
      onError: (error) => {
        settle();
        addLog(`recording cue failed: ${error.message}`, 'WARNING');
      },
    });
  } catch (error) {
    addLog(`speakRecordingCue failed: ${(error as Error).message}`, 'ERROR');
  }
}
