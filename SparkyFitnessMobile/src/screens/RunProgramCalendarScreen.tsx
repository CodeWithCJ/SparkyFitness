import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { planMinutes } from '@workspace/shared';
import Button from '../components/ui/Button';
import ProgramMonthGrid from '../components/recording/ProgramMonthGrid';
import {
  programTitle,
  workoutTitle,
} from '../components/recording/RunProgramCard';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useRunProgram } from '../services/runProgramService';
import { toLocalDateString } from '../utils/dateUtils';
import { formatDayLabel } from '../utils/dayLabel';
import { monthOf } from '../utils/monthGrid';
import {
  buildProgramTimeline,
  itemsByDay,
  type TimelineItem,
} from '../utils/programTimeline';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'RunProgramCalendar'>;

const isoToLocalDay = (iso: string): string => toLocalDateString(new Date(iso));

/**
 * Every workout of the program on a calendar: the ones done, the one due and
 * the ones still to come, on the days the schedule puts them. A tap on a day
 * lists its workouts; a tap on a workout opens it, with the run it was done as
 * or the steps it will ask for.
 */
const RunProgramCalendarScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { program, status, schedule, doneDay, loaded } = useRunProgram();
  const { preferences } = usePreferences();
  const firstDayOfWeek = preferences?.first_day_of_week ?? 1;
  const [now] = useState(() => Date.now());
  const today = toLocalDateString(new Date(now));

  const header = useScreenHeader({
    title: t('screens.runProgramCalendar', {
      defaultValue: 'Program calendar',
    }),
    left: { kind: 'back' },
  });

  const items = useMemo<TimelineItem[]>(
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
          })
        : [],
    [program, status, schedule, doneDay, today]
  );
  const byDay = useMemo(() => itemsByDay(items), [items]);

  const [month, setMonth] = useState(() => monthOf(today));
  const [selectedDay, setSelectedDay] = useState<string | null>(today);

  if (!loaded || !program || !status) {
    return (
      <>
        {header}
        <View className="flex-1 bg-background p-4">
          {loaded ? (
            <Text className="text-text-secondary text-base text-center mt-8">
              {t('runPrograms.calendarScreen.noProgram', {
                defaultValue: 'Start a training program to see its calendar.',
              })}
            </Text>
          ) : null}
        </View>
      </>
    );
  }

  const workouts = status.program.workouts;
  const open = (index: number) =>
    navigation.navigate('RunProgramWorkout', { index });
  const dayItems = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const undated = items.filter((item) => item.state !== 'done' && !item.day);

  const stateText = (item: TimelineItem): string => {
    if (item.state === 'done') {
      return item.day
        ? t('runPrograms.calendarScreen.doneOn', {
            date: formatDayLabel(item.day),
            defaultValue: 'Done {{date}}',
          })
        : t('runPrograms.calendarScreen.done', { defaultValue: 'Done' });
    }
    if (item.state === 'next') {
      return item.day
        ? t('runPrograms.calendarScreen.dueOn', {
            date: formatDayLabel(item.day),
            defaultValue: 'Next · {{date}}',
          })
        : t('runPrograms.calendarScreen.due', { defaultValue: 'Next' });
    }
    return item.day
      ? formatDayLabel(item.day)
      : t('runPrograms.calendarScreen.notScheduled', {
          defaultValue: 'Not scheduled',
        });
  };

  const row = (item: TimelineItem, compact = false) => {
    const workout = workouts[item.index];
    if (!workout) return null;
    return (
      <Pressable
        key={item.index}
        testID={`calendar-workout-${item.index}`}
        accessibilityRole="button"
        onPress={() => open(item.index)}
        className="flex-row items-center justify-between py-2.5 border-b border-border-subtle"
      >
        <View className="flex-1 mr-3">
          <Text className="text-text-primary text-sm font-semibold">
            {workoutTitle(t, status.program, workout)}
          </Text>
          <Text className="text-text-secondary text-xs mt-0.5">
            {compact
              ? stateText(item)
              : t('runPrograms.calendarScreen.minutes', {
                  minutes: planMinutes(workout.plan),
                  defaultValue: '{{minutes}} min',
                })}
          </Text>
        </View>
        <Text
          className={`text-xs font-semibold ${
            item.state === 'done'
              ? 'text-text-success'
              : item.state === 'next'
                ? 'text-accent-primary'
                : 'text-text-muted'
          }`}
        >
          {compact
            ? t('runPrograms.calendarScreen.minutes', {
                minutes: planMinutes(workout.plan),
                defaultValue: '{{minutes}} min',
              })
            : stateText(item)}
        </Text>
      </Pressable>
    );
  };

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
        <Text className="text-text-primary text-lg font-bold">
          {programTitle(t, status.program)}
        </Text>
        <Text className="text-text-secondary text-sm mb-3">
          {t('runPrograms.calendarScreen.progress', {
            done: status.done,
            total: status.total,
            defaultValue: '{{done}} of {{total}} workouts done',
          })}
        </Text>

        <ProgramMonthGrid
          month={month}
          onMonthChange={setMonth}
          firstDayOfWeek={firstDayOfWeek}
          today={today}
          itemsByDay={byDay}
          selectedDay={selectedDay}
          onSelectDay={(day) => {
            setSelectedDay(day);
            setMonth(monthOf(day));
          }}
        />
        <View className="flex-row gap-4 mt-2 mb-3">
          <View className="flex-row items-center gap-1.5">
            <View className="w-2 h-2 rounded-full bg-text-success" />
            <Text className="text-text-muted text-xs">
              {t('runPrograms.calendarScreen.legendDone', {
                defaultValue: 'Done',
              })}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="w-2 h-2 rounded-full bg-accent-primary" />
            <Text className="text-text-muted text-xs">
              {t('runPrograms.calendarScreen.legendAhead', {
                defaultValue: 'Due or to come',
              })}
            </Text>
          </View>
        </View>

        {selectedDay ? (
          <View
            className="bg-surface rounded-xl p-4"
            testID="calendar-day-panel"
          >
            <Text className="text-text-primary text-base font-semibold">
              {formatDayLabel(selectedDay, 'long')}
            </Text>
            {dayItems.length === 0 ? (
              <Text className="text-text-secondary text-sm mt-2">
                {t('runPrograms.calendarScreen.noWorkoutsDay', {
                  defaultValue: 'No program workout on this day.',
                })}
              </Text>
            ) : (
              <View className="mt-1">{dayItems.map((item) => row(item))}</View>
            )}
          </View>
        ) : null}

        {undated.length > 0 ? (
          <Text className="text-text-muted text-xs mt-3">
            {schedule.days.length === 0
              ? t('runPrograms.calendarScreen.pickDays', {
                  count: undated.length,
                  defaultValue_one:
                    '{{count}} more workout is not on the calendar yet. Pick your workout days on the program screen to see when each one falls.',
                  defaultValue_other:
                    '{{count}} more workouts are not on the calendar yet. Pick your workout days on the program screen to see when each one falls.',
                  defaultValue:
                    '{{count}} more workouts are not on the calendar yet. Pick your workout days on the program screen to see when each one falls.',
                })
              : t('runPrograms.calendarScreen.pastGoal', {
                  count: undated.length,
                  defaultValue_one:
                    '{{count}} workout does not fit before your goal date.',
                  defaultValue_other:
                    '{{count}} workouts do not fit before your goal date.',
                  defaultValue:
                    '{{count}} workouts do not fit before your goal date.',
                })}
          </Text>
        ) : null}

        <View className="bg-surface rounded-xl p-4 mt-4" testID="calendar-all">
          <Text className="text-text-primary text-base font-semibold">
            {t('runPrograms.calendarScreen.allWorkouts', {
              defaultValue: 'All workouts',
            })}
          </Text>
          {items.map((item) => row(item, true))}
        </View>

        <View className="mt-4">
          <Button
            variant="outline"
            onPress={() => {
              setSelectedDay(today);
              setMonth(monthOf(today));
            }}
          >
            {t('runPrograms.calendarScreen.today', { defaultValue: 'Today' })}
          </Button>
        </View>
      </ScrollView>
    </>
  );
};

export default RunProgramCalendarScreen;
