import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useDerivedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';

interface MacroCardProps {
  label: string;
  consumed: number;
  goal?: number;
  color: string;
  overfillColor: string;
  unit?: string;
  /** Shrinks label/value text and the bar height for use in denser layouts (e.g. a 3-up row). */
  compact?: boolean;
  /** Overrides the default 2-column `w-[48%]` container width. */
  widthClassName?: string;
}

const MacroCard: React.FC<MacroCardProps> = ({
  label,
  consumed,
  goal,
  color,
  overfillColor,
  unit = 'g',
  compact = false,
  widthClassName = 'w-[48%]',
}) => {
  const [barWidth, setBarWidth] = useState(0);
  const hasGoal = !!(goal && goal > 0);
  const progress = hasGoal ? consumed / (goal as number) : 0;
  const barHeight = compact ? 6 : 8;
  const borderRadius = compact ? 3 : 4;
  const [trackColor] = useCSSVariable([
    '--color-progress-track',
  ]) as [string];

  const animatedProgress = useSharedValue(0);

  // Replay the 0 -> progress entrance animation while the screen is focused.
  // Driven by useIsFocused()+useEffect (rather than useFocusEffect) so the
  // shared-value write lives in a real effect that React's compiler can
  // optimize around.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    animatedProgress.value = 0;
    animatedProgress.value = withTiming(progress, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
  }, [isFocused, progress, animatedProgress]);

  const fillWidth = useDerivedValue(() => {
    const p = animatedProgress.value;
    if (p <= 0 || barWidth <= 0) return 0;
    return p > 1 ? barWidth / p : barWidth * p;
  }, [barWidth]);

  const overflowX = useDerivedValue(() => {
    const p = animatedProgress.value;
    if (p <= 1 || barWidth <= 0) return barWidth;
    return barWidth / p + 2;
  }, [barWidth]);

  const overflowWidth = useDerivedValue(() => {
    const p = animatedProgress.value;
    if (p <= 1 || barWidth <= 0) return 0;
    const gapStart = barWidth / p + 2;
    return Math.max(0, barWidth - gapStart);
  }, [barWidth]);

  const fillStyle = useAnimatedStyle(() => ({
    width: fillWidth.value,
  }));

  const overflowStyle = useAnimatedStyle(() => ({
    left: overflowX.value,
    width: overflowWidth.value,
  }));

  return (
    <View className={`${widthClassName} p-1`}>
      <View className="flex-row justify-between items-center mb-2">
        <Text className={compact ? 'text-xs font-medium text-text-primary' : 'text-sm font-medium text-text-primary'}>
          {label}
        </Text>
        <Text className={compact ? 'text-[11px] text-text-secondary' : 'text-xs text-text-secondary'}>
          {goal && goal > 0
            ? `${Math.round(consumed)}${unit} / ${Math.round(goal)}${unit}`
            : `${Math.round(consumed)}${unit}`}
        </Text>
      </View>
      {hasGoal && (
        <View
          className="h-2"
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        >
          {barWidth > 0 && (
            <View
              style={{
                width: barWidth,
                height: barHeight,
                borderRadius,
                overflow: 'hidden',
                backgroundColor: trackColor,
              }}
            >
              <Animated.View
                style={[
                  { position: 'absolute', left: 0, top: 0, height: barHeight, backgroundColor: color },
                  fillStyle,
                ]}
              />
              <Animated.View
                style={[
                  { position: 'absolute', top: 0, height: barHeight, backgroundColor: color, opacity: 0.65 },
                  overflowStyle,
                ]}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default MacroCard;
