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
          selectedDateRelation === 'past' && 'border-date-past/50',
          selectedDateRelation === 'future' && 'border-date-future/50'
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
          className="relative h-9 w-9 rounded-none border-r border-border/60"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-9 px-4 rounded-none font-normal text-sm gap-2"
            >
              <CalendarIcon
                className={cn(
                  'h-3.5 w-3.5',
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
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNextDay}
          className="relative h-9 w-9 rounded-none border-l border-border/60"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div />
    </div>
  );
};

export default DayNavigator;
