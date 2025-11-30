import React, { createContext, useState, useEffect, useContext } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@HealthConnect:appTheme';

// Theme color definitions
export const lightColors = {
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
};

export const darkColors = {
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
};

export const amoledColors = {
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
};

const ThemeContext = createContext({
  theme: 'System',
  effectiveTheme: 'light',
  isDarkMode: false,
  isAmoled: false,
  colors: lightColors,
  setTheme: async () => {},
});

export const ThemeProvider = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState('System');
  const [isLoading, setIsLoading] = useState(true);

  // Load saved theme preference on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_KEY);
        if (savedTheme) {
          setThemeState(savedTheme);
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
  const setTheme = async (newTheme) => {
    try {
      setThemeState(newTheme);
      await AsyncStorage.setItem(THEME_KEY, newTheme);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  // Calculate effective theme based on user preference and system setting
  const effectiveTheme = (() => {
    if (theme === 'System') {
      return systemColorScheme || 'light';
    }
    return theme.toLowerCase();
  })();

  const isDarkMode = effectiveTheme === 'dark' || effectiveTheme === 'amoled';
  const isAmoled = effectiveTheme === 'amoled';
  
  const colors = (() => {
    if (effectiveTheme === 'amoled') return amoledColors;
    if (effectiveTheme === 'dark') return darkColors;
    return lightColors;
  })();

  const value = {
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

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
