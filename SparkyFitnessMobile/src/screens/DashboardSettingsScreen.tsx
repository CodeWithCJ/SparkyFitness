import React, { useCallback } from 'react';
import { Platform, View, Text, Switch, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useServerConnection, useCustomNutrients, useNutrientDisplayPreferences } from '../hooks';
import {
  updateNutrientDisplayPreference,
  type NutrientDisplayPreference,
} from '../services/api/preferencesApi';
import { nutrientDisplayPreferencesQueryKey } from '../hooks/queryKeys';
import { toggleNutrientVisibility } from '../utils/nutrientUtils';
import {
  useFastingCardVisible,
  setFastingCardVisible,
} from '../services/fastingCardVisibility';
import {
  useHydrationCardVisible,
  setHydrationCardVisible,
} from '../services/hydrationCardVisibility';
import {
  useAskSparkyVisible,
  setAskSparkyVisible,
} from '../services/askSparkyVisibility';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
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

const DashboardSettingsScreen: React.FC<DashboardSettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentPrimary, formEnabled, formDisabled] = useCSSVariable([
    '--color-accent-primary',
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string, string];
  const { backColor } = useHeaderActionColors();

  const fastingCardVisible = useFastingCardVisible();
  const hydrationCardVisible = useHydrationCardVisible();
  const askSparkyVisible = useAskSparkyVisible();

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
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update setting.' });
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
            No custom nutrients
          </Text>
          <Text className="text-text-secondary text-sm">
            Custom nutrients are created in the SparkyFitness web app. Once you add
            some, they will appear here so you can choose which show on your Dashboard.
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

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'ios' ? undefined : { paddingTop: insets.top }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : 'never'}
      >
        {Platform.OS !== 'ios' && (
          <View className="flex-row items-center mb-4">
            <Button
              variant="ghost"
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="py-0 px-0 mr-2"
            >
              <Icon name="chevron-back" size={22} color={backColor} />
            </Button>
            <Text className="text-2xl font-bold text-text-primary">Dashboard Settings</Text>
          </View>
        )}

        <SettingsRowGroup>
          <SettingsRow
            title="Ask Sparky"
            subtitle="Show the Ask Sparky chat launcher on the Dashboard"
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
            title="Hydration"
            subtitle="Show the hydration card on the Dashboard"
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
            title="Fasting"
            subtitle="Show the fasting card on the Dashboard"
            rightAccessory={
              <Switch
                value={fastingCardVisible}
                onValueChange={setFastingCardVisible}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            }
          />

        </SettingsRowGroup>

        <Text className="text-base font-semibold text-text-primary mb-4">
          Custom Nutrient Display
        </Text>

        {renderContent()}
      </ScrollView>
    </View>
  );
};

export default DashboardSettingsScreen;