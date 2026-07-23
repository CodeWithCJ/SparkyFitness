import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Switch,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { toHourMinute, isEntryTimeString } from '@workspace/shared';

import BottomSheetPicker from '../components/BottomSheetPicker';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { usePreferences } from '../hooks/usePreferences';
import { useMealTypes } from '../hooks/useMealTypes';
import { useExternalProviders } from '../hooks/useExternalProviders';
import { updatePreferences } from '../services/api/preferencesApi';
import { updateMealType } from '../services/api/mealTypesApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { preferencesQueryKey, mealTypesQueryKey } from '../hooks/queryKeys';
import { getMealTypeLabel } from '../constants/meals';
import type { UserPreferences } from '../types/preferences';
import type { MealType } from '../types/mealTypes';
import type { RootStackScreenProps } from '../types/navigation';

type FoodSettingsScreenProps = RootStackScreenProps<'FoodSettings'>;

const FoodSettingsScreen: React.FC<FoodSettingsScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];

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
        text1: 'Error',
        text2: 'Failed to update setting.',
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
    title: 'Food Settings',
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
        {/* Show Net Carbs */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-semibold text-text-primary flex-shrink">
              Show Net Carbs
            </Text>
            <Switch
              onValueChange={handleShowNetCarbsToggle}
              value={showNetCarbs}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text className="text-text-secondary text-sm mt-4">
            When enabled, carbohydrate summaries display net carbs (total carbs
            − fiber), and a Total Carbs row is added in nutrient breakdowns.
          </Text>
        </View>

        {/* Default Online Search Provider */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-base font-semibold text-text-primary">
              Default Food Source
            </Text>
            <BottomSheetPicker
              value={foodDataProviderId}
              options={providerOptions}
              onSelect={handleFoodProviderChange}
              title="Search Provider"
              placeholder="First available"
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>
          <Text className="text-text-secondary text-sm mt-4">
            Used when searching for foods by name.
          </Text>
        </View>

        {/* Auto-Scale OpenFoodFacts */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-semibold text-text-primary flex-shrink">
              Adjust Open Food Facts Values
            </Text>
            <Switch
              onValueChange={handleAutoScaleToggle}
              value={autoScale}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text className="text-text-secondary text-sm mt-4">
            Open Food Facts uses values per 100g. This converts them to the
            product’s serving size.
          </Text>
        </View>

        {/* Barcode Scanning */}
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-3">
            Barcode Scanning
          </Text>

          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-text-primary">Provider</Text>
            <BottomSheetPicker
              value={barcodeProviderId}
              options={barcodeProviderOptions}
              onSelect={handleBarcodeProviderChange}
              title="Barcode Provider"
              placeholder="Default"
              containerStyle={{ flex: 1, maxWidth: 200, marginLeft: 16 }}
            />
          </View>

          <View className="flex-row justify-between items-center mt-4">
            <Text className="text-sm text-text-primary flex-shrink">
              Retry with Open Food Facts
            </Text>
            <Switch
              onValueChange={handleBarcodeFallbackToggle}
              value={barcodeFallback}
              trackColor={{ false: formDisabled, true: formEnabled }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text className="text-text-secondary text-sm mt-2">
            If no result is found, try Open Food Facts automatically.
          </Text>
        </View>

        {/* Suggested Meal Category Times */}
        <SuggestedMealTimesSection />
      </ScrollView>
    </View>
  );
};

const SuggestedMealTimesSection: React.FC = () => {
  const queryClient = useQueryClient();
  const { mealTypes, isLoading } = useMealTypes();

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      default_time,
    }: {
      id: string;
      default_time: string | null;
    }) => updateMealType(id, { default_time }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mealTypesQueryKey });
      Toast.show({
        type: 'success',
        text1: 'Updated',
        text2: 'Meal category time updated.',
      });
    },
    onError: () => {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to update meal category time.',
      });
    },
  });

  if (isLoading || mealTypes.length === 0) return null;

  return (
    <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
      <Text className="text-base font-semibold text-text-primary mb-1">
        Suggested Meal Times
      </Text>
      <Text className="text-text-secondary text-sm mb-3">
        Set target start times for your meal categories (e.g. 07:30, 12:00,
        17:00). The app suggests meal types dynamically based on these times
        when logging food.
      </Text>

      {mealTypes.map(mt => (
        <MealTypeTimeRow
          key={mt.id}
          mealType={mt}
          onSave={time =>
            updateMutation.mutate({ id: mt.id, default_time: time })
          }
        />
      ))}
    </View>
  );
};

const MealTypeTimeRow: React.FC<{
  mealType: MealType;
  onSave: (time: string | null) => void;
}> = ({ mealType, onSave }) => {
  const initialValue = toHourMinute(mealType.default_time) || '';
  const [val, setVal] = useState(initialValue);

  const handleBlur = () => {
    const trimmed = val.trim();
    if (trimmed === initialValue) return;

    if (!trimmed) {
      onSave(null);
      return;
    }

    if (isEntryTimeString(trimmed)) {
      onSave(trimmed);
    } else {
      Toast.show({
        type: 'error',
        text1: 'Invalid Time',
        text2:
          'Please enter time in 24-hour HH:MM format (e.g., 07:30, 17:00).',
      });
      setVal(initialValue);
    }
  };

  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-border/40">
      <Text className="text-sm font-medium text-text-primary">
        {getMealTypeLabel(mealType.name)}
      </Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={val}
          onChangeText={setVal}
          onBlur={handleBlur}
          placeholder="HH:MM"
          placeholderTextColor="#9CA3AF"
          className="bg-background border border-border text-text-primary text-xs px-2 py-1 rounded w-20 text-center"
          keyboardType="numbers-and-punctuation"
        />
        {val ? (
          <TouchableOpacity
            onPress={() => {
              setVal('');
              onSave(null);
            }}
            className="px-1.5 py-1"
          >
            <Text className="text-xs text-text-secondary">Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

export default FoodSettingsScreen;
