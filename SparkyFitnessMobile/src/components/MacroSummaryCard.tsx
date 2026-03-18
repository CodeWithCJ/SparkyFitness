import React, { useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { Canvas, Rect, Group, rect, rrect } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withTiming, Easing } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';

interface MacroData {
  label: string;
  consumed: number;
  goal: number;
  color: string;
}

interface MacroSummaryCardProps {
  macros: MacroData[];
  overfillColor: string;
  unit?: string;
}

const BAR_HEIGHT = 8;
const BORDER_RADIUS = 4;

const MacroRow: React.FC<{ macro: MacroData; overfillColor: string; unit: string }> = ({ macro, overfillColor, unit }) => {
  const [barWidth, setBarWidth] = useState(0);
  const progress = macro.goal > 0 ? macro.consumed / macro.goal : 0;
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
    <View>
      <View className="flex-row justify-between items-center mb-1">
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: macro.color }} />
          <Text className="text-sm font-medium text-text-primary">{macro.label}</Text>
        </View>
        <Text className="text-xs text-text-secondary">
          {Math.round(macro.consumed)}{unit} / {Math.round(macro.goal)}{unit}
        </Text>
      </View>
      <View
        className="h-2 mb-3"
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        {barWidth > 0 && (
          <Canvas style={{ width: barWidth, height: BAR_HEIGHT }}>
            <Group clip={rrect(rect(0, 0, barWidth, BAR_HEIGHT), BORDER_RADIUS, BORDER_RADIUS)}>
              <Rect x={0} y={0} width={barWidth} height={BAR_HEIGHT} color={trackColor} />
              <Rect x={0} y={0} width={fillWidth} height={BAR_HEIGHT} color={macro.color} />
              <Group opacity={0.65}>
                <Rect x={overflowX} y={0} width={overflowWidth} height={BAR_HEIGHT} color={macro.color} />
              </Group>
            </Group>
          </Canvas>
        )}
      </View>
    </View>
  );
};

const MacroSummaryCard: React.FC<MacroSummaryCardProps> = ({ macros, overfillColor, unit = 'g' }) => {
  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-md font-bold text-text-primary mb-3">Macros</Text>
      {macros.map((macro) => (
        <MacroRow key={macro.label} macro={macro} overfillColor={overfillColor} unit={unit} />
      ))}
    </View>
  );
};

export default MacroSummaryCard;
