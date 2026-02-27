import React, { useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { Canvas, Rect, Group, rect, rrect } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withTiming, Easing } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';

interface ProgressBarProps {
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
  trackColor: string;
  opacity?: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ label, current, goal, unit, color, trackColor, opacity = 1 }) => {
  const [barWidth, setBarWidth] = useState(0);
  const barHeight = 8;
  const borderRadius = 4;
  const progress = goal > 0 ? current / goal : 0;

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

  const hasGoal = goal > 0;

  return (
    <View>
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-sm font-semibold text-text-primary">{label}</Text>
        <Text className="text-sm text-text-primary">
          {hasGoal ? `${Math.round(current)} / ${Math.round(goal)} ${unit}` : `${Math.round(current)} ${unit}`}
        </Text>
      </View>
      {hasGoal && (
        <View
          className="h-3"
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        >
          {barWidth > 0 && (
            <Canvas style={{ width: barWidth, height: barHeight }}>
              <Group clip={rrect(rect(0, 0, barWidth, barHeight), borderRadius, borderRadius)} opacity={opacity}>
                <Rect x={0} y={0} width={barWidth} height={barHeight} color={trackColor} />
                <Rect x={0} y={0} width={fillWidth} height={barHeight} color={color} />
                <Group opacity={0.65}>
                  <Rect x={overflowX} y={0} width={overflowWidth} height={barHeight} color={color} />
                </Group>
              </Group>
            </Canvas>
          )}
        </View>
      )}
    </View>
  );
};

interface ExerciseProgressCardProps {
  exerciseMinutes: number;
  exerciseMinutesGoal: number;
  exerciseCalories: number;
  exerciseCaloriesGoal: number;
}

const ExerciseProgressCard: React.FC<ExerciseProgressCardProps> = ({
  exerciseMinutes,
  exerciseMinutesGoal,
  exerciseCalories,
  exerciseCaloriesGoal,
}) => {
  const [exerciseColor, trackColor] = useCSSVariable([
    '--color-calories',
    '--color-progress-track',
  ]) as [string, string];

  const hasEntries = exerciseMinutes > 0 || exerciseCalories > 0;

  return (
    <View className="bg-surface rounded-xl p-4 mb-2 shadow-sm">
      <Text className="text-md font-bold text-text-primary mb-4">Exercise</Text>
      {hasEntries ? (
        <>
          <ProgressBar
            label="Minutes"
            current={exerciseMinutes}
            goal={exerciseMinutesGoal}
            unit="min"
            color={exerciseColor}
            trackColor={trackColor}
            opacity={0.8}
          />
          <View className="h-3" />
          <ProgressBar
            label="Calories"
            current={exerciseCalories}
            goal={exerciseCaloriesGoal}
            unit="Cal"
            color={exerciseColor}
            trackColor={trackColor}
            opacity={0.5}
          />
        </>
      ) : (
        <Text className="text-sm text-text-secondary text-center py-2">No exercise entries yet</Text>
      )}
    </View>
  );
};

export default ExerciseProgressCard;
