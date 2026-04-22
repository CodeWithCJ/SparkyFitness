import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FoodNutritionSummary from '../components/FoodNutritionSummary';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useFoodVariants, useServerConnection } from '../hooks';
import {
  buildExternalVariantOptions,
  buildLocalVariantOptions,
  formatVariantLabel,
  resolveFoodDisplayValues,
  applyDisplayValuesToFoodInfo,
} from '../utils/foodDetails';
import type { RootStackScreenProps } from '../types/navigation';

type FoodDetailScreenProps = RootStackScreenProps<'FoodDetail'>;

const FoodDetailScreen: React.FC<FoodDetailScreenProps> = ({ navigation, route }) => {
  const { item } = route.params;
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
  ]) as [string, string];
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();

  const isLocalFood = item.source === 'local';
  const hasExternalVariants = !!(item.externalVariants && item.externalVariants.length > 1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    hasExternalVariants ? (item.variantId ?? 'ext-0') : item.variantId,
  );
  const { variants, isLoading: isVariantsLoading, isError: isVariantsError } = useFoodVariants(item.id, {
    enabled: isLocalFood && isConnected,
  });

  const localVariantOptions = useMemo(
    () => buildLocalVariantOptions(variants),
    [variants],
  );
  const externalVariantOptions = useMemo(
    () => buildExternalVariantOptions(item.externalVariants),
    [item.externalVariants],
  );
  const variantOptions = localVariantOptions.length > 0
    ? localVariantOptions
    : externalVariantOptions;
  const displayValues = useMemo(
    () => resolveFoodDisplayValues({
      item,
      selectedVariantId,
      localVariantOptions,
      externalVariantOptions,
    }),
    [item, selectedVariantId, localVariantOptions, externalVariantOptions],
  );

  const selectedVariantLabel = variantOptions.find((option) => option.id === selectedVariantId)?.label
    ?? formatVariantLabel(displayValues);

  useEffect(() => {
    if (!selectedVariantId && localVariantOptions.length > 0) {
      setSelectedVariantId(localVariantOptions[0].id);
    }
  }, [selectedVariantId, localVariantOptions]);

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconColor="#9CA3AF"
          iconSize={64}
          title="No server configured"
          subtitle="Configure your server connection in Settings to view food details."
          action={{ label: 'Go to Settings', onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    return (
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
          gap: 16,
        }}
      >
        <FoodNutritionSummary
          name={item.name}
          brand={item.brand}
          values={displayValues}
        />

        <View className="bg-surface rounded-xl p-4">
          <Text className="text-text-secondary text-sm mb-2">Serving</Text>
          {variantOptions.length > 1 ? (
            <BottomSheetPicker
              value={selectedVariantId ?? variantOptions[0].id}
              options={variantOptions.map((option) => ({ label: option.label, value: option.id }))}
              onSelect={setSelectedVariantId}
              title="Select Serving"
              renderTrigger={({ onPress }) => (
                <TouchableOpacity
                  onPress={onPress}
                  activeOpacity={0.7}
                  className="flex-row items-center justify-between"
                  accessibilityRole="button"
                  accessibilityLabel="Serving options"
                >
                  <Text className="text-text-primary text-base font-medium flex-1 mr-3">
                    {selectedVariantLabel}
                  </Text>
                  <Icon name="chevron-down" size={16} color={textPrimary} />
                </TouchableOpacity>
              )}
            />
          ) : (
            <Text className="text-text-primary text-base font-medium">
              {selectedVariantLabel}
            </Text>
          )}

          {isVariantsLoading ? (
            <View className="flex-row items-center mt-3">
              <ActivityIndicator size="small" color={accentColor} />
              <Text className="text-text-secondary text-sm ml-2">
                Loading serving options...
              </Text>
            </View>
          ) : null}

          {isVariantsError ? (
            <Text className="text-text-secondary text-sm mt-3">
              Some serving options could not be loaded right now.
            </Text>
          ) : null}
        </View>

        <Button
          variant="primary"
          onPress={() => navigation.navigate('FoodEntryAdd', {
            item: applyDisplayValuesToFoodInfo(item, displayValues, selectedVariantId),
          })}
        >
          <Text className="text-white text-base font-semibold">Log Food</Text>
        </Button>
      </ScrollView>
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
      </View>
      {renderContent()}
    </View>
  );
};

export default FoodDetailScreen;
