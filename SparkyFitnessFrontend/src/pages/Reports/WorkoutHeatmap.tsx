import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { info } from '@/utils/logging';
import { usePreferences } from '@/contexts/PreferencesContext';

interface WorkoutHeatmapProps {
  workoutDates: string[]; // Array of 'YYYY-MM-DD' strings
}

const WorkoutHeatmap = ({ workoutDates }: WorkoutHeatmapProps) => {
  const { t } = useTranslation();
  const {
    loggingLevel,
    formatDateInUserTimezone,
    firstDayOfWeek: prefFirstDayOfWeek,
  } = usePreferences();
  info(loggingLevel, 'WorkoutHeatmap: Rendering component.');

  const today = new Date();

  const generateMonthData = (year: number, month: number) => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const monthFirstDay = firstDayOfMonth.getDay(); // 0 for Sunday, 6 for Saturday

    const monthData = [];
    const emptyCells = (monthFirstDay - prefFirstDayOfWeek + 7) % 7;
    // Add leading empty cells for days before the 1st of the month
    for (let i = 0; i < emptyCells; i++) {
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

  const baseDays = [
    { key: 'sunday', label: 'S' },
    { key: 'monday', label: 'M' },
    { key: 'tuesday', label: 'Tu' },
    { key: 'wednesday', label: 'W' },
    { key: 'thursday', label: 'Th' },
    { key: 'friday', label: 'F' },
    { key: 'saturday', label: 'S' },
  ];
  const shiftedDays = [
    ...baseDays.slice(prefFirstDayOfWeek),
    ...baseDays.slice(0, prefFirstDayOfWeek),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('exerciseReportsDashboard.workoutHeatmap', 'Workout Heatmap')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {monthsToDisplay.map((monthInfo) => (
            <div
              key={`${monthInfo.year}-${monthInfo.month}`}
              className="flex flex-col items-center"
            >
              <h4 className="text-sm font-semibold mb-2">
                {monthInfo.name} {monthInfo.year}
              </h4>
              <div
                className="grid grid-cols-7 gap-1"
                style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
              >
                {shiftedDays.map((day) => (
                  <div
                    key={day.key}
                    className="text-xs text-center text-muted-foreground"
                  >
                    {t(`common.day_short.${day.key}`, day.label)}
                  </div>
                ))}
                {generateMonthData(monthInfo.year, monthInfo.month).map(
                  (date, dayIndex) => (
                    <div
                      key={dayIndex}
                      className={`w-8 h-8 md:w-5 md:h-5 rounded-md flex items-center justify-center text-center text-[10px] md:text-[8px] ${getDayColor(date)}`}
                      title={
                        date
                          ? formatDateInUserTimezone(date, 'yyyy-MM-dd') +
                            (workoutDates.includes(
                              formatDateInUserTimezone(date, 'yyyy-MM-dd')
                            )
                              ? ` (${t('exerciseReportsDashboard.workout', 'Workout')})`
                              : ` (${t('exerciseReportsDashboard.noWorkout', 'No Workout')})`)
                          : ''
                      }
                    >
                      {date ? date.getDate() : ''}
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkoutHeatmap;
