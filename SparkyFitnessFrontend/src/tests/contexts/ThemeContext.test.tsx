import { fireEvent, render, screen } from '@testing-library/react';
import ThemeToggle from '@/components/ThemeToggle';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ loggingLevel: 'SILENT' }),
}));

const ThemeProbe = () => {
  const { theme, resolvedTheme } = useTheme();

  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <ThemeToggle />
    </div>
  );
};

const renderThemeProbe = () =>
  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>
  );

const setSystemTheme = (theme: 'light' | 'dark') => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string): MediaQueryList => ({
      matches: theme === 'dark',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => false),
    })),
  });
};

describe('ThemeContext toggleTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    setSystemTheme('light');
  });

  it('cycles system light through dark and WHOOP before returning to system', () => {
    renderThemeProbe();

    expect(screen.getByTestId('theme').textContent).toBe('system');
    expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
    expect(
      screen.getByTitle('Dark mode').querySelector('.lucide-moon')
    ).not.toBeNull();

    fireEvent.click(screen.getByTitle('Dark mode'));

    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(
      screen.getByTitle('WHOOP theme').querySelector('.lucide-sunset')
    ).not.toBeNull();

    fireEvent.click(screen.getByTitle('WHOOP theme'));

    expect(screen.getByTestId('theme').textContent).toBe('whoop');
    expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('whoop');
    expect(
      screen.getByTitle('Light mode').querySelector('.lucide-sun')
    ).not.toBeNull();

    fireEvent.click(screen.getByTitle('Light mode'));

    expect(screen.getByTestId('theme').textContent).toBe('system');
    expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('system');
    expect(
      screen.getByTitle('Dark mode').querySelector('.lucide-moon')
    ).not.toBeNull();
  });

  it('cycles system dark through WHOOP and light before returning to system', () => {
    setSystemTheme('dark');
    renderThemeProbe();

    expect(screen.getByTestId('theme').textContent).toBe('system');
    expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(
      screen.getByTitle('WHOOP theme').querySelector('.lucide-sunset')
    ).not.toBeNull();

    fireEvent.click(screen.getByTitle('WHOOP theme'));

    expect(screen.getByTestId('theme').textContent).toBe('whoop');
    expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('whoop');
    expect(
      screen.getByTitle('Light mode').querySelector('.lucide-sun')
    ).not.toBeNull();

    fireEvent.click(screen.getByTitle('Light mode'));

    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(screen.getByTestId('resolved-theme').textContent).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
    expect(
      screen.getByTitle('Dark mode').querySelector('.lucide-moon')
    ).not.toBeNull();

    fireEvent.click(screen.getByTitle('Dark mode'));

    expect(screen.getByTestId('theme').textContent).toBe('system');
    expect(screen.getByTestId('resolved-theme').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('system');
    expect(
      screen.getByTitle('WHOOP theme').querySelector('.lucide-sunset')
    ).not.toBeNull();
  });
});
