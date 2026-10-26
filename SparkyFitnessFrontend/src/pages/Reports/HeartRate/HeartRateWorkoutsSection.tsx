import React from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Dumbbell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import WorkoutHeartRateItem from './WorkoutHeartRateItem';
import type { HeartRateChartTheme } from './useHeartRateChartTheme';
import type { HeartRateData } from './useHeartRateData';
import type { HeartRateWindow } from './useHeartRateWindow';

interface HeartRateWorkoutsSectionProps {
  heartRateWindow: HeartRateWindow;
  data: HeartRateData;
  chartTheme: HeartRateChartTheme;
  workoutFilter: string;
  setWorkoutFilter: (id: string) => void;
  displayedWorkouts: HeartRateData['relevantWorkouts'];
}

const HeartRateWorkoutsSection: React.FC<HeartRateWorkoutsSectionProps> = ({
  heartRateWindow,
  data,
  chartTheme,
  workoutFilter,
  setWorkoutFilter,
  displayedWorkouts,
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, dateFormat, timezone } = usePreferences();
  const { setDayWindow } = heartRateWindow;
  const { relevantWorkouts, hrSampleBuckets } = data;

  return (
    <div className="space-y-6 border-t border-border/60 pt-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {t(
              'heartRate.workoutsSectionTitle',
              'Exercise & Workout Heart Rate'
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t(
              'heartRate.workoutsSectionSub',
              'Cardiovascular response, active zone minutes, and intensity distribution'
            )}
          </p>
        </div>

        {/* Exercise Filter Dropdown: "All Workouts" as default */}
        {relevantWorkouts.length > 0 && (
          <div className="flex items-center gap-2 bg-muted/60 border border-border px-3 py-1.5 rounded-lg text-xs self-start sm:self-auto">
            <Dumbbell className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="font-semibold text-foreground text-xs">
              {t('heartRate.filter', 'Filter')}:
            </span>
            <select
              value={workoutFilter}
              onChange={(e) => {
                const id = e.target.value;
                setWorkoutFilter(id);
                const picked = relevantWorkouts.find((w) => w.id === id);
                const day = String(picked?.entry_date || '').slice(0, 10);
                if (day) setDayWindow({ start: day, end: day });
              }}
              className="bg-transparent border-none text-xs text-foreground font-semibold focus:outline-none cursor-pointer pr-1"
            >
              <option
                value="all"
                className="bg-popover text-popover-foreground font-semibold"
              >
                {t('heartRate.allWorkoutsOption', 'All Workouts ({{count}})', {
                  count: relevantWorkouts.length,
                })}
              </option>
              {relevantWorkouts.map((w) => {
                const formattedD = w.entry_date
                  ? formatDateInUserTimezone(w.entry_date, dateFormat)
                  : '';
                const name =
                  w.exercises?.name ||
                  (typeof w['exercise_name'] === 'string'
                    ? w['exercise_name']
                    : 'Workout');
                const hrInfo = w['avg_heart_rate']
                  ? ` (${w['avg_heart_rate']} bpm)`
                  : '';
                return (
                  <option
                    key={w.id}
                    value={w.id}
                    className="bg-popover text-popover-foreground"
                  >
                    {formattedD ? `${formattedD} · ` : ''}
                    {name}
                    {hrInfo}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      {/* List of Workouts rendered one below another */}
      {displayedWorkouts.length > 0 ? (
        <div className="space-y-6">
          {displayedWorkouts.map((w) => (
            <WorkoutHeartRateItem
              key={w.id}
              workout={w}
              hrSampleBuckets={hrSampleBuckets}
              chartTheme={chartTheme}
              timezone={timezone}
            />
          ))}
        </div>
      ) : (
        /* Empty state when no workouts exist in range */
        <div className="p-8 text-center bg-muted/20 border border-border rounded-xl space-y-2">
          <Dumbbell className="w-8 h-8 text-muted-foreground mx-auto opacity-50" />
          <p className="text-sm font-semibold text-foreground">
            {t(
              'heartRate.noWorkoutsInRange',
              'No workouts found in this date range'
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              'heartRate.noWorkoutsInRangeSub',
              'Log a workout or widen your date range filter to view exercise zone metrics.'
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default HeartRateWorkoutsSection;
