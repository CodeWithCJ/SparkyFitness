
import React, { createContext, useContext, useEffect, useState } from 'react';
import { debug, info, warn, error } from '@/utils/logging';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

import { usePreferences } from './PreferencesContext';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loggingLevel } = usePreferences();
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    const initialTheme = (saved as Theme) || 'light';
    info(loggingLevel, "ThemeProvider: Initial theme loaded from localStorage:", initialTheme);
    return initialTheme;
  });

  useEffect(() => {
    info(loggingLevel, "ThemeProvider: Theme changed, updating localStorage and DOM.", theme);
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme, loggingLevel]);

  const toggleTheme = () => {
    setTheme(prev => {
      const newTheme = prev === 'light' ? 'dark' : 'light';
      info(loggingLevel, "ThemeProvider: Toggling theme to:", newTheme);
      return newTheme;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
