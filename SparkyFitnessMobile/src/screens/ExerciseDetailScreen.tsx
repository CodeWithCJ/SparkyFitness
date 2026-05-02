import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PagerView from 'react-native-pager-view';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import {
  useDeleteExerciseLibrary,
  useProfile,
  useServerConnection,
} from '../hooks';
import type { RootStackScreenProps } from '../types/navigation';

type ExerciseDetailScreenProps = RootStackScreenProps<'ExerciseDetail'>;

const DESCRIPTION_PREVIEW_LINES = 3;
const DESCRIPTION_PREVIEW_THRESHOLD = 180;
const INSTRUCTIONS_PREVIEW_COUNT = 1;

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

const ExerciseDetailScreen: React.FC<ExerciseDetailScreenProps> = ({ navigation, route }) => {
  const { item, updatedItem } = route.params;
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const { getImageSource } = useExerciseImageSource();
  const { profile } = useProfile();
  const { isConnected } = useServerConnection();

  const exercise = updatedItem ?? item;

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
  const levelText = exercise.level ? capitalize(exercise.level) : '';
  const forceText = exercise.force ? capitalize(exercise.force) : '';
  const mechanicText = exercise.mechanic ? capitalize(exercise.mechanic) : '';
  const sourceText = exercise.source ?? '';
  const hasDetails = Boolean(levelText || forceText || mechanicText || sourceText);
  const instructionSteps = cleanSteps(exercise.instructions);

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const handleImagePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      setActiveImageIndex(e.nativeEvent.position);
    },
    [],
  );

  const descriptionIsLong = description.length > DESCRIPTION_PREVIEW_THRESHOLD;
  const instructionsHasMore = instructionSteps.length > INSTRUCTIONS_PREVIEW_COUNT;
  const visibleSteps =
    instructionsExpanded || !instructionsHasMore
      ? instructionSteps
      : instructionSteps.slice(0, INSTRUCTIONS_PREVIEW_COUNT);

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

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        {canManageExercise && (
          <View className="ml-auto">
            <Button
              variant="ghost"
              onPress={handleEdit}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              textClassName="font-medium"
            >
              Edit
            </Button>
          </View>
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
          gap: 16,
        }}
      >
        <View className="bg-surface rounded-xl p-4">
          <Text className="text-2xl font-bold text-text-primary">{exercise.name}</Text>
          {exercise.category ? (
            <Text className="text-text-secondary text-base mt-1">{exercise.category}</Text>
          ) : null}
        </View>

        {imageSources.length === 1 ? (
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
        ) : null}

        {exercise.calories_per_hour > 0 ? (
          <View className="bg-surface rounded-xl p-4">
            <Text className="text-text-secondary text-sm">Calories / hour</Text>
            <Text className="text-text-primary text-xl font-semibold mt-1">
              {exercise.calories_per_hour}
            </Text>
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
                color={accentColor}
              />
            </View>
            {detailsExpanded ? (
              <View className="mt-3">
                {levelText ? (
                  <View>
                    <Text className="text-text-secondary text-sm">Level</Text>
                    <Text className="text-text-primary text-base font-medium mt-1">
                      {levelText}
                    </Text>
                  </View>
                ) : null}
                {forceText ? (
                  <View className={levelText ? 'mt-3' : ''}>
                    <Text className="text-text-secondary text-sm">Force</Text>
                    <Text className="text-text-primary text-base font-medium mt-1">
                      {forceText}
                    </Text>
                  </View>
                ) : null}
                {mechanicText ? (
                  <View className={levelText || forceText ? 'mt-3' : ''}>
                    <Text className="text-text-secondary text-sm">Mechanic</Text>
                    <Text className="text-text-primary text-base font-medium mt-1">
                      {mechanicText}
                    </Text>
                  </View>
                ) : null}
                {sourceText ? (
                  <View className={levelText || forceText || mechanicText ? 'mt-3' : ''}>
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
        {instructionSteps.length > 0 ? (
          <TouchableOpacity
            activeOpacity={instructionsHasMore ? 0.7 : 1}
            onPress={
              instructionsHasMore
                ? () => setInstructionsExpanded((prev) => !prev)
                : undefined
            }
            className="bg-surface rounded-xl p-4"
          >
            <Text className="text-text-secondary text-sm mb-2">Instructions</Text>
            {visibleSteps.map((step, index) => (
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
            {instructionsHasMore ? (
              <Text className="text-accent-primary text-sm font-medium mt-3">
                {instructionsExpanded
                  ? 'Show less'
                  : `Show all ${instructionSteps.length} steps`}
              </Text>
            ) : null}
          </TouchableOpacity>
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

        <Button variant="primary" onPress={handleLog}>
          <Text className="text-white text-base font-semibold">Log Exercise</Text>
        </Button>

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
      </ScrollView>
    </View>
  );
};

export default ExerciseDetailScreen;
