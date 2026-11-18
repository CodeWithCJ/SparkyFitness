import React, { useCallback, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useIsFocused } from '@react-navigation/native';
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
  /** Rendered to the right of the thumbnail when minimized (the title block); nothing is drawn for an exercise without pictures. */
  children?: React.ReactNode;
  /**
   * Set while the page shows another exercise than the active one: a "Back to
   * current" pill top-left on the photo, or above the thumbnail row.
   */
  onBackToCurrent?: () => void;
}

const THUMB_SIZE = 96;
const MAX_HEIGHT_RATIO = 0.32;
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
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const [paused, setPaused] = useState(false);

  const usable = images.filter((path) => path && getImageSource(path) !== null);
  const multiple = usable.length > 1;
  // Only the enlarged demo animates: the photo pair stops when minimized to a
  // thumbnail (a still of the first picture) or when the screen is not showing.
  const screenFocused = useIsFocused();
  const index = useImageSlideshow(
    usable.length,
    1000,
    paused || reducedMotion || !expanded || !screenFocused
  );

  const backToCurrent = (overPhoto: boolean) =>
    onBackToCurrent && (
      <Pressable
        onPress={onBackToCurrent}
        accessibilityRole="button"
        className={`min-h-11 flex-row items-center gap-1 self-start rounded-full px-3 active:opacity-70 ${
          overPhoto ? 'absolute left-3 top-3 bg-black/70' : 'bg-raised'
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

  // No pictures: the preview stays collapsed, with no placeholder. The page
  // draws the title itself in that case, so only the way back is left here.
  if (usable.length === 0) return backToCurrent(false) || null;

  const source = getImageSource(usable[index]);
  const stillSource = getImageSource(usable[0]);
  const openFullScreen = () => openLightbox(usable, index, exerciseName);
  // A dark scrim reads over any photo, whatever the app theme.
  const pillClass =
    'flex-row items-center gap-1.5 bg-black/70 rounded-full px-3.5 active:opacity-70';

  if (!expanded) {
    return (
      <View className="gap-2">
        {backToCurrent(false)}
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={onToggleExpanded}
            // The thumbnail is the first picture, so that is the one opened.
            onLongPress={() => openLightbox(usable, 0, exerciseName)}
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
              className="bg-white rounded-2xl overflow-hidden"
              style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
            >
              <SafeImage
                source={stillSource}
                style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                // A thumbnail reads better filled; the card shows the whole
                // frame. It is a still (the first picture, a GIF's first
                // frame); only the enlarged demo animates.
                contentFit="cover"
                fallback={null}
              />
            </View>
            <View className="absolute right-1.5 bottom-1.5 w-6 h-6 rounded-full bg-black/70 items-center justify-center">
              <Icon name="expand" size={12} color="white" />
            </View>
          </Pressable>
          {children}
        </View>
      </View>
    );
  }

  return (
    <View
      className="w-full bg-white overflow-hidden"
      // 22 pt corners, as drawn on the boards.

      style={{
        aspectRatio: aspect,
        maxHeight: windowHeight * MAX_HEIGHT_RATIO,
        borderRadius: 22,
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
          autoplay={!reducedMotion && !paused && screenFocused}
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
        <Icon name="contract" size={16} color="white" />
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
