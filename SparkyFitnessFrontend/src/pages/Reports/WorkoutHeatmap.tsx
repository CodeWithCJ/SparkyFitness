import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { WorkoutDayCount } from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { dayString, heatmapMonthsEndingAt } from '@/utils/workoutHeatmap';

function intensityClass(count: number): string {
  if (count >= 3) return 'bg-green-700 text-white';
  if (count === 2) return 'bg-green-600 text-white';
  return 'bg-green-500 text-white';
}

interface WorkoutHeatmapProps {
  /** Days with workouts in the heatmap window (sparse). */
  workoutDays: WorkoutDayCount[];
  /** Today (YYYY-MM-DD, user timezone); the heatmap ends on this month. */
  today: string;
  /** The report's filtered range; days inside it are outlined. */
  rangeStart?: string;
  rangeEnd?: string;
}

interface MonthCalendarProps {
  year: number;
  month: number;
  monthLabel: string;
  leadingEmpty: number;
  daysInMonth: number;
  shiftedDays: { key: string; label: string }[];
  countsByDay: Map<string, number>;
  inRange: (day: string) => boolean;
  /** Desktop cells keep the test ids the 12-month view is checked against. */
  withTestIds: boolean;
  showTitle?: boolean;
  cellClassName: string;
}

function MonthCalendar({
  year,
  month,
  monthLabel,
  leadingEmpty,
  daysInMonth,
  shiftedDays,
  countsByDay,
  inRange,
  withTestIds,
  showTitle = true,
  cellClassName,
}: MonthCalendarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center">
      {showTitle && (
        <h4 className="text-sm font-semibold mb-2">
          {monthLabel} {year}
        </h4>
      )}
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
        {Array.from({ length: leadingEmpty }, (_, i) => (
          <div
            key={`empty-${i}`}
            className={`${cellClassName} rounded-md bg-gray-100 dark:bg-gray-800`}
          />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = dayString(year, month, i + 1);
          const count = countsByDay.get(day) ?? 0;
          const highlighted = inRange(day);
          const colour =
            count > 0 ? intensityClass(count) : 'bg-gray-200 dark:bg-gray-700';
          const status =
            count > 0
              ? t('exerciseReportsDashboard.workoutCount', {
                  defaultValue: '{{count}} workout',
                  defaultValue_other: '{{count}} workouts',
                  count,
                })
              : t('exerciseReportsDashboard.noWorkout', 'No Workout');
          return (
            <div
              key={day}
              data-testid={withTestIds ? `heatmap-day-${day}` : undefined}
              data-in-range={highlighted ? 'true' : undefined}
              className={`${cellClassName} rounded-md flex items-center justify-center text-center ${
                withTestIds ? 'text-[10px] md:text-[8px]' : 'text-[10px]'
              } ${colour} ${
                highlighted
                  ? 'ring-1 ring-primary ring-offset-1 ring-offset-background'
                  : ''
              }`}
              title={`${day} (${status})`}
            >
              {i + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WorkoutHeatmap = ({
  workoutDays,
  today,
  rangeStart,
  rangeEnd,
}: WorkoutHeatmapProps) => {
  const { t, i18n } = useTranslation();
  const { firstDayOfWeek: prefFirstDayOfWeek } = usePreferences();

  const countsByDay = useMemo(
    () => new Map(workoutDays.map((d) => [d.date, d.count])),
    [workoutDays]
  );
  const months = useMemo(() => heatmapMonthsEndingAt(today), [today]);
  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        timeZone: 'UTC',
      }),
    [i18n.language]
  );

  const inRange = (day: string) =>
    rangeStart != null &&
    rangeEnd != null &&
    day >= rangeStart &&
    day <= rangeEnd;

  const baseDays = [
    { key: 'sunday', label: 'S' },
    { key: 'monday', label: 'M' },
    { key: 'tuesday', label: t('reports.workoutHeatmap.tu', 'Tu') },
    { key: 'wednesday', label: 'W' },
    { key: 'thursday', label: t('reports.workoutHeatmap.th', 'Th') },
    { key: 'friday', label: 'F' },
    { key: 'saturday', label: 'S' },
  ];
  const shiftedDays = [
    ...baseDays.slice(prefFirstDayOfWeek),
    ...baseDays.slice(0, prefFirstDayOfWeek),
  ];

  const monthProps = (year: number, month: number) => {
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return {
      year,
      month,
      monthLabel: monthFormatter.format(Date.UTC(year, month, 1)),
      leadingEmpty: (firstWeekday - prefFirstDayOfWeek + 7) % 7,
      daysInMonth,
      shiftedDays,
      countsByDay,
      inRange,
    };
  };

  // Open on the selected range when there is one, otherwise the latest month.
  const initialMonthIndex = useMemo(() => {
    if (rangeEnd) {
      const match = months.findIndex(({ year, month }) =>
        rangeEnd.startsWith(dayString(year, month, 1).slice(0, 7))
      );
      if (match >= 0) return match;
    }
    return Math.max(0, months.length - 1);
  }, [months, rangeEnd]);
  const [monthIndex, setMonthIndex] = useState(initialMonthIndex);
  useEffect(() => {
    setMonthIndex(initialMonthIndex);
  }, [initialMonthIndex]);

  const mobileMonth = months[monthIndex];

  return (
    <Card className="h-full border shadow-sm">
      <CardHeader>
        <CardTitle>
          {t('exerciseReportsDashboard.workoutHeatmap', 'Workout Heatmap')}
        </CardTitle>
        {rangeStart && rangeEnd && (
          <p className="text-xs text-muted-foreground">
            {t(
              'exerciseReportsDashboard.heatmapRangeHint',
              'Last 12 months. Outlined days are in the selected date range.'
            )}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="hidden lg:grid lg:grid-cols-3 gap-4">
          {months.map(({ year, month }) => (
            <MonthCalendar
              key={`${year}-${month}`}
              {...monthProps(year, month)}
              withTestIds
              cellClassName="w-8 h-8 md:w-5 md:h-5"
            />
          ))}
        </div>

        {mobileMonth && (
          <div className="lg:hidden flex flex-col items-center gap-3">
            <div className="flex w-full items-center justify-between">
              <button
                type="button"
                className="p-1 text-muted-foreground disabled:opacity-30"
                aria-label={t('common.previous', 'Previous')}
                disabled={monthIndex <= 0}
                onClick={() => setMonthIndex((index) => Math.max(0, index - 1))}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h4
                data-testid="heatmap-mobile-month"
                className="text-sm font-semibold"
              >
                {monthFormatter.format(
                  Date.UTC(mobileMonth.year, mobileMonth.month, 1)
                )}{' '}
                {mobileMonth.year}
              </h4>
              <button
                type="button"
                className="p-1 text-muted-foreground disabled:opacity-30"
                aria-label={t('common.next', 'Next')}
                disabled={monthIndex >= months.length - 1}
                onClick={() =>
                  setMonthIndex((index) =>
                    Math.min(months.length - 1, index + 1)
                  )
                }
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <MonthCalendar
              {...monthProps(mobileMonth.year, mobileMonth.month)}
              withTestIds={false}
              showTitle={false}
              cellClassName="w-8 h-8"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WorkoutHeatmap;
