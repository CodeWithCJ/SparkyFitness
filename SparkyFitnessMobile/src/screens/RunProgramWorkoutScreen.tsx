import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  planMinutes,
  runMinutes,
  type IndividualSessionResponse,
} from '@workspace/shared';
import Button from '../components/ui/Button';
import {
  programTitle,
  workoutTitle,
} from '../components/recording/RunProgramCard';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { fetchExerciseEntry } from '../services/api/exerciseStatsApi';
import { addLog } from '../services/LogService';
import {
  setProgramPosition,
  useRunProgram,
} from '../services/runProgramService';
import { toLocalDateString } from '../utils/dateUtils';
import { formatDayLabel } from '../utils/dayLabel';
import { cardioSessionFromDiaryEntry } from '../utils/cardioSession';
import { formatClock } from '../utils/gpsRecording';
import { buildProgramTimeline } from '../utils/programTimeline';
import { intervalStepName } from '../utils/recordingCues';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'RunProgramWorkout'>;

const isoToLocalDay = (iso: string): string => toLocalDateString(new Date(iso));

/**
 * One workout of the program. Done: when, the run it was done as and how hard
 * it felt, with a way to repeat it. Due or to come: when the schedule puts it
 * and the steps it will ask for.
 */
const RunProgramWorkoutScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { index } = route.params;
  const { program, status, schedule, doneDay, enabled } = useRunProgram();
  const { preferences } = usePreferences();
  const [opening, setOpening] = useState(false);
  const [now] = useState(() => Date.now());
  const today = toLocalDateString(new Date(now));

  const header = useScreenHeader({
    title: t('screens.runProgramWorkout', { defaultValue: 'Workout' }),
    left: { kind: 'back' },
  });

  const item = useMemo(
    () =>
      program && status
        ? buildProgramTimeline({
            total: status.total,
            next: status.done,
            completions: program.completion_log,
            efforts: program.effort_log,
            schedule: {
              runDays: schedule.days,
              startDay: schedule.startDay,
              endDay: schedule.endDay,
            },
            today,
            doneToday: doneDay === today,
            isoToDay: isoToLocalDay,
          })[index]
        : undefined,
    [program, status, schedule, doneDay, today, index]
  );
  const workout = status?.program.workouts[index];

  if (!status || !workout || !item) {
    return (
      <>
        {header}
        <View className="flex-1 bg-background p-4">
          <Text className="text-text-secondary text-base text-center mt-8">
            {t('runPrograms.detail.notFound', {
              defaultValue: 'This workout is not in your program any more.',
            })}
          </Text>
        </View>
      </>
    );
  }

  const distanceUnit =
    preferences?.default_distance_unit === 'miles' ? 'miles' : 'km';

  const openRun = async (entryId: string) => {
    setOpening(true);
    try {
      const entry = await fetchExerciseEntry(entryId);
      const session = {
        ...entry,
        type: 'individual',
        name: entry.exercise_snapshot?.name ?? null,
      } as IndividualSessionResponse;
      const cardio = cardioSessionFromDiaryEntry(session, distanceUnit, {
        allowInApp: true,
      });
      if (cardio) {
        navigation.navigate('CardioSession', {
          session: cardio,
          distanceUnit,
          diaryEntry: session,
        });
      } else {
        navigation.navigate('ActivityDetail', { session });
      }
    } catch (error) {
      addLog(`[Run Program] Could not open the run: ${error}`, 'WARNING');
      Toast.show({
        type: 'error',
        text1: t('runPrograms.detail.openFailed', {
          defaultValue: 'Could not open that run',
        }),
        text2: t('runPrograms.detail.openFailedHint', {
          defaultValue: 'It may have been deleted from your diary.',
        }),
      });
    } finally {
      setOpening(false);
    }
  };

  const moveTo = (confirmKey: 'repeat' | 'jump') => {
    const repeat = confirmKey === 'repeat';
    Alert.alert(
      repeat
        ? t('runPrograms.detail.repeatTitle', {
            defaultValue: 'Repeat this workout?',
          })
        : t('runPrograms.detail.jumpTitle', {
            defaultValue: 'Make this the next workout?',
          }),
      repeat
        ? t('runPrograms.detail.repeatMessage', {
            defaultValue:
              'Your place moves back to this workout. The ones after it come round again.',
          })
        : t('runPrograms.detail.jumpMessage', {
            defaultValue:
              'Your place moves forward to this workout, skipping the ones before it.',
          }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.continue', { defaultValue: 'Continue' }),
          onPress: () => {
            void setProgramPosition(index)
              .then(() => navigation.goBack())
              .catch((error: unknown) => {
                addLog(
                  `[Run Program] Could not move the place: ${error}`,
                  'WARNING'
                );
                Toast.show({
                  type: 'error',
                  text1: t('recordActivity.program.errors.update', {
                    defaultValue: 'Could not update your program',
                  }),
                });
              });
          },
        },
      ]
    );
  };

  const stateLabel =
    item.state === 'done'
      ? t('runPrograms.detail.stateDone', { defaultValue: 'Done' })
      : item.state === 'next'
        ? t('runPrograms.detail.stateNext', { defaultValue: 'Next workout' })
        : t('runPrograms.detail.stateUpcoming', { defaultValue: 'Coming up' });
  const dateLine = item.day
    ? item.state === 'done'
      ? t('runPrograms.detail.doneOn', {
          date: formatDayLabel(item.day, 'long'),
          defaultValue: 'Done on {{date}}',
        })
      : t('runPrograms.detail.scheduledOn', {
          date: formatDayLabel(item.day, 'long'),
          defaultValue: 'Scheduled for {{date}}',
        })
    : item.state === 'done'
      ? null
      : t('runPrograms.detail.notScheduled', {
          defaultValue:
            'No date yet. Pick your workout days on the program screen.',
        });

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <Text className="text-text-muted text-xs">
          {programTitle(t, status.program)}
        </Text>
        <Text
          className="text-text-primary text-2xl font-bold"
          testID="workout-title"
        >
          {workoutTitle(t, status.program, workout)}
        </Text>
        <View className="flex-row items-center gap-2 mt-1">
          <Text
            testID="workout-state"
            className={`text-sm font-semibold ${
              item.state === 'done'
                ? 'text-text-success'
                : item.state === 'next'
                  ? 'text-accent-primary'
                  : 'text-text-secondary'
            }`}
          >
            {stateLabel}
          </Text>
          {dateLine ? (
            <Text className="text-text-secondary text-sm">· {dateLine}</Text>
          ) : null}
        </View>

        <View className="flex-row gap-3 mt-4">
          <View className="flex-1 bg-surface rounded-xl p-3">
            <Text className="text-text-muted text-xs">
              {t('runPrograms.detail.totalTime', {
                defaultValue: 'Total time',
              })}
            </Text>
            <Text className="text-text-primary text-lg font-bold">
              {t('runPrograms.calendarScreen.minutes', {
                minutes: planMinutes(workout.plan),
                defaultValue: '{{minutes}} min',
              })}
            </Text>
          </View>
          <View className="flex-1 bg-surface rounded-xl p-3">
            <Text className="text-text-muted text-xs">
              {status.program.activity === 'walk'
                ? t('runPrograms.detail.briskTime', {
                    defaultValue: 'Brisk walking',
                  })
                : t('runPrograms.detail.runTime', { defaultValue: 'Running' })}
            </Text>
            <Text className="text-text-primary text-lg font-bold">
              {t('runPrograms.calendarScreen.minutes', {
                minutes: runMinutes(workout.plan),
                defaultValue: '{{minutes}} min',
              })}
            </Text>
          </View>
        </View>

        {item.rating != null ? (
          <View className="bg-surface rounded-xl p-3 mt-3">
            <Text className="text-text-muted text-xs">
              {t('runPrograms.detail.howHard', {
                defaultValue: 'How hard it felt',
              })}
            </Text>
            <Text
              testID="workout-rating"
              className="text-text-primary text-lg font-bold"
            >
              {t('runPrograms.detail.rating', {
                rating: item.rating,
                defaultValue: '{{rating}} out of 10',
              })}
            </Text>
          </View>
        ) : null}

        <View className="bg-surface rounded-xl p-4 mt-3" testID="workout-steps">
          <Text className="text-text-primary text-base font-semibold">
            {t('runPrograms.detail.steps', { defaultValue: 'Steps' })}
          </Text>
          {workout.plan.steps.map((step, stepIndex) => (
            <View
              key={`${stepIndex}-${step.kind}`}
              className="flex-row justify-between py-1.5 border-b border-border-subtle"
            >
              <Text className="text-text-primary text-sm">
                {intervalStepName(t, step.kind, workout.plan.style)}
              </Text>
              <Text className="text-text-secondary text-sm">
                {formatClock(step.seconds)}
              </Text>
            </View>
          ))}
        </View>

        <View className="mt-4 gap-3">
          {item.state === 'done' && item.entryId ? (
            <Button
              variant="primary"
              loading={opening}
              onPress={() => void openRun(item.entryId!)}
            >
              {t('runPrograms.detail.viewRun', {
                defaultValue: 'View your run',
              })}
            </Button>
          ) : null}
          {item.state === 'next' && enabled ? (
            <Button
              variant="primary"
              onPress={() =>
                navigation.navigate('RecordActivity', { programWorkout: true })
              }
            >
              {t('runPrograms.detail.start', {
                defaultValue: 'Start this workout',
              })}
            </Button>
          ) : null}
          {item.state === 'done' ? (
            <Button variant="outline" onPress={() => moveTo('repeat')}>
              {t('runPrograms.detail.repeat', {
                defaultValue: 'Repeat this workout',
              })}
            </Button>
          ) : null}
          {item.state === 'upcoming' ? (
            <Button variant="outline" onPress={() => moveTo('jump')}>
              {t('runPrograms.detail.jump', {
                defaultValue: 'Make this the next workout',
              })}
            </Button>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
};

export default RunProgramWorkoutScreen;
