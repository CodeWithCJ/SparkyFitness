
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { debug, info, warn, error } from "@/utils/logging";
import { format, parseISO, subDays, subMonths, subYears } from 'date-fns';
import { useTranslation } from 'react-i18next';



interface ReportsControlsProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

const ReportsControls = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: ReportsControlsProps) => {
  const { t } = useTranslation();
  const { formatDate, parseDateInUserTimezone, formatDateInUserTimezone, loggingLevel } = usePreferences();
  info(loggingLevel, 'ReportsControls: Rendering component.');

  const handlePresetClick = (preset: 'week' | 'month' | 'year') => {
    const today = new Date();
    let newStartDate: Date;

    switch (preset) {
      case 'week':
        newStartDate = subDays(today, 7);
        break;
      case 'month':
        newStartDate = subMonths(today, 1);
        break;
      case 'year':
        newStartDate = subYears(today, 1);
        break;
    }

    debug(loggingLevel, `ReportsControls: Preset '${preset}' selected, setting date range.`);
    onStartDateChange(formatDateInUserTimezone(newStartDate, 'yyyy-MM-dd'));
    onEndDateChange(formatDateInUserTimezone(today, 'yyyy-MM-dd'));
  };

  const handleStartDateSelect = (newDate: Date | undefined) => {
    if (newDate) {
      const dateString = formatDateInUserTimezone(newDate, 'yyyy-MM-dd'); // Format the date to YYYY-MM-DD using user's preferred timezone
      debug(loggingLevel, 'ReportsControls: Start date selected:', dateString);
      onStartDateChange(dateString);
    } else {
      debug(loggingLevel, 'ReportsControls: Start date selection cleared.');
    }
  };

  const handleEndDateSelect = (newDate: Date | undefined) => {
    if (newDate) {
      const dateString = format(newDate, 'yyyy-MM-dd'); // Format the date to YYYY-MM-DD using the local timezone
      debug(loggingLevel, 'ReportsControls: End date selected:', dateString);
      onEndDateChange(dateString);
    } else {
      debug(loggingLevel, 'ReportsControls: End date selection cleared.');
    }
  };

  const handlePreviousStartDate = () => {
    debug(loggingLevel, 'ReportsControls: Handling previous start date.');
    const previousDay = parseDateInUserTimezone(startDate);
    previousDay.setDate(previousDay.getDate() - 1);
    handleStartDateSelect(previousDay);
  };

  const handleNextStartDate = () => {
    debug(loggingLevel, 'ReportsControls: Handling next start date.');
    const nextDay = parseDateInUserTimezone(startDate);
    nextDay.setDate(nextDay.getDate() + 1);
    handleStartDateSelect(nextDay);
  };

  const handlePreviousEndDate = () => {
    debug(loggingLevel, 'ReportsControls: Handling previous end date.');
    const previousDay = parseDateInUserTimezone(endDate);
    previousDay.setDate(previousDay.getDate() - 1);
    handleEndDateSelect(previousDay);
  };

  const handleNextEndDate = () => {
    debug(loggingLevel, 'ReportsControls: Handling next end date.');
    const nextDay = parseDateInUserTimezone(endDate);
    nextDay.setDate(nextDay.getDate() + 1);
    handleEndDateSelect(nextDay);
  };


  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          {/* Date Preset Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePresetClick('week')}
              className="text-sm"
            >
              {t('reports.pastWeek', 'Past Week')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePresetClick('month')}
              className="text-sm"
            >
              {t('reports.pastMonth', 'Past Month')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePresetClick('year')}
              className="text-sm"
            >
              {t('reports.pastYear', 'Past Year')}
            </Button>
          </div>

          {/* Date Range Controls */}
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            {/* Start Date Navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="default" // Changed from "icon" to "default"
                onClick={handlePreviousStartDate}
                className="h-8 w-auto px-2" // Adjusted width and padding
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal w-fit px-3" // Added w-fit and adjusted padding
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatDate(startDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={parseDateInUserTimezone(startDate)}
                    onSelect={handleStartDateSelect}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                    // Ensure the calendar displays the date in the local timezone
                    // by setting the timezone to the user's local timezone
                    // This is important for react-day-picker to correctly highlight the selected day
                    // based on the local date, not UTC.
                    // This prop is not directly available in react-day-picker,
                    // but the Date object passed to 'selected' is interpreted based on its internal time.
                    // The key is to ensure the Date object passed to 'selected'
                    // accurately reflects the local date.
                    // Since startDate is already a 'yyyy-MM-dd' string, new Date(startDate)
                    // will create a Date object in the local timezone at midnight.
                  />
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                size="default" // Changed from "icon" to "default"
                onClick={handleNextStartDate}
                className="h-8 w-auto px-2" // Adjusted width and padding
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* End Date Navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="default" // Changed from "icon" to "default"
                onClick={handlePreviousEndDate}
                className="h-8 w-auto px-2" // Adjusted width and padding
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal w-fit px-3" // Added w-fit and adjusted padding
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatDate(endDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={parseDateInUserTimezone(endDate)}
                    onSelect={handleEndDateSelect}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                    // Ensure the calendar displays the date in the local timezone
                    // by setting the timezone to the user's local timezone
                    // This is important for react-day-picker to correctly highlight the selected day
                    // based on the local date, not UTC.
                    // This prop is not directly available in react-day-picker,
                    // but the Date object passed to 'selected' is interpreted based on its internal time.
                    // The key is to ensure the Date object passed to 'selected'
                    // accurately reflects the local date.
                    // Since endDate is already a 'yyyy-MM-dd' string, new Date(endDate)
                    // will create a Date object in the local timezone at midnight.
                  />
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                size="default" // Changed from "icon" to "default"
                onClick={handleNextEndDate}
                className="h-8 w-auto px-2" // Adjusted width and padding
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportsControls;
