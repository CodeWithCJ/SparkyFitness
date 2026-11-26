import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import type { GuidedSetTarget } from '@workspace/shared';
import Icon from './Icon';
import SafeImage from './SafeImage';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import {
  useGuidedWorkout,
  type GuidedSetView,
} from '../hooks/useGuidedWorkout';
import { useRestCountdown } from '../hooks/useRestCountdown';
import { useImageSlideshow } from '../hooks/useImageSlideshow';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { formatRestCountdown } from '../utils/workoutSession';
import {
  setGuidedSpeechMuted,
  useGuidedCaption,
  useGuidedSpeechMuted,
} from '../services/speech';

interface Props {
  getImageSource: GetImageSource;
  onCompleteSet: (setId: string) => void;
}

/** Library exercise photos are landscape, roughly 3:2. */
const IMAGE_ASPECT_RATIO = 3 / 2;

/**
 * Guided mode (#1507) for standard workouts: one set at a time with the
 * exercise image (captioned with what is being said) and a DONE — NEXT button
 * for rep-based sets. Pause freezes the session; Replay reads the set and its
 * instructions again; the speaker mutes the voice for this workout while the
 * captions carry on. Sits above the normal set list, which stays editable.
 * Mounted only while the guided-workout preference is on.
 */
export default function ActiveWorkoutGuidedCard({
  getImageSource,
  onCompleteSet,
}: Props) {
  const { t } = useTranslation();
  const [textMuted, textPrimary, restColor, onRest] = useCSSVariable([
    '--color-text-muted',
    '--color-text-primary',
    '--color-rest',
    '--color-on-rest',
  ]) as [string, string, string, string];
  const { phase, finish, paused, pause, resume, replay } =
    useGuidedWorkout(onCompleteSet);
  const { remainingMs: restRemainingMs } = useRestCountdown();
  const muted = useGuidedSpeechMuted();
  const caption = useGuidedCaption();
  const phaseSet =
    phase.kind === 'done'
      ? null
      : phase.kind === 'rest'
        ? phase.next
        : phase.set;
  const images = phaseSet?.images ?? [];
  const imageIndex = useImageSlideshow(images.length);

  const describeTarget = (target: GuidedSetTarget): string | null => {
    if (target.kind === 'reps') {
      return t('guidedWorkout.card.targetReps', {
        defaultValue: '{{count}} reps',
        count: target.reps,
      });
    }
    if (target.kind === 'time') {
      return t('guidedWorkout.card.targetSeconds', {
        defaultValue: '{{count}} seconds',
        count: target.seconds,
      });
    }
    return null;
  };

  if (phase.kind === 'done') {
    return (
      <View className="bg-surface rounded-2xl p-4 mb-3 border border-border/40 items-center">
        <Icon name="checkmark" size={28} color={textMuted} />
        <Text className="text-base font-semibold text-text-primary mt-2">
          {t('guidedWorkout.card.done', {
            defaultValue: 'All sets done. End the workout to save it.',
          })}
        </Text>
      </View>
    );
  }

  const set: GuidedSetView | null = phaseSet;

  let label: string;
  if (phase.kind === 'starting' || phase.kind === 'getReady') {
    label = t('guidedWorkout.card.getReady', { defaultValue: 'Get ready' });
  } else if (phase.kind === 'rest') {
    label = t('guidedWorkout.card.rest', { defaultValue: 'Rest' });
  } else {
    label = t('guidedWorkout.card.setOfTotal', {
      defaultValue: 'Set {{current}} of {{total}}',
      current: phase.set.setNumber,
      total: phase.set.totalSets,
    });
  }
  if (paused) {
    label = t('guidedWorkout.card.paused', { defaultValue: 'Paused' });
  }

  const target = set ? describeTarget(set.target) : null;
  const image = images[imageIndex];
  const imageSource = image ? getImageSource(image) : null;
  const captionBand =
    caption != null ? (
      <Text
        testID="guided-caption"
        accessibilityLiveRegion="polite"
        className="text-sm font-medium text-white text-center"
        numberOfLines={3}
      >
        {caption}
      </Text>
    ) : null;

  return (
    <View
      testID="guided-workout-card"
      className="bg-surface rounded-2xl p-3 mb-3 border border-border/40"
    >
      <View className="flex-row items-center justify-between mb-2 gap-2">
        <View className="bg-accent-primary/15 px-2 py-0.5 rounded-md">
          <Text className="text-xs font-bold text-accent-primary tracking-wide">
            {t('guidedWorkout.card.badge', { defaultValue: 'GUIDED' })}
          </Text>
        </View>
        <Text
          className="flex-1 text-sm font-medium text-text-secondary"
          numberOfLines={1}
        >
          {label}
        </Text>
        <Pressable
          onPress={replay}
          disabled={paused}
          accessibilityRole="button"
          accessibilityLabel={t('guidedWorkout.card.replay', {
            defaultValue: 'Replay instructions',
          })}
          hitSlop={8}
          className={`w-9 h-9 rounded-full bg-raised items-center justify-center active:opacity-70 ${
            paused ? 'opacity-40' : ''
          }`}
        >
          <Icon name="replay" size={17} color={textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => setGuidedSpeechMuted(!muted)}
          accessibilityRole="button"
          accessibilityLabel={
            muted
              ? t('guidedWorkout.card.unmute', { defaultValue: 'Unmute voice' })
              : t('guidedWorkout.card.mute', { defaultValue: 'Mute voice' })
          }
          hitSlop={8}
          className="w-9 h-9 rounded-full bg-raised items-center justify-center active:opacity-70"
        >
          <Icon
            name={muted ? 'volume-off' : 'volume-on'}
            size={18}
            color={muted ? textMuted : textPrimary}
          />
        </Pressable>
        <Pressable
          onPress={paused ? resume : pause}
          accessibilityRole="button"
          accessibilityLabel={
            paused
              ? t('guidedWorkout.card.resume', { defaultValue: 'Resume' })
              : t('guidedWorkout.card.pause', { defaultValue: 'Pause' })
          }
          hitSlop={8}
          className={`w-9 h-9 rounded-full items-center justify-center active:opacity-70 ${
            paused ? 'bg-accent-primary' : 'bg-raised'
          }`}
        >
          <Icon
            name={paused ? 'play' : 'pause'}
            size={16}
            color={paused ? '#ffffff' : textPrimary}
          />
        </Pressable>
      </View>

      {imageSource != null ? (
        <View
          className="w-full rounded-xl overflow-hidden bg-raised"
          style={{ aspectRatio: IMAGE_ASPECT_RATIO }}
        >
          <SafeImage
            source={imageSource}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            // The demo is the point here (the issue asks for the exercise GIF).
            autoplay
            fallback={null}
          />
          {captionBand != null && (
            <View className="absolute left-0 right-0 bottom-0 bg-black/60 px-3 py-2">
              {captionBand}
            </View>
          )}
        </View>
      ) : (
        captionBand != null && (
          <View className="rounded-xl bg-black/70 px-3 py-2">
            {captionBand}
          </View>
        )
      )}

      {set != null && (
        <View className="items-center mt-2">
          {phase.kind === 'rest' && (
            <Text
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: restColor }}
            >
              {t('guidedWorkout.card.nextUp', { defaultValue: 'Next up' })}
            </Text>
          )}
          <Text
            className="text-xl font-bold text-text-primary text-center"
            numberOfLines={2}
          >
            {set.exerciseName}
          </Text>
          {target != null && (
            <Text className="text-base text-text-secondary">{target}</Text>
          )}
        </View>
      )}

      {phase.kind === 'rest' && (
        <View className="items-center mt-2">
          <Text
            testID="guided-rest-countdown"
            className="text-3xl font-black"
            style={{ color: restColor }}
          >
            {formatRestCountdown(restRemainingMs)}
          </Text>
          <Pressable
            onPress={() => useActiveWorkoutStore.getState().dismissRest()}
            accessibilityRole="button"
            accessibilityLabel={t('activeWorkout.rest.skip', {
              defaultValue: 'Skip rest',
            })}
            className="mt-2 px-4 py-2 rounded-full active:opacity-70"
            style={{ backgroundColor: restColor }}
          >
            <Text className="text-sm font-semibold" style={{ color: onRest }}>
              {t('activeWorkout.rest.skip', { defaultValue: 'Skip rest' })}
            </Text>
          </Pressable>
        </View>
      )}

      {phase.kind === 'reps' && (
        <>
          <Text className="text-sm text-text-secondary text-center mt-3">
            {phase.set.target.kind === 'reps'
              ? t('guidedWorkout.card.doneHintReps', {
                  defaultValue: "Tap when you've done {{count}} reps",
                  count: phase.set.target.reps,
                })
              : t('guidedWorkout.card.doneHint', {
                  defaultValue: "Tap when you're done",
                })}
          </Text>
          <Pressable
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel={t('guidedWorkout.card.doneNext', {
              defaultValue: 'DONE — NEXT',
            })}
            className="mt-2 bg-accent-primary rounded-2xl py-4 items-center active:opacity-80"
          >
            <Text className="text-xl font-black text-white tracking-wider">
              {t('guidedWorkout.card.doneNext', {
                defaultValue: 'DONE — NEXT',
              })}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
