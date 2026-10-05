import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  defaultBodyFigure,
  setsForMuscleKey,
  unmappedMuscleSets,
  type BodyFigure,
} from '@workspace/shared';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useExerciseDashboard } from '../hooks/useExerciseDashboard';
import { useTrainingConsistency } from '../hooks/useTrainingConsistency';
import { useCardioSessions } from '../hooks/useCardioSessions';
import { usePreferences } from '../hooks/usePreferences';
import { useProfile } from '../hooks/useProfile';
import { formatLocalizedNumber } from '../localization';
import { localizeExerciseTaxonomyValue } from '../localization/exerciseTaxonomy';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import SegmentedControl from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import CollapsibleSection from '../components/CollapsibleSection';
import CardioSessionList from '../components/exerciseStats/CardioSessionList';
import TrainingConsistencyCard from '../components/exerciseStats/TrainingConsistencyCard';
import MuscleFigure, {
  MUSCLE_HEAT_COLORS,
} from '../components/exerciseStats/MuscleFigure';
import { trendRangeSegments, type TrendRange } from '../utils/trendRange';
import { getTodayDate } from '../utils/dateUtils';
import { weightFromKg } from '../utils/unitConversions';
import {
  muscleRecoveryRows,
  muscleSetRows,
  rankedMuscleValues,
} from '../utils/exerciseStats';
import type { RootStackScreenProps } from '../types/navigation';

type ExerciseStatisticsScreenProps = RootStackScreenProps<'ExerciseStatistics'>;

type AnalysisSection = 'recovery' | 'variety' | 'volume';
type StatisticsView = 'strength' | 'cardio';

const muscleLabel = (t: TFunction, name: string) =>
  localizeExerciseTaxonomyValue(t, 'muscle', name);

const recoveryLabel = (t: TFunction, daysAgo: number | null, date: string) => {
  if (daysAgo === null) return date;
  if (daysAgo <= 0) {
    return t('exerciseStatistics.recovery.today', { defaultValue: 'Today' });
  }
  if (daysAgo === 1) {
    return t('exerciseStatistics.recovery.yesterday', {
      defaultValue: 'Yesterday',
    });
  }
  return t('exerciseStatistics.recovery.daysAgo', {
    count: daysAgo,
    defaultValue: '{{count}} days ago',
    defaultValue_one: '{{count}} day ago',
    defaultValue_other: '{{count}} days ago',
  });
};

const StatTile: React.FC<{ label: string; value: string; unit?: string }> = ({
  label,
  value,
  unit,
}) => (
  <View className="flex-1 items-center">
    <Text className="text-text-secondary text-xs mb-1">{label}</Text>
    <Text className="text-text-primary text-lg font-bold">
      {value}
      {unit ? (
        <Text className="text-text-secondary text-xs font-normal"> {unit}</Text>
      ) : null}
    </Text>
  </View>
);

const ValueRow: React.FC<{ label: string; value: string; last?: boolean }> = ({
  label,
  value,
  last,
}) => (
  <View
    className={`flex-row justify-between py-2.5 ${
      last ? '' : 'border-b border-border-subtle'
    }`}
  >
    <Text className="text-text-primary text-sm">{label}</Text>
    <Text className="text-text-secondary text-sm">{value}</Text>
  </View>
);

