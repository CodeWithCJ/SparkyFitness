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

interface CheckInPreferencesProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

const CheckInPreferences = ({
  selectedDate,
  onDateChange,
}: CheckInPreferencesProps) => {
  const { t } = useTranslation();
  const { formatDate, parseDateInUserTimezone, loggingLevel } =
    usePreferences();
  debug(loggingLevel, 'CheckInPreferences component rendered.', {
    selectedDate,
  });
  const date = parseDateInUserTimezone(selectedDate); // Use parseDateInUserTimezone

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
      <div className="flex justify-center mb-5 gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground h-9 px-3 rounded-full border border-border/60"
          onClick={() => handleDateSelect(new Date())}
        >
          Today
        </Button>
        <div className="flex items-center gap-0 rounded-full border border-border/60 bg-background overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePreviousDay}
            className="h-9 w-9 rounded-none border-r border-border/60"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 px-4 rounded-none font-normal text-sm gap-2"
              >
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
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
            className="h-9 w-9 rounded-none border-l border-border/60"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CheckInPreferences;
