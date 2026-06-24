import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FASTING_CARD_KEY = '@HealthConnect:fastingCardVisible';

// Defaults to visible so existing users see no change until they opt out.
let fastingCardVisible = true;
let initialized = false;
const listeners = new Set<(visible: boolean) => void>();

export async function initializeFastingCardVisibility(): Promise<void> {
  if (initialized) return;
  try {
    const saved = await AsyncStorage.getItem(FASTING_CARD_KEY);
    // A user toggle that landed during the await above already set
    // `initialized = true`; don't clobber their choice with stored state.
    if (!initialized && saved !== null) {
      fastingCardVisible = saved === 'true';
    }
  } catch {
    // fall back to default (visible)
  } finally {
    if (!initialized) {
      initialized = true;
      listeners.forEach((l) => l(fastingCardVisible));
    }
  }
}

export async function setFastingCardVisible(visible: boolean): Promise<void> {
  // An explicit user toggle wins over any still-pending initialize call.
  initialized = true;
  fastingCardVisible = visible;
  listeners.forEach((l) => l(visible));
  try {
    await AsyncStorage.setItem(FASTING_CARD_KEY, String(visible));
  } catch {
    // ignore — in-memory value still updates so the UI responds immediately
  }
}

export function useFastingCardVisible(): boolean {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => fastingCardVisible,
  );
}

export function getFastingCardVisible(): boolean {
  return fastingCardVisible;
}

/** Test-only helper — resets module-level state. */
export function __resetFastingCardVisibilityForTests(): void {
  fastingCardVisible = true;
  initialized = false;
  listeners.clear();
}
