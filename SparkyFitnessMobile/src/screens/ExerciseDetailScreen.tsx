import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import { useQuery } from '@tanstack/react-query';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import ExerciseHistoryList from '../components/ExerciseHistoryList';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { fetchExerciseById } from '../services/api/exerciseApi';
import { exerciseDetailQueryKey } from '../hooks/queryKeys';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import {
  useDeleteExerciseLibrary,
  usePreferences,
  useProfile,
  useServerConnection,
} from '../hooks';
import { useExerciseStats } from '../hooks/useExerciseStats';
import { useStartLiveWorkout } from '../hooks/useStartLiveWorkout';
import {
  buildSingleExerciseStartPayload,
  formatRecentSessionSet,
  normalizeWeightUnit,
} from '../utils/workoutSession';
import { formatDateLabel } from '../utils/dateUtils';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type ExerciseDetailScreenProps = RootStackScreenProps<'ExerciseDetail'>;

type TabKey = 'summary' | 'history' | 'how-to';

const DESCRIPTION_PREVIEW_LINES = 3;
const DESCRIPTION_PREVIEW_THRESHOLD = 180;

// Tab-change flings ignore touches starting this close to the left screen
// edge so the native-stack back swipe keeps the edge to itself.
const BACK_SWIPE_EDGE_WIDTH = 24;

// Matches the server's `/exercises/:id` UUID guard; a non-UUID id (e.g. an
// external-provider exercise) would 400, so we skip hydration for those.
const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const formatList = (items: string[]) =>
  items
    .filter((value) => value && value.trim().length > 0)
    .map(capitalize)
    .join(', ');

const cleanSteps = (steps: string[] | undefined) =>
  (steps ?? [])
    .map((step) => step?.trim())
    .filter((step): step is string => Boolean(step && step.length > 0));

const StatTile: React.FC<{ label: string; value: string; sub?: string }> = ({
  label,
  value,
  sub,
}) => (
  <View className="bg-surface rounded-xl p-3 flex-1">
    <Text className="text-text-secondary text-xs">{label}</Text>
    <Text className="text-text-primary text-base font-semibold mt-1" numberOfLines={1}>
      {value}
    </Text>
    {sub ? <Text className="text-text-muted text-xs mt-0.5">{sub}</Text> : null}
  </View>
);

