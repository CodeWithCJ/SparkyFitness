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
import HealthSourceLabel, { healthSourceName } from '../components/HealthSourceLabel';
import Switch from '../components/ui/Switch';
import { usePreferences } from '../hooks/usePreferences';
import { updatePreferences } from '../services/api/preferencesApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { preferencesQueryKey } from '../hooks/queryKeys';
import type { UserPreferences } from '../types/preferences';
import type { RootStackScreenProps } from '../types/navigation';

type CalorieSettingsScreenProps = RootStackScreenProps<'CalorieSettings'>;

// Apple Health and Health Connect use different terms for the same baseline-energy value.
const bmrMetricName = Platform.OS === 'ios' ? 'Resting Energy' : 'BMR';

function normalizePreferences(prefs: UserPreferences | undefined) {
  const raw = prefs?.calorie_goal_adjustment_mode;
  return {
    mode: !raw ? 'dynamic' : raw === 'smart' ? 'tdee' : raw,
    activityLevel: prefs?.activity_level ?? 'not_much',
    exerciseCaloriePercentage: prefs?.exercise_calorie_percentage ?? 100,
    includeBmrInNetCalories: prefs?.include_bmr_in_net_calories ?? false,
    tdeeAllowNegativeAdjustment: prefs?.tdee_allow_negative_adjustment ?? false,
    useExternalBmr: prefs?.use_external_bmr ?? false,
  };
}

