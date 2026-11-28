import React, { useCallback, useState } from 'react';
import {
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
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

const THUMB_SIZE = 40;
// The card spans the full content width at 16:9, capped to a share of the
// window so the current-set card and Log set stay on screen.
const MAX_HEIGHT_RATIO = 0.19;
const ASPECT = 16 / 9;

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
  const [cardWidth, setCardWidth] = useState(0);
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => setCardWidth(e.nativeEvent.layout.width),
    []
  );
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
  const lightboxOptions = { getImageSource, controls: true };
  const openFullScreen = () =>
    openLightbox(usable, index, exerciseName, lightboxOptions);
  // A dark scrim reads over any photo, whatever the app theme.
  const pillClass =
    'flex-row items-center gap-1 bg-black/70 rounded-full px-2.5 active:opacity-70';

  if (!expanded) {
    return (
      <View className="gap-2">
        {backToCurrent(false)}
        <View className="flex-row items-center gap-2.5">
          <Pressable
            onPress={onToggleExpanded}
            // 40 pt picture, 44 pt touch target.
            hitSlop={2}
            // The thumbnail is the first picture, so that is the one opened.
            onLongPress={() =>
              openLightbox(usable, 0, exerciseName, lightboxOptions)
            }
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
              className="bg-white rounded-[10px] overflow-hidden"
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
          </Pressable>
          <View className="min-w-0 flex-1">{children}</View>
        </View>
      </View>
    );
  }

  return (
    <View
      className="w-full bg-white overflow-hidden"
      onLayout={handleLayout}
      // 22 pt corners, as drawn on the boards.
      style={{
        height:
          cardWidth > 0
            ? Math.min(cardWidth / ASPECT, windowHeight * MAX_HEIGHT_RATIO)
            : windowHeight * MAX_HEIGHT_RATIO,
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
        />
      </Pressable>
      {backToCurrent(true)}
      <Pressable
        onPress={onToggleExpanded}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        className={`absolute right-2.5 bottom-2.5 h-8 ${pillClass}`}
        accessibilityRole="button"
        accessibilityLabel={t('activeWorkout.focus.media.minimizeLabel', {
          defaultValue: 'Minimize {{name}} image',
          name: exerciseName,
        })}
        accessibilityState={{ expanded: true }}
      >
        <Icon name="contract" size={13} color="white" />
        <Text className="text-xs font-semibold text-white">
          {t('activeWorkout.focus.media.minimize', {
            defaultValue: 'Minimize',
          })}
        </Text>
      </Pressable>
      <View className="absolute right-2.5 top-2.5 flex-row items-center gap-2">
        {multiple && (
          <Pressable
            onPress={() => setPaused((p) => !p)}
            hitSlop={6}
            className={`h-8 w-8 items-center justify-center px-0 ${pillClass}`}
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
            <Icon name={paused ? 'play' : 'pause'} size={15} color="white" />
          </Pressable>
        )}
        <Pressable
          onPress={openFullScreen}
          hitSlop={6}
          className={`h-8 w-8 items-center justify-center px-0 ${pillClass}`}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.focus.media.expandFullScreen', {
            defaultValue: 'Open {{name}} image full screen',
            name: exerciseName,
          })}
        >
          <Icon name="expand" size={15} color="white" />
        </Pressable>
      </View>
    </View>
  );
}

export default React.memo(ActiveWorkoutFocusMedia);
