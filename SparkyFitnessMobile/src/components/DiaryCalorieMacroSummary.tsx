import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, LayoutAnimation } from 'react-native';
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
import NutrientPill from './NutrientPill';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getNetCarbsValue } from '../utils/nutrientUtils';
import { NUTRIENT_META } from '../constants/nutrients';
import type { DailySummary } from '../types/dailySummary';
import type { UserCustomNutrient } from '../hooks/useCustomNutrients';

const CORE_MACROS = ['protein', 'carbs', 'fat', 'dietary_fiber'] as const;

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
  const barHeight = 7;
  const borderRadius = 3.5;
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
    <View>
      <View className="flex-row justify-between items-baseline mb-3">
        <Text className="text-lg font-bold text-text-primary">
          {Math.round(eaten).toLocaleString()}
          {hasGoal && (
            <Text className="text-lg font-semibold text-text-muted">
              {` / ${Math.round(goal).toLocaleString()}`}
            </Text>
          )}
          <Text className="text-sm font-normal text-text-muted"> kcal</Text>
        </Text>
        {hasGoal && (
          <Text className="text-sm font-bold text-text-primary">
            {Math.abs(Math.round(remaining)).toLocaleString()}
            <Text className="text-sm font-normal text-text-muted">
              {' '}
              {remaining >= 0 ? 'remaining' : 'over'}
            </Text>
          </Text>
        )}
      </View>
      {hasGoal && (
        <View className="h-[7px]" onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
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
  /** Diary-specific custom nutrient keys (view_group='diary'), already capped to 4. */
  customNutrientKeys: string[];
  customNutrients: UserCustomNutrient[];
}

const DiaryCalorieMacroSummary: React.FC<DiaryCalorieMacroSummaryProps> = ({
  summary,
  showNetCarbs,
  customNutrientKeys,
  customNutrients,
}) => {
  const diarySummaryVisible = useAppPreferencesStore((s) => s.diarySummaryVisible);
  const diarySummaryExpanded = useAppPreferencesStore((s) => s.diarySummaryExpanded);
  const setDiarySummaryExpanded = useAppPreferencesStore((s) => s.setDiarySummaryExpanded);
  const textSecondary = useCSSVariable('--color-text-secondary') as string;

  const rotation = useSharedValue(diarySummaryExpanded ? 0 : -90);
  useEffect(() => {
    rotation.value = withTiming(diarySummaryExpanded ? 0 : -90, { duration: 200 });
  }, [diarySummaryExpanded, rotation]);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  if (!diarySummaryVisible) {
    return null;
  }

  const { eaten, goal, remaining, progress } = summary.calorieBalance;

  const handleToggleExpanded = () => {
    // Custom config (rather than Presets.easeInEaseOut) so the height change
    // animates without the default create/delete opacity fade on the pills.
    LayoutAnimation.configureNext({
      duration: 200,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.scaleXY },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.scaleXY },
    });
    setDiarySummaryExpanded(!diarySummaryExpanded);
  };

  const resolveCoreMacro = (key: (typeof CORE_MACROS)[number]) => {
    if (key === 'protein') {
      return { label: 'Protein', consumed: summary.protein.consumed, goal: summary.protein.goal || undefined };
    }
    if (key === 'carbs') {
      const consumed = showNetCarbs
        ? getNetCarbsValue(summary.carbs.consumed, summary.fiber.consumed)
        : summary.carbs.consumed;
      return {
        label: showNetCarbs ? 'Net Carbs' : 'Carbs',
        consumed,
        goal: summary.carbs.goal || undefined,
      };
    }
    if (key === 'fat') {
      return { label: 'Fat', consumed: summary.fat.consumed, goal: summary.fat.goal || undefined };
    }
    return { label: 'Fiber', consumed: summary.fiber.consumed, goal: summary.fiber.goal || undefined };
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <TouchableOpacity
        onPress={handleToggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: diarySummaryExpanded }}
        accessibilityHint={diarySummaryExpanded ? 'Collapse this section' : 'Expand this section'}
      >
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-md font-bold text-text-secondary">Calories</Text>
          <Animated.View style={chevronStyle}>
            <Icon name="chevron-down" size={20} color={textSecondary} />
          </Animated.View>
        </View>
        <CalorieBar eaten={eaten} goal={goal} remaining={remaining} progressPercent={progress / 100} />
      </TouchableOpacity>
      {diarySummaryExpanded && (
        <View className="flex-row flex-wrap justify-between mt-3">
          {CORE_MACROS.map((key) => {
            const { label, consumed, goal: macroGoal } = resolveCoreMacro(key);
            return (
              <NutrientPill
                key={key}
                label={label}
                consumed={consumed}
                goal={macroGoal}
              />
            );
          })}
          {customNutrientKeys.map((name) => {
            const customDef = customNutrients.find((cn) => cn.name === name);
            const meta = NUTRIENT_META[name];
            const label = meta?.label ?? customDef?.name ?? name;
            const unit = meta?.unit ?? customDef?.unit ?? 'g';
            const consumed = summary.customNutrientTotals[name] ?? 0;
            const nutrientGoal = summary.customNutrientGoals[name] || undefined;
            return (
              <NutrientPill
                key={name}
                label={label}
                consumed={consumed}
                goal={nutrientGoal}
                unit={unit}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};

export default DiaryCalorieMacroSummary;
