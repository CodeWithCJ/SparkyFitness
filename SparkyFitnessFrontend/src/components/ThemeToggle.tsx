import { Moon, Sun, Monitor, Activity, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  const getIcon = () => {
    switch (theme) {
      case 'light':
        return (
          <Sun className="h-4 w-4 text-amber-500 transition-all duration-300" />
        );
      case 'dark':
        return (
          <Moon className="h-4 w-4 text-indigo-400 transition-all duration-300" />
        );
      case 'system':
        return (
          <Monitor className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        );
      case 'whoop':
        return <Activity className="h-4 w-4 text-red-500 animate-pulse" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const themes = [
    {
      id: 'light',
      label: t('theme.light', 'Light'),
      icon: Sun,
      color: 'text-amber-500',
    },
    {
      id: 'dark',
      label: t('theme.dark', 'Dark'),
      icon: Moon,
      color: 'text-indigo-400',
    },
    {
      id: 'system',
      label: t('theme.system', 'System'),
      icon: Monitor,
      color: 'text-slate-500 dark:text-slate-400',
    },
    {
      id: 'whoop',
      label: t('theme.whoop', 'WHOOP'),
      icon: Activity,
      color: 'text-red-500',
    },
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-9 h-9 p-0 rounded-lg hover:bg-muted/80 border-slate-200 dark:border-slate-800 transition-all relative overflow-hidden group"
          title={t('theme.title', 'Change theme')}
        >
          <div className="transition-transform duration-300 group-hover:scale-110">
            {getIcon()}
          </div>
          <span className="sr-only">{t('theme.title', 'Change theme')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-40 border-slate-200 dark:border-slate-800 rounded-xl p-1 bg-popover text-popover-foreground shadow-md"
      >
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1">
          {t('theme.choose', 'Select Theme')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-200/50 dark:bg-slate-800/50" />
        {themes.map(({ id, label, icon: Icon, color }) => {
          const isActive = theme === id;
          return (
            <DropdownMenuItem
              key={id}
              onClick={() => setTheme(id)}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer text-sm transition-all hover:bg-slate-100 dark:hover:bg-slate-800 ${
                isActive
                  ? 'font-medium text-foreground bg-slate-50 dark:bg-slate-900'
                  : 'text-muted-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={`h-4 w-4 ${color} ${id === 'whoop' && isActive ? 'animate-pulse' : ''}`}
                />
                <span>{label}</span>
              </div>
              {isActive && <Check className="h-4 w-4 text-emerald-500" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
