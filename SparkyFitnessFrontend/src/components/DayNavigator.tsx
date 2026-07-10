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
  const formattedSelectedDate = selectedPickerDate
    ? formatDate(selectedPickerDate)
    : t('common.pickADate');

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
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-9 px-3 rounded-full border border-border/60"
            onClick={handleToday}
          >
            {t('common.today')}
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
          type="button"
          variant="ghost"
          size="icon"
          onClick={handlePreviousDay}
          className="relative h-12 w-12 sm:h-9 sm:w-9 rounded-none border-e border-border/60"
          aria-label={t('common.previousDay')}
        >
          <ChevronLeft
            className="h-5 w-5 sm:h-4 sm:w-4 rtl:rotate-180"
            aria-hidden="true"
          />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="relative h-12 px-4 sm:h-9 rounded-none font-normal text-sm gap-2"
              aria-label={t('common.openDatePicker', {
                date: formattedSelectedDate,
              })}
            >
              <CalendarIcon
                className={cn(
                  'h-4 w-4 sm:h-3.5 sm:w-3.5',
                  selectedDateRelation === 'past' && 'text-date-past',
                  selectedDateRelation === 'future' && 'text-date-future'
                )}
              />
              {selectedPickerDate ? (
                formattedSelectedDate
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
            />
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleNextDay}
          className="relative h-12 w-12 sm:h-9 sm:w-9 rounded-none border-s border-border/60"
          aria-label={t('common.nextDay')}
        >
          <ChevronRight
            className="h-5 w-5 sm:h-4 sm:w-4 rtl:rotate-180"
            aria-hidden="true"
          />
        </Button>
      </div>
      <div />
    </div>
  );
};

export default DayNavigator;
