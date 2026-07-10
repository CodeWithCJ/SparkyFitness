import React, { useCallback } from 'react';
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
import { localizeServingUnit, mobileT } from '../localization';

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
  const hydrationCardVisible = useAppPreferencesStore((s) => s.hydrationCardVisible);
  const setHydrationCardVisible = useAppPreferencesStore((s) => s.setHydrationCardVisible);
  const askSparkyVisible = useAppPreferencesStore((s) => s.askSparkyVisible);
  const setAskSparkyVisible = useAppPreferencesStore((s) => s.setAskSparkyVisible);

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
      Toast.show({
        type: 'error',
        text1: mobileT('common.error'),
        text2: mobileT('dashboardSettings.updateFailed'),
      });
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

    if (!isConnected || customNutrients.length === 0) {
      return (
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-2">
            {isConnected
              ? mobileT('dashboardSettings.noCustomNutrients')
              : mobileT('dashboardSettings.noServerTitle')}
          </Text>
          <Text className="text-text-secondary text-sm">
            {isConnected
              ? mobileT('dashboardSettings.noCustomNutrientsDescription')
              : mobileT('dashboardSettings.noServerDescription')}
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
            subtitle={localizeServingUnit(cn.unit)}
            rightAccessory={
              <Switch
                value={base.includes(cn.name)}
                onValueChange={(value) => handleToggle(cn.name, value)}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
                accessibilityLabel={mobileT(
                  'dashboardSettings.showCustomNutrient',
                  { nutrient: cn.name },
                )}
              />
            }
          />
        ))}
      </SettingsRowGroup>
    );
  };

  const header = useScreenHeader({
    title: mobileT('screens.dashboardSettings'),
    left: { kind: 'back' },
  });

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
            title={mobileT('dashboardSettings.askSparky')}
            subtitle={mobileT('dashboardSettings.askSparkyDescription')}
            rightAccessory={
              <Switch
                value={askSparkyVisible}
                onValueChange={setAskSparkyVisible}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
                accessibilityLabel={mobileT('dashboardSettings.askSparky')}
              />
            }
          />
          <SettingsRow
            title={mobileT('dashboardSettings.hydration')}
            subtitle={mobileT('dashboardSettings.hydrationDescription')}
            rightAccessory={
              <Switch
                value={hydrationCardVisible}
                onValueChange={setHydrationCardVisible}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
                accessibilityLabel={mobileT('dashboardSettings.hydration')}
              />
            }
          />
          <SettingsRow
            title={mobileT('dashboardSettings.fasting')}
            subtitle={mobileT('dashboardSettings.fastingDescription')}
            rightAccessory={
              <Switch
                value={fastingCardVisible}
                onValueChange={setFastingCardVisible}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
                accessibilityLabel={mobileT('dashboardSettings.fasting')}
              />
            }
          />

        </SettingsRowGroup>

        <Text className="text-base font-semibold text-text-primary mb-4">
          {mobileT('dashboardSettings.customNutrients')}
        </Text>

        {renderContent()}
      </ScrollView>
    </View>
  );
};

export default DashboardSettingsScreen;
