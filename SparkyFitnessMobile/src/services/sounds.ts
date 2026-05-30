import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOUNDS_KEY = '@HealthConnect:soundsEnabled';

let soundsEnabled = true;
let initialized = false;
const listeners = new Set<(enabled: boolean) => void>();

export async function initializeSounds(): Promise<void> {
  if (initialized) return;
  try {
    const saved = await AsyncStorage.getItem(SOUNDS_KEY);
    // A user toggle that landed during the await above already set
    // `initialized = true`; don't clobber their choice with stored state.
    if (!initialized && saved !== null) {
      soundsEnabled = saved === 'true';
    }
  } catch {
    // fall back to default (enabled)
  } finally {
    if (!initialized) {
      initialized = true;
      listeners.forEach((l) => l(soundsEnabled));
    }
  }
}

export async function setSoundsEnabled(enabled: boolean): Promise<void> {
  // An explicit user toggle wins over any still-pending initializeSounds().
  initialized = true;
  soundsEnabled = enabled;
  listeners.forEach((l) => l(enabled));
  try {
    await AsyncStorage.setItem(SOUNDS_KEY, String(enabled));
  } catch {
    // ignore — in-memory value still updates so the camera responds immediately
  }
}

export function useSoundsEnabled(): boolean {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => soundsEnabled,
  );
}

export function getSoundsEnabled(): boolean {
  return soundsEnabled;
}

/** Test-only helper — resets module-level state. */
export function __resetSoundsStateForTests(): void {
  soundsEnabled = true;
  initialized = false;
  listeners.clear();
}