const ExerciseStatisticsScreen: React.FC<ExerciseStatisticsScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [range, setRange] = useState<TrendRange>('30d');
  const [pickedMuscle, setPickedMuscle] = useState<string | null>(null);
  const togglePickedMuscle = (key: string) =>
    setPickedMuscle((current) => (current === key ? null : key));
  // Starts from the gender stored for BMR. Switching here is a view choice
  // and is never written back to the profile.
  const [chosenFigure, setChosenFigure] = useState<BodyFigure | null>(null);
  const { profile } = useProfile();
  const figure = chosenFigure ?? defaultBodyFigure(profile?.gender);
  const [openSection, setOpenSection] = useState<AnalysisSection | null>(null);
  const [view, setView] = useState<StatisticsView>('strength');

  const header = useScreenHeader({
    title: t('exerciseStatistics.title', {
      defaultValue: 'Exercise Statistics',
    }),
    left: { kind: 'back' },
  });

  const { data, isLoading } = useExerciseDashboard(range);
  const consistency = useTrainingConsistency();
  const cardio = useCardioSessions(range, view === 'cardio');
  const { preferences } = usePreferences();
  const weightUnit: 'kg' | 'lbs' =
    preferences?.default_weight_unit === 'lbs' ||
    preferences?.default_weight_unit === 'st_lbs'
      ? 'lbs'
      : 'kg';

  const setsByMuscle = useMemo(() => data?.muscleGroupSets ?? {}, [data]);
  const setRows = useMemo(() => muscleSetRows(setsByMuscle), [setsByMuscle]);
  const notOnFigure = useMemo(
    () => unmappedMuscleSets(setsByMuscle),
    [setsByMuscle]
  );
  const recoveryRows = useMemo(
    () => muscleRecoveryRows(data?.recoveryData ?? {}, getTodayDate()),
    [data]
  );
  const varietyRows = useMemo(
    () => rankedMuscleValues(data?.exerciseVarietyData ?? {}),
    [data]
  );
  const volumeRows = useMemo(
    () => rankedMuscleValues(data?.muscleGroupVolume ?? {}),
    [data]
  );

  const selectRange = (next: TrendRange) => {
    setRange(next);
    setPickedMuscle(null);
  };
  const toggleSection = (section: AnalysisSection) =>
    setOpenSection((current) => (current === section ? null : section));

  const setsLabel = (count: number) =>
    t('exerciseStatistics.sets', {
      count,
      formattedCount: formatLocalizedNumber(count),
      defaultValue: '{{formattedCount}} sets',
      defaultValue_one: '{{formattedCount}} set',
      defaultValue_other: '{{formattedCount}} sets',
    });
  const maxRowSets = setRows[0]?.sets ?? 0;
  const hasActivity =
    (data?.keyStats.totalWorkouts ?? 0) > 0 || setRows.length > 0;

  const renderCardio = () => {
    if (cardio.isLoading) {
      return <StatusView inline loading />;
    }
    if (cardio.sessions.length === 0) {
      return cardio.isError ? (
        <StatusView
          inline
          icon="alert-circle"
          iconTone="danger"
          title={t('exerciseStatistics.cardio.loadFailed', {
            defaultValue: 'Failed to load cardio sessions',
          })}
          subtitle={t('common.connectionRetry', {
            defaultValue: 'Please check your connection and try again.',
          })}
        />
      ) : (
        <StatusView
          inline
          icon="exercise-running"
          iconTone="muted"
          title={t('exerciseStatistics.cardio.empty', {
            defaultValue: 'No cardio workouts in this range',
          })}
        />
      );
    }
    return (
      <>
        <Text className="text-text-secondary text-xs mb-3">
          {t('exerciseStatistics.cardio.hint', {
            defaultValue: 'Tap a workout for its route and heart rate.',
          })}
        </Text>
        <CardioSessionList
          sessions={cardio.sessions}
          distanceUnit={cardio.distanceUnit}
          today={getTodayDate()}
          hasMore={cardio.hasNextPage}
          isLoadingMore={cardio.isFetchingNextPage}
          onLoadMore={() => void cardio.fetchNextPage()}
          onOpen={(session) =>
            navigation.navigate('CardioSession', {
              session,
              distanceUnit: cardio.distanceUnit,
            })
          }
        />
      </>
    );
  };

  const renderBody = () => {
    if (isLoading) {
      return <StatusView inline loading />;
    }
    // A failed focus refetch keeps the cached range, so only an empty cache
    // is an error worth replacing the screen for.
    if (!data) {
      return (
        <StatusView
          inline
          icon="alert-circle"
          iconTone="danger"
          title={t('exerciseStatistics.states.loadFailed', {
            defaultValue: 'Failed to load exercise statistics',
          })}
          subtitle={t('common.connectionRetry', {
            defaultValue: 'Please check your connection and try again.',
          })}
        />
      );
    }
    if (!hasActivity) {
      return (
        <StatusView
          inline
          icon="exercise-weights"
          iconTone="muted"
          title={t('exerciseStatistics.states.empty', {
            defaultValue: 'No workouts in this range',
          })}
          subtitle={t('exerciseStatistics.states.emptyHint', {
            defaultValue:
              'Log a workout and its sets will show up here by muscle.',
          })}
        />
      );
    }

    return (
      <>
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm flex-row">
          <StatTile
            label={t('exerciseStatistics.stats.workouts', {
              defaultValue: 'Workouts',
            })}
            value={formatLocalizedNumber(data.keyStats.totalWorkouts)}
          />
          <StatTile
            label={t('exerciseStatistics.stats.volume', {
              defaultValue: 'Volume',
            })}
            value={formatLocalizedNumber(
              Math.round(weightFromKg(data.keyStats.totalVolume, weightUnit))
            )}
            unit={weightUnit}
          />
          <StatTile
            label={t('exerciseStatistics.stats.reps', {
              defaultValue: 'Reps',
            })}
            value={formatLocalizedNumber(data.keyStats.totalReps)}
          />
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-text-primary text-base font-bold">
            {t('exerciseStatistics.setsPerMuscle.title', {
              defaultValue: 'Sets per Muscle',
            })}
          </Text>
          <Text className="text-text-secondary text-xs mt-0.5 mb-3">
            {t('exerciseStatistics.setsPerMuscle.subtitle', {
              defaultValue: 'Working sets on primary muscles in this range',
            })}
          </Text>
          {setRows.length === 0 ? (
            <Text className="text-text-secondary text-sm">
              {t('exerciseStatistics.setsPerMuscle.none', {
                defaultValue: 'No working sets with a primary muscle yet.',
              })}
            </Text>
          ) : (
            setRows.map((row) => (
              // A figure muscle's row picks it on the figure too. The figure's
              // regions are too small and repeated (left, right, front, back)
              // to be screen-reader targets, so the rows are.
              <Pressable
                key={row.key}
                className="mb-2.5"
                disabled={!row.onFigure}
                onPress={() => togglePickedMuscle(row.key)}
                accessibilityRole={row.onFigure ? 'button' : undefined}
                accessibilityState={
                  row.onFigure
                    ? { selected: pickedMuscle === row.key }
                    : undefined
                }
                testID={`muscle-row-${row.key}`}
              >
                <View className="flex-row justify-between mb-1">
                  <Text
                    className={`text-sm text-text-primary ${
                      pickedMuscle === row.key ? 'font-semibold' : ''
                    }`}
                  >
                    {muscleLabel(t, row.name)}
                  </Text>
                  <Text className="text-text-secondary text-sm">
                    {setsLabel(row.sets)}
                  </Text>
                </View>
                <View className="h-1.5 rounded-full bg-progress-track overflow-hidden">
                  <View
                    className="h-1.5 rounded-full bg-exercise"
                    style={{
                      width: `${maxRowSets > 0 ? (row.sets / maxRowSets) * 100 : 0}%`,
                    }}
                  />
                </View>
              </Pressable>
            ))
          )}
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm items-center">
          <Text className="text-text-primary text-base font-bold self-start">
            {t('exerciseStatistics.heatMap.title', {
              defaultValue: 'Muscle Heat Map',
            })}
          </Text>
          <Text className="text-text-secondary text-xs mt-0.5 mb-3 self-start">
            {t('exerciseStatistics.heatMap.subtitle', {
              defaultValue: 'Front and back, tinted by working sets',
            })}
          </Text>
          <View className="self-stretch mb-3">
            <SegmentedControl
              segments={[
                {
                  key: 'male',
                  label: t('exerciseStatistics.heatMap.male', {
                    defaultValue: 'Male',
                  }),
                },
                {
                  key: 'female',
                  label: t('exerciseStatistics.heatMap.female', {
                    defaultValue: 'Female',
                  }),
                },
              ]}
              activeKey={figure}
              onSelect={(next) => {
                setChosenFigure(next);
                setPickedMuscle(null);
              }}
            />
          </View>
          <MuscleFigure
            figure={figure}
            setsByMuscle={setsByMuscle}
            selectedKey={pickedMuscle}
            onSelect={togglePickedMuscle}
            accessibilityLabel={t('exerciseStatistics.heatMap.a11y', {
              defaultValue:
                'Body figure tinted by working sets. The same counts are listed under Sets per Muscle, where selecting a muscle highlights it here.',
            })}
          />
          {pickedMuscle ? (
            <Pressable
              onPress={() => setPickedMuscle(null)}
              accessibilityRole="button"
              accessibilityLiveRegion="polite"
              className="mt-3 rounded-full border border-border-subtle bg-raised px-3 py-1.5"
            >
              <Text className="text-sm text-text-primary">
                <Text className="font-semibold">
                  {muscleLabel(t, pickedMuscle)}
                </Text>
                <Text className="text-text-secondary">
                  {' · '}
                  {setsLabel(setsForMuscleKey(pickedMuscle, setsByMuscle))}
                </Text>
              </Text>
            </Pressable>
          ) : (
            <Text className="mt-3 text-xs text-text-muted">
              {t('exerciseStatistics.heatMap.tap', {
                defaultValue: 'Tap a muscle',
              })}
            </Text>
          )}
          <View className="flex-row items-center mt-3">
            <Text className="text-xs text-text-muted mr-1.5">
              {t('exerciseStatistics.heatMap.fewer', {
                defaultValue: 'Fewer',
              })}
            </Text>
            <View className="w-3 h-3 rounded-sm mr-1 bg-progress-track" />
            {MUSCLE_HEAT_COLORS.map((color) => (
              <View
                key={color}
                className="w-3 h-3 rounded-sm mr-1"
                style={{ backgroundColor: color }}
              />
            ))}
            <Text className="text-xs text-text-muted ml-0.5">
              {t('exerciseStatistics.heatMap.more', { defaultValue: 'More' })}
            </Text>
          </View>
          {notOnFigure.length > 0 ? (
            <View className="self-stretch mt-4">
              <Text className="text-xs uppercase text-text-muted mb-1">
                {t('exerciseStatistics.heatMap.notOnFigure', {
                  defaultValue: 'Not on the figure',
                })}
              </Text>
              {notOnFigure.map((row, index) => (
                <ValueRow
                  key={row.muscle}
                  label={muscleLabel(t, row.muscle)}
                  value={setsLabel(row.sets)}
                  last={index === notOnFigure.length - 1}
                />
              ))}
            </View>
          ) : null}
        </View>

        <TrainingConsistencyCard
          data={consistency.data}
          isLoading={consistency.isLoading}
          isError={consistency.isError}
        />

        <Text className="text-text-primary text-base font-bold mt-2">
          {t('exerciseStatistics.analysis.title', {
            defaultValue: 'More Analysis',
          })}
        </Text>
        <CollapsibleSection
          title={t('exerciseStatistics.analysis.recovery', {
            defaultValue: 'Last Trained',
          })}
          expanded={openSection === 'recovery'}
          onToggle={() => toggleSection('recovery')}
          itemCount={recoveryRows.length}
        >
          {recoveryRows.map((row, index) => (
            <ValueRow
              key={row.name}
              label={muscleLabel(t, row.name)}
              value={recoveryLabel(t, row.daysAgo, row.lastDate)}
              last={index === recoveryRows.length - 1}
            />
          ))}
        </CollapsibleSection>
        <CollapsibleSection
          title={t('exerciseStatistics.analysis.variety', {
            defaultValue: 'Exercise Variety',
          })}
          expanded={openSection === 'variety'}
          onToggle={() => toggleSection('variety')}
          itemCount={varietyRows.length}
        >
          {varietyRows.map((row, index) => (
            <ValueRow
              key={row.name}
              label={muscleLabel(t, row.name)}
              value={t('exerciseStatistics.analysis.exerciseCount', {
                count: row.value,
                defaultValue: '{{count}} exercises',
                defaultValue_one: '{{count}} exercise',
                defaultValue_other: '{{count}} exercises',
              })}
              last={index === varietyRows.length - 1}
            />
          ))}
        </CollapsibleSection>
        <CollapsibleSection
          title={t('exerciseStatistics.analysis.volume', {
            defaultValue: 'Volume by Muscle',
          })}
          expanded={openSection === 'volume'}
          onToggle={() => toggleSection('volume')}
          itemCount={volumeRows.length}
        >
          {volumeRows.map((row, index) => (
            <ValueRow
              key={row.name}
              label={muscleLabel(t, row.name)}
              value={`${formatLocalizedNumber(
                Math.round(weightFromKg(row.value, weightUnit))
              )} ${weightUnit}`}
              last={index === volumeRows.length - 1}
            />
          ))}
        </CollapsibleSection>
      </>
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-4">
          <SegmentedControl
            segments={trendRangeSegments(t)}
            activeKey={range}
            onSelect={selectRange}
          />
        </View>
        <View className="mb-4">
          <SegmentedControl
            segments={[
              {
                key: 'strength',
                label: t('exerciseStatistics.views.strength', {
                  defaultValue: 'Strength',
                }),
              },
              {
                key: 'cardio',
                label: t('exerciseStatistics.views.cardio', {
                  defaultValue: 'Cardio',
                }),
              },
            ]}
            activeKey={view}
            onSelect={setView}
          />
        </View>
        {view === 'strength' ? renderBody() : renderCardio()}
      </ScrollView>
    </View>
  );
};

export default ExerciseStatisticsScreen;
