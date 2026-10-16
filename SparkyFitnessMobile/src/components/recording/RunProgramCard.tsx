import React, { useRef } from 'react';
import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Button from '../ui/Button';
import ProgramActionRow, { ProgramActionList } from './ProgramActionRow';
import Switch from '../ui/Switch';
import BottomSheetPicker, {
  type PickerOption,
  type PickerSection,
} from '../BottomSheetPicker';
import { formatLocalizedNumber, getAppLocale } from '../../localization';
import CalendarSheet, { type CalendarSheetRef } from '../CalendarSheet';
import type { ProgramScheduleChange } from '../../services/runProgramService';
import { toLocalDateString } from '../../utils/dateUtils';
import { formatDayLabel } from '../../utils/dayLabel';
import {
  addDays,
  findProgram,
  planMinutes,
  programOutline,
  RUN_PROGRAMS,
  type ProgramStatus,
  type ProgramWorkout,
  type RunProgram,
  type RunProgramAdjustment,
} from '@workspace/shared';

/** A program's name: the person's own for a custom one, else the built-in's. */
export function programTitle(t: TFunction, program: RunProgram): string {
  return program.custom?.name || programName(t, program.id);
}

/** "Workout 4" or the person's own name for a workout of a custom program. */
export function customWorkoutTitle(
  t: TFunction,
  workout: ProgramWorkout
): string {
  return (
    workout.title ||
    t('runPrograms.custom.workoutNumber', {
      number: workout.week * 7 + workout.day + 1,
      defaultValue: 'Workout {{number}}',
    })
  );
}

export function programName(t: TFunction, id: string): string {
  switch (id) {
    case 'walkFit':
      return t('recordActivity.program.name.walkFit', {
        defaultValue: 'Walk for fitness',
      });
    case 'beginner5k':
      return t('recordActivity.program.name.beginner5k', {
        defaultValue: 'Beginner 5K',
      });
    case 'fiveToTenK':
      return t('recordActivity.program.name.fiveToTenK', {
        defaultValue: '5K to 10K',
      });
    case 'faster5k':
      return t('recordActivity.program.name.faster5k', {
        defaultValue: 'Faster 5K',
      });
    case 'halfMarathon':
      return t('recordActivity.program.name.halfMarathon', {
        defaultValue: 'Half marathon',
      });
    case 'marathon':
      return t('recordActivity.program.name.marathon', {
        defaultValue: 'Marathon',
      });
    case 'walk10k':
      return t('recordActivity.program.name.walk10k', {
        defaultValue: 'Brisk walk 10K',
      });
    case 'returnToRunning':
      return t('recordActivity.program.name.returnToRunning', {
        defaultValue: 'Return to running',
      });
    case 'gentle5k':
      return t('recordActivity.program.name.gentle5k', {
        defaultValue: 'Gentle 5K',
      });
    case 'beginner10k':
      return t('recordActivity.program.name.beginner10k', {
        defaultValue: 'Beginner 10K',
      });
    case 'faster10k':
      return t('recordActivity.program.name.faster10k', {
        defaultValue: 'Faster 10K',
      });
    case 'tenKToHalf':
      return t('recordActivity.program.name.tenKToHalf', {
        defaultValue: '10K to half marathon',
      });
    case 'fasterHalf':
      return t('recordActivity.program.name.fasterHalf', {
        defaultValue: 'Faster half marathon',
      });
    case 'beginnerMarathon':
      return t('recordActivity.program.name.beginnerMarathon', {
        defaultValue: 'Beginner marathon',
      });
    case 'advancedMarathon':
      return t('recordActivity.program.name.advancedMarathon', {
        defaultValue: 'Advanced marathon',
      });
    case 'halfMarathon4':
      return t('recordActivity.program.name.halfMarathon4', {
        defaultValue: 'Half marathon (4 runs a week)',
      });
    case 'tenKToHalf4':
      return t('recordActivity.program.name.tenKToHalf4', {
        defaultValue: '10K to half marathon (4 runs a week)',
      });
    case 'fasterHalf4':
      return t('recordActivity.program.name.fasterHalf4', {
        defaultValue: 'Faster half marathon (4 runs a week)',
      });
    case 'beginnerMarathon4':
      return t('recordActivity.program.name.beginnerMarathon4', {
        defaultValue: 'Beginner marathon (4 runs a week)',
      });
    default:
      return id;
  }
}

