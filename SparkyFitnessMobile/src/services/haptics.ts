import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const HAPTICS_KEY = '@HealthConnect:hapticsEnabled';

let hapticsEnabled = true;
const listeners = new Set<(enabled: boolean) => void>();

export async function initializeHaptics(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(HAPTICS_KEY);
    if (saved !== null) hapticsEnabled = saved === 'true';
  } catch {
    // fall back to default (enabled)
  }
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  hapticsEnabled = enabled;
  listeners.forEach((l) => l(enabled));
  try {
    await AsyncStorage.setItem(HAPTICS_KEY, String(enabled));
  } catch {
    // ignore — in-memory value still updates so the user gets feedback
  }
}

export function useHapticsEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(hapticsEnabled);
  useEffect(() => {
    listeners.add(setEnabled);
    AsyncStorage.getItem(HAPTICS_KEY).then((saved) => {
      if (saved !== null) setEnabled(saved === 'true');
    });
    return () => {
      listeners.delete(setEnabled);
    };
  }, []);
  return enabled;
}

export function fireSuccessHaptic(): void {
  if (!hapticsEnabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
