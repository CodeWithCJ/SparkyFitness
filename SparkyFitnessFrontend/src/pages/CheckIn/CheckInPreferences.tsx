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
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface CheckInPreferencesProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

const CheckInPreferences = ({
  selectedDate,
  onDateChange,
}: CheckInPreferencesProps) => {
  const { t } = useTranslation();
  const {
    formatDate,
    getDateRelationToToday,
    parseDateInUserTimezone,
    loggingLevel,
  } = usePreferences();
  debug(loggingLevel, 'CheckInPreferences component rendered.', {
    selectedDate,
  });
  const date = parseDateInUserTimezone(selectedDate); // Use parseDateInUserTimezone
  const selectedDateRelation = getDateRelationToToday(selectedDate);

  const handleDateSelect = (newDate: Date | undefined) => {
    debug(loggingLevel, 'Handling date select from calendar:', newDate);
    if (newDate) {
      // Format the date to YYYY-MM-DD using the local timezone
      const dateString = format(newDate, 'yyyy-MM-dd');
      info(loggingLevel, 'Date selected:', dateString);
      onDateChange(dateString);
    } else {
      warn(loggingLevel, 'Date select called with undefined date.');
    }
  };

  const handlePreviousDay = () => {
    debug(loggingLevel, 'Handling previous day button click.');
    const previousDay = new Date(date);
    previousDay.setDate(previousDay.getDate() - 1);
    handleDateSelect(previousDay);
  };

  const handleNextDay = () => {
    debug(loggingLevel, 'Handling next day button click.');
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    handleDateSelect(nextDay);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center mb-5 gap-2">
        <div className="flex justify-end">
          {selectedDateRelation !== 'today' && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-9 px-3 rounded-full border border-border/60"
              onClick={() => handleDateSelect(new Date())}
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
                'absolute inset-0 pointer-events-none',
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
                {date ? (
                  formatDate(date)
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
                selected={date}
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
    </div>
  );
};

export default CheckInPreferences;
