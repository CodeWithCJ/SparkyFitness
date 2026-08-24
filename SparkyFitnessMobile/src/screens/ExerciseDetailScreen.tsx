import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { CommonActions, StackActions } from '@react-navigation/native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import { useReducedMotion } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import ExerciseImageCrossfade, {
  sourceMayHaveTransparency,
} from '../components/ExerciseImageCrossfade';
import Icon from '../components/Icon';
import SafeImage from '../components/SafeImage';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import ExerciseHistoryList from '../components/ExerciseHistoryList';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { fetchExerciseById } from '../services/api/exerciseApi';
import { importExercise } from '../services/api/externalExerciseSearchApi';
import { getApiErrorMessage } from '../services/api/errors';
import { exerciseDetailQueryKey, suggestedExercisesQueryKey } from '../hooks/queryKeys';
import {
  useExerciseImageSource,
  useImagePairAspectMatch,
} from '../hooks/useExerciseImageSource';
import {
  useDeleteExerciseLibrary,
  usePreferences,
  useProfile,
  useServerConnection,
  useUpdateExercise,
} from '../hooks';
import { useExerciseStats } from '../hooks/useExerciseStats';
import { useStartLiveWorkout } from '../hooks/useStartLiveWorkout';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import {
  buildSingleExerciseStartPayload,
  CATEGORY_ICON_MAP,
  formatRecentSessionSet,
  normalizeWeightUnit,
  resolveSnapshotModality,
} from '../utils/workoutSession';
import { formatDateLabel } from '../utils/dateUtils';
import { useScreenHeader, type HeaderItem } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { Exercise } from '../types/exercise';
import type { RootStackScreenProps } from '../types/navigation';
import { localizeExerciseTaxonomyValue } from '../localization/exerciseTaxonomy';

type ExerciseDetailScreenProps = RootStackScreenProps<'ExerciseDetail'>;

type TabKey = 'summary' | 'history' | 'how-to';

const DESCRIPTION_PREVIEW_LINES = 3;
const DESCRIPTION_PREVIEW_THRESHOLD = 180;

