import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Speech from 'expo-speech';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { addLog } from './LogService';
import { beginCueDucking, endCueDucking } from './sounds';
import {
  loadSpeechVoices,
  resolveSpeechVoice,
  speechVoicesReady,
} from './speechVoice';
import { getAppLocale } from '../localization';

/**
 * Guided workout narration (#1507). Mirrors `sounds.ts`: a preference check,
 * fire-and-forget calls, failures logged and never thrown into workout state.
 *
 * Speech never configures the audio mode itself. It speaks through the app's
 * audio session (`useApplicationAudioSession`), which the active workout
 * configures with `startIntervalAudioSession()` while guided mode or an
 * interval format is running — so it follows that session's silent-mode and
 * mix-with-music behaviour. The one exception is the opt-in music ducking
 * (`beginCueDucking` in sounds.ts), held for as long as each line is spoken.
 */

/** A queue deeper than this is dropped rather than read late. */
const MAX_QUEUED_UTTERANCES = 20;

let pending = 0;
// Bumped by every stop, so a cue still waiting for the voices is dropped.
let generation = 0;

// Per-workout session state shared by the guided card and the interval HUD:
// the voice mute (not a saved setting) and the caption of the line being
// spoken. Captions keep working while muted, as a silent alternative.
let muted = false;
let caption: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setCaption(text: string | null): void {
  if (caption === text) return;
  caption = text;
  emit();
}

export function setGuidedSpeechMuted(value: boolean): void {
  muted = value;
  if (value) stopGuidedSpeech();
  emit();
}

export function useGuidedSpeechMuted(): boolean {
  return useSyncExternalStore(subscribe, () => muted);
}

/** The line being spoken now (or that would be, while muted). */
export function useGuidedCaption(): string | null {
  return useSyncExternalStore(subscribe, () => caption);
}

/** Clears mute and caption when a guided view goes away. */
export function resetGuidedSpeechSession(): void {
  muted = false;
  caption = null;
  emit();
}

export function isGuidedWorkoutEnabled(): boolean {
  return useAppPreferencesStore.getState().guidedWorkoutEnabled;
}

/**
 * Speaks `lines` in order. `interrupt` cancels whatever is still being read
 * first, so a new set or phase is never announced behind a stale one.
 * Foreground-only: speech queued while backgrounded would fire late and out of
 * step with the clock.
 */
export function speakGuided(
  lines: readonly string[],
  options: { interrupt?: boolean; language?: string } = {}
): void {
  if (!isGuidedWorkoutEnabled() || lines.length === 0) return;
  if (AppState.currentState !== 'active') return;
  // A new batch replaces the caption; a queued one (e.g. "Halfway") takes
  // over as it starts speaking.
  if (options.interrupt || pending === 0 || muted) setCaption(lines[0] ?? null);
  if (muted) return;
  const requested = generation;
  const dispatch = () => {
    if (muted || requested !== generation) return;
    const { guidedSpeechRate } = useAppPreferencesStore.getState();
    const voice = resolveSpeechVoice(options.language ?? getAppLocale());
    try {
      if (options.interrupt) stopGuidedSpeech();
      for (const text of lines) {
        if (pending >= MAX_QUEUED_UTTERANCES) {
          addLog('guided speech queue full; dropping cue', 'WARNING');
          return;
        }
        pending += 1;
        let ducked = false;
        const settle = () => {
          pending = Math.max(0, pending - 1);
          if (ducked) {
            ducked = false;
            endCueDucking();
          }
        };
        Speech.speak(text, {
          language: options.language,
          voice,
          rate: guidedSpeechRate,
          useApplicationAudioSession: true,
          onStart: () => {
            setCaption(text);
            ducked = beginCueDucking();
          },
          onDone: settle,
          onStopped: settle,
          onError: (err) => {
            settle();
            addLog(`guided speech failed: ${err.message}`, 'WARNING');
          },
        });
      }
    } catch (err) {
      addLog(`speakGuided failed: ${(err as Error).message}`, 'ERROR');
    }
  };
  // The first cue waits for the voices, so it never falls back to the system
  // voice while the selected one is still loading.
  if (speechVoicesReady()) dispatch();
  else void loadSpeechVoices().then(dispatch);
}

/** Cancels current and queued narration. Safe to call when nothing is speaking. */
export function stopGuidedSpeech(): void {
  pending = 0;
  generation += 1;
  try {
    void Speech.stop();
  } catch (err) {
    addLog(`stopGuidedSpeech failed: ${(err as Error).message}`, 'WARNING');
  }
}

export interface GuidedVoiceOption {
  identifier: string;
  name: string;
  language: string;
}

/** Installed TTS voices, sorted by language then name. Empty on failure. */
export async function listGuidedVoices(): Promise<GuidedVoiceOption[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices
      .map((v) => ({
        identifier: v.identifier,
        name: v.name,
        language: v.language,
      }))
      .sort(
        (a, b) =>
          a.language.localeCompare(b.language) || a.name.localeCompare(b.name)
      );
  } catch (err) {
    addLog(`listGuidedVoices failed: ${(err as Error).message}`, 'WARNING');
    return [];
  }
}

/** Test-only helper — clears the queue counter. */
export function __resetSpeechForTests(): void {
  pending = 0;
  generation = 0;
  muted = false;
  caption = null;
}
