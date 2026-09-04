import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Switch from '../components/ui/Switch';
import {
  useServerConnection,
  useCustomNutrients,
  useNutrientDisplayPreferences,
} from '../hooks';
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
  const usesNativeHeader = useNativeIOSHeadersActive();

  const fastingCardVisible = useAppPreferencesStore(
    (s) => s.fastingCardVisible
  );
  const setFastingCardVisible = useAppPreferencesStore(
    (s) => s.setFastingCardVisible
  );
  const cycleCardVisible = useAppPreferencesStore((s) => s.cycleCardVisible);
  const setCycleCardVisible = useAppPreferencesStore(
    (s) => s.setCycleCardVisible
  );
  const hydrationCardVisible = useAppPreferencesStore(
    (s) => s.hydrationCardVisible
  );
  const setHydrationCardVisible = useAppPreferencesStore(
    (s) => s.setHydrationCardVisible
  );
  const askSparkyVisible = useAppPreferencesStore((s) => s.askSparkyVisible);
  const setAskSparkyVisible = useAppPreferencesStore(
    (s) => s.setAskSparkyVisible
  );
  const medicationsCardVisible = useAppPreferencesStore(
    (s) => s.medicationsCardVisible
  );
  const progressPhotosCardVisible = useAppPreferencesStore(
    (s) => s.progressPhotosCardVisible
  );
  const setProgressPhotosCardVisible = useAppPreferencesStore(
    (s) => s.setProgressPhotosCardVisible
  );
  const setMedicationsCardVisible = useAppPreferencesStore(
    (s) => s.setMedicationsCardVisible
  );

  const queryClient = useQueryClient();
  const { isConnected } = useServerConnection();
  const { customNutrients, isLoading: isCustomLoading } = useCustomNutrients({
    enabled: isConnected,
  });
  const { preferences, isLoading: isPrefsLoading } =
    useNutrientDisplayPreferences({ enabled: isConnected });

  const isLoading = isConnected && (isCustomLoading || isPrefsLoading);

  // Base array is the raw summary/mobile row (NOT the summaryNutrients getter,
  // which strips 'calories' — using it as the merge base would silently drop
  // calories from the stored row on every PUT). The server guarantees this row
  // exists once preferences resolve; the default is defensive only.
  const summaryRow = preferences.find(
    (p) => p.view_group === SUMMARY_VIEW_GROUP && p.platform === MOBILE_PLATFORM
  );
  const base =
    summaryRow?.visible_nutrients ?? SERVER_DEFAULT_SUMMARY_NUTRIENTS;

  const mutation = useMutation({
    mutationFn: (visibleNutrients: string[]) =>
      updateNutrientDisplayPreference(
        SUMMARY_VIEW_GROUP,
        MOBILE_PLATFORM,
        visibleNutrients
      ),
    onMutate: async (visibleNutrients) => {
      await queryClient.cancelQueries({
        queryKey: nutrientDisplayPreferencesQueryKey,
      });
      const previous = queryClient.getQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey
      );
      queryClient.setQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey,
        (old = []) => {
          const idx = old.findIndex(
            (p) =>
              p.view_group === SUMMARY_VIEW_GROUP &&
              p.platform === MOBILE_PLATFORM
          );
          if (idx >= 0) {
            return old.map((p, i) =>
              i === idx ? { ...p, visible_nutrients: visibleNutrients } : p
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
        }
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          nutrientDisplayPreferencesQueryKey,
          context.previous
        );
      }
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('dashboardSettings.updateFailed', {
          defaultValue: 'Failed to update setting.',
        }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: nutrientDisplayPreferencesQueryKey,
      });
    },
  });

  const handleToggle = useCallback(
    (name: string, value: boolean) => {
      mutation.mutate(toggleNutrientVisibility(base, name, value));
    },
    [base, mutation]
  );

  const renderContent = () => {
    if (isLoading) {
      return <StatusView inline loading />;
    }

    if (customNutrients.length === 0) {
      return (
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-2">
            {t('dashboardSettings.noCustomNutrients', {
              defaultValue: 'No custom nutrients',
            })}
          </Text>
          <Text className="text-text-secondary text-sm">
            {t('dashboardSettings.customNutrientsDescription', {
              defaultValue:
                'Custom nutrients are created in the SparkyFitness web app. Once you add some, they will appear here so you can choose which show on your Dashboard.',
            })}
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
                accessibilityLabel={cn.name}
                value={base.includes(cn.name)}
                onValueChange={(value) => handleToggle(cn.name, value)}
              />
            }
          />
        ))}
      </SettingsRowGroup>
    );
  };

  const header = useScreenHeader({
    title: t('dashboardSettings.title', { defaultValue: 'Dashboard Settings' }),
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
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <SettingsRowGroup>
          <SettingsRow
            title={t('dashboardSettings.askSparky', {
              defaultValue: 'Ask Sparky',
            })}
            subtitle={t('dashboardSettings.askSparkySubtitle', {
              defaultValue:
                'Show the Ask Sparky chat launcher on the Dashboard',
            })}
            rightAccessory={
              <Switch
                accessibilityLabel={t('dashboardSettings.askSparky', {
                  defaultValue: 'Ask Sparky',
                })}
                value={askSparkyVisible}
                onValueChange={setAskSparkyVisible}
              />
            }
          />
          <SettingsRow
            title={t('dashboardSettings.hydration', {
              defaultValue: 'Hydration',
            })}
            subtitle={t('dashboardSettings.hydrationSubtitle', {
              defaultValue: 'Show the hydration card on the Dashboard',
            })}
            rightAccessory={
              <Switch
                accessibilityLabel={t('dashboardSettings.hydration', {
                  defaultValue: 'Hydration',
                })}
                value={hydrationCardVisible}
                onValueChange={setHydrationCardVisible}
              />
            }
          />
          <SettingsRow
            title={t('dashboardSettings.fasting', { defaultValue: 'Fasting' })}
            subtitle={t('dashboardSettings.fastingSubtitle', {
              defaultValue: 'Show the fasting card on the Dashboard',
            })}
            rightAccessory={
              <Switch
                accessibilityLabel={t('dashboardSettings.fasting', {
                  defaultValue: 'Fasting',
                })}
                value={fastingCardVisible}
                onValueChange={setFastingCardVisible}
              />
            }
          />
          <SettingsRow
            title={t('dashboardSettings.cyclePregnancy', {
              defaultValue: 'Cycle & Pregnancy',
            })}
            subtitle={t('dashboardSettings.cyclePregnancySubtitle', {
              defaultValue: 'Show the wellness card on the Dashboard',
            })}
            rightAccessory={
              <Switch
                accessibilityLabel={t('dashboardSettings.cyclePregnancy', {
                  defaultValue: 'Cycle & Pregnancy',
                })}
                value={cycleCardVisible}
                onValueChange={setCycleCardVisible}
              />
            }
          />
          <SettingsRow
            title={t('dashboardSettings.medications', {
              defaultValue: 'Medications',
            })}
            subtitle={t('dashboardSettings.medicationsSubtitle', {
              defaultValue: 'Show the medications card on the Dashboard',
            })}
            rightAccessory={
              <Switch
                accessibilityLabel={t('dashboardSettings.medications', {
                  defaultValue: 'Medications',
                })}
                value={medicationsCardVisible}
                onValueChange={setMedicationsCardVisible}
              />
            }
          />
          <SettingsRow
            title={t('dashboardSettings.progressPhotos', {
              defaultValue: 'Progress Photos',
            })}
            subtitle={t('dashboardSettings.progressPhotosSubtitle', {
              defaultValue: 'Show the progress photos card on the Dashboard',
            })}
            rightAccessory={
              <Switch
                accessibilityLabel={t('dashboardSettings.progressPhotos', {
                  defaultValue: 'Progress Photos',
                })}
                value={progressPhotosCardVisible}
                onValueChange={setProgressPhotosCardVisible}
              />
            }
          />
        </SettingsRowGroup>

        <Text className="text-base font-semibold text-text-primary mb-4">
          {t('dashboardSettings.customNutrientDisplay', {
            defaultValue: 'Custom Nutrient Display',
          })}
        </Text>

        {renderContent()}
      </ScrollView>
    </View>
  );
};

export default DashboardSettingsScreen;
