
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { cn } from "@/lib/utils";
import { debug, info, warn, error } from '@/utils/logging'; // Import logging utility
import { format } from 'date-fns'; // Import format from date-fns
import { useTranslation } from "react-i18next";


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
    parseDateInUserTimezone,
    loggingLevel
  } = usePreferences();
  debug(loggingLevel, "CheckInPreferences component rendered.", { selectedDate });
  const date = parseDateInUserTimezone(selectedDate); // Use parseDateInUserTimezone

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    debug(loggingLevel, "Handling date change from input:", e.target.value);
    onDateChange(e.target.value);
  };

  const handleDateSelect = (newDate: Date | undefined) => {
    debug(loggingLevel, "Handling date select from calendar:", newDate);
    if (newDate) {
      // Format the date to YYYY-MM-DD using the local timezone
      const dateString = format(newDate, 'yyyy-MM-dd');
      info(loggingLevel, "Date selected:", dateString);
      onDateChange(dateString);
    } else {
      warn(loggingLevel, "Date select called with undefined date.");
    }
  };

  const handlePreviousDay = () => {
    debug(loggingLevel, "Handling previous day button click.");
    const previousDay = new Date(date);
    previousDay.setDate(previousDay.getDate() - 1);
    handleDateSelect(previousDay);
  };

  const handleNextDay = () => {
    debug(loggingLevel, "Handling next day button click.");
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    handleDateSelect(nextDay);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div />

            {/* Date Navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePreviousDay}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? formatDate(date) : <span>{t('common.pickADate', 'Pick a Date')}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date} // Use the date object parsed in user's timezone
                    onSelect={handleDateSelect}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                size="icon"
                onClick={handleNextDay}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CheckInPreferences;
