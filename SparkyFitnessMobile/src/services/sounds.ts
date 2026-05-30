import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOUNDS_KEY = '@HealthConnect:soundsEnabled';

let soundsEnabled = true;
const listeners = new Set<(enabled: boolean) => void>();

export async function initializeSounds(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(SOUNDS_KEY);
    if (saved !== null) soundsEnabled = saved === 'true';
  } catch {
    // fall back to default (enabled)
  }
}

export async function setSoundsEnabled(enabled: boolean): Promise<void> {
  soundsEnabled = enabled;
  listeners.forEach((l) => l(enabled));
  try {
    await AsyncStorage.setItem(SOUNDS_KEY, String(enabled));
  } catch {
    // ignore — in-memory value still updates so the camera responds immediately
  }
}

export function useSoundsEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(soundsEnabled);
  useEffect(() => {
    listeners.add(setEnabled);
    AsyncStorage.getItem(SOUNDS_KEY).then((saved) => {
      if (saved !== null) setEnabled(saved === 'true');
    });
    return () => {
      listeners.delete(setEnabled);
    };
  }, []);
  return enabled;
}

export function getSoundsEnabled(): boolean {
  return soundsEnabled;
}
