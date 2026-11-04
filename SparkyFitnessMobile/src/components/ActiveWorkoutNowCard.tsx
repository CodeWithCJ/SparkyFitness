import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import type { PresetSessionResponse } from '@workspace/shared';
import Icon from './Icon';
import SafeImage from './SafeImage';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { useImageSlideshow } from '../hooks/useImageSlideshow';
import {
  useActiveWorkoutStore,
  type CompletedSetMap,
} from '../stores/activeWorkoutStore';
import {
  describeActiveSetAssumed,
  formatSetLoad,
  upcomingExercises,
} from '../utils/workoutSession';

interface Props {
  session: PresetSessionResponse;
  activeSetId: string | null;
  completedSetIds: CompletedSetMap;
  weightUnit: 'kg' | 'lbs';
  /** True while the rest before the active set runs: the card is then "up next". */
  resting: boolean;
  getImageSource: GetImageSource;
  onPressExercise: (entryId: string) => void;
  onSwap: (entryId: string) => void;
}

const IMAGE_SIZE = 84;

/**
 * The set to do now, pinned under the exercise rail: "Set 2 of 3" with one dot
 * per set, the exercise, its target in large type, and what comes after. Swap
 * opens the quick change for a busy machine (do another exercise now, or
 * replace this one). The list below stays the place to edit values.
 */
export default function ActiveWorkoutNowCard({
  session,
  activeSetId,
  completedSetIds,
  weightUnit,
  resting,
  getImageSource,
  onPressExercise,
  onSwap,
}: Props) {
  const { t } = useTranslation();
  const accent = useCSSVariable('--color-accent-primary') as string;
  const previousSessionSets = useActiveWorkoutStore(
    (s) => s.previousSessionSets
  );
  const plannedSetValues = useActiveWorkoutStore((s) => s.plannedSetValues);
  const exerciseConfigs = useActiveWorkoutStore((s) => s.exerciseConfigs);
  const workoutFormat = useActiveWorkoutStore((s) => s.workoutFormat);

  // Assumed-aware, like the workout bar: a set with empty fields shows the
  // target its row shows in grey.
  const description = describeActiveSetAssumed(session, activeSetId, {
    previousSessionSets,
    plannedSetValues,
    exerciseConfigs,
    weightUnit,
    workoutFormat,
  });
  const entry = session.exercises.find((e) =>
    e.sets.some((s) => String(s.id) === activeSetId)
  );
  // The exercise's photos or GIF, cycled like the guided card's when there
  // are several, so the movement can be checked without opening it.
  const images = (entry?.exercise_snapshot?.images ?? []).filter(
    (path) => path && getImageSource(path) !== null
  );
  const imageIndex = useImageSlideshow(images.length);
  if (description == null || entry == null) return null;

  const activeSet = entry.sets.find((s) => String(s.id) === activeSetId);
  const warmup = activeSet?.set_type?.toLowerCase() === 'warmup';
  const target = formatSetLoad(description, weightUnit, t);
  const then = upcomingExercises(session, activeSetId, completedSetIds)[0];
  const exerciseLabel = t('workout.exercise', { defaultValue: 'Exercise' });
  const name = description.exerciseName ?? exerciseLabel;

  return (
    <View
      testID="active-workout-now-card"
      className="bg-surface rounded-2xl px-4 py-3 mx-3 mt-2 border border-border/40"
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-xs font-bold text-accent-primary uppercase tracking-wider">
          {resting
            ? t('activeWorkout.now.upNext', { defaultValue: 'Up next' })
            : t('activeWorkout.now.label', { defaultValue: 'Now' })}
        </Text>
        <Text
          className={`text-sm font-semibold ${
            warmup ? 'text-text-warning' : 'text-text-secondary'
          }`}
        >
          {warmup
            ? t('activeWorkout.now.warmupOf', {
                defaultValue: 'Warm-up {{number}} of {{total}}',
                number: description.setNumber,
                total: description.setCount,
              })
            : t('activeWorkout.now.setOf', {
                defaultValue: 'Set {{number}} of {{total}}',
                number: description.setNumber,
                total: description.setCount,
              })}
        </Text>
        <View className="flex-row items-center gap-1.5 flex-1">
          {entry.sets.map((set) => {
            const id = String(set.id);
            return (
              <View
                key={id}
                className={`w-2 h-2 rounded-full ${
                  completedSetIds[id] != null
                    ? 'bg-icon-success'
                    : id === activeSetId
                      ? 'bg-accent-primary'
                      : 'bg-border'
                }`}
              />
            );
          })}
        </View>
        <Pressable
          onPress={() => onSwap(entry.id)}
          className="flex-row items-center gap-1.5 bg-raised rounded-full px-3 py-1.5 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.now.swapLabel', {
            defaultValue: 'Swap {{name}}',
            name,
          })}
        >
          <Icon name="swap-horizontal" size={15} color={accent} />
          <Text className="text-sm font-semibold text-accent-primary">
            {t('activeWorkout.now.swap', { defaultValue: 'Swap' })}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => onPressExercise(entry.id)}
        className="mt-1 flex-row items-center gap-3"
      >
        <View className="flex-1">
          <Text
            className="text-xl font-bold text-text-primary"
            numberOfLines={2}
          >
            {name}
          </Text>
          {target != null && (
            <Text className="text-3xl font-bold text-text-primary">
              {target}
            </Text>
          )}
        </View>
        {images.length > 0 && (
          <SafeImage
            source={getImageSource(images[imageIndex % images.length])}
            style={{ width: IMAGE_SIZE, height: IMAGE_SIZE, borderRadius: 12 }}
            contentFit="cover"
            autoplay
            fallback={null}
          />
        )}
      </Pressable>

      {then != null && (
        <Text className="text-sm text-text-muted mt-1" numberOfLines={1}>
          {t('activeWorkout.now.then', {
            defaultValue: 'Then {{name}}',
            name: then.exercise_snapshot?.name ?? exerciseLabel,
          })}
        </Text>
      )}
    </View>
  );
}
