import React, { useState } from 'react';
import Toast from 'react-native-toast-message';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import EffortScale from '../components/recording/EffortScale';
import RouteMap from '../components/exerciseStats/RouteMap';
import PaceChart from '../components/exerciseStats/PaceChart';
import { paceSeriesFromDistance } from '../utils/cardioSession';
import { SplitRow, Stat } from '../components/recording/SplitRow';
import SplitsTable from '../components/recording/SplitsTable';
import {
  EASY_RATING,
  HARD_RATING,
  suggestFromEffort,
  type EffortSuggestion,
} from '@workspace/shared';
import {
  setExerciseEntryDistance,
  setExerciseEntryStrideLength,
} from '../services/api/exerciseApi';
import { addLog } from '../services/LogService';
import {
  rateProgramWorkout,
  setProgramPosition,
} from '../services/runProgramService';
import { invalidateExerciseCache } from '../hooks/invalidateExerciseCache';
import { queryClient } from '../hooks/queryClient';
import { usePersonalRecords } from '../hooks/usePersonalRecords';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { formatLocalizedNumber } from '../localization';
import { formatDayLabel } from '../utils/dayLabel';
import { spmText, strideText } from '../utils/cardioSessionStats';
import { computeFormMetrics } from '../utils/stride';
import { parseDecimalInput } from '../utils/numericInput';
import { distanceStandardLabel, recordsHeldBy } from '../utils/personalRecords';
import {
  formatClock,
  formatPace,
  METERS_PER_KM,
  METERS_PER_MILE,
  paceSecondsPerUnit,
  splitBars,
} from '../utils/gpsRecording';
import type { RootStackScreenProps } from '../types/navigation';
import { learnWatchIndoorScale } from '../services/watchIndoorScale';

type Props = RootStackScreenProps<'RunSummary'>;

const FEET_PER_METER = 3.28084;

/**
 * What a recorded walk, run or ride came to, shown once it is saved: the
 * headline figures, the route, each split (or the laps the person marked) and,
 * for a program workout, how far along they are and what is next.
 */
const RunSummaryScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const summary = route.params;
  const miles = summary.distanceUnit === 'miles';
  const unitMeters = miles ? METERS_PER_MILE : METERS_PER_KM;
  const unitLabel = miles
    ? t('recordActivity.unitMi', { defaultValue: 'mi' })
    : t('recordActivity.unitKm', { defaultValue: 'km' });
  const paceUnit = t('recordActivity.perUnit', {
    defaultValue: '/{{unit}}',
    unit: unitLabel,
  });
  const number = (value: number, digits = 2) =>
    formatLocalizedNumber(value, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  // Records this run now holds: it was just saved, so any record it holds is new.
  const { records } = usePersonalRecords(Boolean(summary.entryId));
  const newRecords = summary.entryId
    ? recordsHeldBy(records, summary.entryId)
    : [];

  const done = () => navigation.goBack();

  const [rating, setRating] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState<EffortSuggestion | null>(null);
  const [moved, setMoved] = useState<'repeat' | 'skip' | null>(null);
  const showFailure = (message: string) =>
    Toast.show({
      type: 'error',
      text1: message,
      text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
    });

  // A treadmill run's distance can be corrected to what the machine showed.
  // The laps are scaled by the same factor, as the server does.
  const [distanceMeters, setDistanceMeters] = useState(summary.distanceMeters);
  const [distanceText, setDistanceText] = useState('');
  const [savingDistance, setSavingDistance] = useState(false);
  const [distanceSaved, setDistanceSaved] = useState(false);
  // Stride is distance over steps, so a corrected distance moves it too.
  const [strideLengthCm, setStrideLengthCm] = useState(
    summary.form?.strideLengthCm ?? null
  );
  const formSteps = summary.form?.steps;
  const followStride = async (entryId: string, km: number) => {
    if (formSteps == null) return;
    const next =
      computeFormMetrics(formSteps, summary.activeSeconds, km * METERS_PER_KM)
        ?.strideLengthCm ?? null;
    setStrideLengthCm(next);
    try {
      await setExerciseEntryStrideLength(entryId, next);
    } catch (error) {
      addLog(
        `[Run Summary] Could not update the stride length: ${String(error)}`,
        'WARNING'
      );
    }
  };
  const distanceScale =
    summary.distanceMeters > 0 ? distanceMeters / summary.distanceMeters : 1;
  const saveDistance = async () => {
    const entered = parseDecimalInput(distanceText);
    const km = miles ? (entered * METERS_PER_MILE) / METERS_PER_KM : entered;
    if (!summary.entryId || !(km > 0) || km > 1000) {
      showFailure(
        t('runSummary.distanceInvalid', {
          defaultValue: 'Enter the distance from the machine.',
        })
      );
      return;
    }
    setSavingDistance(true);
    try {
      await setExerciseEntryDistance(summary.entryId, km);
      setDistanceMeters(km * METERS_PER_KM);
      await followStride(summary.entryId, km);
      // The watch's indoor estimate learns from the machine's figure.
      if (summary.watchIndoor) {
        void learnWatchIndoorScale(
          summary.activity,
          summary.watchIndoor.scale,
          summary.watchIndoor.estimatedMeters,
          km * METERS_PER_KM
        );
      }
      setDistanceSaved(true);
      invalidateExerciseCache(queryClient, summary.entryDate);
      void queryClient.invalidateQueries({ queryKey: ['personalRecords'] });
    } catch {
      showFailure(
        t('runSummary.distanceFailed', {
          defaultValue: 'Could not save the distance.',
        })
      );
    } finally {
      setSavingDistance(false);
    }
  };
  // Saves the rating, then reads what the last two say. A failure is shown,
  // but the buttons below still work off this rating alone.
  const rate = async (value: number) => {
    const target = summary.program?.rate;
    if (!target) return;
    setRating(value);
    setSuggestion(null);
    try {
      const program = await rateProgramWorkout(
        target.programId,
        target.index,
        value
      );
      if (program) {
        setSuggestion(
          suggestFromEffort(program.effort_log, program.next_index)
        );
      }
    } catch {
      showFailure(
        t('runSummary.rateFailed', {
          defaultValue: 'Could not save how hard that was.',
        })
      );
    }
  };
  // Hard offers a repeat; easy offers to skip the next, unless it is the last.
  const advice: 'repeat' | 'skip' | null =
    rating === null
      ? null
      : rating >= HARD_RATING
        ? 'repeat'
        : rating <= EASY_RATING &&
            summary.program != null &&
            summary.program.done < summary.program.total - 1
          ? 'skip'
          : null;
  // Moves the place in the program, then says so; a failure is shown, not lost.
  const move = async (kind: 'repeat' | 'skip', index: number) => {
    try {
      await setProgramPosition(index);
      setMoved(kind);
    } catch {
      showFailure(
        t('runSummary.moveFailed', {
          defaultValue: 'Could not change the program.',
        })
      );
    }
  };

  const header = useScreenHeader({
    title: t('screens.runSummary', { defaultValue: 'Activity saved' }),
    right: {
      kind: 'primary',
      label: t('runSummary.done', { defaultValue: 'Done' }),
      onPress: done,
    },
  });

  const title =
    summary.activity === 'walk'
      ? t('runSummary.walkSaved', { defaultValue: 'Walk saved' })
      : summary.activity === 'ride'
        ? t('runSummary.rideSaved', { defaultValue: 'Ride saved' })
        : summary.activity === 'jumpRope'
          ? t('runSummary.jumpRopeSaved', { defaultValue: 'Jump Rope saved' })
          : t('runSummary.runSaved', { defaultValue: 'Run saved' });

  const avgPace = paceSecondsPerUnit(
    distanceMeters,
    summary.activeSeconds,
    unitMeters
  );
  const elevation = miles
    ? summary.elevationGainMeters * FEET_PER_METER
    : summary.elevationGainMeters;
  // Marked laps replace the per-unit splits, as they do in the diary entry.
  const rows = (summary.laps.length > 0 ? summary.laps : summary.splits).map(
    (row) => ({ ...row, distanceMeters: row.distanceMeters * distanceScale })
  );
  const usesLaps = summary.laps.length > 0;
  // A treadmill run has no route; its pace comes from the distance the watch
  // logged against time, moved by the same correction as the totals.
  const paceSeries = paceSeriesFromDistance(
    (summary.distanceSeries ?? []).map(([sec, meters]) => [
      sec,
      meters * distanceScale,
    ]),
    unitMeters
  );
  const bars = splitBars(rows, unitMeters);
  const fastestLabel = t('recordActivity.fastest', { defaultValue: 'Fastest' });

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
        <View className="items-center mb-4">
          <View className="w-14 h-14 rounded-full bg-accent-primary items-center justify-center">
            <Icon name="checkmark" size={28} color="#ffffff" />
          </View>
          <Text className="text-text-primary text-xl font-bold mt-3">
            {title}
          </Text>
          <Text className="text-text-muted text-sm mt-1">
            {formatDayLabel(summary.entryDate)}
          </Text>
        </View>

        <View className="flex-row mb-3">
          {summary.activity !== 'jumpRope' ? (
            <Stat
              label={t('recordActivity.distance', { defaultValue: 'Distance' })}
              value={number(distanceMeters / unitMeters)}
              unit={unitLabel}
            />
          ) : null}
          <Stat
            label={t('recordActivity.time', { defaultValue: 'Time' })}
            value={formatClock(summary.activeSeconds)}
          />
          {summary.activity !== 'jumpRope' ? (
            <Stat
              label={t('recordActivity.avgPace', { defaultValue: 'Avg pace' })}
              value={formatPace(avgPace)}
              unit={paceUnit}
            />
          ) : null}
          {summary.activity === 'jumpRope' &&
          summary.activeEnergyKcal != null &&
          summary.activeEnergyKcal > 0 ? (
            <Stat
              label={t('watchRunLive.calories', { defaultValue: 'Calories' })}
              value={String(Math.round(summary.activeEnergyKcal))}
              unit={t('watchRunLive.kcal', { defaultValue: 'kcal' })}
            />
          ) : null}
        </View>
        {summary.elevationGainMeters >= 1 || summary.avgHeartRate != null ? (
          <View className="flex-row mb-3">
            {summary.elevationGainMeters >= 1 ? (
              <Stat
                label={t('recordActivity.elevationGain', {
                  defaultValue: 'Elevation gain',
                })}
                value={number(elevation, 0)}
                unit={
                  miles
                    ? t('recordActivity.unitFt', { defaultValue: 'ft' })
                    : t('recordActivity.unitM', { defaultValue: 'm' })
                }
              />
            ) : null}
            {summary.avgHeartRate != null ? (
              <Stat
                label={t('runSummary.avgHeartRate', {
                  defaultValue: 'Avg heart rate',
                })}
                value={number(summary.avgHeartRate, 0)}
                unit={t('recordActivity.unitBpm', { defaultValue: 'bpm' })}
              />
            ) : null}
          </View>
        ) : null}

        {summary.form ? (
          <View className="flex-row mb-3">
            <Stat
              label={t('exerciseStatistics.cardio.cadence', {
                defaultValue: 'Avg cadence',
              })}
              value={spmText(t, summary.form.avgCadence)}
            />
            {strideLengthCm != null ? (
              <Stat
                label={t('exerciseStatistics.cardio.strideLength', {
                  defaultValue: 'Stride length',
                })}
                value={strideText(t, strideLengthCm, summary.distanceUnit)}
              />
            ) : null}
          </View>
        ) : null}

        {summary.editableDistance && summary.entryId ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-bold">
              {t('runSummary.treadmillDistance', {
                defaultValue: 'Treadmill distance',
              })}
            </Text>
            <Text className="text-text-secondary text-sm mt-1">
              {distanceSaved
                ? t('runSummary.distanceUpdated', {
                    defaultValue: 'Distance updated.',
                  })
                : t('runSummary.treadmillHint', {
                    defaultValue:
                      'The watch estimated this distance. Enter what the machine showed to correct it.',
                  })}
            </Text>
            <View className="flex-row items-center mt-3" style={{ gap: 8 }}>
              <FormInput
                className="flex-1 bg-raised rounded-lg px-3 text-text-primary"
                value={distanceText}
                onChangeText={setDistanceText}
                keyboardType="decimal-pad"
                placeholder={number(distanceMeters / unitMeters)}
                accessibilityLabel={t('runSummary.treadmillDistanceA11y', {
                  defaultValue: 'Distance from the treadmill in {{unit}}',
                  unit: unitLabel,
                })}
              />
              <Text className="text-text-secondary text-base">{unitLabel}</Text>
              <Button
                variant="secondary"
                disabled={savingDistance || distanceText.trim() === ''}
                onPress={() => void saveDistance()}
              >
                {t('runSummary.saveDistance', { defaultValue: 'Update' })}
              </Button>
            </View>
          </View>
        ) : null}

        {newRecords.length > 0 ? (
          <View
            className="bg-surface rounded-xl p-4 mb-4"
            accessibilityRole="summary"
          >
            <Text className="text-text-primary text-base font-bold">
              {t('runSummary.newRecords', {
                count: newRecords.length,
                defaultValue: 'New personal records',
                defaultValue_one: 'New personal record',
                defaultValue_other: 'New personal records',
              })}
            </Text>
            {newRecords.map((record) => (
              <View
                key={record.distanceStandard}
                className="flex-row justify-between mt-2"
              >
                <Text className="text-text-secondary text-base">
                  {distanceStandardLabel(t, record)}
                </Text>
                <Text className="text-text-primary text-base font-semibold">
                  {record.formattedTime}
                </Text>
              </View>
            ))}
            <Button
              variant="link"
              onPress={() => navigation.navigate('PersonalRecords')}
            >
              {t('runSummary.viewRecords', {
                defaultValue: 'View all records',
              })}
            </Button>
          </View>
        ) : null}

        {summary.program ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-bold">
              {summary.program.finished
                ? t('runSummary.programDone', {
                    defaultValue: 'Program complete',
                  })
                : t('runSummary.programProgress', {
                    done: summary.program.done,
                    total: summary.program.total,
                    defaultValue: 'Workout {{done}} of {{total}} done',
                  })}
            </Text>
            <View className="h-2 rounded-full bg-raised mt-2 overflow-hidden">
              <View
                className="h-2 rounded-full bg-accent-primary"
                style={{
                  width: `${Math.round(
                    (summary.program.total > 0
                      ? summary.program.done / summary.program.total
                      : 0) * 100
                  )}%`,
                }}
              />
            </View>
            <Text className="text-text-secondary text-sm mt-2">
              {summary.program.nextLine}
            </Text>
            {summary.program.rate ? (
              <View className="mt-3">
                <EffortScale
                  rating={rating}
                  disabled={moved != null}
                  onSelect={rate}
                />
                {moved ? (
                  <Text className="text-text-secondary text-sm mt-2">
                    {moved === 'repeat'
                      ? t('runSummary.repeating', {
                          defaultValue: 'Done. You will do this workout again.',
                        })
                      : t('runSummary.skipping', {
                          defaultValue: 'Done. The next workout is skipped.',
                        })}
                  </Text>
                ) : suggestion || advice ? (
                  <>
                    <Text className="text-text-secondary text-sm mt-2">
                      {suggestion === 'ease'
                        ? t('runSummary.easeSuggestion', {
                            defaultValue:
                              'Two hard workouts in a row. Repeating this one is a good way to build up safely.',
                          })
                        : suggestion === 'advance'
                          ? t('runSummary.advanceSuggestion', {
                              defaultValue:
                                'Two easy workouts in a row. You could skip the next one and move on.',
                            })
                          : advice === 'repeat'
                            ? t('runSummary.hardHint', {
                                defaultValue:
                                  'Repeating a workout that felt hard is a good way to build up safely.',
                              })
                            : t('runSummary.easyHint', {
                                defaultValue:
                                  'Felt easy? You can skip the next workout and move on.',
                              })}
                    </Text>
                    {advice === 'repeat' ? (
                      <Button
                        variant="secondary"
                        onPress={() =>
                          move('repeat', summary.program!.rate!.index)
                        }
                      >
                        {t('runSummary.repeat', {
                          defaultValue: 'Repeat this workout',
                        })}
                      </Button>
                    ) : advice === 'skip' ? (
                      <Button
                        variant="secondary"
                        onPress={() =>
                          move('skip', summary.program!.rate!.index + 2)
                        }
                      >
                        {t('runSummary.skipNext', {
                          defaultValue: 'Skip the next workout',
                        })}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : null}
            <Button
              variant="link"
              onPress={() => navigation.navigate('RunPrograms')}
            >
              {t('runSummary.viewProgram', { defaultValue: 'View program' })}
            </Button>
          </View>
        ) : null}

        {summary.route.length > 1 ? (
          <View className="mb-4">
            <RouteMap
              points={summary.route}
              accessibilityLabel={t('runSummary.routeA11y', {
                defaultValue: 'Map of your route',
              })}
            />
          </View>
        ) : null}

        {paceSeries.length >= 2 ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-bold mb-2">
              {t('exerciseStatistics.cardio.pace', { defaultValue: 'Pace' })}
            </Text>
            <PaceChart
              data={paceSeries}
              xAxisCaption={
                miles
                  ? t('exerciseStatistics.cardio.milesAxis', {
                      defaultValue: 'Miles from start',
                    })
                  : t('exerciseStatistics.cardio.kilometersAxis', {
                      defaultValue: 'Kilometers from start',
                    })
              }
            />
          </View>
        ) : null}

        {rows.length > 0 ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-bold mb-2">
              {usesLaps
                ? t('recordActivity.laps', { defaultValue: 'Laps' })
                : t('recordActivity.splits', { defaultValue: 'Splits' })}
            </Text>
            {usesLaps ? (
              <>
                {rows.map((row, i) => (
                  <SplitRow
                    key={row.index}
                    label={t('recordActivity.lapLabel', {
                      defaultValue: 'Lap {{number}}',
                      number: row.index,
                    })}
                    detail={`${number(row.distanceMeters / unitMeters, 2)} ${unitLabel} · ${formatClock(row.durationSeconds)}`}
                    pace={`${formatPace(
                      paceSecondsPerUnit(
                        row.distanceMeters,
                        row.durationSeconds,
                        unitMeters
                      )
                    )} ${paceUnit}`}
                    fraction={bars[i].fraction}
                    fastest={bars[i].fastest}
                    fastestLabel={fastestLabel}
                  />
                ))}
              </>
            ) : (
              <SplitsTable
                splits={rows}
                unitMeters={unitMeters}
                unit={summary.distanceUnit}
              />
            )}
          </View>
        ) : null}

        <Button onPress={done}>
          {t('runSummary.done', { defaultValue: 'Done' })}
        </Button>
      </ScrollView>
    </>
  );
};

export default RunSummaryScreen;
