import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface TimezoneSelectProps {
  value: string;
  onValueChange: (value: string) => void;
}

// Common aliases that supportedValuesOf may omit but the app accepts
const EXTRA_TIMEZONES = ['UTC', 'Etc/UTC', 'Etc/GMT'];

function getSupportedTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    // Fallback for environments without supportedValuesOf (older WebViews)
    return [
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...EXTRA_TIMEZONES,
    ];
  }
}

function getTimezoneOffset(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(new Date());
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');
    return offsetPart?.value ?? '';
  } catch {
    return '';
  }
}

function formatTimezoneLabel(tz: string): string {
  const offset = getTimezoneOffset(tz);
  const display = tz.replace(/_/g, ' ');
  return offset ? `${display} (${offset})` : display;
}

export const TimezoneSelect = ({
  value,
  onValueChange,
}: TimezoneSelectProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const timezones = useMemo(() => {
    const canonical = getSupportedTimezones();
    const set = new Set(canonical);
    for (const tz of EXTRA_TIMEZONES) {
      set.add(tz);
    }
    // Ensure the currently stored value is always in the list
    if (value && !set.has(value)) {
      set.add(value);
    }
    return Array.from(set).map((tz) => ({
      value: tz,
      label: formatTimezoneLabel(tz),
      searchLabel: tz.replace(/_/g, ' ').toLowerCase(),
    }));
  }, [value]);

  const filtered = useMemo(() => {
    if (!search) return timezones;
    const lower = search.toLowerCase();
    return timezones.filter((tz) => tz.searchLabel.includes(lower));
  }, [timezones, search]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value
              ? formatTimezoneLabel(value)
              : t('settings.preferences.selectTimezone', 'Select timezone...')}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <div className="p-2">
          <Input
            ref={inputRef}
            placeholder={t(
              'settings.preferences.searchTimezones',
              'Search timezones...'
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-60 overflow-y-auto px-1 pb-1">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t('settings.preferences.noTimezoneFound', 'No timezone found.')}
            </div>
          ) : (
            filtered.map((tz) => (
              <button
                key={tz.value}
                type="button"
                className={cn(
                  'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                  value === tz.value && 'bg-accent text-accent-foreground'
                )}
                onClick={() => {
                  onValueChange(tz.value);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4 shrink-0',
                    value === tz.value ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span className="truncate">{tz.label}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
