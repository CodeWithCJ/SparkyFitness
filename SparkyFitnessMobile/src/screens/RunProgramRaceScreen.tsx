import React, { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  addDays,
  buildRacePlan,
  customProgramId,
  RACE_DISTANCES,
  RACE_LEVELS,
  type RaceDistance,
  type RaceLevel,
} from '@workspace/shared';
import Button from '../components/ui/Button';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  saveCustomProgram,
  setProgramSchedule,
  startProgram,
  useRunProgram,
} from '../services/runProgramService';
import { addLog } from '../services/LogService';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import type { RootStackScreenProps } from '../types/navigation';
import { toLocalDateString } from '../utils/dateUtils';
import { formatDayLabel } from '../utils/dayLabel';

type Props = RootStackScreenProps<'RunProgramRace'>;

const weekdayLabel = (day: number, style: 'narrow' | 'long'): string =>
  // 2024-01-07 was a Sunday, so day 0 is Sunday.
  new Date(2024, 0, 7 + day).toLocaleDateString(getAppLocale(), {
    weekday: style,
  });

const Chip: React.FC<{
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}> = ({ label, selected, onPress, testID }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
      selected ? 'bg-accent-primary' : 'bg-surface'
    }`}
    testID={testID}
  >
    <Text
      className={selected ? 'text-white font-semibold' : 'text-text-primary'}
    >
      {label}
    </Text>
  </Pressable>
);

/**
 * Plans a race: pick the distance, how much you run now, the race day and the
 * weekdays you can run, and it writes a plan that builds up to the day, with
 * easy weeks and a taper, and starts it on the calendar.
 */
const RunProgramRaceScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { enabled, status } = useRunProgram();
  const [now] = useState(() => Date.now());
  const today = toLocalDateString(new Date(now));
  const calendarRef = useRef<CalendarSheetRef>(null);
  const [distance, setDistance] = useState<RaceDistance>('10k');
  const [level, setLevel] = useState<RaceLevel>('some');
  const [raceDay, setRaceDay] = useState<string>(() => addDays(today, 7 * 12));
  const [runDays, setRunDays] = useState<number[]>([2, 4, 0]);
  const [saving, setSaving] = useState(false);
  // What a failed attempt already did, so a retry does only the rest instead
  // of saving the plan again. Cleared when the plan itself changes.
  const progress = useRef<{ planKey: string; id?: string; started?: boolean }>({
    planKey: '',
  });

  const header = useScreenHeader({
    title: t('screens.runProgramRace', { defaultValue: 'Plan a race' }),
    left: { kind: 'back' },
  });

  const distanceLabel = (id: RaceDistance): string => {
    switch (id) {
      case '5k':
        return t('runPrograms.race.distance.5k', { defaultValue: '5K' });
      case '10k':
        return t('runPrograms.race.distance.10k', { defaultValue: '10K' });
      case 'half':
        return t('runPrograms.race.distance.half', {
          defaultValue: 'Half marathon',
        });
      default:
        return t('runPrograms.race.distance.marathon', {
          defaultValue: 'Marathon',
        });
    }
  };
  const levelLabel = (id: RaceLevel): string => {
    switch (id) {
      case 'new':
        return t('runPrograms.race.level.new', {
          defaultValue: 'New to running',
        });
      case 'some':
        return t('runPrograms.race.level.some', {
          defaultValue: 'Run a little',
        });
      case 'regular':
        return t('runPrograms.race.level.regular', {
          defaultValue: 'Run regularly',
        });
      default:
        return t('runPrograms.race.level.experienced', {
          defaultValue: 'Experienced',
        });
    }
  };

  const plan = useMemo(
    () =>
      buildRacePlan({
        distance,
        level,
        raceDay,
        today,
        runDays,
        titles: {
          easy: t('runPrograms.race.title.easy', { defaultValue: 'Easy run' }),
          long: t('runPrograms.race.title.long', { defaultValue: 'Long run' }),
          tempo: t('runPrograms.race.title.tempo', {
            defaultValue: 'Tempo run',
          }),
          intervals: t('runPrograms.race.title.intervals', {
            defaultValue: 'Intervals',
          }),
          shakeout: t('runPrograms.race.title.shakeout', {
            defaultValue: 'Shake-out run',
          }),
          race: t('runPrograms.race.title.race', {
            label: distanceLabel(distance),
            defaultValue: 'Race day: {{label}}',
          }),
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [distance, level, raceDay, today, runDays, t]
  );

  const tooFewDays = runDays.length < 2;
  const blocked = plan.tooShort || tooFewDays || plan.workouts.length === 0;

  const toggleDay = (day: number) =>
    setRunDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b)
    );

  const create = async () => {
    setSaving(true);
    try {
      const planKey = JSON.stringify([
        distance,
        plan.workouts,
        plan.startDay,
        plan.endDay,
        plan.runDays,
      ]);
      if (progress.current.planKey !== planKey) {
        progress.current = { planKey };
      }
      const done = progress.current;
      if (!done.id) {
        const saved = await saveCustomProgram({
          name: t('runPrograms.race.planName', {
            label: distanceLabel(distance),
            defaultValue: '{{label}} race plan',
          }).slice(0, 60),
          activity: 'run',
          workouts: plan.workouts,
        });
        done.id = saved.id;
      }
      if (!done.started) {
        await startProgram(
          customProgramId(done.id),
          plan.startDay <= today ? null : plan.startDay
        );
        done.started = true;
      }
      await setProgramSchedule({
        days: plan.runDays,
        startDay: plan.startDay <= today ? null : plan.startDay,
        endDay: plan.endDay,
      });
      progress.current = { planKey: '' };
      navigation.goBack();
    } catch (error) {
      addLog(
        `[Run Program] Could not create the race plan: ${error}`,
        'WARNING'
      );
      Toast.show({
        type: 'error',
        text1: t('runPrograms.race.saveError', {
          defaultValue: 'Could not create your plan',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmCreate = () => {
    if (blocked || saving) return;
    if (!enabled || !status) {
      void create();
      return;
    }
    // Starting a plan replaces the program being followed.
    Alert.alert(
      t('runPrograms.race.replaceTitle', {
        defaultValue: 'Replace your current program?',
      }),
      t('runPrograms.race.replaceMessage', {
        defaultValue:
          'The race plan starts now and replaces the program you are following. Your place in it is not kept.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('runPrograms.race.replaceConfirm', {
            defaultValue: 'Replace',
          }),
          onPress: () => void create(),
        },
      ]
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
        <Text className="text-text-secondary text-sm">
          {t('runPrograms.race.intro', {
            defaultValue:
              'Pick your race and the days you can run. The plan builds up to race day, with an easier week every fourth week and a taper at the end.',
          })}
        </Text>

        <Text className="text-text-primary text-sm font-semibold mt-4 mb-2">
          {t('runPrograms.race.distanceLabel', { defaultValue: 'Distance' })}
        </Text>
        <View className="flex-row flex-wrap">
          {RACE_DISTANCES.map((id) => (
            <Chip
              key={id}
              label={distanceLabel(id)}
              selected={distance === id}
              onPress={() => setDistance(id)}
              testID={`race-distance-${id}`}
            />
          ))}
        </View>

        <Text className="text-text-primary text-sm font-semibold mt-2 mb-2">
          {t('runPrograms.race.levelLabel', {
            defaultValue: 'How much do you run now?',
          })}
        </Text>
        <View className="flex-row flex-wrap">
          {RACE_LEVELS.map((id) => (
            <Chip
              key={id}
              label={levelLabel(id)}
              selected={level === id}
              onPress={() => setLevel(id)}
              testID={`race-level-${id}`}
            />
          ))}
        </View>

        <Text className="text-text-primary text-sm font-semibold mt-2 mb-2">
          {t('runPrograms.race.dayLabel', { defaultValue: 'Race day' })}
        </Text>
        <Button
          variant="outline"
          onPress={() => calendarRef.current?.present()}
          testID="race-day"
        >
          {formatDayLabel(raceDay, 'long')}
        </Button>

        <Text className="text-text-primary text-sm font-semibold mt-4 mb-2">
          {t('runPrograms.race.daysLabel', {
            defaultValue: 'Days you can run',
          })}
        </Text>
        <View className="flex-row">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <Pressable
              key={day}
              onPress={() => toggleDay(day)}
              accessibilityRole="button"
              accessibilityLabel={weekdayLabel(day, 'long')}
              accessibilityState={{ selected: runDays.includes(day) }}
              className={`w-10 h-10 mr-1 rounded-full items-center justify-center ${
                runDays.includes(day) ? 'bg-accent-primary' : 'bg-surface'
              }`}
              testID={`race-weekday-${day}`}
            >
              <Text
                className={
                  runDays.includes(day) ? 'text-white' : 'text-text-primary'
                }
              >
                {weekdayLabel(day, 'narrow')}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text className="text-text-muted text-xs mt-2">
          {t('runPrograms.race.daysHint', {
            defaultValue:
              'Race day is always included. Pick at least two days; three or four suit most people.',
          })}
        </Text>

        <View className="bg-surface rounded-xl p-4 mt-4" testID="race-summary">
          {plan.workouts.length === 0 ? (
            <Text className="text-text-secondary text-sm">
              {t('runPrograms.race.pastDay', {
                defaultValue: 'Pick a race day that has not passed.',
              })}
            </Text>
          ) : (
            <>
              <Text className="text-text-primary text-base font-semibold">
                {t('runPrograms.race.summaryTitle', {
                  weeks: formatLocalizedNumber(plan.weeks),
                  defaultValue: '{{weeks}} weeks to race day',
                })}
              </Text>
              <Text className="text-text-secondary text-sm mt-1">
                {t('runPrograms.race.summaryBody', {
                  workouts: formatLocalizedNumber(plan.workouts.length),
                  long: formatLocalizedNumber(plan.peakLongMinutes),
                  defaultValue:
                    '{{workouts}} workouts, the longest run about {{long}} minutes.',
                })}
              </Text>
              <Text className="text-text-muted text-xs mt-1">
                {t('runPrograms.race.estimate', {
                  minutes: formatLocalizedNumber(plan.raceMinutes),
                  defaultValue:
                    'Race day is planned at about {{minutes}} minutes at an easy pace; you can change it in the plan afterwards.',
                })}
              </Text>
            </>
          )}
          {plan.tooShort && plan.workouts.length > 0 ? (
            <Text
              className="text-text-secondary text-sm mt-2"
              testID="race-too-short"
            >
              {t('runPrograms.race.tooShort', {
                min: formatLocalizedNumber(plan.minWeeks),
                defaultValue:
                  'That is less time than we suggest: at least {{min}} weeks for this distance. Pick a later race day.',
              })}
            </Text>
          ) : null}
          {tooFewDays ? (
            <Text className="text-text-secondary text-sm mt-2">
              {t('runPrograms.race.tooFewDays', {
                defaultValue: 'Pick at least two days to run.',
              })}
            </Text>
          ) : null}
        </View>

        <View className="mt-4">
          <Button
            variant="primary"
            disabled={blocked}
            loading={saving}
            onPress={confirmCreate}
            testID="race-create"
          >
            {t('runPrograms.race.create', {
              defaultValue: 'Create and start the plan',
            })}
          </Button>
        </View>
      </ScrollView>
      <CalendarSheet
        ref={calendarRef}
        selectedDate={raceDay}
        onSelectDate={(day) => setRaceDay(day)}
      />
    </>
  );
};

export default RunProgramRaceScreen;
