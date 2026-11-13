import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  catchUpFor,
  daysBetween,
  instantToDay,
  buildProgramTimeline,
  itemsByDay,
  planMinutes,
  projectRuns,
  projectedFinishDay,
  type ProgramStatus,
  type RunProgramResponse,
  type TimelineItem,
} from '@workspace/shared';
import MonthCalendar, { type DayCellRender } from '@/components/MonthCalendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  formatDayLabel,
  weekdayLabel,
  workoutTitle,
} from '@/utils/runPrograms';

/** Workouts listed before "Show all". */
const PREVIEW_RUNS = 7;

const COLOR_DONE = '#22c55e55';
const COLOR_NEXT = '#3b82f655';
const COLOR_UPCOMING = '#3b82f622';

interface TrainingProgramCalendarProps {
  program: RunProgramResponse;
  status: ProgramStatus;
  /** Today, YYYY-MM-DD, in the user's timezone. */
  today: string;
  busy: boolean;
  /** Moves the place in the program to this workout (a catch-up). */
  onCatchUp: (next: number) => void;
}

/**
 * The planned workouts against what was done: a month view with the workouts
 * done, the one due and the ones still to come on the days the schedule puts
 * them, plus the day the program finishes and whether that is before the goal
 * date. Worked out from the place in the plan, so a missed workout moves the
 * dates after it along.
 */
