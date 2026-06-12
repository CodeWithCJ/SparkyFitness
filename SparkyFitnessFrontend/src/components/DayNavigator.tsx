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

interface DayNavigatorProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  className?: string;
}

const DayNavigator = ({
  selectedDate,
  onDateChange,
  className,
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
  const selectedDateDisplay = formatDate(selectedPickerDate);
  const selectedDateLabel =
    selectedDateRelation === 'past'
      ? 'Past Day'
      : selectedDateRelation === 'future'
        ? 'Future Day'
        : '';

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
    <div className={cn('space-y-5', className)}>
      {selectedDateRelation !== 'today' && (
        <div
          className={cn(
            'fixed top-2 left-2 right-2 z-40 rounded-lg border px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-opacity-95 sm:top-3 sm:left-1/2 sm:right-auto sm:w-[calc(100vw-2rem)] sm:max-w-[1400px] sm:-translate-x-1/2 sm:rounded-xl',
            selectedDateRelation === 'past' &&
              'border-date-past/40 bg-date-past/10 text-foreground dark:border-date-past/60 dark:bg-date-past/20',
            selectedDateRelation === 'future' &&
              'border-date-future/40 bg-date-future/10 text-foreground dark:border-date-future/60 dark:bg-date-future/20'
          )}
        >
          <div className="relative pr-24 sm:pr-28">
            <div className="flex items-start gap-3">
              <CalendarIcon
                className={cn(
                  'mt-0.5 h-5 w-5 shrink-0',
                  selectedDateRelation === 'past' && 'text-date-past',
                  selectedDateRelation === 'future' && 'text-date-future'
                )}
              />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">
                  {selectedDateLabel}: {selectedDateDisplay}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              className="absolute right-0 top-1/2 -translate-y-1/2"
            >
              Today
            </Button>
          </div>
        </div>
      )}
      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2'
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
            selectedDateRelation === 'past' && 'border-date-past/50',
            selectedDateRelation === 'future' && 'border-date-future/50',
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
            <PopoverContent
              className="w-auto p-0"
              align="center"
              sideOffset={8}
            >
              <Calendar
                mode="single"
                selected={selectedPickerDate}
                onSelect={handleDateSelect}
                yearsRange={10}
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
    </div>
  );
};

export default DayNavigator;
