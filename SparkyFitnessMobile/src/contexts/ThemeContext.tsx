import React, { createContext, useState, useEffect, useContext } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@HealthConnect:appTheme';

export interface ThemeColors {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  navBar: string;
  navBarBorder: string;
  inputBackground: string;
  tagBackground: string;
  metricBackground: string;
  // Status colors
  success: string;
  successBackground: string;
  warning: string;
  warningBackground: string;
  warningText: string;
  danger: string;
  dangerBackground: string;
}

export type ThemePreference = 'System' | 'Light' | 'Dark' | 'Amoled';
export type EffectiveTheme = 'light' | 'dark' | 'amoled';

export interface ThemeContextValue {
  theme: ThemePreference;
  effectiveTheme: EffectiveTheme;
  isDarkMode: boolean;
  isAmoled: boolean;
  colors: ThemeColors;
  setTheme: (theme: ThemePreference) => Promise<void>;
  isLoading: boolean;
}

// Theme color definitions
export const lightColors: ThemeColors = {
  background: '#f0f2f5',
  card: '#fff',
  text: '#333',
  textSecondary: '#555',
  textMuted: '#777',
  border: '#ddd',
  primary: '#007bff',
  navBar: '#fff',
  navBarBorder: '#eee',
  inputBackground: '#fff',
  tagBackground: '#e0e0e0',
  metricBackground: '#f9f9f9', // Distinct light grey for metric items
  // Status colors
  success: '#28a745',
  successBackground: '#e6ffe6',
  warning: '#ffc107',
  warningBackground: '#fff3cd',
  warningText: '#856404',
  danger: '#dc3545',
  dangerBackground: '#ffe6e6',
};

export const darkColors: ThemeColors = {
  background: '#121212',
  card: '#1e1e1e',
  text: '#e0e0e0',
  textSecondary: '#b0b0b0',
  textMuted: '#888',
  border: '#333',
  primary: '#4da6ff',
  navBar: '#1e1e1e',
  navBarBorder: '#333',
  inputBackground: '#2c2c2c',
  tagBackground: '#3a3a3a',
  metricBackground: '#2c2c2c', // Dark grey for metric items
  // Status colors
  success: '#4ade80',
  successBackground: '#14532d',
  warning: '#facc15',
  warningBackground: '#422006',
  warningText: '#fef08a',
  danger: '#f87171',
  dangerBackground: '#450a0a',
};

export const amoledColors: ThemeColors = {
  background: '#000000',
  card: '#0a0a0a',
  text: '#ffffff',
  textSecondary: '#b0b0b0',
  textMuted: '#888',
  border: '#1a1a1a',
  primary: '#4da6ff',
  navBar: '#000000',
  navBarBorder: '#1a1a1a',
  inputBackground: '#0f0f0f',
  tagBackground: '#1a1a1a',
  metricBackground: '#1a1a1a', // Darker grey for metric items
  // Status colors
  success: '#4ade80',
  successBackground: '#0a2e14',
  warning: '#facc15',
  warningBackground: '#2a1503',
  warningText: '#fef08a',
  danger: '#f87171',
  dangerBackground: '#2a0505',
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'System',
  effectiveTheme: 'light',
  isDarkMode: false,
  isAmoled: false,
  colors: lightColors,
  setTheme: async () => { },
  isLoading: true,
});

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemePreference>('System');
  const [isLoading, setIsLoading] = useState(true);

  // Load saved theme preference on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_KEY);
        if (savedTheme) {
          setThemeState(savedTheme as ThemePreference);
        }
      } catch (error) {
        console.error('Failed to load theme preference:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadTheme();
  }, []);

  // Save theme preference
  const setTheme = async (newTheme: ThemePreference): Promise<void> => {
    try {
      setThemeState(newTheme);
      await AsyncStorage.setItem(THEME_KEY, newTheme);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  // Calculate effective theme based on user preference and system setting
  const effectiveTheme: EffectiveTheme = (() => {
    if (theme === 'System') {
      return (systemColorScheme || 'light') as EffectiveTheme;
    }
    return theme.toLowerCase() as EffectiveTheme;
  })();

  const isDarkMode = effectiveTheme === 'dark' || effectiveTheme === 'amoled';
  const isAmoled = effectiveTheme === 'amoled';

  const colors: ThemeColors = (() => {
    if (effectiveTheme === 'amoled') return amoledColors;
    if (effectiveTheme === 'dark') return darkColors;
    return lightColors;
  })();

  const value: ThemeContextValue = {
    theme,
    effectiveTheme,
    isDarkMode,
    isAmoled,
    colors,
    setTheme,
    isLoading,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