const ExerciseDetailScreen: React.FC<ExerciseDetailScreenProps> = ({ navigation, route }) => {
  const { item, updatedItem, hideWorkoutActions } = route.params;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  const { getImageSource } = useExerciseImageSource();
  const { profile } = useProfile();
  const { isConnected } = useServerConnection();

  // Opened from a workout/preset row, `item` may be sparse (only
  // name/category/images). Hydrate the full catalog record by id so muscles,
  // equipment, instructions, and ownership fill in. A just-returned edit
  // (`updatedItem`) always wins; otherwise prefer the hydrated record, falling
  // back to whatever `item` we were handed while it loads or offline.
  const { data: hydratedItem } = useQuery({
    queryKey: exerciseDetailQueryKey(item.id),
    queryFn: () => fetchExerciseById(item.id),
    enabled: isConnected && UUID_REGEX.test(item.id),
  });

  const exercise = updatedItem ?? hydratedItem ?? item;

  const { preferences } = usePreferences();
  const weightUnit = normalizeWeightUnit(preferences?.default_weight_unit);
  // Same UUID guard as hydration: the stats and history routes 400 on non-UUID
  // ids (e.g. external-provider exercises), so those get no History tab.
  const historyAvailable = isConnected && UUID_REGEX.test(item.id);
  const { data: stats } = useExerciseStats(historyAvailable ? item.id : null);
  const bestSet = stats?.bestSet ?? null;
  const lastSet = stats?.lastSet ?? null;

  const canManageExercise = !!(
    isConnected &&
    exercise.userId &&
    profile?.id === exercise.userId
  );

  const { confirmAndDelete, isPending: isDeletePending } = useDeleteExerciseLibrary({
    exerciseId: exercise.id,
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Exercise deleted' });
      navigation.goBack();
    },
  });

  const { startLiveWorkout, isStarting } = useStartLiveWorkout(navigation);
  const handleStartWorkout = () => {
    void startLiveWorkout({ exercises: buildSingleExerciseStartPayload({ id: exercise.id }) });
  };

  const imageSources = useMemo(() => {
    return (exercise.images ?? [])
      .map((path) => (path ? getImageSource(path) : null))
      .filter((source): source is { uri: string; headers: Record<string, string> } =>
        source !== null,
      );
  }, [exercise.images, getImageSource]);

  const equipmentText = formatList(exercise.equipment ?? []);
  const primaryMusclesText = formatList(exercise.primary_muscles ?? []);
  const secondaryMusclesText = formatList(exercise.secondary_muscles ?? []);
  const description = exercise.description?.trim() ?? '';
  const categoryText = exercise.category ? capitalize(exercise.category) : '';
  const levelText = exercise.level ? capitalize(exercise.level) : '';
  const forceText = exercise.force ? capitalize(exercise.force) : '';
  const mechanicText = exercise.mechanic ? capitalize(exercise.mechanic) : '';
  const sourceText = exercise.source ?? '';
  const hasDetails = Boolean(
    categoryText || levelText || forceText || mechanicText || sourceText,
  );
  const instructionSteps = cleanSteps(exercise.instructions);

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const scrollRef = useRef<ScrollView>(null);

  // The image carousel renders on both Summary and How to, so it remounts at
  // page 0 on tab switches; reset the dot index with it.
  const handleSelectTab = useCallback((key: TabKey) => {
    setActiveTab(key);
    setActiveImageIndex(0);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const hasHowToContent =
    imageSources.length > 0 || instructionSteps.length > 0 || description.length > 0;

  const segments = useMemo(() => {
    const tabs: Segment<TabKey>[] = [{ key: 'summary', label: 'Summary' }];
    if (historyAvailable) tabs.push({ key: 'history', label: 'History' });
    if (hasHowToContent) tabs.push({ key: 'how-to', label: 'How to' });
    return tabs;
  }, [historyAvailable, hasHowToContent]);

  const resolvedTab: TabKey =
    (activeTab === 'history' && !historyAvailable) ||
    (activeTab === 'how-to' && !hasHowToContent)
      ? 'summary'
      : activeTab;

  const swipeGesture = useMemo(() => {
    const selectAdjacentTab = (offset: number) => {
      const index = segments.findIndex((segment) => segment.key === resolvedTab);
      const target = segments[index + offset];
      if (target) handleSelectTab(target.key);
    };
    return Gesture.Race(
      Gesture.Fling()
        .direction(Directions.RIGHT)
        .hitSlop({ left: -BACK_SWIPE_EDGE_WIDTH })
        .onEnd(() => selectAdjacentTab(-1))
        .runOnJS(true),
      Gesture.Fling()
        .direction(Directions.LEFT)
        .onEnd(() => selectAdjacentTab(1))
        .runOnJS(true),
    );
  }, [segments, resolvedTab, handleSelectTab]);

  const handleImagePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      setActiveImageIndex(e.nativeEvent.position);
    },
    [],
  );

  const descriptionIsLong = description.length > DESCRIPTION_PREVIEW_THRESHOLD;

  const imageCarousel =
    imageSources.length === 1 ? (
      <View className="bg-surface rounded-xl overflow-hidden">
        <Image
          source={imageSources[0]}
          style={{ width: '100%', aspectRatio: 16 / 9 }}
          resizeMode="cover"
        />
      </View>
    ) : imageSources.length > 1 ? (
      <View>
        <View
          className="bg-surface rounded-xl overflow-hidden"
          style={{ width: '100%', aspectRatio: 16 / 9 }}
        >
          <PagerView
            style={{ flex: 1 }}
            initialPage={0}
            onPageSelected={handleImagePageSelected}
          >
            {imageSources.map((source, index) => (
              <View key={`${source.uri}-${index}`}>
                <Image
                  source={source}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </View>
            ))}
          </PagerView>
        </View>
        <View className="flex-row justify-center items-center mt-2">
          {imageSources.map((source, index) => (
            <View
              key={`dot-${source.uri}-${index}`}
              className={`w-2 h-2 rounded-full mx-1 ${
                index === activeImageIndex ? 'bg-accent-primary' : 'bg-border'
              }`}
            />
          ))}
        </View>
      </View>
    ) : null;

  const handleLog = () => {
    navigation.navigate('ActivityAdd', {
      selectedExercise: exercise,
      selectionNonce: Date.now(),
    });
  };

  const handleEdit = () => {
    navigation.navigate('ExerciseForm', {
      mode: 'edit-exercise',
      exercise,
      returnKey: route.key,
    });
  };

  const header = useScreenHeader({
    title: exercise.name,
    nativeTitle: exercise.name,
    borderless: true,
    left: { kind: 'back' },
    right: canManageExercise
      ? {
          kind: 'text',
          label: 'Edit',
          role: 'secondary',
          onPress: handleEdit,
          accessibilityLabel: 'Edit exercise',
          identifier: 'exercise-detail-edit',
        }
      : null,
  });

  return (
    <GestureDetector gesture={swipeGesture}>
      <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
        {header}

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
            gap: 16,
          }}
        >
          {segments.length > 1 ? (
            <SegmentedControl
              segments={segments}
              activeKey={resolvedTab}
              onSelect={handleSelectTab}
            />
          ) : null}

          {resolvedTab === 'history' ? (
            <ExerciseHistoryList
              exerciseId={item.id}
              weightUnit={weightUnit}
              bestSet={bestSet}
            />
          ) : resolvedTab === 'how-to' ? (
            <>
              {imageCarousel}

              {instructionSteps.length > 0 ? (
                <View className="bg-surface rounded-xl p-4">
                  <Text className="text-text-secondary text-sm mb-2">Instructions</Text>
                  {instructionSteps.map((step, index) => (
                    <View
                      key={`${index}-${step.slice(0, 12)}`}
                      className={`flex-row ${index === 0 ? '' : 'mt-2'}`}
                    >
                      <Text className="text-text-secondary text-base font-semibold w-6">
                        {index + 1}.
                      </Text>
                      <Text className="text-text-primary text-base flex-1 leading-6">
                        {step}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {description.length > 0 ? (
                <TouchableOpacity
                  activeOpacity={descriptionIsLong ? 0.7 : 1}
                  onPress={
                    descriptionIsLong
                      ? () => setDescriptionExpanded((prev) => !prev)
                      : undefined
                  }
                  className="bg-surface rounded-xl p-4"
                >
                  <Text className="text-text-secondary text-sm">Description</Text>
                  <Text
                    className="text-text-primary text-base mt-1 leading-6"
                    numberOfLines={
                      descriptionIsLong && !descriptionExpanded
                        ? DESCRIPTION_PREVIEW_LINES
                        : undefined
                    }
                  >
                    {description}
                  </Text>
                  {descriptionIsLong ? (
                    <Text className="text-accent-primary text-sm font-medium mt-2">
                      {descriptionExpanded ? 'Show less' : 'Show more'}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <>
              {imageCarousel}

              {bestSet || lastSet || exercise.calories_per_hour > 0 ? (
                <View className="flex-row gap-3">
                  {bestSet ? (
                    <StatTile
                      label={`Best (${weightUnit})`}
                      value={formatRecentSessionSet(
                        {
                          setNumber: bestSet.setNumber,
                          setType: null,
                          weight: bestSet.weight,
                          reps: bestSet.reps,
                        },
                        weightUnit,
                      )}
                      sub={formatDateLabel(bestSet.entryDate)}
                    />
                  ) : null}
                  {lastSet ? (
                    <StatTile
                      label={`Last (${weightUnit})`}
                      value={formatRecentSessionSet(
                        {
                          setNumber: lastSet.setNumber,
                          setType: null,
                          weight: lastSet.weight,
                          reps: lastSet.reps,
                        },
                        weightUnit,
                      )}
                      sub={formatDateLabel(lastSet.entryDate)}
                    />
                  ) : null}
                  {exercise.calories_per_hour > 0 ? (
                    <StatTile label="Cal / hour" value={String(exercise.calories_per_hour)} />
                  ) : null}
                </View>
              ) : null}

              {equipmentText.length > 0 ||
              primaryMusclesText.length > 0 ||
              secondaryMusclesText.length > 0 ? (
                <View className="bg-surface rounded-xl p-4">
                  {equipmentText.length > 0 ? (
                    <View>
                      <Text className="text-text-secondary text-sm">Equipment</Text>
                      <Text className="text-text-primary text-base font-medium mt-1">
                        {equipmentText}
                      </Text>
                    </View>
                  ) : null}
                  {primaryMusclesText.length > 0 ? (
                    <View className={equipmentText.length > 0 ? 'mt-3' : ''}>
                      <Text className="text-text-secondary text-sm">Primary muscles</Text>
                      <Text className="text-text-primary text-base font-medium mt-1">
                        {primaryMusclesText}
                      </Text>
                    </View>
                  ) : null}
                  {secondaryMusclesText.length > 0 ? (
                    <View
                      className={
                        equipmentText.length > 0 || primaryMusclesText.length > 0
                          ? 'mt-3'
                          : ''
                      }
                    >
                      <Text className="text-text-secondary text-sm">Secondary muscles</Text>
                      <Text className="text-text-primary text-base font-medium mt-1">
                        {secondaryMusclesText}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {hasDetails ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setDetailsExpanded((prev) => !prev)}
                  className="bg-surface rounded-xl p-4"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-text-primary text-base font-semibold">
                      Exercise details
                    </Text>
                    <Icon
                      name={detailsExpanded ? 'chevron-down' : 'chevron-forward'}
                      size={18}
                      color={textPrimary}
                    />
                  </View>
                  {detailsExpanded ? (
                    <View className="mt-3">
                      {categoryText ? (
                        <View>
                          <Text className="text-text-secondary text-sm">Category</Text>
                          <Text className="text-text-primary text-base font-medium mt-1">
                            {categoryText}
                          </Text>
                        </View>
                      ) : null}
                      {levelText ? (
                        <View className={categoryText ? 'mt-3' : ''}>
                          <Text className="text-text-secondary text-sm">Level</Text>
                          <Text className="text-text-primary text-base font-medium mt-1">
                            {levelText}
                          </Text>
                        </View>
                      ) : null}
                      {forceText ? (
                        <View className={categoryText || levelText ? 'mt-3' : ''}>
                          <Text className="text-text-secondary text-sm">Force</Text>
                          <Text className="text-text-primary text-base font-medium mt-1">
                            {forceText}
                          </Text>
                        </View>
                      ) : null}
                      {mechanicText ? (
                        <View
                          className={categoryText || levelText || forceText ? 'mt-3' : ''}
                        >
                          <Text className="text-text-secondary text-sm">Mechanic</Text>
                          <Text className="text-text-primary text-base font-medium mt-1">
                            {mechanicText}
                          </Text>
                        </View>
                      ) : null}
                      {sourceText ? (
                        <View
                          className={
                            categoryText || levelText || forceText || mechanicText
                              ? 'mt-3'
                              : ''
                          }
                        >
                          <Text className="text-text-secondary text-sm">Source</Text>
                          <Text className="text-text-primary text-base font-medium mt-1">
                            {sourceText}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </TouchableOpacity>
              ) : null}
              {!hideWorkoutActions && (
                <>
                  <Button variant="primary" onPress={handleStartWorkout} disabled={isStarting}>
                    <Text className="text-white text-base font-semibold">
                      {isStarting ? 'Starting…' : 'Start Workout'}
                    </Text>
                  </Button>

                  <Button variant="ghost" onPress={handleLog}>
                    <Text className="text-accent-primary text-base font-semibold">
                      Log Exercise
                    </Text>
                  </Button>
                </>
              )}

              {canManageExercise && (
                <Button
                  variant="ghost"
                  onPress={confirmAndDelete}
                  disabled={isDeletePending}
                  textClassName="text-bg-danger font-medium"
                >
                  {isDeletePending ? 'Deleting...' : 'Delete Exercise'}
                </Button>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </GestureDetector>
  );
};

export default ExerciseDetailScreen;
