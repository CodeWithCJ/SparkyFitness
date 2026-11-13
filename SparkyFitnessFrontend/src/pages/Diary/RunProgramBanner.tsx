import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { planMinutes, programRunForDate, todayInZone } from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useHiddenWebTabs } from '@/hooks/Settings/useHiddenWebTabs';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useCompleteRunProgramWorkoutMutation,
  useRunProgram,
} from '@/hooks/Exercises/useRunProgram';
import {
  customWorkoutTitle,
  programTitle,
  workoutTitle,
} from '@/utils/runPrograms';

interface RunProgramBannerProps {
  /** The day the Diary is showing, YYYY-MM-DD. */
  date: string;
}

/**
 * The Diary's row for the training program's workout, in the style of a
 * scheduled workout plan: on a run day (or any day, when no days are chosen)
 * it offers the workout, and on days still to come it shows what is
 * scheduled. Nothing when the program is off, finished, or not due that day.
 */
const RunProgramBanner = ({ date }: RunProgramBannerProps) => {
  const { t } = useTranslation();
  const { isActingOnBehalf } = useActiveUser();
  const { hidden: hiddenWebTabs } = useHiddenWebTabs();
  const { timezone } = usePreferences();
  const { program, status, enabled, schedule, doneDay } =
    useRunProgram(!isActingOnBehalf);
  const complete = useCompleteRunProgramWorkoutMutation();
  const today = todayInZone(timezone);

  if (isActingOnBehalf || !program || !status || !enabled) return null;
  const run = programRunForDate({
    enabled,
    total: status.total,
    next: status.done,
    schedule: {
      runDays: schedule.days,
      startDay: schedule.startDay,
      endDay: schedule.endDay,
    },
    doneDay,
    today,
    date,
  });
  const workout = run ? status.program.workouts[run.index] : null;
  if (!run || !workout) return null;

  const isToday = date === today;
  const minutes = planMinutes(workout.plan);
  const title = status.program.custom
    ? customWorkoutTitle(t, workout)
    : workoutTitle(t, status.program, workout);

  return (
    <div
      className="mb-3 flex flex-col justify-between gap-3 rounded-lg border bg-muted/40 p-3.5 sm:flex-row sm:items-center"
      data-testid="run-program-banner"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-xs font-semibold">
            <CalendarDays className="h-3 w-3 text-primary" />
            {run.kind === 'upNext'
              ? t('trainingPrograms.banner.upNext', 'Up next')
              : isToday
                ? t('trainingPrograms.banner.scheduledToday', 'Scheduled Today')
                : t('trainingPrograms.banner.scheduled', 'Scheduled')}
          </Badge>
          <span className="text-sm font-semibold">
            {t('trainingPrograms.banner.title', '{{title}} · {{minutes}} min', {
              title,
              minutes,
            })}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('trainingPrograms.banner.program', 'Training program: {{name}}', {
            name: programTitle(t, status.program),
          })}
          {/* The program page sits under Exercises; no link once it is hidden. */}
          {!hiddenWebTabs.has('exercises') && (
            <>
              {' '}
              <Link
                to="/exercises/training-programs"
                className="underline underline-offset-2"
              >
                {t('trainingPrograms.banner.open', 'Open program')}
              </Link>
            </>
          )}
        </p>
      </div>
      {isToday ? (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={complete.isPending}
          onClick={() =>
            complete.mutate({
              index: run.index,
              program_id: program.program_id,
              day: today,
            })
          }
        >
          {t('trainingPrograms.banner.markDone', 'Mark as done')}
        </Button>
      ) : null}
    </div>
  );
};

export default RunProgramBanner;
