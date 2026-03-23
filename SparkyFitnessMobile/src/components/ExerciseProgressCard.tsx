import React, { useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useDerivedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
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

  const fillStyle = useAnimatedStyle(() => ({
    width: fillWidth.value,
  }));

  const overflowStyle = useAnimatedStyle(() => ({
    left: overflowX.value,
    width: overflowWidth.value,
  }));

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
            <View
              style={{
                width: barWidth,
                height: barHeight,
                borderRadius,
                overflow: 'hidden',
                backgroundColor: trackColor,
                opacity,
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
      <Text className="text-md font-bold text-text-secondary mb-4">Exercise</Text>
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
