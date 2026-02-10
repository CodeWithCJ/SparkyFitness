import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Uniwind, useUniwind } from 'uniwind';

const THEME_KEY = '@HealthConnect:appTheme';

export type ThemePreference = 'System' | 'Light' | 'Dark' | 'Amoled';

/**
 * Convert user-facing theme preference to Uniwind theme string
 */
function toUniwindTheme(pref: ThemePreference): 'system' | 'light' | 'dark' | 'amoled' {
  return pref === 'System' ? 'system' : (pref.toLowerCase() as 'light' | 'dark' | 'amoled');
}

/**
 * Convert Uniwind theme string to user-facing theme preference
 */
function fromUniwindTheme(theme: string, hasAdaptiveThemes: boolean): ThemePreference {
  if (hasAdaptiveThemes) return 'System';
  switch (theme) {
    case 'light': return 'Light';
    case 'dark': return 'Dark';
    case 'amoled': return 'Amoled';
    default: return 'System';
  }
}

/**
 * Load saved theme preference and apply it via Uniwind.
 * Call this once on app startup.
 */
export async function initializeTheme(): Promise<void> {
  try {
    const savedTheme = await AsyncStorage.getItem(THEME_KEY);
    const preference = savedTheme ? (savedTheme as ThemePreference) : 'System';
    Uniwind.setTheme(toUniwindTheme(preference));
  } catch (error) {
    console.error('Failed to load theme preference:', error);
    Uniwind.setTheme('system');
  }
}

/**
 * Set theme preference - saves to storage and updates Uniwind
 */
export async function setThemePreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_KEY, preference);
    Uniwind.setTheme(toUniwindTheme(preference));
  } catch (error) {
    console.error('Failed to save theme preference:', error);
  }
}

/**
 * Hook to get the current theme preference for UI display.
 * Returns the user-facing preference (System/Light/Dark/Amoled).
 */
export function useThemePreference(): ThemePreference {
  const { theme, hasAdaptiveThemes } = useUniwind();
  const [preference, setPreference] = useState<ThemePreference>('System');

  useEffect(() => {
    // Load saved preference to get accurate user selection
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (saved) {
        setPreference(saved as ThemePreference);
      } else {
        setPreference(fromUniwindTheme(theme, hasAdaptiveThemes));
      }
    });
  }, [theme, hasAdaptiveThemes]);

  return preference;
}
