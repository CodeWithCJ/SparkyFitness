import React, { useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const SLIDE_MS = 320;

interface AnimatedStripBoxProps {
  /** Where the box starts, from the top of its parent. */
  top: number;
  /**
   * Identifies the layout `top` was measured for (the window size). A change
   * of layout is a new arrangement, not movement: the box goes straight there.
   */
  layoutKey: string;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'box-none' | 'auto' | 'none' | 'box-only';
  testID?: string;
  children?: React.ReactNode;
}

/**
 * A box beside the vertical bar that slides to a new `top` instead of
 * jumping. A Live Activity starting or ending pushes the status strip down or
 * back up with no notice, and everything hung from the strip's bottom edge
 * followed it in one frame. Sliding keeps that readable; folds and rotations
 * still snap, because there the whole arrangement changes.
 */
export function AnimatedStripBox({
  top,
  layoutKey,
  style,
  pointerEvents,
  testID,
  children,
}: AnimatedStripBoxProps) {
  const animatedTop = useSharedValue(top);
  const lastLayoutKey = useRef(layoutKey);
  const lastTop = useRef(top);

  useEffect(() => {
    const previousTop = lastTop.current;
    lastTop.current = top;
    if (lastLayoutKey.current !== layoutKey) {
      lastLayoutKey.current = layoutKey;
      animatedTop.value = top;
      return;
    }
    if (top === previousTop) return;
    animatedTop.value = withTiming(top, {
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [top, layoutKey, animatedTop]);

  const animatedStyle = useAnimatedStyle(() => ({ top: animatedTop.value }));

  return (
    <Animated.View
      pointerEvents={pointerEvents}
      testID={testID}
      style={[style, animatedStyle]}
    >
      {children}
    </Animated.View>
  );
}
