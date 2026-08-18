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

type DiarySettingsScreenProps = RootStackScreenProps<'DiarySettings'>;

const DIARY_VIEW_GROUP = 'diary';
const MOBILE_PLATFORM = 'mobile';
const MAX_DIARY_CUSTOM_NUTRIENTS = 4;

// Diary has no server-synthesized default row (unlike the Dashboard's
// summary/mobile row), so an unconfigured diary/mobile row simply means "no
// custom nutrients selected yet" — an empty list is the correct fallback.
const SERVER_DEFAULT_DIARY_NUTRIENTS: string[] = [];

const DiarySettingsScreen: React.FC<DiarySettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const diarySummaryVisible = useAppPreferencesStore((s) => s.diarySummaryVisible);
  const setDiarySummaryVisible = useAppPreferencesStore((s) => s.setDiarySummaryVisible);

  const queryClient = useQueryClient();
  const { isConnected } = useServerConnection();
  const { customNutrients, isLoading: isCustomLoading } = useCustomNutrients({ enabled: isConnected });
  const { preferences, isLoading: isPrefsLoading } = useNutrientDisplayPreferences({ enabled: isConnected });

  const isLoading = isConnected && (isCustomLoading || isPrefsLoading);

  const diaryRow = preferences.find(
    (p) => p.view_group === DIARY_VIEW_GROUP && p.platform === MOBILE_PLATFORM,
  );
  const base = diaryRow?.visible_nutrients ?? SERVER_DEFAULT_DIARY_NUTRIENTS;

  const mutation = useMutation({
    mutationFn: (visibleNutrients: string[]) =>
      updateNutrientDisplayPreference(DIARY_VIEW_GROUP, MOBILE_PLATFORM, visibleNutrients),
    onMutate: async (visibleNutrients) => {
      await queryClient.cancelQueries({ queryKey: nutrientDisplayPreferencesQueryKey });
      const previous = queryClient.getQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey,
      );
      queryClient.setQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey,
        (old = []) => {
          const idx = old.findIndex(
            (p) => p.view_group === DIARY_VIEW_GROUP && p.platform === MOBILE_PLATFORM,
          );
          if (idx >= 0) {
            return old.map((p, i) =>
              i === idx ? { ...p, visible_nutrients: visibleNutrients } : p,
            );
          }
          return [
            ...old,
            {
              view_group: DIARY_VIEW_GROUP,
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
      Toast.show({ type: 'error', text1: t('common.error', { defaultValue: 'Error' }), text2: t('diarySettings.updateFailed', { defaultValue: 'Failed to update setting.' }) });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: nutrientDisplayPreferencesQueryKey });
    },
  });

  const handleToggle = useCallback(
    (name: string, value: boolean) => {
      if (value && base.length >= MAX_DIARY_CUSTOM_NUTRIENTS) {
        Toast.show({
          type: 'info',
          text1: t('diarySettings.limitReached', { defaultValue: 'Limit reached' }),
          text2: t('diarySettings.limitDescription', { defaultValue: 'Up to {{count}} custom nutrients can be shown here.', count: MAX_DIARY_CUSTOM_NUTRIENTS }),
        });
        return;
      }
      mutation.mutate(toggleNutrientVisibility(base, name, value));
    },
    [base, mutation, t],
  );

  const renderContent = () => {
    if (isLoading) {
      return <StatusView inline loading />;
    }

    if (customNutrients.length === 0) {
      return (
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-2">
            {t('diarySettings.noCustomNutrients', { defaultValue: 'No custom nutrients' })}
          </Text>
          <Text className="text-text-secondary text-sm">
            {t('diarySettings.customNutrientsDescription', { defaultValue: 'Custom nutrients are created in the SparkyFitness web app. Once you add some, they will appear here so you can choose which show on your Diary.' })}
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

  const header = useScreenHeader({ title: t('diarySettings.title', { defaultValue: 'Diary Settings' }), left: { kind: 'back' } });

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
            title={t('diarySettings.summary', { defaultValue: 'Diary Summary' })}
            subtitle={t('diarySettings.summarySubtitle', { defaultValue: 'Show calories and macronutrients' })}
            rightAccessory={
              <Switch
                accessibilityLabel={t('diarySettings.summary', { defaultValue: 'Diary Summary' })}
                value={diarySummaryVisible}
                onValueChange={setDiarySummaryVisible}
              />
            }
          />
        </SettingsRowGroup>

        <Text className="text-base font-semibold text-text-primary mb-4">
          {t('diarySettings.customNutrientDisplay', { defaultValue: 'Custom Nutrient Display' })}
        </Text>

        {renderContent()}
      </ScrollView>
    </View>
  );
};

export default DiarySettingsScreen;
