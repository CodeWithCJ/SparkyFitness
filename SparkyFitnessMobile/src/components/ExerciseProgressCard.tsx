import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useDerivedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { energyFromKcal } from '@workspace/shared';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { energyUnitLabel } from '../utils/energyUnit';

interface ProgressBarProps {
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
  trackColor: string;
  opacity?: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  label,
  current,
  goal,
  unit,
  color,
  trackColor,
  opacity = 1,
}) => {
  const [barWidth, setBarWidth] = useState(0);
  const barHeight = 8;
  const borderRadius = 4;
  const progress = goal > 0 ? current / goal : current > 0 ? 1 : 0;
  const showBar = goal > 0 || current > 0;

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
    <View>
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-sm font-semibold text-text-primary">{label}</Text>
        <Text className="text-sm text-text-primary">
          {goal > 0
            ? `${Math.round(current)} / ${Math.round(goal)} ${unit}`
            : `${Math.round(current)} ${unit}`}
        </Text>
      </View>
      {showBar && (
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
                  {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: barHeight,
                    backgroundColor: color,
                  },
                  fillStyle,
                ]}
              />
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: 0,
                    height: barHeight,
                    backgroundColor: color,
                    opacity: 0.65,
                  },
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
  /** Opens exercise statistics from the card's header. */
  onPressDetails?: () => void;
}

const ExerciseProgressCard: React.FC<ExerciseProgressCardProps> = ({
  exerciseMinutes,
  exerciseMinutesGoal,
  exerciseCalories,
  exerciseCaloriesGoal,
  onPressDetails,
}) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const [exerciseColor, trackColor, accentColor] = useCSSVariable([
    '--color-calories',
    '--color-progress-track',
    '--color-accent-primary',
  ]) as [string, string, string];

  const hasEntries = exerciseMinutes > 0 || exerciseCalories > 0;

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Pressable
        onPress={onPressDetails}
        disabled={!onPressDetails}
        accessibilityRole={onPressDetails ? 'button' : undefined}
        className="flex-row justify-between items-center mb-4"
      >
        <Text className="text-md font-bold text-text-secondary">
          {t('dashboard.exercise', { defaultValue: 'Exercise' })}
        </Text>
        {onPressDetails ? (
          <View className="flex-row items-center">
            <Text className="text-xs font-semibold text-accent-primary mr-1">
              {t('dashboard.exerciseStatistics', {
                defaultValue: 'Statistics',
              })}
            </Text>
            <Icon name="chevron-forward" size={14} color={accentColor} />
          </View>
        ) : null}
      </Pressable>
      {hasEntries ? (
        <>
          <ProgressBar
            label={t('dashboard.minutes', { defaultValue: 'Minutes' })}
            current={exerciseMinutes}
            goal={exerciseMinutesGoal}
            unit="min"
            color={exerciseColor}
            trackColor={trackColor}
            opacity={0.8}
          />
          <View className="h-3" />
          <ProgressBar
            label={t('dashboard.calories', { defaultValue: 'Calories' })}
            current={energyFromKcal(exerciseCalories, energyUnit)}
            goal={energyFromKcal(exerciseCaloriesGoal, energyUnit)}
            unit={energyUnitLabel(energyUnit, t)}
            color={exerciseColor}
            trackColor={trackColor}
            opacity={0.5}
          />
        </>
      ) : (
        <Text className="text-sm text-text-secondary text-center py-2">
          {t('dashboard.noExerciseEntries', {
            defaultValue: 'No exercise entries yet',
          })}
        </Text>
      )}
    </View>
  );
};

export default ExerciseProgressCard;
