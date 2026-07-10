import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, CalendarIcon } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, warn } from '@/utils/logging';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { addDays, localDateToDay, todayInZone } from '@workspace/shared';
import { useMemo } from 'react';

// Class applied to calendar days that carry a marker (e.g. days with progress
// photos). It renders a small dot at the bottom of the cell. The dot sits at
// z-20 so it stays visible above the z-10 day button even when the day is
// selected, and switches to the foreground color on the selected day for
// contrast against its filled background.
const MARKED_DAY_CLASS =
  "after:content-[''] after:pointer-events-none after:absolute after:bottom-1 " +
  'after:left-1/2 after:z-20 after:h-1.5 after:w-1.5 after:-translate-x-1/2 ' +
  'after:rounded-full after:bg-blue-500 ' +
  'data-[selected=true]:after:bg-primary-foreground';

interface DayNavigatorProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  className?: string;
  // Optional YYYY-MM-DD strings to mark with a dot in the calendar (e.g. days
  // that have progress photos). Omitted by callers that don't need markers.
  markedDates?: string[];
  // Legend label shown under the calendar when markedDates is provided.
  markedDatesLabel?: string;
}

const DayNavigator = ({
  selectedDate,
  onDateChange,
  className,
  markedDates,
  markedDatesLabel,
}: DayNavigatorProps) => {
  const { t } = useTranslation();
  const {
    formatDate,
    getDateRelationToToday,
    parseDateInUserTimezone,
    timezone,
    loggingLevel,
  } = usePreferences();

  const selectedPickerDate = parseDateInUserTimezone(selectedDate);
  const selectedDateRelation = getDateRelationToToday(selectedDate);

  // Convert marked day strings to Date objects the same way the selected date
  // is parsed, so a marker lands on exactly the cell that date would select.
  const markedDateObjects = useMemo(
    () =>
      (markedDates ?? [])
        .map((d) => parseDateInUserTimezone(d))
        .filter((d): d is Date => d instanceof Date && !isNaN(d.getTime())),
    [markedDates, parseDateInUserTimezone]
  );

  const handleDateSelect = (newDate: Date | undefined) => {
    debug(loggingLevel, 'Handling date select from calendar:', newDate);
    if (newDate) {
      const dateString = localDateToDay(newDate);
      info(loggingLevel, 'Date selected:', dateString);
      onDateChange(dateString);
    } else {
      warn(loggingLevel, 'Date select called with undefined date.');
    }
  };

  const handlePreviousDay = () => {
    debug(loggingLevel, 'Handling previous day button click.');
    onDateChange(addDays(selectedDate, -1));
  };

  const handleNextDay = () => {
    debug(loggingLevel, 'Handling next day button click.');
    onDateChange(addDays(selectedDate, 1));
  };

  const handleToday = () => {
    debug(loggingLevel, 'Handling today button click.');
    onDateChange(todayInZone(timezone));
  };

  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center mb-5 gap-2',
        className
      )}
    >
      <div className="flex justify-end">
        {selectedDateRelation !== 'today' && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-9 px-3 rounded-full border border-border/60"
            onClick={handleToday}
          >
            Today
          </Button>
        )}
      </div>
      <div
        className={cn(
          'relative flex items-center gap-0 rounded-full border border-border/60 bg-background overflow-hidden transition-colors',
          selectedDateRelation === 'past' && 'border-date-past/40',
          selectedDateRelation === 'future' && 'border-date-future/40',
          'h-12 sm:h-9'
        )}
      >
        {selectedDateRelation !== 'today' && (
          <div
            className={cn(
              'absolute inset-0 pointer-events-none z-10',
              selectedDateRelation === 'past' && 'bg-date-past/10',
              selectedDateRelation === 'future' && 'bg-date-future/10'
            )}
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePreviousDay}
          className="relative h-12 w-12 sm:h-9 sm:w-9 rounded-none border-r border-border/60"
        >
          <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-12 px-4 sm:h-9 rounded-none font-normal text-sm gap-2"
            >
              <CalendarIcon
                className={cn(
                  'h-4 w-4 sm:h-3.5 sm:w-3.5',
                  selectedDateRelation === 'past' && 'text-date-past',
                  selectedDateRelation === 'future' && 'text-date-future'
                )}
              />
              {selectedPickerDate ? (
                formatDate(selectedPickerDate)
              ) : (
                <span className="text-muted-foreground">
                  {t('foodDiary.pickADate', 'Pick a Date')}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center" sideOffset={8}>
            <Calendar
              mode="single"
              selected={selectedPickerDate}
              onSelect={handleDateSelect}
              yearsRange={10}
              modifiers={
                markedDateObjects.length > 0
                  ? { hasMarker: markedDateObjects }
                  : undefined
              }
              modifiersClassNames={{ hasMarker: MARKED_DAY_CLASS }}
              footer={
                markedDateObjects.length > 0 && markedDatesLabel ? (
                  <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    {markedDatesLabel}
                  </div>
                ) : undefined
              }
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNextDay}
          className="relative h-12 w-12 sm:h-9 sm:w-9 rounded-none border-l border-border/60"
        >
          <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
        </Button>
      </div>
      <div />
    </div>
  );
};

export default DayNavigator;