const TrainingProgramCalendar = ({
  program,
  status,
  today,
  busy,
  onCatchUp,
}: TrainingProgramCalendarProps) => {
  const { t } = useTranslation();
  const { timezone, firstDayOfWeek } = usePreferences();
  const locale = t('i18n.locale', 'en-US');
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(today);
  const [showAll, setShowAll] = useState(false);

  const schedule = useMemo(
    () => ({
      runDays: program.run_days,
      startDay: program.start_date,
      endDay: program.end_date,
    }),
    [program.run_days, program.start_date, program.end_date]
  );
  const doneToday = program.last_done_date === today;
  const base = { total: status.total, next: status.done, today, doneToday };

  const items = useMemo<TimelineItem[]>(
    () =>
      buildProgramTimeline({
        total: status.total,
        next: status.done,
        completions: program.completion_log,
        efforts: program.effort_log,
        schedule,
        today,
        doneToday,
        isoToDay: (iso) => instantToDay(iso, timezone),
      }),
    [
      status.total,
      status.done,
      program.completion_log,
      program.effort_log,
      schedule,
      today,
      doneToday,
      timezone,
    ]
  );
  const byDay = useMemo(() => itemsByDay(items), [items]);

  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        weekdayLabel((firstDayOfWeek + i) % 7, locale)
      ),
    [firstDayOfWeek, locale]
  );

  const runs = projectRuns({ ...base, schedule });
  const finish = projectedFinishDay({ ...base, schedule });
  const left = status.total - status.done;
  const catchUp = catchUpFor({ ...base, schedule });
  const dayText = (day: string, style: 'long' | 'short' = 'short') =>
    formatDayLabel(day, locale, style);

  let fit: string | null = null;
  if (finish && schedule.endDay) {
    const gap = daysBetween(finish, schedule.endDay);
    fit =
      gap >= 0
        ? t(
            'trainingPrograms.calendar.fitsBefore',
            'On track: you finish on {{date}}, {{count}} days before your goal date.',
            {
              count: gap,
              date: dayText(finish, 'long'),
              defaultValue_one:
                'On track: you finish on {{date}}, {{count}} day before your goal date.',
              defaultValue_other:
                'On track: you finish on {{date}}, {{count}} days before your goal date.',
            }
          )
        : t(
            'trainingPrograms.calendar.fitsAfter',
            'At this pace you finish on {{date}}, {{count}} days after your goal date. Add a workout day or move the date.',
            {
              count: -gap,
              date: dayText(finish, 'long'),
              defaultValue_one:
                'At this pace you finish on {{date}}, {{count}} day after your goal date. Add a workout day or move the date.',
              defaultValue_other:
                'At this pace you finish on {{date}}, {{count}} days after your goal date. Add a workout day or move the date.',
            }
          );
  }

  const minutesText = (index: number): string => {
    const workout = status.program.workouts[index];
    return workout
      ? t('trainingPrograms.card.minutes', '{{minutes}} min', {
          minutes: planMinutes(workout.plan),
        })
      : '';
  };
  const itemTitle = (item: TimelineItem): string => {
    const workout = status.program.workouts[item.index];
    return workout ? workoutTitle(t, status.program, workout) : '';
  };
  const stateBadge = (item: TimelineItem) =>
    item.state === 'done' ? (
      <Badge variant="secondary">
        {item.day
          ? t('trainingPrograms.calendar.doneOn', 'Done {{date}}', {
              date: dayText(item.day),
            })
          : t('trainingPrograms.calendar.done', 'Done')}
      </Badge>
    ) : item.state === 'next' ? (
      <Badge>{t('trainingPrograms.calendar.due', 'Next')}</Badge>
    ) : (
      <Badge variant="outline">
        {item.day
          ? dayText(item.day)
          : t('trainingPrograms.calendar.notScheduled', 'Not scheduled')}
      </Badge>
    );

  const dayItems = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const shownRuns = showAll ? runs : runs.slice(0, PREVIEW_RUNS);

  return (
    <Card data-testid="training-program-calendar">
      <CardHeader className="pb-2">
        <CardTitle>
          {t('trainingPrograms.calendar.title', 'Schedule')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.finished ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'trainingPrograms.calendar.finishedNote',
              'Every workout is done. Start the program again to plan another round.'
            )}
          </p>
        ) : schedule.runDays.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'trainingPrograms.calendar.noDays',
              '{{count}} workouts left. Pick your run days to see when each one falls; until then the Diary offers the next one every day.',
              {
                count: left,
                defaultValue_one:
                  '{{count}} workout left. Pick your run days to see when each one falls; until then the Diary offers the next one every day.',
                defaultValue_other:
                  '{{count}} workouts left. Pick your run days to see when each one falls; until then the Diary offers the next one every day.',
              }
            )}
          </p>
        ) : (
          <div className="space-y-1 text-sm">
            {finish ? (
              <p data-testid="training-program-finish">
                {t(
                  'trainingPrograms.calendar.finish',
                  'Finishes on {{date}}.',
                  { date: dayText(finish, 'long') }
                )}
              </p>
            ) : null}
            {fit ? (
              <p
                className="text-muted-foreground"
                data-testid="training-program-fit"
              >
                {fit}
              </p>
            ) : null}
            {catchUp.state === 'skip' ? (
              <div
                className="space-y-2 pt-1"
                data-testid="training-program-catch-up"
              >
                <p className="text-muted-foreground">
                  {t(
                    'trainingPrograms.calendar.catchUp',
                    'Skip the next {{count}} workouts to finish on {{date}}, in time for your goal. The last workout is never skipped.',
                    {
                      count: catchUp.skip,
                      date: dayText(catchUp.finishDay, 'long'),
                      defaultValue_one:
                        'Skip the next {{count}} workout to finish on {{date}}, in time for your goal. The last workout is never skipped.',
                      defaultValue_other:
                        'Skip the next {{count}} workouts to finish on {{date}}, in time for your goal. The last workout is never skipped.',
                    }
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onCatchUp(catchUp.next)}
                >
                  {t(
                    'trainingPrograms.calendar.catchUpButton',
                    'Skip {{count}} workouts',
                    {
                      count: catchUp.skip,
                      defaultValue_one: 'Skip {{count}} workout',
                      defaultValue_other: 'Skip {{count}} workouts',
                    }
                  )}
                </Button>
              </div>
            ) : null}
            {catchUp.state === 'tooFar' ? (
              <p
                className="text-muted-foreground"
                data-testid="training-program-too-far"
              >
                {t(
                  'trainingPrograms.calendar.tooFar',
                  'You are too far behind to catch up by skipping: {{count}} workouts will not fit. Add run days or move your goal date.',
                  {
                    count: catchUp.late,
                    defaultValue_one:
                      'You are too far behind to catch up by skipping: {{count}} workout will not fit. Add run days or move your goal date.',
                    defaultValue_other:
                      'You are too far behind to catch up by skipping: {{count}} workouts will not fit. Add run days or move your goal date.',
                  }
                )}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t(
                'trainingPrograms.calendar.moves',
                'A workout you miss is not skipped: the dates after it move along.'
              )}
            </p>
          </div>
        )}

        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          weekdayLabels={weekdayLabels}
          selectedDate={selectedDay ?? undefined}
          onDayClick={setSelectedDay}
          monthLabelLocale={locale}
          legend={[
            {
              label: t('trainingPrograms.calendar.legendDone', 'Done'),
              color: COLOR_DONE,
            },
            {
              label: t('trainingPrograms.calendar.legendNext', 'Next'),
              color: COLOR_NEXT,
            },
            {
              label: t('trainingPrograms.calendar.legendAhead', 'Planned'),
              color: COLOR_UPCOMING,
            },
          ]}
          renderDay={(day): DayCellRender | undefined => {
            const here = byDay.get(day);
            if (!here || here.length === 0) return undefined;
            const done = here.some((item) => item.state === 'done');
            const next = here.some((item) => item.state === 'next');
            return {
              fill: done ? COLOR_DONE : next ? COLOR_NEXT : COLOR_UPCOMING,
              title: here
                .map(
                  (item) => `${itemTitle(item)} · ${minutesText(item.index)}`
                )
                .join('\n'),
              ariaLabel: `${dayText(day, 'long')}: ${here
                .map((item) => itemTitle(item))
                .join(', ')}`,
            };
          }}
        />

        {selectedDay ? (
          <div className="space-y-2" data-testid="training-program-day">
            <h4 className="text-sm font-semibold">
              {dayText(selectedDay, 'long')}
            </h4>
            {dayItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  'trainingPrograms.calendar.noWorkoutsDay',
                  'No workouts on this day.'
                )}
              </p>
            ) : (
              dayItems.map((item) => (
                <div
                  key={item.index}
                  className="flex items-center justify-between gap-2 border-b py-1.5 text-sm"
                >
                  <span>
                    {itemTitle(item)} · {minutesText(item.index)}
                  </span>
                  {stateBadge(item)}
                </div>
              ))
            )}
          </div>
        ) : null}

        {shownRuns.length > 0 ? (
          <div className="space-y-1" data-testid="training-program-upcoming">
            <h4 className="text-sm font-semibold">
              {t('trainingPrograms.calendar.upcoming', 'Coming up')}
            </h4>
            {shownRuns.map((run) => {
              const workout = status.program.workouts[run.index];
              if (!workout) return null;
              return (
                <div
                  key={run.index}
                  className="flex items-center justify-between gap-2 border-b py-1.5 text-sm"
                >
                  <span>
                    {dayText(run.day)}
                    {run.day === today
                      ? ` · ${t('trainingPrograms.calendar.today', 'Today')}`
                      : ''}
                  </span>
                  <span className="text-muted-foreground">
                    {workoutTitle(t, status.program, workout)} ·{' '}
                    {minutesText(run.index)}
                  </span>
                </div>
              );
            })}
            {runs.length > PREVIEW_RUNS ? (
              <Button
                variant="link"
                size="sm"
                className="px-0"
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll
                  ? t('trainingPrograms.calendar.showLess', 'Show fewer')
                  : t(
                      'trainingPrograms.calendar.showAll',
                      'Show all {{count}}',
                      {
                        count: runs.length,
                        defaultValue_one: 'Show {{count}}',
                        defaultValue_other: 'Show all {{count}}',
                      }
                    )}
              </Button>
            ) : null}
            {runs.length < left ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  'trainingPrograms.calendar.cutOff',
                  '{{count}} workouts do not fit before your goal date.',
                  {
                    count: left - runs.length,
                    defaultValue_one:
                      '{{count}} workout does not fit before your goal date.',
                    defaultValue_other:
                      '{{count}} workouts do not fit before your goal date.',
                  }
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default TrainingProgramCalendar;
