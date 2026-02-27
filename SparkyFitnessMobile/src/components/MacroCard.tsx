import React, { useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { Canvas, Rect, Group, rect, rrect } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withTiming, Easing } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';

interface MacroCardProps {
  label: string;
  consumed: number;
  goal: number;
  color: string;
  overfillColor: string;
  unit?: string;
}

const MacroCard: React.FC<MacroCardProps> = ({ label, consumed, goal, color, overfillColor, unit = 'g' }) => {
  const [barWidth, setBarWidth] = useState(0);
  const progress = goal > 0 ? consumed / goal : 0;
  const barHeight = 8;
  const borderRadius = 4;
  const trackColor = useCSSVariable('--color-progress-track') as string;

  const animatedProgress = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      animatedProgress.value = 0;
      animatedProgress.value = withTiming(progress, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
      });
    }, [progress, animatedProgress])
  );

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

  return (
    <View className="w-[48%] bg-surface rounded-xl p-3 mb-3 shadow-sm">
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-sm font-medium text-text-primary">{label}</Text>
        <Text className="text-xs text-text-secondary">
          {Math.round(consumed)}{unit} / {Math.round(goal)}{unit}
        </Text>
      </View>
      {/* Progress bar container */}
      <View
        className="h-2"
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        {barWidth > 0 && (
          <Canvas style={{ width: barWidth, height: barHeight }}>
            {/* Clip entire bar for rounded corners */}
            <Group clip={rrect(rect(0, 0, barWidth, barHeight), borderRadius, borderRadius)}>
              {/* Track background */}
              <Rect
                x={0}
                y={0}
                width={barWidth}
                height={barHeight}
                color={trackColor}
              />
              {/* Animated fill portion */}
              <Rect x={0} y={0} width={fillWidth} height={barHeight} color={color} />
              {/* Overflow portion with reduced opacity */}
              <Group opacity={0.65}>
                <Rect x={overflowX} y={0} width={overflowWidth} height={barHeight} color={color} />
              </Group>
            </Group>
          </Canvas>
        )}
      </View>
    </View>
  );
};

export default MacroCard;
