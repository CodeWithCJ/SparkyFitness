import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  planMinutes,
  type ProgramStatus,
  type RunProgramResponse,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  customWorkoutTitle,
  formatDayLabel,
  programDescription,
  programTitle,
  programWorkoutLabel,
  weekdayLabel,
} from '@/utils/runPrograms';

/** A change older than this is history, not news. */
const RECENT_CHANGE_MS = 14 * 24 * 3600 * 1000;

interface TrainingProgramCardProps {
  program: RunProgramResponse;
  status: ProgramStatus;
  /** Today, YYYY-MM-DD, in the user's timezone. */
  today: string;
  /** Epoch ms "now", to judge whether the last plan change is recent. */
  now: number;
  /** Whether a change is being saved. */
  busy: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onMarkDone: () => void;
  onSkip: () => void;
  onRestart: () => void;
  onPickWorkout: (index: number) => void;
  onToggleDay: (day: number) => void;
  onStartDay: (day: string | null) => void;
  onEndDay: (day: string | null) => void;
}

/** The running program: today's workout, the place in the plan and its schedule. */
const TrainingProgramCard = ({
  program,
  status,
  today,
  now,
  busy,
  onToggleEnabled,
  onMarkDone,
  onSkip,
  onRestart,
  onPickWorkout,
  onToggleDay,
  onStartDay,
  onEndDay,
}: TrainingProgramCardProps) => {
  const { t } = useTranslation();
  const locale = t('i18n.locale', 'en-US');
  const [pickerKey, setPickerKey] = useState(0);
  const title = programTitle(t, status.program);
  const enabled = program.enabled;
  const startDay = program.start_date;
  const endDay = program.end_date;
  const futureStart = startDay !== null && startDay > today;
  const fraction = status.total > 0 ? status.done / status.total : 0;
  const lastChange = program.adjustment_log.at(-1) ?? null;
  const recentChange =
    lastChange && now - Date.parse(lastChange.at) < RECENT_CHANGE_MS
      ? lastChange
      : null;
  const dayText = (day: string) => formatDayLabel(day, locale);

  const workoutOption = (index: number): string => {
    const workout = status.program.workouts[index];
    if (!workout) return '';
    const minutes = planMinutes(workout.plan);
    const mark = index < status.done ? '✓ ' : '';
    if (status.program.custom) {
      return `${mark}${customWorkoutTitle(t, workout)} · ${t(
        'trainingPrograms.card.minutes',
        '{{minutes}} min',
        { minutes }
      )}`;
    }
    return `${mark}${
      status.program.activity === 'walk'
        ? t('trainingPrograms.card.pickWalk', 'Walk {{number}}', {
            number: workout.day + 1,
          })
        : t('trainingPrograms.card.pickRun', 'Run {{number}}', {
            number: workout.day + 1,
          })
    } · ${t('trainingPrograms.card.minutes', '{{minutes}} min', { minutes })}`;
  };

  return (
    <Card data-testid="training-program-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>
              {t('trainingPrograms.card.title', 'Training program')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t(
                'trainingPrograms.card.switchHint',
                'Follow a plan that builds up week by week.'
              )}
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={busy}
            onCheckedChange={onToggleEnabled}
            aria-label={t(
              'trainingPrograms.card.use',
              'Use a training program'
            )}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'trainingPrograms.card.paused',
              '{{name}} is paused at {{done}} of {{total}} workouts. Switch it on to carry on.',
              { name: title, done: status.done, total: status.total }
            )}
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">
                {status.finished
                  ? t('trainingPrograms.card.finished', '{{name}} complete', {
                      name: title,
                    })
                  : programWorkoutLabel(t, status)}
              </h3>
              <p className="text-sm text-muted-foreground">
                {status.finished
                  ? t(
                      'trainingPrograms.card.finishedHint',
                      'Well done. You can start it again or move on.'
                    )
                  : t(
                      'trainingPrograms.card.progress',
                      'Workout {{done}} of {{total}} done · {{minutes}} min today',
                      {
                        done: status.done,
                        total: status.total,
                        minutes: status.workout
                          ? planMinutes(status.workout.plan)
                          : 0,
                      }
                    )}
              </p>
              {recentChange ? (
                <p className="text-sm text-muted-foreground">
                  {recentChange.source === 'assistant'
                    ? t(
                        'trainingPrograms.card.changedBySparky',
                        'Sparky changed your plan on {{date}}: {{summary}}',
                        {
                          date: new Date(recentChange.at).toLocaleDateString(
                            locale,
                            { month: 'short', day: 'numeric' }
                          ),
                          summary: recentChange.summary,
                        }
                      )
                    : t(
                        'trainingPrograms.card.changed',
                        'Plan changed on {{date}}: {{summary}}',
                        {
                          date: new Date(recentChange.at).toLocaleDateString(
                            locale,
                            { month: 'short', day: 'numeric' }
                          ),
                          summary: recentChange.summary,
                        }
                      )}
                </p>
              ) : null}
              <Progress
                value={Math.round(fraction * 100)}
                className="h-2 mt-2"
                aria-label={t(
                  'trainingPrograms.card.progressBar',
                  'Place in the program'
                )}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {status.finished ? (
                <Button onClick={onRestart} disabled={busy}>
                  {t('trainingPrograms.card.restart', 'Start again')}
                </Button>
              ) : (
                <>
                  <Button onClick={onMarkDone} disabled={busy}>
                    {t(
                      'trainingPrograms.card.markDone',
                      'Mark workout as done'
                    )}
                  </Button>
                  <Button variant="outline" onClick={onSkip} disabled={busy}>
                    {t('trainingPrograms.card.skip', 'Skip')}
                  </Button>
                </>
              )}
              {!status.finished ? (
                <Button variant="outline" onClick={onRestart} disabled={busy}>
                  {t('trainingPrograms.card.startOver', 'Start over')}
                </Button>
              ) : null}
            </div>
            {!status.finished ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  'trainingPrograms.card.actionsHint',
                  'Skip moves on without doing this workout. Start over goes back to the first workout.'
                )}
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="training-program-workout">
                {t(
                  'trainingPrograms.card.chooseWorkout',
                  'Choose a different workout'
                )}
              </Label>
              <Select
                key={pickerKey}
                onValueChange={(value) => {
                  onPickWorkout(Number(value));
                  // Back to the placeholder so the same workout can be picked again.
                  setPickerKey((k) => k + 1);
                }}
                disabled={busy}
              >
                <SelectTrigger
                  id="training-program-workout"
                  className="w-full sm:w-80"
                >
                  <SelectValue
                    placeholder={t(
                      'trainingPrograms.card.pickWorkout',
                      'Pick a workout'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: status.program.weeks }, (_, week) => (
                    <SelectGroup key={week}>
                      <SelectLabel>
                        {t('trainingPrograms.card.week', 'Week {{week}}', {
                          week: week + 1,
                        })}
                      </SelectLabel>
                      {status.program.workouts.map((workout, index) =>
                        workout.week === week ? (
                          <SelectItem key={index} value={String(index)}>
                            {workoutOption(index)}
                          </SelectItem>
                        ) : null
                      )}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!status.finished ? (
              <div className="space-y-4 border-t pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('trainingPrograms.card.schedule', 'Schedule')}
                </h4>
                <div className="space-y-2">
                  <Label>
                    {t('trainingPrograms.card.runDays', 'Run days')}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 7 }, (_, day) => {
                      const on = program.run_days.includes(day);
                      return (
                        <Button
                          key={day}
                          type="button"
                          size="sm"
                          variant={on ? 'default' : 'outline'}
                          aria-pressed={on}
                          disabled={busy}
                          onClick={() => onToggleDay(day)}
                        >
                          {weekdayLabel(day, locale)}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {program.run_days.length > 0
                      ? t(
                          'trainingPrograms.card.runDaysSet',
                          'The Diary shows the workout on these days. A workout you miss stays due.'
                        )
                      : t(
                          'trainingPrograms.card.runDaysHint',
                          'Pick the days you plan to train, or leave them empty to see the workout every day.'
                        )}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="training-program-start">
                    {t('trainingPrograms.card.startDay', 'First workout')}
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="training-program-start"
                      type="date"
                      className="w-44"
                      value={startDay ?? ''}
                      max={endDay ?? undefined}
                      disabled={busy}
                      onChange={(e) => onStartDay(e.target.value || null)}
                    />
                    {startDay ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => onStartDay(null)}
                      >
                        {t('trainingPrograms.card.startClear', 'Start today')}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {futureStart && startDay
                      ? t(
                          'trainingPrograms.card.startDaySet',
                          'Starts {{date}}. Nothing shows in the Diary before then.',
                          { date: dayText(startDay) }
                        )
                      : startDay
                        ? t(
                            'trainingPrograms.card.startDayPast',
                            'Started {{date}}. Your next workout is scheduled from today.',
                            { date: dayText(startDay) }
                          )
                        : t(
                            'trainingPrograms.card.startDayToday',
                            'Starts today, {{date}}. Pick a later date if you want to begin then.',
                            { date: dayText(today) }
                          )}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="training-program-goal">
                    {t('trainingPrograms.card.goalDay', 'Goal date')}
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="training-program-goal"
                      type="date"
                      className="w-44"
                      value={endDay ?? ''}
                      min={startDay ?? undefined}
                      disabled={busy}
                      onChange={(e) => onEndDay(e.target.value || null)}
                    />
                    {endDay ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => onEndDay(null)}
                      >
                        {t('trainingPrograms.card.goalClear', 'Clear')}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {endDay
                      ? t(
                          'trainingPrograms.card.goalDaySet',
                          'Nothing is scheduled after {{date}}. The schedule below says whether the program fits.',
                          { date: dayText(endDay) }
                        )
                      : t(
                          'trainingPrograms.card.goalDayHint',
                          'Optional, for example a race day. The schedule below says whether the program fits before it.'
                        )}
                  </p>
                </div>
              </div>
            ) : null}
          </>
        )}
        {!enabled || status.finished ? null : (
          <p className="text-xs text-muted-foreground">
            {programDescription(t, status.program.id)}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default TrainingProgramCard;
