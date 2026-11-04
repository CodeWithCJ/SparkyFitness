import React, { useCallback, useState } from 'react';
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
  /**
   * Set while the page shows another exercise than the active one: a "Back to
   * current" pill top-left on the photo, or above the thumbnail row.
   */
  onBackToCurrent?: () => void;
}

const THUMB_SIZE = 72;
const MAX_HEIGHT_RATIO = 0.45;
// Library photos are mostly 4:3 landscape; the card takes each image's own
// shape once it loads, within portrait 3:4 and wide 16:9, so a photo fills it
// instead of sitting between white bands.
const DEFAULT_ASPECT = 4 / 3;
const MIN_ASPECT = 3 / 4;
const MAX_ASPECT = 16 / 9;

/**
 * The focus view's exercise media: a large card that can be minimized
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
  onBackToCurrent,
}: Props) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const handleLoadSize = useCallback((width: number, height: number) => {
    if (width > 0 && height > 0) {
      setAspect(Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, width / height)));
    }
  }, []);
  const openLightbox = useOpenLightbox();
  const reducedMotion = useReducedMotion();
  const textPrimary = String(useCSSVariable('--color-text-primary'));
  const textMuted = String(useCSSVariable('--color-text-muted'));
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const [paused, setPaused] = useState(false);

  const usable = images.filter((path) => path && getImageSource(path) !== null);
  const multiple = usable.length > 1;
  const index = useImageSlideshow(usable.length, 1000, paused || reducedMotion);

  const backToCurrent = (overPhoto: boolean) =>
    onBackToCurrent && (
      <Pressable
        onPress={onBackToCurrent}
        accessibilityRole="button"
        className={`min-h-11 flex-row items-center gap-1 self-start rounded-full px-3 active:opacity-70 ${
          overPhoto ? 'absolute left-3 top-3 bg-black/55' : 'bg-raised'
        }`}
      >
        <Icon
          name="arrow-undo"
          size={15}
          color={overPhoto ? 'white' : accentPrimary}
        />
        <Text
          className={`text-sm font-semibold ${
            overPhoto ? 'text-white' : 'text-accent-primary'
          }`}
        >
          {t('activeWorkout.focus.backToCurrent', {
            defaultValue: 'Back to current',
          })}
        </Text>
      </Pressable>
    );

  if (usable.length === 0) {
    return (
      <View className="gap-2">
        {backToCurrent(false)}
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
      </View>
    );
  }

  const source = getImageSource(usable[index]);
  const openFullScreen = () => openLightbox(usable, index, exerciseName);
  // A dark scrim reads over any photo, whatever the app theme.
  const pillClass =
    'flex-row items-center gap-1.5 bg-black/55 rounded-full px-3 active:opacity-70';

  if (!expanded) {
    return (
      <View className="gap-2">
        {backToCurrent(false)}
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
                // A thumbnail reads better filled; the card shows the whole frame.
                contentFit="cover"
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
      </View>
    );
  }

  return (
    <View
      className="w-full bg-white rounded-2xl overflow-hidden"
      style={{
        aspectRatio: aspect,
        maxHeight: windowHeight * MAX_HEIGHT_RATIO,
      }}
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
          contentFit="cover"
          autoplay
          fallback={null}
          onLoadSize={handleLoadSize}
        />
      </Pressable>
      {backToCurrent(true)}
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
        <Icon name="chevron-down" size={16} color="white" />
        <Text className="text-sm font-semibold text-white">
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
          <Icon name={paused ? 'play' : 'pause'} size={16} color="white" />
          <Text className="text-sm font-semibold text-white">
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
