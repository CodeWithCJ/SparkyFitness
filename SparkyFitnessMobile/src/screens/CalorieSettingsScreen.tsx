import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, Platform } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import HealthSourceLabel from '../components/HealthSourceLabel';
import Switch from '../components/ui/Switch';
import { usePreferences } from '../hooks/usePreferences';
import { updatePreferences } from '../services/api/preferencesApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { preferencesQueryKey } from '../hooks/queryKeys';
import type { UserPreferences } from '../types/preferences';
import type { RootStackScreenProps } from '../types/navigation';
import {
  DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
  MAX_CALORIE_SAFETY_FLOOR,
  MIN_CALORIE_SAFETY_FLOOR,
  convertEnergyValue,
  type CalorieSafetyFloorMode,
} from '@workspace/shared';

type CalorieSettingsScreenProps = RootStackScreenProps<'CalorieSettings'>;


function normalizePreferences(prefs: UserPreferences | undefined) {
  const raw = prefs?.calorie_goal_adjustment_mode;
  return {
    mode: !raw ? 'dynamic' : raw === 'smart' ? 'tdee' : raw,
    activityLevel: prefs?.activity_level ?? 'not_much',
    exerciseCaloriePercentage: prefs?.exercise_calorie_percentage ?? 100,
    includeBmrInNetCalories: prefs?.include_bmr_in_net_calories ?? false,
    tdeeAllowNegativeAdjustment: prefs?.tdee_allow_negative_adjustment ?? false,
    useExternalBmr: prefs?.use_external_bmr ?? false,
    calorieSafetyFloorMode: prefs?.calorie_safety_floor_mode ?? 'standard',
    calorieSafetyFloorValue:
      prefs?.calorie_safety_floor_value ??
      DEFAULT_CUSTOM_CALORIE_SAFETY_FLOOR,
    energyUnit: prefs?.energy_unit ?? 'kcal',
  };
}

const displayEnergy = (kcal: number, unit: 'kcal' | 'kJ') =>
  Math.round(convertEnergyValue(kcal, 'kcal', unit));

const toKcal = (value: number, unit: 'kcal' | 'kJ') =>
  Math.round(convertEnergyValue(value, unit, 'kcal'));

