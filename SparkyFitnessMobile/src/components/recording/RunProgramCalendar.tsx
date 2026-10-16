import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  catchUpFor,
  daysBetween,
  planMinutes,
  projectRuns,
  projectedFinishDay,
  type ProgramStatus,
} from '@workspace/shared';
import { formatDayLabel } from '../../utils/dayLabel';
import Button from '../ui/Button';

/** Runs listed before "Show all". */
const PREVIEW_RUNS = 7;

const dayText = (day: string, style: 'long' | 'short'): string =>
  formatDayLabel(day, style);

/**
 * When each remaining workout falls, from the person's place, their run days,
 * first day and goal day. Worked out afresh from the next workout due, so a
 * missed run moves everything after it. Says whether the program fits before
 * the goal day.
 */
const RunProgramCalendar: React.FC<{
  status: ProgramStatus;
  schedule: {
    days: number[];
    startDay: string | null;
    endDay: string | null;
  };
  doneDay: string | null;
  /** Today, YYYY-MM-DD. */
  today: string;
  /** Moves the place in the program to this workout (a catch-up). */
  onCatchUp?: (next: number) => void;
}> = ({ status, schedule, doneDay, today, onCatchUp }) => {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  if (status.finished) return null;

  const base = {
    total: status.total,
    next: status.done,
    today,
    doneToday: doneDay === today,
  };
  const plan = {
    runDays: schedule.days,
    startDay: schedule.startDay,
    endDay: schedule.endDay,
  };
  const runs = projectRuns({ ...base, schedule: plan });
  const finish = projectedFinishDay({ ...base, schedule: plan });
  const left = status.total - status.done;

  let fit: string | null = null;
  if (finish && schedule.endDay) {
    const gap = daysBetween(finish, schedule.endDay);
    fit =
      gap >= 0
        ? t('runPrograms.calendar.fitsBefore', {
            count: gap,
            date: dayText(finish, 'long'),
            defaultValue:
              'On track: you finish on {{date}}, {{count}} days before your goal date.',
            defaultValue_one:
              'On track: you finish on {{date}}, {{count}} day before your goal date.',
            defaultValue_other:
              'On track: you finish on {{date}}, {{count}} days before your goal date.',
          })
        : t('runPrograms.calendar.fitsAfter', {
            count: -gap,
            date: dayText(finish, 'long'),
            defaultValue:
              'At this pace you finish on {{date}}, {{count}} days after your goal date. Add a workout day or move the date.',
            defaultValue_one:
              'At this pace you finish on {{date}}, {{count}} day after your goal date. Add a workout day or move the date.',
            defaultValue_other:
              'At this pace you finish on {{date}}, {{count}} days after your goal date. Add a workout day or move the date.',
          });
  }

  const catchUp = catchUpFor({ ...base, schedule: plan });

  const shown = showAll ? runs : runs.slice(0, PREVIEW_RUNS);
  return (
    <View
      className="bg-surface rounded-xl p-4 mt-4"
      testID="run-program-calendar"
    >
      <Text className="text-text-primary text-base font-semibold">
        {t('runPrograms.calendar.title', { defaultValue: 'Schedule' })}
      </Text>
      {schedule.days.length === 0 ? (
        <Text className="text-text-secondary text-sm mt-2">
          {t('runPrograms.calendar.noDays', {
            count: left,
            defaultValue:
              '{{count}} workouts left. Pick your workout days to see when each one falls; until then the Diary offers the next one every day.',
            defaultValue_one:
              '{{count}} workout left. Pick your workout days to see when each one falls; until then the Diary offers the next one every day.',
            defaultValue_other:
              '{{count}} workouts left. Pick your workout days to see when each one falls; until then the Diary offers the next one every day.',
          })}
        </Text>
      ) : (
        <>
          {finish ? (
            <Text className="text-text-secondary text-sm mt-1">
              {t('runPrograms.calendar.finish', {
                date: dayText(finish, 'long'),
                defaultValue: 'Finishes on {{date}}.',
              })}
            </Text>
          ) : null}
          {fit ? (
            <Text className="text-text-secondary text-sm mt-1">{fit}</Text>
          ) : null}
          {catchUp.state === 'skip' && onCatchUp ? (
            <View className="mt-2" testID="run-program-catch-up">
              <Text className="text-text-secondary text-sm">
                {t('runPrograms.calendar.catchUp', {
                  count: catchUp.skip,
                  date: dayText(catchUp.finishDay, 'long'),
                  defaultValue:
                    'Skip the next {{count}} workouts to finish on {{date}}, in time for your goal. The last workout is never skipped.',
                  defaultValue_one:
                    'Skip the next {{count}} workout to finish on {{date}}, in time for your goal. The last workout is never skipped.',
                  defaultValue_other:
                    'Skip the next {{count}} workouts to finish on {{date}}, in time for your goal. The last workout is never skipped.',
                })}
              </Text>
              <View className="mt-2">
                <Button
                  variant="outline"
                  onPress={() => onCatchUp(catchUp.next)}
                  testID="run-program-catch-up-button"
                >
                  {t('runPrograms.calendar.catchUpButton', {
                    count: catchUp.skip,
                    defaultValue: 'Skip {{count}} workouts',
                    defaultValue_one: 'Skip {{count}} workout',
                    defaultValue_other: 'Skip {{count}} workouts',
                  })}
                </Button>
              </View>
            </View>
          ) : null}
          {catchUp.state === 'tooFar' ? (
            <Text
              className="text-text-secondary text-sm mt-1"
              testID="run-program-too-far"
            >
              {t('runPrograms.calendar.tooFar', {
                count: catchUp.late,
                defaultValue:
                  'You are too far behind to catch up by skipping: {{count}} workouts will not fit. Add workout days or move your goal date.',
                defaultValue_one:
                  'You are too far behind to catch up by skipping: {{count}} workout will not fit. Add workout days or move your goal date.',
                defaultValue_other:
                  'You are too far behind to catch up by skipping: {{count}} workouts will not fit. Add workout days or move your goal date.',
              })}
            </Text>
          ) : null}
          <Text className="text-text-muted text-xs mt-1">
            {t('runPrograms.calendar.moves', {
              defaultValue:
                'A workout you miss is not skipped: the dates after it move along.',
            })}
          </Text>
          <View className="mt-3">
            {shown.map((run) => {
              const workout = status.program.workouts[run.index];
              if (!workout) return null;
              return (
                <View
                  key={run.index}
                  className="flex-row justify-between py-1.5 border-b border-border-subtle"
                >
                  <Text className="text-text-primary text-sm">
                    {dayText(run.day, 'short')}
                    {run.day === today
                      ? ` · ${t('date.today', { defaultValue: 'Today' })}`
                      : ''}
                  </Text>
                  <Text className="text-text-secondary text-sm">
                    {status.program.activity === 'walk'
                      ? t('runPrograms.calendar.rowWalk', {
                          week: workout.week + 1,
                          walk: workout.day + 1,
                          minutes: planMinutes(workout.plan),
                          defaultValue:
                            'Week {{week}}, walk {{walk}} · {{minutes}} min',
                        })
                      : t('runPrograms.calendar.row', {
                          week: workout.week + 1,
                          run: workout.day + 1,
                          minutes: planMinutes(workout.plan),
                          defaultValue:
                            'Week {{week}}, run {{run}} · {{minutes}} min',
                        })}
                  </Text>
                </View>
              );
            })}
          </View>
          {runs.length > PREVIEW_RUNS ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAll((value) => !value)}
              className="mt-2"
            >
              <Text className="text-accent-primary text-sm font-semibold">
                {showAll
                  ? t('runPrograms.calendar.showLess', {
                      defaultValue: 'Show fewer',
                    })
                  : t('runPrograms.calendar.showAll', {
                      count: runs.length,
                      defaultValue: 'Show all {{count}}',
                      defaultValue_one: 'Show {{count}}',
                      defaultValue_other: 'Show all {{count}}',
                    })}
              </Text>
            </Pressable>
          ) : null}
          {runs.length < left ? (
            <Text className="text-text-muted text-xs mt-2">
              {t('runPrograms.calendar.cutOff', {
                count: left - runs.length,
                defaultValue:
                  '{{count}} workouts do not fit before your goal date.',
                defaultValue_one:
                  '{{count}} workout does not fit before your goal date.',
                defaultValue_other:
                  '{{count}} workouts do not fit before your goal date.',
              })}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
};

export default RunProgramCalendar;
