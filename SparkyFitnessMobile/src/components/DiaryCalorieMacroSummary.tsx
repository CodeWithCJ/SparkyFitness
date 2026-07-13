import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, { useSharedValue, useDerivedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';

import MacroCard from './MacroCard';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getNetCarbsValue } from '../utils/nutrientUtils';
import type { DailySummary } from '../types/dailySummary';

interface CalorieBarProps {
  eaten: number;
  goal: number;
  remaining: number;
  progressPercent: number;
}

const CalorieBar: React.FC<CalorieBarProps> = ({ eaten, goal, remaining, progressPercent }) => {
  const [barWidth, setBarWidth] = useState(0);
  const [trackColor, fillColor] = useCSSVariable([
    '--color-progress-track',
    '--color-calories',
  ]) as [string, string];
  const barHeight = 10;
  const borderRadius = 5;
  const hasGoal = goal > 0;

  const animatedProgress = useSharedValue(0);
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    animatedProgress.value = 0;
    animatedProgress.value = withTiming(hasGoal ? progressPercent : 0, {
      duration: 500,
      easing: Easing.out(Easing.cubic),
    });
  }, [isFocused, hasGoal, progressPercent, animatedProgress]);

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

  const fillStyle = useAnimatedStyle(() => ({ width: fillWidth.value }));
  const overflowStyle = useAnimatedStyle(() => ({ left: overflowX.value, width: overflowWidth.value }));

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-md font-bold text-text-secondary mb-2">Calories</Text>
      <View className="flex-row justify-between items-end mb-3">
        <Text className="text-lg font-bold text-text-primary">
          {Math.round(eaten).toLocaleString()}
          <Text className="text-sm font-normal text-text-secondary">
            {' '}
            kcal{hasGoal ? ` / ${Math.round(goal).toLocaleString()}` : ''}
          </Text>
        </Text>
        {hasGoal && (
          <Text className="text-base font-semibold text-text-primary">
            {Math.abs(Math.round(remaining)).toLocaleString()}
            <Text className="text-sm font-normal text-text-secondary">
              {' '}
              {remaining >= 0 ? 'remaining' : 'over'}
            </Text>
          </Text>
        )}
      </View>
      {hasGoal && (
        <View className="h-2.5" onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
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
                  { position: 'absolute', left: 0, top: 0, height: barHeight, backgroundColor: fillColor },
                  fillStyle,
                ]}
              />
              <Animated.View
                style={[
                  { position: 'absolute', top: 0, height: barHeight, backgroundColor: fillColor, opacity: 0.65 },
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

interface DiaryCalorieMacroSummaryProps {
  summary: DailySummary;
  showNetCarbs: boolean;
}

const DiaryCalorieMacroSummary: React.FC<DiaryCalorieMacroSummaryProps> = ({ summary, showNetCarbs }) => {
  const diaryCalorieSummaryVisible = useAppPreferencesStore((s) => s.diaryCalorieSummaryVisible);
  const diaryMacroSummaryVisible = useAppPreferencesStore((s) => s.diaryMacroSummaryVisible);
  const [proteinColor, carbsColor, fatColor, progressOverfillColor] = useCSSVariable([
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
    '--color-progress-overfill',
  ]) as [string, string, string, string];

  if (!diaryCalorieSummaryVisible && !diaryMacroSummaryVisible) {
    return null;
  }

  const { eaten, goal, remaining, progress } = summary.calorieBalance;

  const carbsConsumed = showNetCarbs
    ? getNetCarbsValue(summary.carbs.consumed, summary.fiber.consumed)
    : summary.carbs.consumed;
  const carbsLabel = showNetCarbs ? 'Net Carbs' : 'Carbs';

  return (
    <>
      {diaryCalorieSummaryVisible && (
        <CalorieBar eaten={eaten} goal={goal} remaining={remaining} progressPercent={progress / 100} />
      )}
      {diaryMacroSummaryVisible && (
        <View className="bg-surface rounded-xl p-3 mb-3 shadow-sm">
          <Text className="text-md font-bold text-text-secondary mb-2 px-1">Macronutrients</Text>
          <View className="flex-row flex-wrap justify-between">
            <MacroCard
              label={carbsLabel}
              consumed={carbsConsumed}
              goal={summary.carbs.goal || undefined}
              color={carbsColor}
              overfillColor={progressOverfillColor}
            />
            <MacroCard
              label="Fat"
              consumed={summary.fat.consumed}
              goal={summary.fat.goal || undefined}
              color={fatColor}
              overfillColor={progressOverfillColor}
            />
            <MacroCard
              label="Protein"
              consumed={summary.protein.consumed}
              goal={summary.protein.goal || undefined}
              color={proteinColor}
              overfillColor={progressOverfillColor}
            />
          </View>
        </View>
      )}
    </>
  );
};

export default DiaryCalorieMacroSummary;
