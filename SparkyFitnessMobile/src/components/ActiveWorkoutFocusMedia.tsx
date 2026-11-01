import React, { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import SafeImage from './SafeImage';
import { useOpenLightbox } from './LightboxProvider';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { useImageSlideshow } from '../hooks/useImageSlideshow';

interface Props {
  /** `exercise_snapshot.images` paths, unfiltered. */
  images: string[];
  exerciseName: string;
  getImageSource: GetImageSource;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Rendered to the right of the thumbnail when minimized (the title block). */
  children?: React.ReactNode;
}

const THUMB_SIZE = 72;
const MAX_HEIGHT_RATIO = 0.45;

/**
 * The focus view's exercise media: a large square card that can be minimized
 * to a thumbnail beside the title. The photo pair cycles unless paused or
 * Reduce Motion is on; tapping the card opens the zoomable lightbox.
 */
function ActiveWorkoutFocusMedia({
  images,
  exerciseName,
  getImageSource,
  expanded,
  onToggleExpanded,
  children,
}: Props) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const openLightbox = useOpenLightbox();
  const reducedMotion = useReducedMotion();
  const textPrimary = String(useCSSVariable('--color-text-primary'));
  const textMuted = String(useCSSVariable('--color-text-muted'));
  const [paused, setPaused] = useState(false);

  const usable = images.filter((path) => path && getImageSource(path) !== null);
  const multiple = usable.length > 1;
  const index = useImageSlideshow(usable.length, 1000, paused || reducedMotion);

  if (usable.length === 0) {
    return (
      <View className="flex-row items-center gap-3">
        <View
          testID="focus-media-placeholder"
          className="bg-raised items-center justify-center rounded-xl"
          style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
        >
          <Icon name="exercise-weights" size={36} color={textMuted} />
        </View>
        {children}
      </View>
    );
  }

  const source = getImageSource(usable[index]);
  const openFullScreen = () => openLightbox(usable, index, exerciseName);
  const pillClass =
    'flex-row items-center gap-1.5 bg-surface/90 border border-border/40 rounded-full px-3 active:opacity-70';

  if (!expanded) {
    return (
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onToggleExpanded}
          onLongPress={openFullScreen}
          className="active:opacity-80"
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.focus.media.expandLabel', {
            defaultValue: 'Expand {{name}} image',
            name: exerciseName,
          })}
          accessibilityHint={t('activeWorkout.focus.media.expandHint', {
            defaultValue: 'Long press to open full screen',
          })}
          accessibilityState={{ expanded: false }}
        >
          <View
            className="bg-white rounded-xl overflow-hidden"
            style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
          >
            <SafeImage
              source={source}
              style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
              contentFit="contain"
              autoplay
              fallback={null}
            />
          </View>
          <View className="absolute right-1 bottom-1 w-5 h-5 rounded-full bg-surface/90 border border-border/40 items-center justify-center">
            <Icon name="expand" size={11} color={textPrimary} />
          </View>
        </Pressable>
        {children}
      </View>
    );
  }

  return (
    <View
      className="w-full bg-white rounded-2xl overflow-hidden"
      style={{ aspectRatio: 1, maxHeight: windowHeight * MAX_HEIGHT_RATIO }}
    >
      <Pressable
        onPress={openFullScreen}
        className="flex-1"
        accessibilityRole="imagebutton"
        accessibilityLabel={t('activeWorkout.focus.media.openFullScreen', {
          defaultValue: 'View {{name}} image full screen',
          name: exerciseName,
        })}
        accessibilityHint={t('activeWorkout.focus.media.openFullScreenHint', {
          defaultValue: 'Opens the image so you can zoom in',
        })}
      >
        <SafeImage
          source={source}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          autoplay
          fallback={null}
        />
      </Pressable>
      <Pressable
        onPress={onToggleExpanded}
        className={`absolute left-3 bottom-3 min-h-11 ${pillClass}`}
        accessibilityRole="button"
        accessibilityLabel={t('activeWorkout.focus.media.minimizeLabel', {
          defaultValue: 'Minimize {{name}} image',
          name: exerciseName,
        })}
        accessibilityState={{ expanded: true }}
      >
        <Icon name="chevron-down" size={16} color={textPrimary} />
        <Text className="text-sm font-semibold text-text-primary">
          {t('activeWorkout.focus.media.minimize', {
            defaultValue: 'Minimize',
          })}
        </Text>
      </Pressable>
      {multiple && (
        <Pressable
          onPress={() => setPaused((p) => !p)}
          className={`absolute right-3 bottom-3 min-h-11 ${pillClass}`}
          accessibilityRole="button"
          accessibilityLabel={
            paused
              ? t('activeWorkout.focus.media.playLabel', {
                  defaultValue: 'Play {{name}} animation',
                  name: exerciseName,
                })
              : t('activeWorkout.focus.media.pauseLabel', {
                  defaultValue: 'Pause {{name}} animation',
                  name: exerciseName,
                })
          }
        >
          <Icon
            name={paused ? 'play' : 'pause'}
            size={16}
            color={textPrimary}
          />
          <Text className="text-sm font-semibold text-text-primary">
            {paused
              ? t('activeWorkout.focus.media.play', { defaultValue: 'Play' })
              : t('activeWorkout.focus.media.pause', { defaultValue: 'Pause' })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default React.memo(ActiveWorkoutFocusMedia);