const CalorieSettingsScreen: React.FC<CalorieSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const copy = useCallback((key: string, options?: Record<string, string | number>) => {
    switch (key) {
      case 'title': return t('screenCopy.calorie.title', options);
      case 'mode': return t('screenCopy.calorie.mode', options);
      case 'adjustmentMode': return t('screenCopy.calorie.adjustmentMode', options);
      case 'modeDescription': return t('screenCopy.calorie.modeDescription', options);
      case 'exerciseApplied': return t('screenCopy.calorie.exerciseApplied', options);
      case 'exerciseDescription': return t('screenCopy.calorie.exerciseDescription', options);
      case 'activityLevel': return t('screenCopy.calorie.activityLevel', options);
      case 'baseline': return t('screenCopy.calorie.baseline', options);
      case 'fallback': return t('screenCopy.calorie.fallback', options);
      case 'negative': return t('screenCopy.calorie.negative', options);
      case 'negativeDescription': return t('screenCopy.calorie.negativeDescription', options);
      case 'resting': return t('screenCopy.calorie.resting', options);
      case 'restingDescription': return t('screenCopy.calorie.restingDescription', options);
      case 'howWorks': return t('screenCopy.calorie.howWorks', options);
      case 'burned': return t('screenCopy.calorie.burned', options);
      case 'activityBmr': return t('screenCopy.calorie.activityBmr', options);
      case 'activityOnly': return t('screenCopy.calorie.activityOnly', options);
      case 'net': return t('screenCopy.calorie.net', options);
      case 'netFormula': return t('screenCopy.calorie.netFormula', options);
      case 'remaining': return t('screenCopy.calorie.remaining', options);
      case 'goalNet': return t('screenCopy.calorie.goalNet', options);
      case 'goalGrows': return t('screenCopy.calorie.goalGrows', options);
      case 'percentageBmrFormula': return t('screenCopy.calorie.percentageBmrFormula', options);
      case 'percentageFormula': return t('screenCopy.calorie.percentageFormula', options);
      case 'projectionFormula': return t('screenCopy.calorie.projectionFormula', options);
      case 'projectionNote': return t('screenCopy.calorie.projectionNote', options);
      case 'adaptiveFormula': return t('screenCopy.calorie.adaptiveFormula', options);
      case 'adaptiveNote': return t('screenCopy.calorie.adaptiveNote', options);
      case 'fixedNote': return t('screenCopy.calorie.fixedNote', options);
      case 'external': return t('screenCopy.calorie.external', options);
      case 'externalDescription': return t('screenCopy.calorie.externalDescription', options);
      case 'externalIosNote': return t('screenCopy.calorie.externalIosNote', options);
      default: return '';
    }
  }, [t]);
  const modeOptions = useMemo(() => [
    { label: t('calorieModes.adaptive'), value: 'adaptive' },
    { label: t('calorieModes.dynamic'), value: 'dynamic' },
    { label: t('calorieModes.fixed'), value: 'fixed' },
    { label: t('calorieModes.percentage'), value: 'percentage' },
    { label: t('calorieModes.tdee'), value: 'tdee' },
  ], [t]);
  const activityLevelOptions = useMemo(() => [
    { label: t('activityLevels.none'), value: 'none' },
    { label: t('activityLevels.not_much'), value: 'not_much' },
    { label: t('activityLevels.light'), value: 'light' },
    { label: t('activityLevels.moderate'), value: 'moderate' },
    { label: t('activityLevels.heavy'), value: 'heavy' },
  ], [t]);
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
       Toast.show({ type: 'error', text1: t('common.error'), text2: t('foodMeals.failedToUpdateSetting') });
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

     const burned = bmr ? copy('activityBmr') : copy('activityOnly');

     const net = copy('netFormula');

    let remainingFormula: string;
    let remainingNote: string | null;
    switch (mode) {
      case 'dynamic':
         remainingFormula = copy('goalNet');
         remainingNote = copy('goalGrows');
        break;
      case 'percentage':
        remainingFormula = bmr
           ? copy('percentageBmrFormula', { pct })
           : copy('percentageFormula', { pct });
        remainingNote = null;
        break;
      case 'tdee':
         remainingFormula = copy('projectionFormula');
         remainingNote = copy('projectionNote');
        break;
      case 'adaptive':
         remainingFormula = copy('adaptiveFormula');
         remainingNote = copy('adaptiveNote');
        break;
      default:
         remainingFormula = copy('adaptiveFormula');
         remainingNote = copy('fixedNote');
        break;
    }

    return { burned, net, remainingFormula, remainingNote };
  }, [normalized.mode, normalized.includeBmrInNetCalories, normalized.exerciseCaloriePercentage, copy]);

  const header = useScreenHeader({ title: copy('title'), left: { kind: 'back' } });

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
            <Text className="text-base font-semibold text-text-primary">{copy('mode')}</Text>
            <BottomSheetPicker
              value={normalized.mode}
                options={modeOptions}
              onSelect={handleModeChange}
              title={copy('adjustmentMode')}
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-3">
            {copy('modeDescription')}
          </Text>
        </View>

        {/* Options */}
        <Animated.View className="bg-surface rounded-xl p-4 mb-4 shadow-sm" layout={optionsLayout}>
          {/* Percentage Input */}
          {showPercentage && (
            <Animated.View layout={optionsLayout}>
              <Text className="text-base font-semibold text-text-primary mb-2">
                {copy('exerciseApplied')}
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
                {copy('exerciseDescription')}
              </Text>
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* Activity Level */}
          {showActivityLevel && (
            <Animated.View layout={optionsLayout}>
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-text-primary">{copy('activityLevel')}</Text>
                <BottomSheetPicker
                  value={normalized.activityLevel}
                    options={activityLevelOptions}
                  onSelect={handleActivityLevelChange}
                  title={copy('activityLevel')}
                  containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
                />
              </View>
              <Text className="text-text-secondary text-sm mt-1">
                {copy('baseline')}
              </Text>
              {normalized.mode === 'adaptive' && (
                <Text className="text-text-secondary text-sm mt-3">
                  {copy('fallback')}
                </Text>
              )}
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* Negative Adjustment Toggle */}
          {showNegativeAdjustment && (
            <Animated.View layout={optionsLayout}>
              <View className="flex-row justify-between items-center">
                <Text className="text-base font-semibold text-text-primary">{copy('negative')}</Text>
                <Switch
                  onValueChange={handleNegativeAdjustmentToggle}
                  value={normalized.tdeeAllowNegativeAdjustment}
                />
              </View>
              <Text className="text-text-secondary text-sm mt-3">
                {copy('negativeDescription')}
              </Text>
              <View className="border-t border-border-subtle my-3" />
            </Animated.View>
          )}

          {/* BMR Toggle */}
          <Animated.View layout={optionsLayout}>
            <View className="flex-row justify-between items-center">
              <Text className="text-base font-semibold text-text-primary">{copy('resting')}</Text>
              <Switch
                onValueChange={handleBmrToggle}
                value={normalized.includeBmrInNetCalories}
              />
            </View>
            <Text className="text-text-secondary text-sm mt-3">
              {copy('restingDescription')}
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
              {copy('howWorks')}
            </Text>
          </View>

          <Animated.View className="items-center" layout={pipelineLayout}>
            {/* Step 1: Burned */}
            <Text className="text-base font-semibold text-text-primary">{copy('burned')}</Text>
            <Animated.View
              key={`burned-${explanation.burned}`}
              layout={pipelineLayout}
            >
              <Text className="text-sm text-text-secondary">{explanation.burned}</Text>
            </Animated.View>

            <Text className="text-text-muted text-lg my-1">{'\u2193'}</Text>

            {/* Step 2: Net */}
            <Text className="text-base font-semibold text-text-primary">{copy('net')}</Text>
            <Animated.View
              key={`net-${explanation.net}`}
              layout={pipelineLayout}
            >
              <Text className="text-sm text-text-secondary">{explanation.net}</Text>
            </Animated.View>

            <Text className="text-text-muted text-lg my-1">{'\u2193'}</Text>

            {/* Step 3: Remaining */}
            <Text className="text-base font-semibold text-text-primary">{copy('remaining')}</Text>
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
              {copy('external', { metric: bmrMetricName, source: healthSourceName })}
            </Text>
            <Switch
              onValueChange={handleExternalBmrToggle}
              value={normalized.useExternalBmr}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-3">
            {copy('externalDescription', { metric: bmrMetricName, source: healthSourceName })}
          </Text>
          {normalized.useExternalBmr && (
            <View className="mt-3">
              <HealthSourceLabel />
              {Platform.OS === 'ios' && (
                <Text className="text-text-secondary text-xs mt-3">
                  {copy('externalIosNote')}
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