/** A sentence on who a program is for and what it does. */
export function programDescription(t: TFunction, id: string): string {
  switch (id) {
    case 'walkFit':
      return t('recordActivity.program.walkFitDescription', {
        defaultValue:
          'Walk for fitness: eight weeks, three walks a week, with no running. You alternate brisk and easy walking and build up to 30 minutes of brisk walking.',
      });
    case 'beginner5k':
      return t('recordActivity.program.beginner5kDescription', {
        defaultValue:
          'Beginner 5K: nine weeks, three runs a week. You alternate running and walking, and build up to 30 minutes of running.',
      });
    case 'fiveToTenK':
      return t('recordActivity.program.fiveToTenKDescription', {
        defaultValue:
          '5K to 10K: eight weeks, three runs a week, for when you can run 30 minutes. It builds to a 65 minute long run.',
      });
    case 'faster5k':
      return t('recordActivity.program.faster5kDescription', {
        defaultValue:
          'Faster 5K: six weeks of speed sessions, easy runs and tempo runs, for when you already run 5K.',
      });
    case 'halfMarathon':
      return t('recordActivity.program.halfMarathonDescription', {
        defaultValue:
          'Half marathon: twelve weeks, three runs a week, with long runs building to about two hours. For when you run 30 minutes comfortably.',
      });
    case 'marathon':
      return t('recordActivity.program.marathonDescription', {
        defaultValue:
          'Marathon: sixteen weeks, four runs a week, with long runs building to about 2¾ hours and a taper. For people who already run regularly.',
      });
    case 'walk10k':
      return t('recordActivity.program.walk10kDescription', {
        defaultValue:
          'Brisk walk 10K: ten weeks, three walks a week, with no running. You build up to a 10K walk of about an hour and three quarters.',
      });
    case 'returnToRunning':
      return t('recordActivity.program.returnToRunningDescription', {
        defaultValue:
          'Return to running: four weeks, three runs a week, for easing back in after a break. You build from one-minute runs to about 20 minutes of running. Leave a day or two between runs and keep the pace easy. If you are coming back from an injury, check with a physio or doctor first.',
      });
    case 'gentle5k':
      return t('recordActivity.program.gentle5kDescription', {
        defaultValue:
          'Gentle 5K: twelve weeks, three runs a week. A slower start than Beginner 5K, with very short runs between long walks, building to 30 minutes of running.',
      });
    case 'beginner10k':
      return t('recordActivity.program.beginner10kDescription', {
        defaultValue:
          'Beginner 10K: twelve weeks, three runs a week, starting from walking. You build up to running for an hour.',
      });
    case 'faster10k':
      return t('recordActivity.program.faster10kDescription', {
        defaultValue:
          'Faster 10K: eight weeks of speed sessions, easy runs and tempo runs, for when you already run 10K.',
      });
    case 'tenKToHalf':
      return t('recordActivity.program.tenKToHalfDescription', {
        defaultValue:
          '10K to half marathon: ten weeks, three runs a week, for when you can run 10K. Long runs build from 65 to 115 minutes.',
      });
    case 'fasterHalf':
      return t('recordActivity.program.fasterHalfDescription', {
        defaultValue:
          'Faster half marathon: ten weeks of speed sessions, easy runs and long runs with tempo work, for when you have run a half marathon before.',
      });
    case 'beginnerMarathon':
      return t('recordActivity.program.beginnerMarathonDescription', {
        defaultValue:
          'Beginner marathon: eighteen weeks, three runs a week, with long runs building to 2½ hours and a taper. For when you can run 10K.',
      });
    case 'advancedMarathon':
      return t('recordActivity.program.advancedMarathonDescription', {
        defaultValue:
          'Advanced marathon: sixteen weeks, five runs a week, with speed or tempo work and long runs building to three hours. For experienced runners.',
      });
    case 'halfMarathon4':
      return t('recordActivity.program.halfMarathon4Description', {
        defaultValue:
          'Half marathon: twelve weeks, four runs a week, with long runs building to about two hours. For when you run 30 minutes comfortably.',
      });
    case 'tenKToHalf4':
      return t('recordActivity.program.tenKToHalf4Description', {
        defaultValue:
          '10K to half marathon: ten weeks, four runs a week, with long runs building to about two hours. For when you can run 10K.',
      });
    case 'beginnerMarathon4':
      return t('recordActivity.program.beginnerMarathon4Description', {
        defaultValue:
          'Beginner marathon: eighteen weeks, four runs a week, with long runs building to 2⅔ hours and a taper. For when you can run 10K.',
      });
    case 'fasterHalf4':
      return t('recordActivity.program.fasterHalf4Description', {
        defaultValue:
          'Faster half marathon: ten weeks, four runs a week, with a speed session, easy runs and a long run with tempo work. For when you have run a half marathon before.',
      });
    default:
      return id;
  }
}

