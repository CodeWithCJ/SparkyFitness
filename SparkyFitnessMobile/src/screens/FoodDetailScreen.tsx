import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FoodNutritionSummary from '../components/FoodNutritionSummary';
import StatusView from '../components/StatusView';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useDeleteFood, useFoodVariants, useProfile, useServerConnection, usePreferences } from '../hooks';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import {
  buildExternalVariantOptions,
  buildLocalVariantOptions,
  formatVariantLabel,
  resolveFoodDisplayValues,
  applyDisplayValuesToFoodInfo,
} from '../utils/foodDetails';
import type { RootStackScreenProps } from '../types/navigation';

type FoodDetailScreenProps = RootStackScreenProps<'FoodDetail'>;

const buildSelectedVariantId = (hasExternalVariants: boolean, variantId?: string) =>
  hasExternalVariants ? (variantId ?? 'ext-0') : variantId;

const FoodDetailScreen: React.FC<FoodDetailScreenProps> = ({ navigation, route }) => {
  const { item, updatedItem, updatedSelectedVariantId, updatedBarcode } = route.params;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentColor, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
  ]) as [string, string];
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { profile } = useProfile();
  const { preferences } = usePreferences({ enabled: isConnected });
  const showNetCarbs = preferences?.show_net_carbs === true;
  const [food, setFood] = useState(item);

  const isLocalFood = food.source === 'local';
  const hasExternalVariants = !!(food.externalVariants && food.externalVariants.length > 1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    buildSelectedVariantId(hasExternalVariants, item.variantId),
  );
  const { variants, isLoading: isVariantsLoading, isError: isVariantsError } = useFoodVariants(food.id, {
    enabled: isLocalFood && isConnected,
  });
  const canManageFood = !!(isLocalFood && isConnected && food.userId && profile?.id === food.userId);

  const localVariantOptions = useMemo(
    () => buildLocalVariantOptions(variants),
    [variants],
  );
  const externalVariantOptions = useMemo(
    () => buildExternalVariantOptions(food.externalVariants),
    [food.externalVariants],
  );
  const variantOptions = localVariantOptions.length > 0
    ? localVariantOptions
    : externalVariantOptions;
  const displayValues = useMemo(
    () => resolveFoodDisplayValues({
      item: food,
      selectedVariantId,
      localVariantOptions,
      externalVariantOptions,
    }),
    [food, selectedVariantId, localVariantOptions, externalVariantOptions],
  );

  const selectedVariantLabel = variantOptions.find((option) => option.id === selectedVariantId)?.label
    ?? formatVariantLabel(displayValues);
  const selectedCustomNutrients = useMemo(() => {
    const selectedVariant = variants?.find((variant) => variant.id === selectedVariantId);
    if (selectedVariant) {
      return selectedVariant.custom_nutrients ?? null;
    }

    if (selectedVariantId === food.variantId) {
      return food.customNutrients ?? null;
    }

    return undefined;
  }, [food.customNutrients, food.variantId, selectedVariantId, variants]);

  useEffect(() => {
    setFood(item);
  }, [item]);

  useEffect(() => {
    if (updatedItem) {
      setFood(updatedItem);
      setSelectedVariantId(updatedSelectedVariantId ?? updatedItem.variantId);
      navigation.setParams({
        updatedItem: undefined,
        updatedSelectedVariantId: undefined,
      });
    }
  }, [updatedItem, updatedSelectedVariantId, navigation]);

  useEffect(() => {
    if (updatedBarcode !== undefined) {
      setFood((prev) => ({ ...prev, barcode: updatedBarcode }));
      navigation.setParams({ updatedBarcode: undefined });
    }
  }, [updatedBarcode, navigation]);

  useEffect(() => {
    if (!selectedVariantId && localVariantOptions.length > 0) {
      setSelectedVariantId(localVariantOptions[0].id);
    }
  }, [selectedVariantId, localVariantOptions]);

  const { confirmAndDelete, isPending: isDeletePending, invalidateCaches } = useDeleteFood({
    foodId: food.id,
    onSuccess: () => {
      invalidateCaches();
      navigation.goBack();
    },
  });

  const handleEdit = () => {
    if (!selectedVariantId) {
      return;
    }

    navigation.navigate('FoodForm', {
      mode: 'edit-food',
      item: applyDisplayValuesToFoodInfo(food, displayValues, selectedVariantId),
      returnKey: route.key,
      foodId: food.id,
      variantId: selectedVariantId,
      customNutrients: selectedCustomNutrients,
      initialValues: {
        name: food.name,
        brand: food.brand ?? '',
        servingSize: String(displayValues.servingSize),
        servingUnit: displayValues.servingUnit,
        calories: String(displayValues.calories),
        protein: String(displayValues.protein),
        carbs: String(displayValues.carbs),
        fat: String(displayValues.fat),
        fiber: displayValues.fiber != null ? String(displayValues.fiber) : '',
        saturatedFat: displayValues.saturatedFat != null ? String(displayValues.saturatedFat) : '',
        sodium: displayValues.sodium != null ? String(displayValues.sodium) : '',
        sugars: displayValues.sugars != null ? String(displayValues.sugars) : '',
        transFat: displayValues.transFat != null ? String(displayValues.transFat) : '',
        potassium: displayValues.potassium != null ? String(displayValues.potassium) : '',
        calcium: displayValues.calcium != null ? String(displayValues.calcium) : '',
        iron: displayValues.iron != null ? String(displayValues.iron) : '',
        cholesterol: displayValues.cholesterol != null ? String(displayValues.cholesterol) : '',
        vitaminA: displayValues.vitaminA != null ? String(displayValues.vitaminA) : '',
        vitaminC: displayValues.vitaminC != null ? String(displayValues.vitaminC) : '',
      },
    });
  };

  const header = useScreenHeader({
    borderless: true,
    left: { kind: 'back' },
    right: canManageFood
      ? {
          kind: 'text',
          label: 'Edit',
          role: 'secondary',
          disabled: !selectedVariantId,
          onPress: handleEdit,
          accessibilityLabel: 'Edit food',
          identifier: 'food-detail-edit',
        }
      : null,
  });

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
          name={food.name}
          brand={food.brand}
          values={displayValues}
          showNetCarbs={showNetCarbs}
          provider_verified={food.provider_verified}
          customNutrients={selectedCustomNutrients}
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

        {canManageFood && (
          <SettingsRowGroup>
            <SettingsRow
              icon="scan"
              title="Barcode"
              subtitle={
                food.barcode ? (
                  food.barcode
                ) : (
                  <Text className="text-sm text-text-secondary mt-0.5">Not set</Text>
                )
              }
              onPress={() =>
                navigation.navigate('EditBarcode', {
                  foodId: food.id,
                  foodName: food.name,
                  currentBarcode: food.barcode ?? null,
                  returnKey: route.key,
                })
              }
            />
          </SettingsRowGroup>
        )}

        <Button
          variant="primary"
          onPress={() => navigation.navigate('FoodEntryAdd', {
            item: applyDisplayValuesToFoodInfo(food, displayValues, selectedVariantId),
          })}
        >
          <Text className="text-white text-base font-semibold">Log Food</Text>
        </Button>

        {canManageFood && (
          <Button
            variant="ghost"
            onPress={confirmAndDelete}
            disabled={isDeletePending}
            textClassName="text-bg-danger font-medium"
          >
            {isDeletePending ? 'Deleting...' : 'Delete Food'}
          </Button>
        )}
      </ScrollView>
    );
  };

  return (
    <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
      {header}
      {renderContent()}
    </View>
  );
};

export default FoodDetailScreen;
