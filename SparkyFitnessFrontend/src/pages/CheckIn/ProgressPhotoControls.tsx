import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarIcon } from 'lucide-react';
import { localDateToDay, type PhotoType } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { usePreferences } from '@/contexts/PreferencesContext';
import { cn } from '@/lib/utils';
import { formatWeight } from '@/utils/numberFormatting';
import { PHOTO_ANGLES } from '@/utils/progressPhotos';

interface PhotoAngleToggleProps {
  value: PhotoType;
  onChange: (angle: PhotoType) => void;
}

/** Front / Back / Side, as one segmented control. */
export const PhotoAngleToggle = ({
  value,
  onChange,
}: PhotoAngleToggleProps) => {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('checkIn.photos.angle', 'Angle')}
      className="inline-flex rounded-full border border-border/60 p-0.5"
    >
      {PHOTO_ANGLES.map(({ type, labelKey, defaultLabel }) => (
        <Button
          key={type}
          type="button"
          size="sm"
          variant={value === type ? 'secondary' : 'ghost'}
          aria-pressed={value === type}
          className="h-8 rounded-full px-3 text-xs"
          onClick={() => onChange(type)}
        >
          {t(labelKey, defaultLabel)}
        </Button>
      ))}
    </div>
  );
};

interface PhotoDayWeightProps {
  /** The day's weight in kg, or null when none was logged. */
  weight: number | null;
  date: string;
  /** When given, a day without a weight offers to log one. */
  onLogWeight?: (date: string) => void;
  className?: string;
}

/** The weight logged on a photo's day, or a way to log it. */
export const PhotoDayWeight = ({
  weight,
  date,
  onLogWeight,
  className,
}: PhotoDayWeightProps) => {
  const { t } = useTranslation();
  const { weightUnit } = usePreferences();

  if (weight != null) {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>
        {formatWeight(weight, weightUnit)}
      </span>
    );
  }
  if (!onLogWeight) {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>
        {t('checkIn.photos.noWeight', 'No weight logged')}
      </span>
    );
  }
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className={cn('h-auto p-0 text-sm underline', className)}
      onClick={() => onLogWeight(date)}
    >
      {t('checkIn.photos.logWeight', 'Log weight')}
    </Button>
  );
};

interface PhotoDayPickerProps {
  /** The day shown on the button (YYYY-MM-DD). */
  value: string;
  /** The only days that can be picked: the ones with a photo of this angle. */
  availableDates: string[];
  onSelect: (date: string) => void;
  /** Accessible name, e.g. "Choose the Before day". */
  label: string;
}

/**
 * A date button whose calendar only lets you pick days that have a photo, so
 * there is no "no photo on that day" error to recover from.
 */
export const PhotoDayPicker = ({
  value,
  availableDates,
  onSelect,
  label,
}: PhotoDayPickerProps) => {
  const { formatDate, parseDateInUserTimezone } = usePreferences();
  const [open, setOpen] = useState(false);
  const available = useMemo(() => new Set(availableDates), [availableDates]);
  const selected = parseDateInUserTimezone(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-2 font-semibold"
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {/* The visible date stays part of the name, so screen readers hear
              which day is shown and voice control can target what is seen. */}
          <span className="sr-only">{label}: </span>
          {formatDate(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center" sideOffset={8}>
        <Calendar
          mode="single"
          // Clicking the day already shown picks it again (and closes) rather
          // than clearing the selection.
          required
          selected={selected}
          defaultMonth={selected}
          disabled={(date) => !available.has(localDateToDay(date))}
          onSelect={(date: Date) => {
            onSelect(localDateToDay(date));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
