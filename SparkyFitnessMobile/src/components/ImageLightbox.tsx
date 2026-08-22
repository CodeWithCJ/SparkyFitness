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
import Icon from './Icon';
import { useFoodImageSourceContext } from './FoodImageSourceProvider';

const AUTOPLAY_INTERVAL_MS = 3000;

export interface ImageLightboxProps {
  visible: boolean;
  images: string[];
  initialIndex: number;
  title?: string;
  onClose: () => void;
}

/**
 * Full-screen viewer for a food/meal/entry photo set.
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
}) => {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const getImageSource = useFoodImageSourceContext();
  const listRef = useRef<FlatList<string>>(null);

  const [index, setIndex] = useState(initialIndex);
  const [autoplay, setAutoplay] = useState(true);

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
      setAutoplay(true);
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
    [],
  );

  const stopAutoplay = useCallback(() => setAutoplay(false), []);

  const getItemLayout = useCallback(
    (_: unknown, i: number) => ({ length: width, offset: width * i, index: i }),
    [width],
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
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          keyExtractor={(item, i) => `${i}:${item}`}
          onScrollBeginDrag={stopAutoplay}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          renderItem={({ item }) => (
            <View style={{ width, height }} className="items-center justify-center">
              <SafeImage
                source={getImageSource(item)}
                style={{ width, height: height * 0.8 }}
                contentFit="contain"
                autoplay
              />
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
            <Text className="text-white text-base font-medium" numberOfLines={1}>
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
