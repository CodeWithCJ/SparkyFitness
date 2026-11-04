import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import {
  planMinutes,
  programRunForDate,
  suggestFromBreak,
  suggestFromLoad,
  type ExerciseSessionResponse,
} from '@workspace/shared';
import Icon from '../Icon';
import Button from '../ui/Button';
import {
  adjustProgramRunning,
  completeProgramWorkout,
  useRunProgram,
} from '../../services/runProgramService';
import { useTrainingLoad } from '../../hooks/useTrainingLoad';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { addLog } from '../../services/LogService';
import { toLocalDateString } from '../../utils/dateUtils';
import { findLoggedRun } from '../../utils/loggedRun';
import { customWorkoutTitle, programTitle } from './RunProgramCard';
import ZoneCheckNote from './ZoneCheckNote';

/** The current time, read when the Diary renders. */
const clockNow = (): number => Date.now();

/**
 * The Diary's card for the training program's workout, in the style of a
 * scheduled workout plan: on a run day (or any day, when no days are chosen)
 * it offers the workout with a Start button, and on days still to come it
 * shows what is scheduled. If a run was already logged today some other way, it
 * offers to count that run as the workout instead.
 */
const RunProgramBanner: React.FC<{
  /** The day the Diary is showing, YYYY-MM-DD. */
  date: string;
  /** The day's logged exercise, to spot a run logged some other way. */
  exerciseEntries: readonly ExerciseSessionResponse[];
  onStart: () => void;
}> = ({ date, exerciseEntries, onStart }) => {
  const { t } = useTranslation();
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];
  // Read each render: this card stays mounted on the Diary tab overnight.
  const today = toLocalDateString(new Date());
  const [counting, setCounting] = useState(false);
  const [easing, setEasing] = useState(false);
  const [easeDismissed, setEaseDismissed] = useState(false);
  const {
    status,
    enabled,
    schedule,
    doneDay,
    lastAdjustment,
    loaded,
    refetch,
  } = useRunProgram();
  const { load } = useTrainingLoad();
  // The program may have changed on another device or through Sparky.
  useRefetchOnFocus(refetch, true);

  const run =
    loaded && status
      ? programRunForDate({
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
        })
      : null;
  const workout = run && status ? status.program.workouts[run.index] : null;
  if (!run || !status || !workout) return null;

  const minutes = planMinutes(workout.plan);
  const isToday = date === today;
  const logged = isToday
    ? findLoggedRun(exerciseEntries, minutes, status.program.activity)
    : null;

  const breakOffer =
    isToday && status.program.activity !== 'walk' && !easeDismissed
      ? suggestFromBreak({
          lastDoneDay: doneDay,
          today,
          next: status.done,
          total: status.total,
          lastAdjustedDay: lastAdjustment
            ? toLocalDateString(new Date(lastAdjustment.at))
            : null,
        })
      : null;
  // Training load only speaks up when the break offer has nothing to say.
  const loadOffer =
    !breakOffer &&
    isToday &&
    status.program.activity !== 'walk' &&
    !easeDismissed &&
    load
      ? suggestFromLoad({
          status: load.status,
          next: status.done,
          total: status.total,
          lastAdjustedAt: lastAdjustment?.at ?? null,
          nowMs: clockNow(),
        })
      : null;
  const ease = breakOffer
    ? { ...breakOffer, reason: 'break' as const }
    : loadOffer
      ? { ...loadOffer, reason: 'load' as const }
      : null;

  const easeBackIn = async (percent: number, count: number) => {
    setEasing(true);
    try {
      await adjustProgramRunning(percent, count);
    } catch (error) {
      addLog(`[Run Program] Could not ease back in: ${error}`, 'WARNING');
      Toast.show({
        type: 'error',
        text1: t('recordActivity.program.errors.update', {
          defaultValue: 'Could not update your program',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    } finally {
      setEasing(false);
    }
  };

  const countLoggedRun = async (entryId: string) => {
    setCounting(true);
    try {
      await completeProgramWorkout(
        status.program.id,
        run.index,
        undefined,
        entryId
      );
    } catch (error) {
      addLog(`[Run Program] Could not count the run: ${error}`, 'WARNING');
      Toast.show({
        type: 'error',
        text1: t('recordActivity.program.errors.update', {
          defaultValue: 'Could not update your program',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    } finally {
      setCounting(false);
    }
  };

  return (
    <View
      className="bg-surface rounded-xl p-4 mb-2 shadow-sm"
      testID="run-program-banner"
    >
      <View className="flex-row items-center gap-1.5 mb-2">
        <Icon name="calendar" size={14} color={accent || '#3B82F6'} />
        <Text
          className="text-xs font-semibold text-text-secondary flex-1"
          numberOfLines={1}
        >
          {programTitle(t, status.program)} •{' '}
          {run.kind === 'upNext'
            ? t('runPrograms.banner.upNext', { defaultValue: 'Up next' })
            : isToday
              ? t('runPrograms.banner.scheduledToday', {
                  defaultValue: 'Scheduled Today',
                })
              : t('runPrograms.banner.scheduled', {
                  defaultValue: 'Scheduled',
                })}
        </Text>
      </View>
      <View className="flex-row items-center justify-between">
        <Text
          className="text-base font-semibold text-text-primary flex-1 mr-3"
          numberOfLines={2}
        >
          {status.program.custom
            ? t('runPrograms.banner.titleCustom', {
                title: customWorkoutTitle(t, workout),
                minutes,
                defaultValue: '{{title}} · {{minutes}} min',
              })
            : status.program.activity === 'walk'
              ? t('runPrograms.banner.titleWalk', {
                  week: workout.week + 1,
                  walk: workout.day + 1,
                  minutes,
                  defaultValue:
                    'Week {{week}}, walk {{walk}} · {{minutes}} min',
                })
              : t('runPrograms.banner.title', {
                  week: workout.week + 1,
                  run: workout.day + 1,
                  minutes,
                  defaultValue: 'Week {{week}}, run {{run}} · {{minutes}} min',
                })}
        </Text>
        {isToday ? (
          <Button variant="primary" onPress={onStart}>
            {t('runPrograms.banner.start', { defaultValue: 'Start' })}
          </Button>
        ) : null}
      </View>
      {isToday ? (
        <ZoneCheckNote program={status.program} workout={workout} />
      ) : null}
      {ease ? (
        <View className="mt-3 pt-3 border-t border-border-subtle">
          <Text className="text-text-secondary text-sm mb-2">
            {ease.reason === 'break'
              ? t('runPrograms.banner.easeBack', {
                  workouts: ease.count,
                  days: ease.daysAway,
                  percent: Math.abs(ease.percent),
                  defaultValue:
                    "It's been {{days}} days since your last workout. Ease the running in the next {{workouts}} workouts by {{percent}}% to build back safely?",
                })
              : t('runPrograms.banner.easeLoad', {
                  workouts: ease.count,
                  percent: Math.abs(ease.percent),
                  defaultValue:
                    'Your training jumped well above your usual this week. Ease the running in the next {{workouts}} workouts by {{percent}}% to lower the injury risk?',
                })}
          </Text>
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              onPress={() => void easeBackIn(ease.percent, ease.count)}
              disabled={easing}
            >
              {t('runPrograms.banner.easeBackAction', {
                defaultValue: 'Ease back in',
              })}
            </Button>
            <Button variant="ghost" onPress={() => setEaseDismissed(true)}>
              {t('runPrograms.banner.easeBackDismiss', {
                defaultValue: 'Not now',
              })}
            </Button>
          </View>
        </View>
      ) : null}
      {logged ? (
        <View className="mt-3 pt-3 border-t border-border-subtle flex-row items-center justify-between">
          <Text className="text-text-secondary text-sm flex-1 mr-3">
            {status.program.activity === 'walk'
              ? t('runPrograms.banner.loggedWalk', {
                  defaultValue:
                    'You logged a walk today. Count it as this workout?',
                })
              : t('runPrograms.banner.loggedRun', {
                  defaultValue:
                    'You logged a run today. Count it as this workout?',
                })}
          </Text>
          <Button
            variant="outline"
            onPress={() => void countLoggedRun(logged.id)}
            disabled={counting}
          >
            {t('runPrograms.banner.countIt', { defaultValue: 'Count it' })}
          </Button>
        </View>
      ) : null}
    </View>
  );
};

export default RunProgramBanner;