/** "Week 3, run 2" for a workout of `program`, without the program's name. */
export function workoutTitle(
  t: TFunction,
  program: RunProgram,
  workout: ProgramWorkout
): string {
  if (program.custom) return customWorkoutTitle(t, workout);
  if (program.activity === 'walk') {
    return t('runPrograms.detail.workoutTitleWalk', {
      week: workout.week + 1,
      walk: workout.day + 1,
      defaultValue: 'Week {{week}}, walk {{walk}}',
    });
  }
  return t('runPrograms.detail.workoutTitle', {
    week: workout.week + 1,
    run: workout.day + 1,
    defaultValue: 'Week {{week}}, run {{run}}',
  });
}

/** "Week 3, run 2" for a program workout. */
export function programWorkoutLabel(
  t: TFunction,
  status: ProgramStatus
): string {
  const workout = status.workout;
  if (!workout) return programTitle(t, status.program);
  if (status.program.custom) {
    return t('recordActivity.program.customWorkoutLabel', {
      name: programTitle(t, status.program),
      workout: customWorkoutTitle(t, workout),
      defaultValue: '{{name}} · {{workout}}',
    });
  }
  if (status.program.activity === 'walk') {
    return t('recordActivity.program.workoutLabelWalk', {
      name: programTitle(t, status.program),
      week: workout.week + 1,
      walk: workout.day + 1,
      defaultValue: '{{name}} · Week {{week}}, walk {{walk}}',
    });
  }
  return t('recordActivity.program.workoutLabel', {
    name: programTitle(t, status.program),
    week: workout.week + 1,
    run: workout.day + 1,
    defaultValue: '{{name}} · Week {{week}}, run {{run}}',
  });
}

const weekdayLabel = (day: number, style: 'narrow' | 'long'): string =>
  // 2024-01-07 was a Sunday, so day 0 is Sunday.
  new Date(2024, 0, 7 + day).toLocaleDateString(getAppLocale(), {
    weekday: style,
  });

/** When the Diary offers the workout: weekdays (none = every day) and first day. */
export interface RunSchedule {
  days: number[];
  startDay: string | null;
  endDay: string | null;
}

