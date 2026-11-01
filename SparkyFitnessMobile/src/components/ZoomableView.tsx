import React, { useEffect, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2;
const RESET_MS = 180;

interface ZoomableViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
  /**
   * Back to 1x, centred, whenever this changes: a viewer passes whether it
   * is open, a pager whether this page is the one on screen.
   */
  resetKey?: unknown;
  /** Told when the content goes above 1x and back, so a pager can stop paging. */
  onZoomChange?: (zoomed: boolean) => void;
}

/**
 * Pinch to zoom (up to 4x), drag to pan once zoomed, double-tap to zoom to 2x
 * and back. Panning is only switched on while zoomed, so at 1x a drag still
 * reaches the list or pager around it.
 */
export default function ZoomableView({
  children,
  style,
  className,
  resetKey,
  onZoomChange,
}: ZoomableViewProps) {
  const [zoomed, setZoomed] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const reportZoom = (next: boolean) => {
    setZoomed(next);
    onZoomChange?.(next);
  };

  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    // Shared values are stable refs; only the key should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Not part of the effect above: a page that scrolls away should stop
  // blocking the pager, but the parent's state is its own to reset.
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setZoomed(false);
  }

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      const next = savedScale.value * event.scale;
      scale.value = Math.min(Math.max(next, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      // Snapping back at 1x also recentres, so a pinch-out-then-in cannot
      // strand the content off-screen.
      if (scale.value <= MIN_SCALE) {
        translateX.value = withTiming(0, { duration: RESET_MS });
        translateY.value = withTiming(0, { duration: RESET_MS });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
      runOnJS(reportZoom)(scale.value > MIN_SCALE);
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((event) => {
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
      const zoomIn = scale.value <= MIN_SCALE;
      const target = zoomIn ? DOUBLE_TAP_SCALE : MIN_SCALE;
      scale.value = withTiming(target, { duration: RESET_MS });
      savedScale.value = target;
      if (!zoomIn) {
        translateX.value = withTiming(0, { duration: RESET_MS });
        translateY.value = withTiming(0, { duration: RESET_MS });
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
      runOnJS(reportZoom)(zoomIn);
    });

  const gesture = Gesture.Simultaneous(
    Gesture.Exclusive(doubleTap, pan),
    pinch
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[style, animatedStyle]} className={className}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
