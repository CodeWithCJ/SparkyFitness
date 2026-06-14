import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import { createNativeHeaderTextButtonItem } from '../utils/nativeHeaderItems';
import { addLog } from '../services/LogService';
import { updateFood } from '../services/api/foodsApi';
import { lookupBarcodeV2 } from '../services/api/externalFoodSearchApi';
import { foodsQueryKey } from '../hooks/queryKeys';
import type { RootStackScreenProps } from '../types/navigation';

type EditBarcodeScreenProps = RootStackScreenProps<'EditBarcode'>;

const BARCODE_REGEX = /^\d{8,14}$/;

/** Pad a 12-digit UPC-A to a 13-digit EAN-13 to mirror the server's
 *  normalizeBarcode. Used only for the same-value short-circuit so re-typing
 *  a 12-digit value that's already stored as 13 digits doesn't save. */
function normalizeBarcodeClient(value: string): string {
  return value.length === 12 ? `0${value}` : value;
}

const EditBarcodeScreen: React.FC<EditBarcodeScreenProps> = ({ navigation, route }) => {
  const { foodId, foodName, currentBarcode, returnKey, pendingScannedBarcode, scannedBarcodeNonce } =
    route.params;
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [accentColor, textSecondary, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
    '--color-text-primary',
  ]) as [string, string, string];

  const [value, setValue] = useState(currentBarcode ?? '');

  // Apply a barcode handed back from the FoodScan capture-barcode flow.
  useEffect(() => {
    if (scannedBarcodeNonce == null || pendingScannedBarcode == null) return;
    setValue(pendingScannedBarcode);
    navigation.setParams({
      pendingScannedBarcode: undefined,
      scannedBarcodeNonce: undefined,
    });
  }, [scannedBarcodeNonce, pendingScannedBarcode, navigation]);

  const invalidateCaches = () => {
    queryClient.invalidateQueries({ queryKey: foodsQueryKey, refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['foodsLibrary'], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['foodSearch'], refetchType: 'all' });
  };

  const mutation = useMutation({
    mutationFn: (barcode: string | null) => updateFood(foodId, { barcode }),
  });

  const dispatchUpdate = (barcode: string | null) => {
    navigation.dispatch({
      ...CommonActions.setParams({ updatedBarcode: barcode }),
      source: returnKey,
    });
  };

  const trimmed = value.trim();
  const isUnchanged = (() => {
    if (trimmed === '' && currentBarcode == null) return true;
    if (trimmed === '' || currentBarcode == null) return false;
    return normalizeBarcodeClient(trimmed) === currentBarcode;
  })();
  const isValidFormat = trimmed === '' || BARCODE_REGEX.test(trimmed);
  const saveDisabled =
    mutation.isPending || trimmed === '' || isUnchanged || !isValidFormat;

  const handleSave = async () => {
    const barcode = trimmed;
    if (!BARCODE_REGEX.test(barcode)) {
      Toast.show({
        type: 'error',
        text1: 'Invalid barcode',
        text2: 'Barcode must be 8-14 digits.',
      });
      return;
    }
    if (isUnchanged) {
      navigation.goBack();
      return;
    }

    // Conflict pre-check — fail open if lookup itself errors.
    try {
      const lookup = await lookupBarcodeV2(barcode);
      if (lookup.source === 'local' && lookup.food?.id && lookup.food.id !== foodId) {
        const otherName = lookup.food.name || 'another food';
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Barcode already in use',
            `This barcode is already attached to "${otherName}". Attach it to "${foodName}" anyway?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Attach', style: 'default', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!proceed) return;
      }
    } catch (error) {
      addLog('[EditBarcode] Pre-check lookup failed; proceeding anyway', 'WARNING', [
        `foodId: ${foodId}`,
        `barcode: ${barcode}`,
        `error: ${error instanceof Error ? error.message : String(error)}`,
      ]);
    }

    try {
      const updated = await mutation.mutateAsync(barcode);
      const stored = updated?.barcode ?? null;
      dispatchUpdate(stored);
      invalidateCaches();
      Toast.show({ type: 'success', text1: 'Barcode saved' });
      navigation.goBack();
    } catch (error) {
      addLog('[EditBarcode] Failed to save barcode', 'ERROR', [
        `foodId: ${foodId}`,
        `error: ${error instanceof Error ? error.message : String(error)}`,
      ]);
      Toast.show({
        type: 'error',
        text1: 'Could not save barcode',
        text2: 'Please try again.',
      });
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove barcode',
      `Remove the barcode from "${foodName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await mutation.mutateAsync(null);
              dispatchUpdate(null);
              invalidateCaches();
              Toast.show({ type: 'success', text1: 'Barcode removed' });
              navigation.goBack();
            } catch (error) {
              addLog('[EditBarcode] Failed to remove barcode', 'ERROR', [
                `foodId: ${foodId}`,
                `error: ${error instanceof Error ? error.message : String(error)}`,
              ]);
              Toast.show({
                type: 'error',
                text1: 'Could not remove barcode',
                text2: 'Please try again.',
              });
            }
          },
        },
      ],
    );
  };

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;

    navigation.setOptions({
      unstable_headerRightItems: () => [
        createNativeHeaderTextButtonItem({
          label: 'Save',
          identifier: 'edit-barcode-save',
          tintColor: textPrimary,
          accessibilityLabel: 'Save barcode',
          fontWeight: '600',
          disabled: saveDisabled,
          onPress: () => {
            void handleSave();
          },
        }),
      ],
    });
  }, [navigation, textPrimary, saveDisabled, handleSave]);

  return (
    <View className="flex-1 bg-background" style={Platform.OS === 'ios' ? undefined : { paddingTop: insets.top }}>
      {Platform.OS !== 'ios' && (
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        <Text
          pointerEvents="none"
          className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold"
        >
          Barcode
        </Text>
        <View className="ml-auto">
          <Button
            variant="header"
            onPress={() => {
              void handleSave();
            }}
            disabled={saveDisabled}
          >
            Save
          </Button>
        </View>
      </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <Text className="text-sm text-text-secondary">For {foodName}</Text>
          <FormInput
            placeholder="012345678905"
            keyboardType="number-pad"
            value={value}
            onChangeText={setValue}
            maxLength={14}
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (!saveDisabled) void handleSave();
            }}
          />
          {!isValidFormat ? (
            <Text className="text-sm" style={{ color: '#dc2626' }}>
              Barcode must be 8-14 digits.
            </Text>
          ) : (
            <Text className="text-xs" style={{ color: textSecondary }}>
              Standard barcodes are 8 to 14 digits.
            </Text>
          )}
        </View>

        <Button
          variant="ghost"
          onPress={() =>
            navigation.navigate('FoodScan', {
              mode: 'capture-barcode',
              returnKey: route.key,
            })
          }
        >
          Scan with camera
        </Button>

        {currentBarcode != null ? (
          <Button
            variant="ghost"
            onPress={handleRemove}
            disabled={mutation.isPending}
            textClassName="text-bg-danger font-medium"
          >
            Remove barcode
          </Button>
        ) : null}
      </ScrollView>
    </View>
  );
};

export default EditBarcodeScreen;
