import { Moon, Sun, Sunset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return <Moon className="h-4 w-4" />;
      case 'dark':
        return <Sunset className="h-4 w-4" />;
      case 'whoop':
        return <Sun className="h-4 w-4" />;
      case 'system':
        return <Moon className="h-4 w-4" />;
    }
  };

  const getLabel = () => {
    switch (theme) {
      case 'light':
        return 'Dark mode';
      case 'dark':
        return 'WHOOP theme';
      case 'whoop':
        return 'Light mode';
      case 'system':
        return 'Dark mode';
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className="w-9 h-9 p-0"
      title={getLabel()}
    >
      {getIcon()}
      <span className="sr-only">{getLabel()}</span>
    </Button>
  );
};

export default ThemeToggle;
