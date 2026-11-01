import { useTranslation } from 'react-i18next';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  FlatList,
  useWindowDimensions,
  AppState,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SafeImage from './SafeImage';
import ZoomableView from './ZoomableView';
import Icon from './Icon';
import { useFoodImageSourceContext } from './FoodImageSourceProvider';
import type { GetImageSource } from '../hooks/useExerciseImageSource';

const AUTOPLAY_INTERVAL_MS = 3000;

export interface ImageLightboxProps {
  visible: boolean;
  images: string[];
  initialIndex: number;
  title?: string;
  onClose: () => void;
  /**
   * Resolves an image path to a source. Defaults to the food resolver;
   * exercise viewers pass `useExerciseImageSource().getImageSource`.
   */
  getImageSource?: GetImageSource;
  /** Multi-image slideshow on open. Defaults to true (food/meal photos). */
  autoPlay?: boolean;
}

/**
 * Full-screen viewer for a photo set (food/meal/entry photos, exercise images).
 *
 * Multi-image sets auto-advance, matching web. Autoplay stops for good on the
 * first manual swipe — a slideshow that resumes fights a user who is browsing —
 * and pauses while the app is backgrounded, which is the React Native
 * equivalent of the `visibilitychange` handling in the web lightbox.
 */
const ImageLightbox: React.FC<ImageLightboxProps> = ({
  visible,
  images,
  initialIndex,
  title,
  onClose,
  getImageSource: getImageSourceProp,
  autoPlay = true,
}) => {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const foodImageSource = useFoodImageSourceContext();
  const getImageSource = getImageSourceProp ?? foodImageSource;
  const listRef = useRef<FlatList<string>>(null);

  const [index, setIndex] = useState(initialIndex);
  const [autoplay, setAutoplay] = useState(autoPlay);
  // A zoomed image takes the drag for panning, so paging waits until it is
  // back at 1x.
  const [zoomed, setZoomed] = useState(false);

  // Re-seed on every open, so it starts on the tapped image with autoplay
  // running rather than wherever the previous session left off. Done during
  // render (not in an effect) so the first painted frame is the right slide.
  //
  // The key has to track `visible` itself, not just the index: every caller
  // opens at index 0, so keying on the index alone would fire once and never
  // again — leaving autoplay permanently off after the first manual swipe.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setIndex(initialIndex);
      setAutoplay(autoPlay);
      setZoomed(false);
    }
  }

  useEffect(() => {
    if (!visible || !autoplay || images.length < 2) return;

    let paused = AppState.currentState !== 'active';
    const subscription = AppState.addEventListener('change', (state) => {
      paused = state !== 'active';
    });

    const timer = setInterval(() => {
      if (paused) return;
      setIndex((current) => {
        const next = (current + 1) % images.length;
        listRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, AUTOPLAY_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [visible, autoplay, images.length]);

  // Stable identity via empty deps: FlatList rejects a changing
  // onViewableItemsChanged, and reading a ref during render is disallowed.
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setIndex(first.index);
    },
    []
  );

  const stopAutoplay = useCallback(() => setAutoplay(false), []);
  const handleZoomChange = useCallback((next: boolean) => {
    setZoomed(next);
    // Zooming in is browsing too: the slideshow must not move the image away.
    if (next) setAutoplay(false);
  }, []);

  const getItemLayout = useCallback(
    (_: unknown, i: number) => ({ length: width, offset: width * i, index: i }),
    [width]
  );

  if (images.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 bg-black">
        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          keyExtractor={(item, i) => `${i}:${item}`}
          onScrollBeginDrag={stopAutoplay}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          renderItem={({ item, index: itemIndex }) => (
            <View
              style={{ width, height }}
              className="items-center justify-center"
            >
              {/* Back to 1x once paged away from, and on close. */}
              <ZoomableView
                resetKey={visible && itemIndex === index}
                onZoomChange={handleZoomChange}
              >
                <SafeImage
                  source={getImageSource(item)}
                  style={{ width, height: height * 0.8 }}
                  contentFit="contain"
                  autoplay
                />
              </ZoomableView>
            </View>
          )}
        />

        <Pressable
          onPress={onClose}
          accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
          testID="lightbox-close"
          hitSlop={12}
          className="absolute"
          style={{ top: insets.top + 8, right: 16 }}
        >
          <View className="bg-black/60 rounded-full p-2">
            <Icon name="close" size={22} color="#fff" />
          </View>
        </Pressable>

        <View
          className="absolute left-0 right-0 items-center"
          style={{ top: insets.top + 12 }}
          pointerEvents="none"
        >
          {title ? (
            <Text
              className="text-white text-base font-medium"
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : null}
          {images.length > 1 ? (
            <Text className="text-white/70 text-xs mt-0.5">
              {index + 1} / {images.length}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

export default ImageLightbox;