const CalorieSettingsScreen: React.FC<CalorieSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const healthSourceName = Platform.OS === 'ios'
    ? t('healthSync.appleHealth', { defaultValue: 'Apple Health' })
    : t('healthSync.healthConnect', { defaultValue: 'Health Connect' });
  const bmrMetricName = Platform.OS === 'ios'
    ? t('calorieSettings.restingEnergy', { defaultValue: 'Resting Energy' })
    : t('calorieSettings.bmr', { defaultValue: 'BMR' });
  const safetyFloorOptions = useMemo(() => [
    { label: t('calorieSettings.safetyFloor.standard', { defaultValue: 'Standard' }), value: 'standard' },
    { label: t('calorieSettings.safetyFloor.custom', { defaultValue: 'Custom' }), value: 'custom' },
    { label: t('calorieSettings.safetyFloor.disabled', { defaultValue: 'Disabled' }), value: 'disabled' },
  ], [t]);
  const modeOptions = [
    { label: t('calorieSettings.modes.adaptive', { defaultValue: 'Adaptive Goal' }), value: 'adaptive' },
    { label: t('calorieSettings.modes.dynamic', { defaultValue: 'Dynamic Goal' }), value: 'dynamic' },
    { label: t('calorieSettings.modes.fixed', { defaultValue: 'Fixed Goal' }), value: 'fixed' },
    { label: t('calorieSettings.modes.percentage', { defaultValue: 'Percentage Earn-Back' }), value: 'percentage' },
    { label: t('calorieSettings.modes.tdee', { defaultValue: 'Device Projection' }), value: 'tdee' },
  ];
  const activityLevelOptions = [
    { label: t('calorieSettings.activity.none', { defaultValue: 'None (x1.0)' }), value: 'none' },
    { label: t('calorieSettings.activity.sedentary', { defaultValue: 'Sedentary (x1.2)' }), value: 'not_much' },
    { label: t('calorieSettings.activity.light', { defaultValue: 'Lightly Active (x1.375)' }), value: 'light' },
    { label: t('calorieSettings.activity.moderate', { defaultValue: 'Moderately Active (x1.55)' }), value: 'moderate' },
    { label: t('calorieSettings.activity.heavy', { defaultValue: 'Very Active (x1.725)' }), value: 'heavy' },
  ];
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [string];

  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const normalized = normalizePreferences(preferences);

  const [percentageText, setPercentageText] = useState(
    () => String(normalized.exerciseCaloriePercentage),
  );
  const [safetyFloorText, setSafetyFloorText] = useState(() =>
    String(
      displayEnergy(normalized.calorieSafetyFloorValue, normalized.energyUnit),
    ),
  );

  // Re-sync the input text when the saved percentage changes (e.g. a background
  // refetch). Done during render (instead of in an effect) so the field shows
  // the latest saved value on the first render after it changes.
  const [syncedPercentage, setSyncedPercentage] = useState(
    normalized.exerciseCaloriePercentage,
  );
  if (syncedPercentage !== normalized.exerciseCaloriePercentage) {
    setSyncedPercentage(normalized.exerciseCaloriePercentage);
    setPercentageText(String(normalized.exerciseCaloriePercentage));
  }
  const [syncedSafetyFloor, setSyncedSafetyFloor] = useState(
    `${normalized.calorieSafetyFloorValue}:${normalized.energyUnit}`,
  );
  const safetyFloorSyncKey = `${normalized.calorieSafetyFloorValue}:${normalized.energyUnit}`;
  if (syncedSafetyFloor !== safetyFloorSyncKey) {
    setSyncedSafetyFloor(safetyFloorSyncKey);
    setSafetyFloorText(
      String(
        displayEnergy(
          normalized.calorieSafetyFloorValue,
          normalized.energyUnit,
        ),
      ),
    );
  }

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
      Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('calorieSettings.updateFailed', { defaultValue: 'Failed to update setting.' }) });
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

  const handleExternalBmrToggle = useCallback((value: boolean) => {
    mutation.mutate({ use_external_bmr: value });
  }, [mutation]);

  const handleSafetyFloorModeChange = useCallback(
    (value: string) => {
      mutation.mutate({
        calorie_safety_floor_mode: value as CalorieSafetyFloorMode,
      });
    },
    [mutation],
  );

  const handleSafetyFloorBlur = useCallback(() => {
    const trimmedValue = safetyFloorText.trim();
    if (trimmedValue === '') {
      setSafetyFloorText(
        String(
          displayEnergy(
            normalized.calorieSafetyFloorValue,
            normalized.energyUnit,
          ),
        ),
      );
      return;
    }
    const parsed = Number(trimmedValue);
    const kcal = Number.isFinite(parsed)
      ? toKcal(parsed, normalized.energyUnit)
      : normalized.calorieSafetyFloorValue;
    const clamped = Math.max(
      MIN_CALORIE_SAFETY_FLOOR,
      Math.min(MAX_CALORIE_SAFETY_FLOOR, kcal),
    );
    setSafetyFloorText(String(displayEnergy(clamped, normalized.energyUnit)));
    if (clamped !== normalized.calorieSafetyFloorValue) {
      mutation.mutate({ calorie_safety_floor_value: clamped });
    }
  }, [
    mutation,
    normalized.calorieSafetyFloorValue,
    normalized.energyUnit,
    safetyFloorText,
  ]);

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
      ? t('calorieSettings.formulas.activityWithBmr', { defaultValue: 'Activity + BMR' })
      : t('calorieSettings.formulas.activityOnly', { defaultValue: 'Activity only (exercise + steps)' });
    const net = t('calorieSettings.formulas.eatenBurned', { defaultValue: 'Eaten − Burned' });

    let remainingFormula: string;
    let remainingNote: string | null;
    switch (mode) {
      case 'dynamic':
        remainingFormula = t('calorieSettings.formulas.dynamic', { defaultValue: 'Goal − Net Energy' });
        remainingNote = t('calorieSettings.notes.dynamic', { defaultValue: 'Goal grows as you move' });
        break;
      case 'percentage':
        remainingFormula = bmr
          ? t('calorieSettings.formulas.percentageWithBmr', { defaultValue: 'Goal − Eaten + BMR + {{percentage}}% of Exercise', percentage: pct })
          : t('calorieSettings.formulas.percentage', { defaultValue: 'Goal − Eaten + {{percentage}}% of Exercise', percentage: pct });
        remainingNote = null;
        break;
      case 'tdee':
        remainingFormula = t('calorieSettings.formulas.tdee', { defaultValue: 'Goal − Eaten + (Projection − TDEE)' });
        remainingNote = t('calorieSettings.notes.tdee', { defaultValue: 'Projection converges at midnight' });
        break;
      case 'adaptive':
        remainingFormula = t('calorieSettings.formulas.adaptive', { defaultValue: 'Goal − Eaten' });
        remainingNote = t('calorieSettings.notes.adaptive', { defaultValue: 'Goal = Adaptive TDEE' });
        break;
      default:
        remainingFormula = t('calorieSettings.formulas.fixed', { defaultValue: 'Goal − Eaten' });
        remainingNote = t('calorieSettings.notes.fixed', { defaultValue: 'Activity does not change your budget' });
        break;
    }

    return { burned, net, remainingFormula, remainingNote };
  }, [normalized.mode, normalized.includeBmrInNetCalories, normalized.exerciseCaloriePercentage, t]);

  const header = useScreenHeader({ title: t('calorieSettings.title', { defaultValue: 'Calorie & BMR Settings' }), left: { kind: 'back' } });

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        {/* Mode */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">{t('calorieSettings.modeLabel', { defaultValue: 'Calorie Mode' })}</Text>
            <BottomSheetPicker
              value={normalized.mode}
              options={modeOptions}
              onSelect={handleModeChange}
              title={t('calorieSettings.adjustmentMode', { defaultValue: 'Adjustment Mode' })}
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-3">
            {t('calorieSettings.modeDescription', { defaultValue: 'Controls how your daily calorie goal adjusts based on activity.' })}
          </Text>
        </View>

        {/* Options */}
        <Animated.View className="bg-surface rounded-xl p-4 mb-4 shadow-sm" layout={optionsLayout}>
          {/* Percentage Input */}
          {showPercentage && (
            <Animated.View layout={optionsLayout}>
              <Text className="text-base font-semibold text-text-primary mb-2">
                {t('calorieSettings.exerciseCaloriesApplied', { defaultValue: 'Exercise Calories Applied' })}
              </Text>
              <FormInput
                value={percentageText}
                onChangeText={setPercentageText}
                onBlur={handlePercentageBlur}
                keyboardType="number-pad"
                maxLength={3}
                returnKeyType="done"
                accessibilityLabel={t('calorieSettings.exerciseCaloriesApplied', { defaultValue: 'Exercise Calories Applied' })}
              />
              <Text className="text-text-secondary text-sm mt-3">
                {t('calorieSettings.exerciseCaloriesDescription', { defaultValue: 'How much of your exercise calories are added back to your daily goal.' })}
              </Text>
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* Activity Level */}
          {showActivityLevel && (
            <Animated.View layout={optionsLayout}>
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-text-primary">{t('calorieSettings.activityLevel', { defaultValue: 'Activity Level' })}</Text>
                <BottomSheetPicker
                  value={normalized.activityLevel}
                  options={activityLevelOptions}
                  onSelect={handleActivityLevelChange}
                  title={t('calorieSettings.activityLevel', { defaultValue: 'Activity Level' })}
                  containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
                />
              </View>
              <Text className="text-text-secondary text-sm mt-1">
                {t('calorieSettings.activityBaseline', { defaultValue: 'Used as a baseline for TDEE.' })}
              </Text>
              {normalized.mode === 'adaptive' && (
                <Text className="text-text-secondary text-sm mt-3">
                  {t('calorieSettings.adaptiveFallback', { defaultValue: 'Acts as a fallback until you have enough tracking data.' })}
                </Text>
              )}
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* Negative Adjustment Toggle */}
          {showNegativeAdjustment && (
            <Animated.View layout={optionsLayout}>
              <View className="flex-row justify-between items-center">
                <Text className="text-base font-semibold text-text-primary">{t('calorieSettings.allowNegative', { defaultValue: 'Allow Negative Adjustment' })}</Text>
                <Switch
                  onValueChange={handleNegativeAdjustmentToggle}
                  value={normalized.tdeeAllowNegativeAdjustment}
                  accessibilityLabel={t('calorieSettings.allowNegative', { defaultValue: 'Allow Negative Adjustment' })}
                />
              </View>
              <Text className="text-text-secondary text-sm mt-3">
                {t('calorieSettings.negativeDescription', { defaultValue: 'Lower your daily goal when you burn less than expected.' })}
              </Text>
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* BMR Toggle */}
          <Animated.View layout={optionsLayout}>
            <View className="flex-row justify-between items-center">
              <Text className="text-base font-semibold text-text-primary">{t('calorieSettings.includeResting', { defaultValue: 'Include Resting Calories' })}</Text>
              <Switch
                onValueChange={handleBmrToggle}
                value={normalized.includeBmrInNetCalories}
                accessibilityLabel={t('calorieSettings.includeResting', { defaultValue: 'Include Resting Calories' })}
              />
            </View>
            <Text className="text-text-secondary text-sm mt-3">
              {t('calorieSettings.includeRestingDescription', { defaultValue: 'Include your baseline energy (BMR) in net calculations.' })}
            </Text>
          </Animated.View>
        </Animated.View>

        <Animated.View
          className="bg-surface rounded-xl p-4 mb-4 shadow-sm"
          layout={optionsLayout}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">
              {t('calorieSettings.safetyFloor.title', { defaultValue: 'Safety Floor' })}
            </Text>
            <BottomSheetPicker
              value={normalized.calorieSafetyFloorMode}
              options={safetyFloorOptions}
              onSelect={handleSafetyFloorModeChange}
              title={t('calorieSettings.safetyFloor.title', { defaultValue: 'Safety Floor' })}
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>
          {normalized.calorieSafetyFloorMode === 'custom' && (
            <View className="mt-4">
              <Text className="text-sm font-semibold text-text-primary mb-2">
                {t('calorieSettings.safetyFloor.customMinimum', { defaultValue: 'Custom minimum ({{unit}})', unit: normalized.energyUnit })}
              </Text>
              <FormInput
                value={safetyFloorText}
                onChangeText={setSafetyFloorText}
                onBlur={handleSafetyFloorBlur}
                keyboardType="number-pad"
                maxLength={5}
                returnKeyType="done"
              />
            </View>
          )}
          <Text className="text-text-secondary text-sm mt-3">
            {normalized.calorieSafetyFloorMode === 'standard'
              ? t('calorieSettings.safetyFloor.standardDescription', { defaultValue: 'Uses the higher of your estimated RMR and the clinical minimum.' })
              : normalized.calorieSafetyFloorMode === 'custom'
                ? t('calorieSettings.safetyFloor.customDescription', { defaultValue: 'Replaces the standard floor with your chosen minimum. Health recommendations remain visible.' })
                : t('calorieSettings.safetyFloor.disabledDescription', { defaultValue: 'Stops automatic target clamping. Health warnings remain visible.' })}
          </Text>
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
              {t('calorieSettings.howThisWorks', { defaultValue: 'How this works' })}
            </Text>
          </View>

          <Animated.View className="items-center" layout={pipelineLayout}>
            {/* Step 1: Burned */}
            <Text className="text-base font-semibold text-text-primary">{t('calorieSettings.burnedCalories', { defaultValue: 'Burned Calories' })}</Text>
            <Animated.View
              key={`burned-${explanation.burned}`}
              layout={pipelineLayout}
            >
              <Text className="text-sm text-text-secondary">{explanation.burned}</Text>
            </Animated.View>

            <Text className="text-text-muted text-lg my-1">{'\u2193'}</Text>

            {/* Step 2: Net */}
            <Text className="text-base font-semibold text-text-primary">{t('calorieSettings.netEnergy', { defaultValue: 'Net Energy' })}</Text>
            <Animated.View
              key={`net-${explanation.net}`}
              layout={pipelineLayout}
            >
              <Text className="text-sm text-text-secondary">{explanation.net}</Text>
            </Animated.View>

            <Text className="text-text-muted text-lg my-1">{'\u2193'}</Text>

            {/* Step 3: Remaining */}
            <Text className="text-base font-semibold text-text-primary">{t('calorieSettings.remainingCalories', { defaultValue: 'Remaining Calories' })}</Text>
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

        {/* External BMR — use connected health app's resting energy / BMR */}
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-semibold text-text-primary flex-1 mr-3">
              {t('calorieSettings.useExternal', { defaultValue: 'Use {{metric}} from {{source}}', metric: bmrMetricName, source: healthSourceName })}
            </Text>
            <Switch
              onValueChange={handleExternalBmrToggle}
              value={normalized.useExternalBmr}
              accessibilityLabel={t('calorieSettings.useExternal', { defaultValue: 'Use {{metric}} from {{source}}', metric: bmrMetricName, source: healthSourceName })}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-3">
            {t('calorieSettings.externalDescription', { defaultValue: 'Uses {{source}} {{metric}} when available. Otherwise, the selected {{formula}}', source: healthSourceName, metric: bmrMetricName, formula: t('calorieSettings.externalFormula', { defaultValue: 'formula' }) })}
          </Text>
          {normalized.useExternalBmr && (
            <View className="mt-3">
              <HealthSourceLabel />
              {Platform.OS === 'ios' && (
                <Text className="text-text-secondary text-xs mt-3">
                  {t('calorieSettings.iosNote', { defaultValue: 'The synced value already includes light daily activity, so you may want to set' })}
                  {' '}{t('calorieSettings.iosNoteContinuation', { defaultValue: 'your Activity Level to None (×1.0) to avoid counting it twice.' })}
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default CalorieSettingsScreen;
