import * as Speech from 'expo-speech';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  bestVoiceId,
  primaryLanguage,
  type SpeechVoice,
} from '../utils/speechVoices';
import { addLog } from './LogService';

/**
 * The voice spoken cues use, shared by guided workouts and GPS recordings.
 * Speaking is synchronous, so the installed voices are read ahead of time
 * (`loadSpeechVoices`) and `resolveSpeechVoice` answers from that copy.
 */

let installed: SpeechVoice[] | null = null;
let loading: Promise<SpeechVoice[]> | null = null;

/** True when the installed voices are read and no refresh is under way. */
export function speechVoicesReady(): boolean {
  return installed !== null && loading === null;
}

/**
 * Reads the installed voices; empty on failure. Cached until `refresh`, and a
 * read already under way is shared, so callers can wait for it.
 */
export function loadSpeechVoices(refresh = false): Promise<SpeechVoice[]> {
  if (loading) return loading;
  if (installed && !refresh) return Promise.resolve(installed);
  loading = (async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      installed = voices.map((v) => ({
        identifier: v.identifier,
        name: v.name,
        language: v.language,
        quality: v.quality,
      }));
      return installed;
    } catch (err) {
      // Not cached, so the next call tries again.
      addLog(`loadSpeechVoices failed: ${(err as Error).message}`, 'WARNING');
      return [];
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/**
 * The voice identifier to speak with: the person's pick while it is still
 * installed, otherwise the best premium or enhanced voice for the language,
 * otherwise undefined (the system default). Undefined too until the voices
 * have been read, so a stale pick can never be sent to the speech engine.
 */
export function resolveSpeechVoice(locale: string): string | undefined {
  if (!installed) return undefined;
  const picked = useAppPreferencesStore.getState().guidedVoiceId;
  // `voice` overrides `language`, so a pick only counts in its own language.
  const pickedVoice = picked
    ? installed.find((v) => v.identifier === picked)
    : undefined;
  if (
    pickedVoice &&
    primaryLanguage(pickedVoice.language) === primaryLanguage(locale)
  ) {
    return pickedVoice.identifier;
  }
  return bestVoiceId(installed, locale) ?? undefined;
}

/** Test-only helper. */
export function __resetSpeechVoicesForTests(): void {
  installed = null;
  loading = null;
}
