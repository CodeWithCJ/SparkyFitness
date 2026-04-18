import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, Switch, ScrollView } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { usePreferences } from '../hooks/usePreferences';
import { updatePreferences } from '../services/api/preferencesApi';
import { preferencesQueryKey } from '../hooks/queryKeys';
import type { UserPreferences } from '../types/preferences';
import type { RootStackScreenProps } from '../types/navigation';

type CalorieSettingsScreenProps = RootStackScreenProps<'CalorieSettings'>;

const modeOptions = [
  { label: 'Adaptive TDEE', value: 'adaptive' },
  { label: 'Dynamic Goal', value: 'dynamic' },
  { label: 'Fixed Goal', value: 'fixed' },
  { label: 'Percentage Earn-Back', value: 'percentage' },
  { label: 'Device Projection', value: 'tdee' },
];

const activityLevelOptions = [
  { label: 'Sedentary (x1.2)', value: 'not_much' },
  { label: 'Lightly Active (x1.375)', value: 'light' },
  { label: 'Moderately Active (x1.55)', value: 'moderate' },
  { label: 'Very Active (x1.725)', value: 'heavy' },
];

function normalizePreferences(prefs: UserPreferences | undefined) {
  const raw = prefs?.calorie_goal_adjustment_mode;
  return {
    mode: !raw ? 'dynamic' : raw === 'smart' ? 'tdee' : raw,
    activityLevel: prefs?.activity_level ?? 'not_much',
    exerciseCaloriePercentage: prefs?.exercise_calorie_percentage ?? 100,
    includeBmrInNetCalories: prefs?.include_bmr_in_net_calories ?? false,
    tdeeAllowNegativeAdjustment: prefs?.tdee_allow_negative_adjustment ?? false,
  };
}