interface Props {
  /** The program picked in the list (the running one, or the one to start). */
  programId: string;
  onChooseProgram: (programId: string) => void;
  /** The latest change to the plan, shown for a couple of weeks. */
  lastAdjustment?: RunProgramAdjustment | null;
  /** Epoch ms "now", from the screen, to judge whether a change is recent. */
  now: number;
  /** The days the workout shows in the Diary, and the first day it does. */
  schedule: RunSchedule;
  onSchedule: (change: ProgramScheduleChange) => void;
  /** Jump to any workout in the program (0-based index). */
  onPickWorkout: (index: number) => void;
  status: ProgramStatus | null;
  loaded: boolean;
  /** Whether today's program workout is the plan chosen for this recording. */
  selected: boolean;
  /** Whether the person is using the program. */
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onSelect: () => void;
  /** Label for the button that uses today's workout; defaults to the Record screen's wording. */
  startLabel?: string;
  onRestart: () => void;
  onSkip: () => void;
  /** Fill the start button, for the screen whose main job is starting it. */
  prominent?: boolean;
}

const SectionHeading: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Text className="text-xs font-bold text-text-secondary uppercase tracking-wider">
    {children}
  </Text>
);

const InlineLink: React.FC<{
  onPress: () => void;
  children: string;
}> = ({ onPress, children }) => (
  <Pressable
    accessibilityRole="button"
    onPress={onPress}
    hitSlop={8}
    className="mr-5"
    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
  >
    <Text className="text-text-link text-sm font-semibold">{children}</Text>
  </Pressable>
);

