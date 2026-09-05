import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from './Icon';
import SafeImage from './SafeImage';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const RESET_MS = 180;

export interface ProgressPhotoViewerProps {
  visible: boolean;
  source: { uri: string; headers: Record<string, string> } | null;
  /** Shown under the photo, e.g. the shoot date. */
  title?: string;
  /** Shown beneath the title, e.g. that day's weight. */
  subtitle?: string;
  onClose: () => void;
}

/**
 * Full-screen viewer for one progress photo, with pinch to zoom and drag to
 * pan.
 *
 * This does not reuse ImageLightbox: that component resolves its URIs through
 * the food image source context and takes plain `string` URLs, while check-in
 * photo bytes sit behind auth and need per-request headers. Its multi-image
 * autoplay would also compete with the dedicated time-lapse screen.
 */
const ProgressPhotoViewer: React.FC<ProgressPhotoViewerProps> = ({
  visible,
  source,
  title,
  subtitle,
  onClose,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetTransform = useCallback(() => {
    scale.value = withTiming(1, { duration: RESET_MS });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: RESET_MS });
    translateY.value = withTiming(0, { duration: RESET_MS });
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [
    scale,
    savedScale,
    translateX,
    translateY,
    savedTranslateX,
    savedTranslateY,
  ]);

  // Zoom state belongs to one viewing session, so it is cleared on the way out
  // rather than on the way in — reopening then starts at 1x with no flash of
  // the previous photo's pan offset.
  const handleClose = useCallback(() => {
    resetTransform();
    onClose();
  }, [resetTransform, onClose]);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      const next = savedScale.value * event.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // Snapping back at 1x also recentres, so a pinch-out-then-in cannot
      // strand the photo off-screen.
      if (scale.value <= MIN_SCALE) {
        translateX.value = withTiming(0, { duration: RESET_MS });
        translateY.value = withTiming(0, { duration: RESET_MS });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  // Panning is only meaningful once zoomed in; below that the gesture is left
  // alone so a drag is not swallowed.
  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value <= MIN_SCALE) return;
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > MIN_SCALE) {
        scale.value = withTiming(1, { duration: RESET_MS });
        savedScale.value = 1;
        translateX.value = withTiming(0, { duration: RESET_MS });
        translateY.value = withTiming(0, { duration: RESET_MS });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2, { duration: RESET_MS });
        savedScale.value = 2;
      }
    });

  const gesture = Gesture.Simultaneous(
    Gesture.Exclusive(doubleTap, pan),
    pinch
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!source) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View className="flex-1 bg-black">
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[{ width, height: height * 0.8 }, imageStyle]}
            className="self-center my-auto"
          >
            <SafeImage
              source={source}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
            />
          </Animated.View>
        </GestureDetector>

        <Pressable
          onPress={handleClose}
          accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
          testID="progress-photo-viewer-close"
          hitSlop={12}
          className="absolute"
          style={{ top: insets.top + 8, right: 16 }}
        >
          <View className="bg-black/60 rounded-full p-2">
            <Icon name="close" size={22} color="#fff" />
          </View>
        </Pressable>

        {title || subtitle ? (
          <View
            className="absolute left-0 right-0 items-center"
            style={{ bottom: insets.bottom + 24 }}
            pointerEvents="none"
          >
            {title ? (
              <Text className="text-white text-base font-medium">{title}</Text>
            ) : null}
            {subtitle ? (
              <Text className="text-white/70 text-sm mt-0.5">{subtitle}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
};

export default ProgressPhotoViewer;