const CalorieSettingsScreen: React.FC<CalorieSettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentPrimary, formEnabled, formDisabled] = useCSSVariable([
    '--color-accent-primary',
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string, string];

  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const normalized = normalizePreferences(preferences);

  const [percentageText, setPercentageText] = useState(
    () => String(normalized.exerciseCaloriePercentage),
  );

  useEffect(() => {
    setPercentageText(String(normalized.exerciseCaloriePercentage));
  }, [normalized.exerciseCaloriePercentage]);

  const mutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => updatePreferences(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: preferencesQueryKey });
      const previous = queryClient.getQueryData<UserPreferences>(preferencesQueryKey);
      queryClient.setQueryData<UserPreferences>(preferencesQueryKey, (old) =>
        old ? { ...old, ...data } : data as UserPreferences,
      );
      return { previous };
    },
    onError: (_err, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData(preferencesQueryKey, context.previous);
      }
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update setting.' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
    },
  });

  const handleModeChange = useCallback((value: string) => {
    mutation.mutate({ calorie_goal_adjustment_mode: value });
  }, [mutation]);

  const handleActivityLevelChange = useCallback((value: string) => {
    mutation.mutate({ activity_level: value });
  }, [mutation]);

  const handleBmrToggle = useCallback((value: boolean) => {
    mutation.mutate({ include_bmr_in_net_calories: value });
  }, [mutation]);

  const handleNegativeAdjustmentToggle = useCallback((value: boolean) => {
    mutation.mutate({ tdee_allow_negative_adjustment: value });
  }, [mutation]);

  const handlePercentageBlur = useCallback(() => {
    const parsed = parseInt(percentageText, 10);
    const clamped = isNaN(parsed) ? 100 : Math.max(0, Math.min(100, parsed));
    setPercentageText(String(clamped));
    if (clamped !== normalized.exerciseCaloriePercentage) {
      mutation.mutate({ exercise_calorie_percentage: clamped });
    }
  }, [percentageText, normalized.exerciseCaloriePercentage, mutation]);


  const optionsLayout = LinearTransition.delay(0).duration(250);
  const pipelineLayout = LinearTransition.delay(50).duration(250);

  const showPercentage = normalized.mode === 'percentage';
  const showActivityLevel = normalized.mode === 'tdee' || normalized.mode === 'adaptive';
  const showNegativeAdjustment = normalized.mode === 'tdee';

  const explanation = useMemo(() => {
    const mode = normalized.mode;
    const bmr = normalized.includeBmrInNetCalories;
    const pct = normalized.exerciseCaloriePercentage;

    const burned = bmr
      ? 'Activity + BMR'
      : 'Activity only (exercise + steps)';

    const net = 'Eaten \u2212 Burned';

    let remainingFormula: string;
    let remainingNote: string | null;
    switch (mode) {
      case 'dynamic':
        remainingFormula = 'Goal \u2212 Net Energy';
        remainingNote = 'Goal grows as you move';
        break;
      case 'percentage':
        remainingFormula = bmr
          ? `Goal \u2212 Eaten + BMR + ${pct}% of Exercise`
          : `Goal \u2212 Eaten + ${pct}% of Exercise`;
        remainingNote = null;
        break;
      case 'tdee':
        remainingFormula = 'Goal \u2212 Eaten + (Projection \u2212 TDEE)';
        remainingNote = 'Projection converges at midnight';
        break;
      case 'adaptive':
        remainingFormula = 'Goal \u2212 Eaten';
        remainingNote = 'Goal = Adaptive TDEE';
        break;
      default:
        remainingFormula = 'Goal \u2212 Eaten';
        remainingNote = 'Activity does not change your budget';
        break;
    }

    return { burned, net, remainingFormula, remainingNote };
  }, [normalized.mode, normalized.includeBmrInNetCalories, normalized.exerciseCaloriePercentage]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding }}
        contentInsetAdjustmentBehavior="never"
      >
        {/* Header */}
        <View className="flex-row items-center mb-4">
          <Button
            variant="ghost"
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="py-0 px-0 mr-2"
          >
            <Icon name="chevron-back" size={22} color={accentPrimary} />
          </Button>
          <Text className="text-2xl font-bold text-text-primary">Calorie Settings</Text>
        </View>

        {/* Mode */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">Calorie Mode</Text>
            <BottomSheetPicker
              value={normalized.mode}
              options={modeOptions}
              onSelect={handleModeChange}
              title="Adjustment Mode"
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-3">
            Controls how your daily calorie goal adjusts based on activity.
          </Text>
        </View>

        {/* Options */}
        <Animated.View className="bg-surface rounded-xl p-4 mb-4 shadow-sm" layout={optionsLayout}>
          {/* Percentage Input */}
          {showPercentage && (
            <Animated.View layout={optionsLayout}>
              <Text className="text-base font-semibold text-text-primary mb-2">
                Exercise Calories Applied
              </Text>
              <FormInput
                value={percentageText}
                onChangeText={setPercentageText}
                onBlur={handlePercentageBlur}
                keyboardType="number-pad"
                maxLength={3}
                returnKeyType="done"
              />
              <Text className="text-text-secondary text-sm mt-3">
                How much of your exercise calories are added back to your daily goal.
              </Text>
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* Activity Level */}
          {showActivityLevel && (
            <Animated.View layout={optionsLayout}>
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-text-primary">Activity Level</Text>
                <BottomSheetPicker
                  value={normalized.activityLevel}
                  options={activityLevelOptions}
                  onSelect={handleActivityLevelChange}
                  title="Activity Level"
                  containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
                />
              </View>
              <Text className="text-text-secondary text-sm mt-1">
                Used as a baseline for TDEE.
              </Text>
              {normalized.mode === 'adaptive' && (
                <Text className="text-text-secondary text-sm mt-3">
                  Acts as a fallback until you have enough tracking data.
                </Text>
              )}
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* Negative Adjustment Toggle */}
          {showNegativeAdjustment && (
            <Animated.View layout={optionsLayout}>
              <View className="flex-row justify-between items-center">
                <Text className="text-base font-semibold text-text-primary">Allow Negative Adjustment</Text>
                <Switch
                  onValueChange={handleNegativeAdjustmentToggle}
                  value={normalized.tdeeAllowNegativeAdjustment}
                  trackColor={{ false: formDisabled, true: formEnabled }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <Text className="text-text-secondary text-sm mt-3">
                Lower your daily goal when you burn less than expected.
              </Text>
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* BMR Toggle */}
          <Animated.View layout={optionsLayout}>
            <View className="flex-row justify-between items-center">
              <Text className="text-base font-semibold text-text-primary">Include Resting Calories</Text>
              <Switch
                onValueChange={handleBmrToggle}
                value={normalized.includeBmrInNetCalories}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            </View>
            <Text className="text-text-secondary text-sm mt-3">
              Include your baseline energy (BMR) in net calculations.
            </Text>
          </Animated.View>
        </Animated.View>

        {/* Calculation Pipeline */}
        <Animated.View
          className="rounded-xl p-4 mb-4"
          layout={pipelineLayout}
          style={{ backgroundColor: `${accentPrimary}15`}}
        >
          <View className="flex-row items-center mb-4">
            <Icon name="info-circle" size={18} color={accentPrimary} />
            <Text className="text-base font-semibold text-text-primary ml-2">
              How this works
            </Text>
          </View>

          <Animated.View className="items-center" layout={pipelineLayout}>
            {/* Step 1: Burned */}
            <Text className="text-base font-semibold text-text-primary">Burned Calories</Text>
            <Animated.View
              key={`burned-${explanation.burned}`}
              layout={pipelineLayout}
            >
              <Text className="text-sm text-text-secondary">{explanation.burned}</Text>
            </Animated.View>

            <Text className="text-text-muted text-lg my-1">{'\u2193'}</Text>

            {/* Step 2: Net */}
            <Text className="text-base font-semibold text-text-primary">Net Energy</Text>
            <Animated.View
              key={`net-${explanation.net}`}
              layout={pipelineLayout}
            >
              <Text className="text-sm text-text-secondary">{explanation.net}</Text>
            </Animated.View>

            <Text className="text-text-muted text-lg my-1">{'\u2193'}</Text>

            {/* Step 3: Remaining */}
            <Text className="text-base font-semibold text-text-primary">Remaining Calories</Text>
            <Animated.View
              key={`remaining-${explanation.remainingFormula}`}
              layout={pipelineLayout}
            >
              <Text className="text-sm text-text-secondary">{explanation.remainingFormula}</Text>
            </Animated.View>
            {explanation.remainingNote && (
              <Animated.View
                key={`note-${explanation.remainingNote}`}
                layout={pipelineLayout}
              >
                <Text className="text-sm text-text-secondary mt-2 italic">({explanation.remainingNote})</Text>
              </Animated.View>
            )}
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </View>
  );
};

export default CalorieSettingsScreen;
