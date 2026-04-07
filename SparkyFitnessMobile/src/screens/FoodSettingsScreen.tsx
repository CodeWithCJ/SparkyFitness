import React, { useCallback, useMemo } from 'react';
import { View, Text, Switch, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import { usePreferences } from '../hooks/usePreferences';
import { useExternalProviders } from '../hooks/useExternalProviders';
import { updatePreferences } from '../services/api/preferencesApi';
import { preferencesQueryKey } from '../hooks/queryKeys';
import type { UserPreferences } from '../types/preferences';
import type { RootStackScreenProps } from '../types/navigation';

type FoodSettingsScreenProps = RootStackScreenProps<'FoodSettings'>;

const FoodSettingsScreen: React.FC<FoodSettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [accentPrimary, formEnabled, formDisabled] = useCSSVariable([
    '--color-accent-primary',
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string, string];

  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const { providers } = useExternalProviders();

  const providerOptions = useMemo(
    () => providers.map((p) => ({ label: p.provider_name, value: p.id })),
    [providers],
  );

  const barcodeProviderId = preferences?.default_barcode_provider_id ?? '';
  const foodDataProviderId = preferences?.default_food_data_provider_id ?? '';
  const autoScale = preferences?.auto_scale_open_food_facts_imports ?? true;
  const barcodeFallback = preferences?.barcode_fallback_open_food_facts ?? true;

  const mutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) => updatePreferences(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: preferencesQueryKey });
      const previous = queryClient.getQueryData<UserPreferences>(preferencesQueryKey);
      queryClient.setQueryData<UserPreferences>(preferencesQueryKey, (old) =>
        old ? { ...old, ...data } : (data as UserPreferences),
      );
      return { previous };
    },
    onError: (_err, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData(preferencesQueryKey, context.previous);
      }
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to update setting.' });
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
    (value: string) => mutation.mutate({ default_food_data_provider_id: value }),
    [mutation],
  );

  const handleAutoScaleToggle = useCallback(
    (value: boolean) => mutation.mutate({ auto_scale_open_food_facts_imports: value }),
    [mutation],
  );

  const handleBarcodeFallbackToggle = useCallback(
    (value: boolean) => mutation.mutate({ barcode_fallback_open_food_facts: value }),
    [mutation],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 80 }}
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
          <Text className="text-2xl font-bold text-text-primary">Food Settings</Text>
        </View>

        {/* Default Barcode Provider */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">Barcode Provider</Text>
            <BottomSheetPicker
              value={barcodeProviderId}
              options={providerOptions}
              onSelect={handleBarcodeProviderChange}
              title="Barcode Provider"
              placeholder="Default"
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-3">
            Which provider is used when scanning barcodes.
          </Text>
        </View>

        {/* Default Online Search Provider */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">Default Search Provider</Text>
            <BottomSheetPicker
              value={foodDataProviderId}
              options={providerOptions}
              onSelect={handleFoodProviderChange}
              title="Search Provider"
              placeholder="First available"
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-3">
            Pre-selected provider on the Online tab when searching for foods.
          </Text>
        </View>

        {/* Auto-Scale OpenFoodFacts */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-semibold text-text-primary flex-shrink">
              Auto-Scale OpenFoodFacts
            </Text>
            <Switch
              onValueChange={handleAutoScaleToggle}
              value={autoScale}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text className="text-text-secondary text-sm mt-3">
            Scale nutrition values from per-100g to the product's actual serving size.
          </Text>
        </View>

        {/* Barcode Fallback: Open Food Facts */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-semibold text-text-primary flex-shrink">
              Barcode Fallback: Open Food Facts
            </Text>
            <Switch
              onValueChange={handleBarcodeFallbackToggle}
              value={barcodeFallback}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text className="text-text-secondary text-sm mt-3">
            When a barcode scan returns no results, automatically retry using Open Food Facts.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

export default FoodSettingsScreen;
