import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useUniwind, useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useUpdateFoodEntry } from '../hooks/useUpdateFoodEntry';
import type { FoodEntry } from '../types/foodEntries';

export interface ServingAdjustSheetRef {
  present: (entry: FoodEntry) => void;
  dismiss: () => void;
}

interface ServingAdjustSheetProps {
  onViewEntry?: (entry: FoodEntry) => void;
}

const ServingAdjustSheet = forwardRef<ServingAdjustSheetRef, ServingAdjustSheetProps>(({ onViewEntry }, ref) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [entry, setEntry] = useState<FoodEntry | null>(null);
  const [quantityText, setQuantityText] = useState('0');
  const { theme } = useUniwind();
  const [surfaceBg, textMuted, accentColor] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string, string];
  const isDarkMode = theme === 'dark' || theme === 'amoled';

  const quantity = parseFloat(quantityText) || 0;
  const totalCalories = entry && entry.serving_size > 0
    ? Math.round(entry.calories * quantity / entry.serving_size)
    : 0;

  const { updateEntry, isPending, invalidateCache } = useUpdateFoodEntry({
    entryId: entry?.id ?? '',
    entryDate: entry?.entry_date ?? '',
    onSuccess: () => {
      invalidateCache();
      bottomSheetRef.current?.dismiss();
    },
  });

  useImperativeHandle(ref, () => ({
    present: (newEntry: FoodEntry) => {
      if (!newEntry.serving_size || newEntry.serving_size <= 0) return;
      setEntry(newEntry);
      setQuantityText(String(newEntry.quantity));
      bottomSheetRef.current?.present();
    },
    dismiss: () => {
      bottomSheetRef.current?.dismiss();
    },
  }));

  const formatQuantity = (value: number): string => {
    return value % 1 === 0 ? String(value) : value.toFixed(1);
  };

  const clampQuantity = () => {
    if (quantity <= 0) setQuantityText(formatQuantity(0.5));
  };

  const adjustQuantity = (delta: number) => {
    const step = (entry?.serving_size ?? 2) / 2;
    if (quantity <= 0) {
      if (delta > 0) setQuantityText(formatQuantity(step));
      return;
    }
    const boundary =
      delta > 0
        ? Math.ceil(quantity / step) * step
        : Math.floor(quantity / step) * step;
    const next = boundary !== quantity ? boundary : quantity + delta * step;
    setQuantityText(formatQuantity(Math.max(0.5, next)));
  };

  const updateQuantityText = (text: string) => {
    if (/^\d*\.?\d*$/.test(text)) {
      setQuantityText(text);
    }
  };

  const handleDone = () => {
    if (!entry || quantity <= 0) return;
    if (quantity === entry.quantity) {
      bottomSheetRef.current?.dismiss();
      return;
    }
    updateEntry({ quantity });
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        opacity={isDarkMode ? 0.7 : 0.5}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [isDarkMode]
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: surfaceBg }}
      handleIndicatorStyle={{ backgroundColor: textMuted }}
    >
      <BottomSheetView className="px-6 pb-8">
        {entry && (
          <>
            {/* Header */}
            <View className="items-center mb-5">
              <Text className="text-text-primary text-lg font-semibold text-center" numberOfLines={2}>
                {entry.food_name || 'Unknown food'}
              </Text>
              <Text className="text-text-secondary text-sm mt-1">
                {entry.serving_size} {entry.unit} = {entry.calories} Cal
              </Text>
            </View>

            {/* Quantity stepper */}
            <View className="items-center mb-5">
              <View className="flex-row items-center">
                <View className="flex-row items-center bg-raised border border-border-subtle rounded-lg overflow-hidden">
                  <TouchableOpacity
                    onPress={() => adjustQuantity(-1)}
                    className="w-12 h-12 items-center justify-center border-r border-border-subtle"
                    activeOpacity={0.7}
                  >
                    <Icon name="remove" size={20} color={accentColor} />
                  </TouchableOpacity>
                  <BottomSheetTextInput
                    value={quantityText}
                    onChangeText={updateQuantityText}
                    onBlur={clampQuantity}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    className="text-text-primary text-center w-16 h-12"
                    style={{ fontSize: 20, lineHeight: 22 }}
                  />
                  <TouchableOpacity
                    onPress={() => adjustQuantity(1)}
                    className="w-12 h-12 items-center justify-center border-l border-border-subtle"
                    activeOpacity={0.7}
                  >
                    <Icon name="add" size={20} color={accentColor} />
                  </TouchableOpacity>
                </View>
                <Text className="text-text-secondary text-lg ml-3">{entry.unit}</Text>
              </View>
            </View>

            {/* Calories */}
            <View className="items-center mb-6">
              <Text className="text-text-primary text-2xl font-semibold">
                {totalCalories} Cal
              </Text>
            </View>

            {/* More link */}
            {onViewEntry && (
              <TouchableOpacity
                onPress={() => {
                  bottomSheetRef.current?.dismiss();
                  onViewEntry(entry);
                }}
                className="items-center mb-4"
                activeOpacity={0.7}
              >
                <Text className="text-accent-primary text-sm font-medium">More</Text>
              </TouchableOpacity>
            )}

            {/* Done button */}
            <TouchableOpacity
              onPress={handleDone}
              disabled={isPending || quantity <= 0}
              className="bg-accent-primary rounded-xl py-3.5 items-center"
              style={isPending || quantity <= 0 ? { opacity: 0.5 } : undefined}
              activeOpacity={0.8}
            >
              <Text className="text-white text-base font-semibold">
                {isPending ? 'Saving...' : 'Done'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

ServingAdjustSheet.displayName = 'ServingAdjustSheet';

export default ServingAdjustSheet;