/** Start, follow and leave a multi-week run program. */
const RunProgramCard: React.FC<Props> = ({
  programId,
  onChooseProgram,
  lastAdjustment = null,
  now,
  schedule,
  onSchedule,
  onPickWorkout,
  status,
  loaded,
  selected,
  enabled,
  onToggle,
  onSelect,
  startLabel,
  onRestart,
  onSkip,
  prominent = false,
}) => {
  const { t } = useTranslation();
  const calendarRef = useRef<CalendarSheetRef>(null);
  const goalCalendarRef = useRef<CalendarSheetRef>(null);
  if (!loaded) return null;

  const header = (
    <View className="flex-row items-center justify-between">
      <View className="flex-1 mr-3">
        <Text className="text-text-primary text-sm font-semibold">
          {t('recordActivity.program.title', {
            defaultValue: 'Training program',
          })}
        </Text>
        <Text className="text-text-secondary text-xs mt-1">
          {t('recordActivity.program.switchHint', {
            defaultValue:
              'Follow a plan that builds up week by week. Off by default.',
          })}
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        accessibilityLabel={t('recordActivity.program.use', {
          defaultValue: 'Use a training program',
        })}
      />
    </View>
  );

  const programOptions: PickerOption<string>[] = RUN_PROGRAMS.map((p) => ({
    label: t('recordActivity.program.optionLabel', {
      name: programName(t, p.id),
      weeks: p.weeks,
      runs: p.workoutsPerWeek,
      defaultValue: '{{name}} · {{weeks}} weeks, {{runs}} workouts a week',
    }),
    value: p.id,
  }));
  // A plan the person wrote is not in the built-in list, but is the one shown.
  if (status?.program.custom) {
    programOptions.unshift({
      label: t('runPrograms.custom.optionLabel', {
        name: programTitle(t, status.program),
        count: status.total,
        formattedCount: formatLocalizedNumber(status.total),
        defaultValue: '{{name}} · {{formattedCount}} workouts',
        defaultValue_one: '{{name}} · {{formattedCount}} workout',
        defaultValue_other: '{{name}} · {{formattedCount}} workouts',
      }),
      value: status.program.id,
    });
  }

  if (!enabled || !status) {
    return (
      <View className="bg-surface rounded-xl p-4 mt-4">
        {header}
        <View className="mt-3">
          <BottomSheetPicker<string>
            value={programId}
            options={programOptions}
            onSelect={onChooseProgram}
            title={t('recordActivity.program.chooseTitle', {
              defaultValue: 'Choose a program',
            })}
          />
        </View>
        <Text className="text-text-secondary text-xs mt-3">
          {status && status.program.id === programId
            ? t('recordActivity.program.paused', {
                name: programTitle(t, status.program),
                done: status.done,
                total: status.total,
                defaultValue:
                  '{{name}} is paused at {{done}} of {{total}} workouts. Switch it on to carry on.',
              })
            : programDescription(t, programId)}
        </Text>
        {(!status || status.program.id !== programId) &&
          (() => {
            const program = findProgram(programId);
            if (!program) return null;
            const outline = programOutline(program);
            return (
              <Text className="text-text-secondary text-xs mt-2">
                {program.activity === 'walk'
                  ? t('recordActivity.program.outlineWalk', {
                      weekOne: outline.firstWeek.join(', '),
                      peak: outline.peakRunMinutes,
                      defaultValue:
                        'Week 1: workouts of {{weekOne}} minutes. Builds to {{peak}} minutes of brisk walking.',
                    })
                  : t('recordActivity.program.outline', {
                      weekOne: outline.firstWeek.join(', '),
                      peak: outline.peakRunMinutes,
                      defaultValue:
                        'Week 1: workouts of {{weekOne}} minutes. Builds to {{peak}} minutes of running.',
                    })}
              </Text>
            );
          })()}
      </View>
    );
  }

  const sections: PickerSection<number>[] = Array.from(
    { length: status.program.weeks },
    (_, week) => ({
      title: t('recordActivity.program.weekTitle', {
        week: week + 1,
        defaultValue: 'Week {{week}}',
      }),
      options: status.program.workouts
        .map((workout, index) => ({ workout, index }))
        .filter(({ workout }) => workout.week === week)
        .map(({ workout, index }) => ({
          label: status.program.custom
            ? t('recordActivity.program.pickOptionCustom', {
                title: customWorkoutTitle(t, workout),
                minutes: planMinutes(workout.plan),
                mark: index < status.done ? '✓ ' : '',
                defaultValue: '{{mark}}{{title}} · {{minutes}} min',
              })
            : status.program.activity === 'walk'
              ? t('recordActivity.program.pickOptionWalk', {
                  walk: workout.day + 1,
                  minutes: planMinutes(workout.plan),
                  mark: index < status.done ? '✓ ' : '',
                  defaultValue: '{{mark}}Walk {{walk}} · {{minutes}} min',
                })
              : t('recordActivity.program.pickOption', {
                  run: workout.day + 1,
                  minutes: planMinutes(workout.plan),
                  mark: index < status.done ? '✓ ' : '',
                  defaultValue: '{{mark}}Run {{run}} · {{minutes}} min',
                }),
          value: index,
        })),
    })
  );
  // A change older than this is history, not news.
  const recentChange =
    lastAdjustment &&
    now - Date.parse(lastAdjustment.at) < 14 * 24 * 3600 * 1000
      ? lastAdjustment
      : null;
  const changeDate = recentChange
    ? new Date(recentChange.at).toLocaleDateString(getAppLocale(), {
        month: 'short',
        day: 'numeric',
      })
    : '';
  const today = toLocalDateString(new Date(now));
  const hasStart = !!schedule.startDay;
  const futureStart = hasStart && (schedule.startDay as string) > today;
  const dayLabel = (day: string): string => formatDayLabel(day);
  const fraction = status.total > 0 ? status.done / status.total : 0;
  return (
    <View className="bg-surface rounded-xl p-4 mt-4">
      {header}
      <View className="h-px bg-border-subtle mt-4" />
      <Text className="text-text-primary text-lg font-semibold mt-4">
        {status.finished
          ? t('recordActivity.program.finished', {
              name: programTitle(t, status.program),
              defaultValue: '{{name}} complete',
            })
          : programWorkoutLabel(t, status)}
      </Text>
      <Text className="text-text-secondary text-xs mt-1">
        {status.finished
          ? t('recordActivity.program.finishedHint', {
              defaultValue: 'Well done. You can start it again or move on.',
            })
          : t('recordActivity.program.progress', {
              done: status.done,
              total: status.total,
              minutes: status.workout ? planMinutes(status.workout.plan) : 0,
              defaultValue:
                'Workout {{done}} of {{total}} done · {{minutes}} min today',
            })}
      </Text>
      {recentChange ? (
        <Text className="text-text-secondary text-xs mt-2">
          {recentChange.source === 'assistant'
            ? t('recordActivity.program.changedBySparky', {
                date: changeDate,
                summary: recentChange.summary,
                defaultValue:
                  'Sparky changed your plan on {{date}}: {{summary}}',
              })
            : t('recordActivity.program.changed', {
                date: changeDate,
                summary: recentChange.summary,
                defaultValue: 'Plan changed on {{date}}: {{summary}}',
              })}
        </Text>
      ) : null}
      <View className="h-2 rounded-full bg-raised mt-3 overflow-hidden">
        <View
          className="h-2 rounded-full bg-accent-primary"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </View>
      <View className="mt-4">
        {status.finished ? (
          <Button variant="outline" onPress={onRestart}>
            {t('recordActivity.program.restart', {
              defaultValue: 'Start again',
            })}
          </Button>
        ) : (
          <Button
            variant={selected || prominent ? 'primary' : 'outline'}
            onPress={onSelect}
          >
            {selected
              ? t('recordActivity.program.using', {
                  defaultValue: 'Using this workout',
                })
              : (startLabel ??
                t('recordActivity.program.doThis', {
                  defaultValue: 'Do this workout',
                }))}
          </Button>
        )}
      </View>
      {status.finished ? null : (
        <View className="mt-6">
          <SectionHeading>
            {t('recordActivity.program.scheduleTitle', {
              defaultValue: 'Schedule',
            })}
          </SectionHeading>
          <Text className="text-text-primary text-sm font-semibold mt-3">
            {t('recordActivity.program.diaryDays', {
              defaultValue: 'Days in your Diary',
            })}
          </Text>
          <View className="flex-row justify-between mt-2">
            {Array.from({ length: 7 }, (_, day) => {
              const on = schedule.days.includes(day);
              return (
                <TouchableOpacity
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={weekdayLabel(day, 'long')}
                  accessibilityState={{ selected: on }}
                  onPress={() => onSchedule({ toggleDay: day })}
                  className={`w-10 h-10 rounded-full items-center justify-center ${
                    on ? 'bg-accent-primary' : 'bg-raised'
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      on ? 'text-white' : 'text-text-primary'
                    }`}
                  >
                    {weekdayLabel(day, 'narrow')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text className="text-text-muted text-xs mt-2">
            {schedule.days.length > 0
              ? t('recordActivity.program.diaryDaysSet', {
                  defaultValue:
                    'The Diary shows the workout on these days. A workout you miss stays due.',
                })
              : t('recordActivity.program.diaryDaysHint', {
                  defaultValue:
                    'Pick the days you plan to train, or leave them empty to see the workout every day.',
                })}
          </Text>
          <View className="h-px bg-border-subtle mt-4" />
          <Text className="text-text-primary text-sm font-semibold mt-4">
            {t('recordActivity.program.startDay', {
              defaultValue: 'First workout',
            })}
          </Text>
          <Text className="text-text-secondary text-xs mt-1">
            {futureStart
              ? t('recordActivity.program.startDaySet', {
                  date: dayLabel(schedule.startDay as string),
                  defaultValue:
                    'Starts {{date}}. Nothing shows in the Diary before then.',
                })
              : hasStart
                ? t('recordActivity.program.startDayPast', {
                    date: dayLabel(schedule.startDay as string),
                    defaultValue:
                      'Started {{date}}. Your next workout is scheduled from today.',
                  })
                : t('recordActivity.program.startDayToday', {
                    date: dayLabel(today),
                    defaultValue:
                      'Starts today, {{date}}. Pick a later date if you want to begin then.',
                  })}
          </Text>
          <View className="flex-row mt-2">
            <InlineLink onPress={() => calendarRef.current?.present()}>
              {t('recordActivity.program.startChange', {
                defaultValue: 'Change start date',
              })}
            </InlineLink>
            {hasStart ? (
              <InlineLink onPress={() => onSchedule({ startDay: null })}>
                {t('recordActivity.program.startClear', {
                  defaultValue: 'Start today',
                })}
              </InlineLink>
            ) : null}
          </View>
          <View className="h-px bg-border-subtle mt-4" />
          <Text className="text-text-primary text-sm font-semibold mt-4">
            {t('recordActivity.program.goalDay', {
              defaultValue: 'Goal date',
            })}
          </Text>
          <Text className="text-text-secondary text-xs mt-1">
            {schedule.endDay
              ? t('recordActivity.program.goalDaySet', {
                  date: dayLabel(schedule.endDay),
                  defaultValue:
                    'Nothing is scheduled after {{date}}. The schedule below says whether the program fits.',
                })
              : t('recordActivity.program.goalDayHint', {
                  defaultValue:
                    'Optional, for example a race day. The schedule below says whether the program fits before it.',
                })}
          </Text>
          <View className="flex-row mt-2">
            <InlineLink onPress={() => goalCalendarRef.current?.present()}>
              {schedule.endDay
                ? t('recordActivity.program.goalChange', {
                    defaultValue: 'Change goal date',
                  })
                : t('recordActivity.program.goalPick', {
                    defaultValue: 'Set a goal date',
                  })}
            </InlineLink>
            {schedule.endDay ? (
              <InlineLink onPress={() => onSchedule({ endDay: null })}>
                {t('recordActivity.program.goalClear', {
                  defaultValue: 'Clear',
                })}
              </InlineLink>
            ) : null}
          </View>
        </View>
      )}
      <View className="mt-6">
        <SectionHeading>
          {t('recordActivity.program.manageTitle', {
            defaultValue: 'Manage',
          })}
        </SectionHeading>
        <ProgramActionList>
          <BottomSheetPicker<string>
            value={programId}
            options={programOptions}
            onSelect={onChooseProgram}
            title={t('recordActivity.program.chooseTitle', {
              defaultValue: 'Choose a program',
            })}
            renderTrigger={({ onPress }) => (
              <ProgramActionRow
                onPress={onPress}
                label={t('recordActivity.program.change', {
                  defaultValue: 'Change program',
                })}
              />
            )}
          />
          <BottomSheetPicker<number>
            value={Math.min(status.done, status.total - 1)}
            sections={sections}
            onSelect={onPickWorkout}
            title={t('recordActivity.program.pickTitle', {
              defaultValue: 'Choose a workout',
            })}
            renderTrigger={({ onPress }) => (
              <ProgramActionRow
                onPress={onPress}
                label={t('recordActivity.program.pick', {
                  defaultValue: 'Choose a different workout',
                })}
              />
            )}
          />
          {status.finished ? null : (
            <ProgramActionRow
              onPress={onSkip}
              chevron={false}
              label={t('recordActivity.program.skip', { defaultValue: 'Skip' })}
              hint={t('recordActivity.program.skipHint', {
                defaultValue: 'Move on without doing this workout',
              })}
            />
          )}
          {status.done > 0 ? (
            <ProgramActionRow
              onPress={onRestart}
              chevron={false}
              destructive
              label={t('recordActivity.program.startOver', {
                defaultValue: 'Start over',
              })}
              hint={t('recordActivity.program.startOverHint', {
                defaultValue: 'Go back to the first workout',
              })}
            />
          ) : null}
        </ProgramActionList>
      </View>
      <CalendarSheet
        ref={goalCalendarRef}
        selectedDate={schedule.endDay ?? addDays(today, 28)}
        onSelectDate={(day) =>
          onSchedule({ endDay: day <= today ? null : day })
        }
      />
      <CalendarSheet
        ref={calendarRef}
        selectedDate={schedule.startDay ?? today}
        onSelectDate={(day) => onSchedule({ startDay: day })}
      />
    </View>
  );
};

export default RunProgramCard;
