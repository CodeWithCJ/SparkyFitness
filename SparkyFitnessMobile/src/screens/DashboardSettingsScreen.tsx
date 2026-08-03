import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Switch, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useServerConnection, useCustomNutrients, useNutrientDisplayPreferences } from '../hooks';
import {
  updateNutrientDisplayPreference,
  type NutrientDisplayPreference,
} from '../services/api/preferencesApi';
import { nutrientDisplayPreferencesQueryKey } from '../hooks/queryKeys';
import { toggleNutrientVisibility } from '../utils/nutrientUtils';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

type DashboardSettingsScreenProps = RootStackScreenProps<'DashboardSettings'>;

const SUMMARY_VIEW_GROUP = 'summary';
const MOBILE_PLATFORM = 'mobile';

// Matches what the server synthesizes for the summary/mobile row when the user
// has never customized it. Only used defensively if the row is somehow absent
// after the preferences query has resolved — the real row is the merge base.
const SERVER_DEFAULT_SUMMARY_NUTRIENTS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
];

const DashboardSettingsScreen: React.FC<DashboardSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentPrimary, formEnabled, formDisabled] = useCSSVariable([
    '--color-accent-primary',
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string, string];
  const usesNativeHeader = useNativeIOSHeadersActive();

  const fastingCardVisible = useAppPreferencesStore((s) => s.fastingCardVisible);
  const setFastingCardVisible = useAppPreferencesStore((s) => s.setFastingCardVisible);
  const cycleCardVisible = useAppPreferencesStore((s) => s.cycleCardVisible);
  const setCycleCardVisible = useAppPreferencesStore((s) => s.setCycleCardVisible);
  const hydrationCardVisible = useAppPreferencesStore((s) => s.hydrationCardVisible);
  const setHydrationCardVisible = useAppPreferencesStore((s) => s.setHydrationCardVisible);
  const askSparkyVisible = useAppPreferencesStore((s) => s.askSparkyVisible);
  const setAskSparkyVisible = useAppPreferencesStore((s) => s.setAskSparkyVisible);
  const medicationsCardVisible = useAppPreferencesStore((s) => s.medicationsCardVisible);
  const setMedicationsCardVisible = useAppPreferencesStore((s) => s.setMedicationsCardVisible);

  const queryClient = useQueryClient();
  const { isConnected } = useServerConnection();
  const { customNutrients, isLoading: isCustomLoading } = useCustomNutrients({ enabled: isConnected });
  const { preferences, isLoading: isPrefsLoading } = useNutrientDisplayPreferences({ enabled: isConnected });

  const isLoading = isConnected && (isCustomLoading || isPrefsLoading);

  // Base array is the raw summary/mobile row (NOT the summaryNutrients getter,
  // which strips 'calories' — using it as the merge base would silently drop
  // calories from the stored row on every PUT). The server guarantees this row
  // exists once preferences resolve; the default is defensive only.
  const summaryRow = preferences.find(
    (p) => p.view_group === SUMMARY_VIEW_GROUP && p.platform === MOBILE_PLATFORM,
  );
  const base = summaryRow?.visible_nutrients ?? SERVER_DEFAULT_SUMMARY_NUTRIENTS;

  const mutation = useMutation({
    mutationFn: (visibleNutrients: string[]) =>
      updateNutrientDisplayPreference(SUMMARY_VIEW_GROUP, MOBILE_PLATFORM, visibleNutrients),
    onMutate: async (visibleNutrients) => {
      await queryClient.cancelQueries({ queryKey: nutrientDisplayPreferencesQueryKey });
      const previous = queryClient.getQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey,
      );
      queryClient.setQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey,
        (old = []) => {
          const idx = old.findIndex(
            (p) => p.view_group === SUMMARY_VIEW_GROUP && p.platform === MOBILE_PLATFORM,
          );
          if (idx >= 0) {
            return old.map((p, i) =>
              i === idx ? { ...p, visible_nutrients: visibleNutrients } : p,
            );
          }
          return [
            ...old,
            {
              view_group: SUMMARY_VIEW_GROUP,
              platform: MOBILE_PLATFORM,
              visible_nutrients: visibleNutrients,
            },
          ];
        },
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(nutrientDisplayPreferencesQueryKey, context.previous);
      }
      Toast.show({ type: 'error', text1: t('common.error'), text2: t('foodMeals.failedToUpdateSetting') });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: nutrientDisplayPreferencesQueryKey });
    },
  });

  const handleToggle = useCallback(
    (name: string, value: boolean) => {
      mutation.mutate(toggleNutrientVisibility(base, name, value));
    },
    [base, mutation],
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <View className="items-center justify-center py-12">
          <ActivityIndicator size="large" color={accentPrimary} />
        </View>
      );
    }

    if (customNutrients.length === 0) {
      return (
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-2">
            {copy('none')}
          </Text>
          <Text className="text-text-secondary text-sm">
            {copy('noneDescription')}
          </Text>
        </View>
      );
    }

    return (
      <SettingsRowGroup>
        {customNutrients.map((cn) => (
          <SettingsRow
            key={cn.id}
            title={cn.name}
            subtitle={cn.unit}
            rightAccessory={
              <Switch
                value={base.includes(cn.name)}
                onValueChange={(value) => handleToggle(cn.name, value)}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            }
          />
        ))}
      </SettingsRowGroup>
    );
  };

  const copy = (key: string) => {
    switch (key) {
      case 'title': return t('screenCopy.dashboardSettings.title', { defaultValue: 'Dashboard Settings' });
      case 'ask': return t('screenCopy.dashboardSettings.ask', { defaultValue: 'Ask Sparky' });
      case 'askDescription': return t('screenCopy.dashboardSettings.askDescription', { defaultValue: 'Show the Ask Sparky chat launcher on the Dashboard' });
      case 'hydration': return t('screenCopy.dashboardSettings.hydration', { defaultValue: 'Hydration' });
      case 'hydrationDescription': return t('screenCopy.dashboardSettings.hydrationDescription', { defaultValue: 'Show the hydration card on the Dashboard' });
      case 'fasting': return t('screenCopy.dashboardSettings.fasting', { defaultValue: 'Fasting' });
      case 'fastingDescription': return t('screenCopy.dashboardSettings.fastingDescription', { defaultValue: 'Show the fasting card on the Dashboard' });
      case 'cycle': return t('screenCopy.dashboardSettings.cycle', { defaultValue: 'Cycle & Pregnancy' });
      case 'cycleDescription': return t('screenCopy.dashboardSettings.cycleDescription', { defaultValue: 'Show the wellness card on the Dashboard' });
      case 'medications': return t('screenCopy.dashboardSettings.medications', { defaultValue: 'Medications' });
      case 'medicationsDescription': return t('screenCopy.dashboardSettings.medicationsDescription', { defaultValue: 'Show the medications card on the Dashboard' });
      case 'customTitle': return t('screenCopy.dashboardSettings.customTitle', { defaultValue: 'Custom Nutrient Display' });
      case 'none': return t('screenCopy.dashboardSettings.none', { defaultValue: 'No custom nutrients' });
      case 'noneDescription': return t('screenCopy.dashboardSettings.noneDescription', { defaultValue: 'Custom nutrients are created in the SparkyFitness web app. Once you add some, they will appear here so you can choose which show on your Dashboard.' });
      default: return key;
    }
  };
  const header = useScreenHeader({ title: copy('title'), left: { kind: 'back' } });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        <SettingsRowGroup>
          <SettingsRow
             title={copy('ask')}
             subtitle={copy('askDescription')}
            rightAccessory={
              <Switch
                value={askSparkyVisible}
                onValueChange={setAskSparkyVisible}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            }
          />          
          <SettingsRow
             title={copy('hydration')}
             subtitle={copy('hydrationDescription')}
            rightAccessory={
              <Switch
                value={hydrationCardVisible}
                onValueChange={setHydrationCardVisible}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <SettingsRow
             title={copy('fasting')}
             subtitle={copy('fastingDescription')}
            rightAccessory={
              <Switch
                value={fastingCardVisible}
                onValueChange={setFastingCardVisible}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <SettingsRow
             title={copy('cycle')}
             subtitle={copy('cycleDescription')}
            rightAccessory={
              <Switch
                value={cycleCardVisible}
                onValueChange={setCycleCardVisible}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <SettingsRow
             title={copy('medications')}
             subtitle={copy('medicationsDescription')}
            rightAccessory={
              <Switch
                value={medicationsCardVisible}
                onValueChange={setMedicationsCardVisible}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            }
          />

        </SettingsRowGroup>

        <Text className="text-base font-semibold text-text-primary mb-4">
           {copy('customTitle')}
        </Text>

        {renderContent()}
      </ScrollView>
    </View>
  );
};

export default DashboardSettingsScreen;