// Matches the dominant exercise image sets (4:3 photos), so cover-filled
// frames crop little to nothing.
const IMAGE_ASPECT_RATIO = 4 / 3;

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
  const { t , i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { item, updatedItem, hideWorkoutActions, selectionReturnKey } = route.params;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  const textMuted = useCSSVariable('--color-text-muted') as string;
  const { getImageSource } = useExerciseImageSource();
  const reducedMotion = useReducedMotion();
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
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
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

  const isPublic = !!exercise.sharedWithPublic;
  const { updateExerciseAsync, isPending: isSharePending } = useUpdateExercise();

  const handleToggleShare = useCallback(async () => {
    const nextIsPublic = !isPublic;
    const runUpdate = async () => {
      try {
        const updated = await updateExerciseAsync({
          id: exercise.id,
          payload: { shared_with_public: nextIsPublic },
        });
        navigation.setParams({ updatedItem: updated });
        Toast.show({
          type: 'success',
          text1: updated.sharedWithPublic ? t('exerciseDetail.sharedPublicly', { defaultValue: 'Exercise shared publicly' }) : t('exerciseDetail.madePrivate', { defaultValue: 'Exercise made private' }),
        });
      } catch {
        // useUpdateExercise hook already shows error Toast on failure
      }
    };

    if (nextIsPublic) {
      Alert.alert(
        t('exerciseDetail.makePublicTitle', { defaultValue: 'Make public?' }),
        t('exerciseDetail.makePublicMessage', { defaultValue: 'This exercise will become visible to all users on this server.' }),
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          {
            text: t('exerciseDetail.makePublic', { defaultValue: 'Make Public' }),
            onPress: () => void runUpdate(),
          },
        ]
      );
    } else {
      void runUpdate();
    }
  }, [exercise.id, isPublic, updateExerciseAsync, navigation, t]);

  const { confirmAndDelete, isPending: isDeletePending } = useDeleteExerciseLibrary({
    exerciseId: exercise.id,
    onSuccess: () => {
      Toast.show({ type: 'success', text1: t('exerciseDetail.deleted', { defaultValue: 'Exercise deleted' }) });
      navigation.goBack();
    },
  });

  const { startLiveWorkout, isStarting } = useStartLiveWorkout(navigation);
  const handleStartWorkout = () => {
    void startLiveWorkout({
      exercises: buildSingleExerciseStartPayload(exercise),
    });
  };

  const imageSources = useMemo(() => {
    return (exercise.images ?? [])
      .map((path) => (path ? getImageSource(path) : null))
      .filter((source): source is { uri: string; headers: Record<string, string> } =>
        source !== null,
      );
  }, [exercise.images, getImageSource]);

  const pairAspectMatch = useImagePairAspectMatch(imageSources);

  const equipmentText = formatList(exercise.equipment ?? []);
  const primaryMusclesText = formatList(exercise.primary_muscles ?? []);
  const secondaryMusclesText = formatList(exercise.secondary_muscles ?? []);
  const description = exercise.description?.trim() ?? '';
  const categoryText = localizeExerciseTaxonomyValue(t, 'category', exercise.category);
  const levelText = localizeExerciseTaxonomyValue(t, 'level', exercise.level);
  const forceText = localizeExerciseTaxonomyValue(t, 'force', exercise.force);
  const mechanicText = localizeExerciseTaxonomyValue(t, 'mechanic', exercise.mechanic);
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
    const tabs: Segment<TabKey>[] = [{ key: 'summary', label: t('exerciseDetail.summary', { defaultValue: 'Summary' }) }];
    if (historyAvailable) tabs.push({ key: 'history', label: t('exerciseDetail.history', { defaultValue: 'History' }) });
    if (hasHowToContent) tabs.push({ key: 'how-to', label: t('exerciseDetail.howTo', { defaultValue: 'How to' }) });
    return tabs;
  }, [historyAvailable, hasHowToContent, t]);

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

  const imageFallback = (
    <View className="bg-raised items-center justify-center" style={{ flex: 1 }}>
      <Icon
        name={(exercise.category && CATEGORY_ICON_MAP[exercise.category]) || 'exercise-weights'}
        size={48}
        color={textMuted}
      />
    </View>
  );

  const imageCarousel =
    imageSources.length === 1 ? (
      <View
        className={`${
          sourceMayHaveTransparency(imageSources[0].uri) ? 'bg-white' : 'bg-surface'
        } rounded-xl overflow-hidden`}
      >
        <SafeImage
          source={imageSources[0]}
          style={{ width: '100%', aspectRatio: IMAGE_ASPECT_RATIO }}
          contentFit={sourceMayHaveTransparency(imageSources[0].uri) ? 'contain' : 'cover'}
          fallback={imageFallback}
          autoplay={!reducedMotion}
        />
      </View>
    ) : imageSources.length === 2 && !reducedMotion && pairAspectMatch !== false ? (
      <View
        className="bg-surface rounded-xl overflow-hidden"
        style={{ width: '100%', aspectRatio: IMAGE_ASPECT_RATIO }}
      >
        <ExerciseImageCrossfade
          sources={[imageSources[0], imageSources[1]]}
          fallback={imageFallback}
        />
      </View>
    ) : imageSources.length > 1 ? (
      <View>
        <View
          className="bg-surface rounded-xl overflow-hidden"
          style={{ width: '100%', aspectRatio: IMAGE_ASPECT_RATIO }}
        >
          <PagerView
            style={{ flex: 1 }}
            initialPage={0}
            onPageSelected={handleImagePageSelected}
          >
            {imageSources.map((source, index) => (
              <View
                key={`${source.uri}-${index}`}
                className={sourceMayHaveTransparency(source.uri) ? 'bg-white' : undefined}
              >
                <SafeImage
                  source={source}
                  style={{ width: '100%', height: '100%' }}
                  contentFit={sourceMayHaveTransparency(source.uri) ? 'contain' : 'cover'}
                  fallback={imageFallback}
                  autoplay={!reducedMotion}
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
      date: useDiaryDateStore.getState().selectedDate,
    });
  };

  const handleEdit = () => {
    navigation.navigate('ExerciseForm', {
      mode: 'edit-exercise',
      exercise,
      returnKey: route.key,
    });
  };

  // Pre-add preview flow (opened via ⓘ from ExerciseSearch): Add selects this
  // exercise into the form that opened the search. External items (non-UUID
  // id) are imported into the user's library first.
  const addInFlightRef = useRef(false);
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!selectionReturnKey) return;
    // `busy` only disables the button after a re-render; the ref blocks a
    // second tap landing before that.
    if (addInFlightRef.current) return;
    addInFlightRef.current = true;
    setIsAdding(true);

    let selected: Exercise | null = exercise;
    if (!UUID_REGEX.test(item.id)) {
      try {
        selected = await importExercise(item.source, item.id);
        // The import succeeded server-side, so the library cache must reflect
        // it even when the selection is abandoned below.
        queryClient.invalidateQueries({ queryKey: suggestedExercisesQueryKey });
      } catch (error) {
        Toast.show({
          type: 'error',
          text1: t('exerciseDetail.addFailed', { defaultValue: 'Failed to add exercise' }),
          text2: getApiErrorMessage(error) ?? undefined,
        });
        selected = null;
      }
      // `busy` doesn't stop the back swipe/button; dispatching the selection
      // or popping from an unfocused route would misfire.
      if (!navigation.isFocused()) selected = null;
    }

    if (selected) {
      navigation.dispatch({
        ...CommonActions.setParams({
          selectedExercise: selected,
          selectionNonce: Date.now(),
        }),
        source: selectionReturnKey,
      });
      // Form ← ExerciseSearch ← ExerciseDetail.
      navigation.dispatch(StackActions.pop(2));
    }
    // No `finally`: the react compiler can't lower it and would bail on the
    // whole component. Every path above falls through to this cleanup.
    addInFlightRef.current = false;
    setIsAdding(false);
  };

  const rightItems: HeaderItem[] = [
    ...(canManageExercise
      ? [
          {
            kind: 'icon',
            sfSymbol: isPublic ? 'lock.fill' : 'square.and.arrow.up',
            ionicon: isPublic ? 'lock-closed-outline' : 'share-social-outline',
            role: 'secondary',
            useIoniconOnIOS: !isPublic,
            disabled: isSharePending,
            onPress: handleToggleShare,
            accessibilityLabel: isPublic
              ? t('exerciseDetail.makePrivate', { defaultValue: 'Make private' })
              : t('exerciseDetail.shareWithPublic', { defaultValue: 'Share with public' }),
            identifier: 'exercise-detail-share',
          } as const,
          {
            kind: 'text',
            label: t('common.edit', { defaultValue: 'Edit' }),
            role: 'secondary',
            onPress: handleEdit,
            accessibilityLabel: t('exerciseDetail.editExercise', { defaultValue: 'Edit exercise' }),
            identifier: 'exercise-detail-edit',
          } as const,
        ]
      : []),
    ...(selectionReturnKey
      ? [
          {
            kind: 'primary',
            label: t('common.add', { defaultValue: 'Add' }),
            busy: isAdding,
            onPress: () => {
              void handleAdd();
            },
            accessibilityLabel: t('exerciseDetail.addExercise', { defaultValue: 'Add exercise' }),
            identifier: 'exercise-detail-add',
          } as const,
        ]
      : []),
  ];

  const header = useScreenHeader({
    title: exercise.name,
    nativeTitle: exercise.name,
    borderless: true,
    left: { kind: 'back' },
    right: rightItems.length > 0 ? rightItems : null,
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
              distanceUnit={distanceUnit}
              modality={resolveSnapshotModality(exercise)}
              bestSet={bestSet}
            />
          ) : resolvedTab === 'how-to' ? (
            <>
              {imageCarousel}

              {instructionSteps.length > 0 ? (
                <View className="bg-surface rounded-xl p-4">
                  <Text className="text-text-secondary text-sm mb-2">{t('exerciseDetail.instructions', { defaultValue: 'Instructions' })}</Text>
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
                  <Text className="text-text-secondary text-sm">{t('exerciseDetail.description', { defaultValue: 'Description' })}</Text>
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
                      {descriptionExpanded ? t('common.showLess', { defaultValue: 'Show less' }) : t('exerciseDetail.showMore', { defaultValue: 'Show more' })}
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
                      label={t('exerciseDetail.best', { defaultValue: 'Best ({{unit}})', unit: weightUnit })}
                      value={formatRecentSessionSet(
                        {
                          setNumber: bestSet.setNumber,
                          setType: null,
                          weight: bestSet.weight,
                          reps: bestSet.reps,
                        },
                        weightUnit,
                        t,
                        resolveSnapshotModality(exercise),
                      )}
                      sub={formatDateLabel(bestSet.entryDate, t, dateLocale)}
                    />
                  ) : null}
                  {lastSet ? (
                    <StatTile
                      label={t('exerciseDetail.last', { defaultValue: 'Last ({{unit}})', unit: weightUnit })}
                      value={formatRecentSessionSet(
                        {
                          setNumber: lastSet.setNumber,
                          setType: null,
                          weight: lastSet.weight,
                          reps: lastSet.reps,
                        },
                        weightUnit,
                        t,
                        resolveSnapshotModality(exercise),
                      )}
                      sub={formatDateLabel(lastSet.entryDate, t, dateLocale)}
                    />
                  ) : null}
                  {exercise.calories_per_hour > 0 ? (
                    <StatTile label={t('exerciseDetail.caloriesPerHour', { defaultValue: 'Cal / hour' })} value={String(exercise.calories_per_hour)} />
                  ) : null}
                </View>
              ) : null}

              {equipmentText.length > 0 ||
              primaryMusclesText.length > 0 ||
              secondaryMusclesText.length > 0 ? (
                <View className="bg-surface rounded-xl p-4">
                  {equipmentText.length > 0 ? (
                    <View>
                      <Text className="text-text-secondary text-sm">{t('exerciseDetail.equipment', { defaultValue: 'Equipment' })}</Text>
                      <Text className="text-text-primary text-base font-medium mt-1">
                        {equipmentText}
                      </Text>
                    </View>
                  ) : null}
                  {primaryMusclesText.length > 0 ? (
                    <View className={equipmentText.length > 0 ? 'mt-3' : ''}>
                      <Text className="text-text-secondary text-sm">{t('exerciseDetail.primaryMuscles', { defaultValue: 'Primary muscles' })}</Text>
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
                      <Text className="text-text-secondary text-sm">{t('exerciseDetail.secondaryMuscles', { defaultValue: 'Secondary muscles' })}</Text>
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
                      {t('exerciseDetail.details', { defaultValue: 'Exercise details' })}
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
                          <Text className="text-text-secondary text-sm">{t('exerciseDetail.category', { defaultValue: 'Category' })}</Text>
                          <Text className="text-text-primary text-base font-medium mt-1">
                            {categoryText}
                          </Text>
                        </View>
                      ) : null}
                      {levelText ? (
                        <View className={categoryText ? 'mt-3' : ''}>
                          <Text className="text-text-secondary text-sm">{t('exerciseDetail.level', { defaultValue: 'Level' })}</Text>
                          <Text className="text-text-primary text-base font-medium mt-1">
                            {levelText}
                          </Text>
                        </View>
                      ) : null}
                      {forceText ? (
                        <View className={categoryText || levelText ? 'mt-3' : ''}>
                          <Text className="text-text-secondary text-sm">{t('exerciseDetail.force', { defaultValue: 'Force' })}</Text>
                          <Text className="text-text-primary text-base font-medium mt-1">
                            {forceText}
                          </Text>
                        </View>
                      ) : null}
                      {mechanicText ? (
                        <View
                          className={categoryText || levelText || forceText ? 'mt-3' : ''}
                        >
                          <Text className="text-text-secondary text-sm">{t('exerciseDetail.mechanic', { defaultValue: 'Mechanic' })}</Text>
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
                          <Text className="text-text-secondary text-sm">{t('exerciseDetail.source', { defaultValue: 'Source' })}</Text>
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
                      {isStarting ? t('exerciseDetail.starting', { defaultValue: 'Starting…' }) : t('exerciseDetail.startWorkout', { defaultValue: 'Start Workout' })}
                    </Text>
                  </Button>

                  <Button variant="ghost" onPress={handleLog}>
                    <Text className="text-accent-primary text-base font-semibold">
                      {t('exerciseDetail.logExercise', { defaultValue: 'Log Exercise' })}
                    </Text>
                  </Button>
                </>
              )}

              {canManageExercise && (
                <Button
                  variant="destructive"
                  onPress={confirmAndDelete}
                  disabled={isDeletePending}
                >
                  {isDeletePending ? t('exerciseDetail.deleting', { defaultValue: 'Deleting...' }) : t('exerciseDetail.deleteExercise', { defaultValue: 'Delete Exercise' })}
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
