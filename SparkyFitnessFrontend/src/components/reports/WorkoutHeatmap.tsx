import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { debug, info, UserLoggingLevel } from '@/utils/logging';
import { usePreferences } from '@/contexts/PreferencesContext';

interface WorkoutHeatmapProps {
  workoutDates: string[]; // Array of 'YYYY-MM-DD' strings
}

const WorkoutHeatmap: React.FC<WorkoutHeatmapProps> = ({ workoutDates }) => {
  const { t } = useTranslation();
  const { loggingLevel, formatDateInUserTimezone } = usePreferences();
  info(loggingLevel, 'WorkoutHeatmap: Rendering component.');

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  const generateMonthData = (year: number, month: number) => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const firstDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday, 6 for Saturday

    const monthData = [];
    // Add leading empty cells for days before the 1st of the month
    for (let i = 0; i < firstDayOfWeek; i++) {
      monthData.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      monthData.push(date);
    }
    return monthData;
  };

  const getDayColor = (date: Date | null) => {
    if (!date) return 'bg-gray-100 dark:bg-gray-800'; // Empty cell color

    const dateString = formatDateInUserTimezone(date, 'yyyy-MM-dd');
    const hasWorkout = workoutDates.includes(dateString);

    if (hasWorkout) {
      // You can implement more sophisticated logic here for intensity
      // For now, a simple green for any workout
      return 'bg-green-500 text-white';
    }
    return 'bg-gray-200 dark:bg-gray-700'; // No workout color
  };

  // Generate data for the last 12 months
  const monthsToDisplay = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthsToDisplay.unshift({
      year: date.getFullYear(),
      month: date.getMonth(),
      name: date.toLocaleString('default', { month: 'short' }),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exerciseReportsDashboard.workoutHeatmap", "Workout Heatmap")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {monthsToDisplay.map((monthInfo, monthIndex) => (
            <div key={`${monthInfo.year}-${monthInfo.month}`} className="flex flex-col items-center">
              <h4 className="text-sm font-semibold mb-2">{monthInfo.name} {monthInfo.year}</h4>
              <div className="grid grid-cols-7 gap-1" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                <div className="text-xs text-center text-muted-foreground">{t("common.day_short.sunday", "S")}</div>
                <div className="text-xs text-center text-muted-foreground">{t("common.day_short.monday", "M")}</div>
                <div className="text-xs text-center text-muted-foreground">{t("common.day_short.tuesday", "T")}</div>
                <div className="text-xs text-center text-muted-foreground">{t("common.day_short.wednesday", "W")}</div>
                <div className="text-xs text-center text-muted-foreground">{t("common.day_short.thursday", "T")}</div>
                <div className="text-xs text-center text-muted-foreground">{t("common.day_short.friday", "F")}</div>
                <div className="text-xs text-center text-muted-foreground">{t("common.day_short.saturday", "S")}</div>
                {generateMonthData(monthInfo.year, monthInfo.month).map((date, dayIndex) => (
                  <div
                    key={dayIndex}
                    className={`w-8 h-8 md:w-5 md:h-5 rounded-md flex items-center justify-center text-center text-[10px] md:text-[8px] ${getDayColor(date)}`}
                    title={date ? formatDateInUserTimezone(date, 'yyyy-MM-dd') + (workoutDates.includes(formatDateInUserTimezone(date, 'yyyy-MM-dd')) ? ` (${t("exerciseReportsDashboard.workout", "Workout")})` : ` (${t("exerciseReportsDashboard.noWorkout", "No Workout")})`) : ''}
                  >
                    {date ? date.getDate() : ''}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkoutHeatmap;