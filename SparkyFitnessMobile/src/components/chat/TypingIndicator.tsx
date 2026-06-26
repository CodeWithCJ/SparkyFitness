import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

const DOT_COUNT = 3;
const DOT_DURATION = 400;
const DOT_STAGGER = 150;

/** A single pulsing dot, offset by `delay` so the three dots ripple in sequence. */
function Dot({ color, delay }: { color: string; delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: DOT_DURATION, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: DOT_DURATION, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [progress, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + progress.value * 0.7,
    transform: [{ translateY: progress.value * -3 }],
  }));

  return (
    <Animated.View
      style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, style]}
    />
  );
}

/**
 * Animated three-dot "thinking" indicator shown in an assistant bubble while
 * Sparky is responding but hasn't streamed any visible content yet.
 */
export default function TypingIndicator() {
  const muted = useCSSVariable('--color-text-muted') as string;

  return (
    <View
      className="flex-row items-center gap-1"
      style={{ height: 20 }}
      accessibilityLabel="Sparky is typing"
    >
      {Array.from({ length: DOT_COUNT }).map((_, i) => (
        <Dot key={i} color={muted} delay={i * DOT_STAGGER} />
      ))}
    </View>
  );
}
