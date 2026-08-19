import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import BottomSheetPicker from '../components/BottomSheetPicker';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Switch from '../components/ui/Switch';
import { usePreferences } from '../hooks/usePreferences';
import { useExternalProviders } from '../hooks/useExternalProviders';
import { updatePreferences } from '../services/api/preferencesApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { preferencesQueryKey } from '../hooks/queryKeys';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import type { UserPreferences } from '../types/preferences';
import type { RootStackScreenProps } from '../types/navigation';

type FoodSettingsScreenProps = RootStackScreenProps<'FoodSettings'>;

const FoodSettingsScreen: React.FC<FoodSettingsScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const { providers } = useExternalProviders();
  const { providers: barcodeProviders } = useExternalProviders({
    supportsBarcode: true,
  });

  const providerOptions = useMemo(
    () => providers.map(p => ({ label: p.provider_name, value: p.id })),
    [providers],
  );

  const barcodeProviderOptions = useMemo(
    () => barcodeProviders.map(p => ({ label: p.provider_name, value: p.id })),
    [barcodeProviders],
  );

  const barcodeProviderId = preferences?.default_barcode_provider_id ?? '';
  const foodDataProviderId = preferences?.default_food_data_provider_id ?? '';
  const autoScale = preferences?.auto_scale_open_food_facts_imports ?? true;
  const barcodeFallback = preferences?.barcode_fallback_open_food_facts ?? true;
  const showNetCarbs = preferences?.show_net_carbs ?? false;

  const mutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => updatePreferences(data),
    onMutate: async data => {
      await queryClient.cancelQueries({ queryKey: preferencesQueryKey });
      const previous =
        queryClient.getQueryData<UserPreferences>(preferencesQueryKey);
      queryClient.setQueryData<UserPreferences>(preferencesQueryKey, old =>
        old ? { ...old, ...data } : (data as UserPreferences),
      );
      return { previous };
    },
    onError: (_err, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData(preferencesQueryKey, context.previous);
      }
      Toast.show({
        type: 'error',
        text1: t('foodSettings.errors.error', { defaultValue: 'Error' }),
        text2: t('foodSettings.errors.updateFailed', { defaultValue: 'Failed to update setting.' }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
    },
  });

  const handleBarcodeProviderChange = useCallback(
    (value: string) => mutation.mutate({ default_barcode_provider_id: value }),
    [mutation],
  );

  const handleFoodProviderChange = useCallback(
    (value: string) =>
      mutation.mutate({ default_food_data_provider_id: value }),
    [mutation],
  );

  const handleAutoScaleToggle = useCallback(
    (value: boolean) =>
      mutation.mutate({ auto_scale_open_food_facts_imports: value }),
    [mutation],
  );

  const handleBarcodeFallbackToggle = useCallback(
    (value: boolean) =>
      mutation.mutate({ barcode_fallback_open_food_facts: value }),
    [mutation],
  );

  const handleShowNetCarbsToggle = useCallback(
    (value: boolean) => mutation.mutate({ show_net_carbs: value }),
    [mutation],
  );

  const header = useScreenHeader({
    title: t('foodSettings.title', { defaultValue: 'Food Settings' }),
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
        {/* Meal Types */}
        <SettingsRowGroup>
          <SettingsRow
            icon="meal"
            title={t('foodSettings.mealTypes.title', { defaultValue: 'Meal Types' })}
            subtitle={t('foodSettings.mealTypes.subtitle', { defaultValue: 'Add, edit, reorder, or delete custom meal categories' })}
            onPress={() => navigation.navigate('MealTypeSettings')}
          />
        </SettingsRowGroup>

        {/* {t('foodSettings.netCarbs.title', { defaultValue: 'Show Net Carbs' })} */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-semibold text-text-primary flex-shrink">
              {t('foodSettings.netCarbs.title', { defaultValue: 'Show Net Carbs' })}
            </Text>
            <Switch
              onValueChange={handleShowNetCarbsToggle}
              value={showNetCarbs}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-4">
            {t('foodSettings.netCarbs.description', { defaultValue: 'When enabled, carbohydrate summaries display net carbs (total carbs − fiber), and a Total Carbs row is added in nutrient breakdowns.' })}
          </Text>
        </View>

        {/* Default Online Search Provider */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">
              {t('foodSettings.foodSource.title', { defaultValue: 'Default Food Source' })}
            </Text>
            <BottomSheetPicker
              value={foodDataProviderId}
              options={providerOptions}
              onSelect={handleFoodProviderChange}
              title={t('foodSettings.foodSource.pickerTitle', { defaultValue: 'Search Provider' })}
              placeholder={t('foodSettings.foodSource.firstAvailable', { defaultValue: 'First available' })}
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-4">
            {t('foodSettings.foodSource.description', { defaultValue: 'Used when searching for foods by name.' })}
          </Text>
        </View>

        {/* Auto-Scale OpenFoodFacts */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-semibold text-text-primary flex-shrink">
              {t('foodSettings.openFacts.title', { defaultValue: 'Adjust Open Food Facts Values' })}
            </Text>
            <Switch
              onValueChange={handleAutoScaleToggle}
              value={autoScale}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-4">
            {t('foodSettings.openFacts.description', { defaultValue: 'Open Food Facts uses values per 100g. This converts them to the product’s serving size.' })}
          </Text>
        </View>

        {/* {t('foodSettings.barcode.title', { defaultValue: 'Barcode Scanning' })} */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-3">
            {t('foodSettings.barcode.title', { defaultValue: 'Barcode Scanning' })}
          </Text>

          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-text-primary">{t('foodSettings.barcode.provider', { defaultValue: 'Provider' })}</Text>
            <BottomSheetPicker
              value={barcodeProviderId}
              options={barcodeProviderOptions}
              onSelect={handleBarcodeProviderChange}
              title={t('foodSettings.barcode.pickerTitle', { defaultValue: 'Barcode Provider' })}
              placeholder={t('foodSettings.barcode.default', { defaultValue: 'Default' })}
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>

          <View className="flex-row justify-between items-center mt-4">
            <Text className="text-sm text-text-primary flex-shrink">
              {t('foodSettings.barcode.retryTitle', { defaultValue: 'Retry with Open Food Facts' })}
            </Text>
            <Switch
              onValueChange={handleBarcodeFallbackToggle}
              value={barcodeFallback}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            {t('foodSettings.barcode.retryDescription', { defaultValue: 'If no result is found, try Open Food Facts automatically.' })}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default FoodSettingsScreen;
