import { whoopCSSVariables } from '@/lib/sleep/whoop-colors';
import { info } from '@/utils/logging';
import type React from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

type ThemeSetting = 'light' | 'dark' | 'whoop' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeSetting;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeSetting) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

import { usePreferences } from './PreferencesContext';

const getSystemTheme = (): ResolvedTheme => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
};

/** Apply WHOOP CSS custom properties to the root element */
const applyWhoopCSS = () => {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(whoopCSSVariables)) {
    root.style.setProperty(key, value);
  }
};

/** Remove WHOOP CSS custom properties from the root element */
const removeWhoopCSS = () => {
  const root = document.documentElement;
  for (const key of Object.keys(whoopCSSVariables)) {
    root.style.removeProperty(key);
  }
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { loggingLevel } = usePreferences();
  const previousTheme = useRef<ThemeSetting | null>(null);
  const [theme, setThemeState] = useState<ThemeSetting>(() => {
    const saved = localStorage.getItem('theme');
    const initialTheme = (saved as ThemeSetting) || 'system';
    info(
      loggingLevel,
      'ThemeProvider: Initial theme loaded from localStorage:',
      initialTheme
    );
    return initialTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    const saved = localStorage.getItem('theme') as ThemeSetting;
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    // WHOOP resolves as dark
    if (saved === 'whoop') {
      return 'dark';
    }
    return getSystemTheme();
  });

  // Listen for system theme changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const newResolvedTheme = e.matches ? 'dark' : 'light';
      info(
        loggingLevel,
        'ThemeProvider: System theme changed to:',
        newResolvedTheme
      );
      setResolvedTheme(newResolvedTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, loggingLevel]);

  // Update resolved theme when theme setting changes
  useEffect(() => {
    if (theme === 'system') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolvedTheme(getSystemTheme());
    } else if (theme === 'whoop') {
      setResolvedTheme('dark');
    } else {
      setResolvedTheme(theme);
    }
  }, [theme]);

  // Apply theme to DOM
  useEffect(() => {
    info(
      loggingLevel,
      'ThemeProvider: Theme changed, updating localStorage and DOM.',
      theme,
      'resolved:',
      resolvedTheme
    );
    localStorage.setItem('theme', theme);

    // Apply dark class for dark-based themes
    if (resolvedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // WHOOP theme: inject/remove CSS variables
    if (theme === 'whoop') {
      applyWhoopCSS();
    } else if (previousTheme.current === 'whoop') {
      removeWhoopCSS();
    }

    previousTheme.current = theme;
  }, [theme, resolvedTheme, loggingLevel]);

  const setTheme = (newTheme: ThemeSetting) => {
    info(loggingLevel, 'ThemeProvider: Setting theme to:', newTheme);
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => {
      const newTheme =
        prev === 'light'
          ? 'dark'
          : prev === 'dark'
            ? 'whoop'
            : prev === 'whoop'
              ? 'system'
              : 'light';
      info(loggingLevel, 'ThemeProvider: Toggling theme to:', newTheme);
      return newTheme;
    });
  };

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, setTheme, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
