import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useCSSVariable, useUniwind } from 'uniwind';
import Icon from './Icon';
import type {
  FoodUnitSelectionResult,
  FoodUnitVariant,
} from '../types/foodUnitVariants';
import { canAutoConvertToUnit, useUnitConversion } from '../hooks/useUnitConversion';
import { FOOD_FORM_UNIT_GROUPS } from '../utils/servingSizeConversions';

const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => (
        <FullWindowOverlay>{children}</FullWindowOverlay>
      )
    : undefined;

interface FoodUnitSelectorSheetProps {
  variants: FoodUnitVariant[];
  selectedVariantId?: string;
  selectedSelection?: FoodUnitSelectionResult | null;
  title?: string;
  renderTrigger: (props: { onPress: () => void }) => React.ReactNode;
  onSelect: (selection: FoodUnitSelectionResult) => Promise<void> | void;
}

function formatVariantLabel(variant: FoodUnitVariant): string {
  return `${variant.serving_size} ${variant.serving_unit} (${Math.round(
    variant.calories,
  )} cal)`;
}

function normalizeUnitKey(unit?: string | null): string {
  return unit?.trim().toLowerCase() ?? '';
}

const FoodUnitSelectorSheet: React.FC<FoodUnitSelectorSheetProps> = ({
  variants,
  selectedVariantId,
  selectedSelection,
  title = 'Select Unit',
  renderTrigger,
  onSelect,
}) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { theme } = useUniwind();
  const [
    surfaceBg,
    raisedBg,
    borderSubtle,
    textMuted,
    accentPrimary,
    successText,
  ] = useCSSVariable([
    '--color-surface',
    '--color-raised',
    '--color-border-subtle',
    '--color-text-muted',
    '--color-accent-primary',
    '--color-text-success',
  ]) as [string, string, string, string, string, string];
  const isDarkMode = theme === 'dark' || theme === 'amoled';
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedVariant = useMemo(
    () =>
      variants.find((variant) => variant.id === selectedVariantId) ??
      variants[0] ??
      null,
    [selectedVariantId, variants],
  );

  const { convertibleUnits, buildConvertedVariant, buildManualVariant } =
    useUnitConversion({
      variants,
      selectedVariant,
    });

  const hasSelectedExistingVariant = useMemo(
    () => selectedSelection?.kind === 'existing',
    [selectedSelection],
  );
  const selectedDraftUnitKey = useMemo(
    () =>
      hasSelectedExistingVariant
        ? ''
        : normalizeUnitKey(selectedSelection?.variant.serving_unit),
    [hasSelectedExistingVariant, selectedSelection],
  );

  const groupedUnits = useMemo(() => {
    const availableUnits = new Set(
      convertibleUnits.map((unit) => unit.toLowerCase()),
    );
    if (selectedDraftUnitKey) {
      availableUnits.add(selectedDraftUnitKey);
    }

    return FOOD_FORM_UNIT_GROUPS
      .map((group) => ({
        label: group.label,
        units: group.units.filter((unit) => availableUnits.has(unit.toLowerCase())),
      }))
      .filter((group) => group.units.length > 0);
  }, [convertibleUnits, selectedDraftUnitKey]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        opacity={isDarkMode ? 0.7 : 0.5}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [isDarkMode],
  );

  const handleOpen = useCallback(() => {
    bottomSheetRef.current?.present();
  }, []);

  useEffect(() => {
    const sheetRef = bottomSheetRef.current;
    return () => {
      sheetRef?.dismiss();
    };
  }, []);

  const handleExistingVariantPress = useCallback(
    async (variant: FoodUnitVariant) => {
      setIsSubmitting(true);
      try {
        await onSelect({ kind: 'existing', variant });
        bottomSheetRef.current?.dismiss();
      } catch {
        Toast.show({
          type: 'error',
          text1: 'Could not update that unit',
          text2: 'Please try again.',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [onSelect],
  );

  const showManualUpdateToast = useCallback(() => {
    setTimeout(() => {
      Toast.show({
        type: 'info',
        text1: 'Please update the nutrition values manually.',
      });
    }, 250);
  }, []);

  const handleUnitPress = useCallback(
    async (unit: string) => {
      const convertedVariant = buildConvertedVariant(unit);
      const manualVariant = convertedVariant ? null : buildManualVariant(unit);
      if (!convertedVariant && !manualVariant) {
        Toast.show({
          type: 'error',
          text1: 'Could not update that unit',
          text2: 'Please try again.',
        });
        return;
      }

      const selection: FoodUnitSelectionResult = convertedVariant
        ? { kind: 'draft', variant: convertedVariant }
        : {
            kind: 'draft',
            variant: manualVariant!,
            requiresNutritionUpdate: true,
          };

      setIsSubmitting(true);
      try {
        await onSelect(selection);
        bottomSheetRef.current?.dismiss();
        if (!convertedVariant) {
          showManualUpdateToast();
        }
      } catch {
        Toast.show({
          type: 'error',
          text1: 'Could not update that unit',
          text2: 'Please try again.',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [buildConvertedVariant, buildManualVariant, onSelect, showManualUpdateToast],
  );

  const renderVariantRow = (variant: FoodUnitVariant, index: number) => {
    const isSelected = variant.id != null && variant.id === selectedVariantId;

    return (
      <TouchableOpacity
        key={`variant-${variant.id ?? index}`}
        testID={`food-unit-variant-row-${variant.id ?? index}`}
        className="flex-row items-center justify-between px-4 py-3.5"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: borderSubtle,
          backgroundColor: isSelected ? raisedBg : 'transparent',
          borderLeftWidth: isSelected ? 3 : 0,
          borderLeftColor: isSelected ? accentPrimary : 'transparent',
        }}
        onPress={() => {
          void handleExistingVariantPress(variant);
        }}
        activeOpacity={0.7}
        disabled={isSubmitting}
      >
        <Text
          className={`text-base text-text-primary ${isSelected ? 'font-semibold' : ''}`}
        >
          {formatVariantLabel(variant)}
        </Text>
        {!isSelected ? (
          <Icon name="chevron-forward" size={16} color={textMuted} />
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderUnitRow = (unit: string) => {
    const compatible = canAutoConvertToUnit(variants, selectedVariant, unit);
    const isSelected = selectedDraftUnitKey === normalizeUnitKey(unit);

    return (
      <TouchableOpacity
        key={unit}
        testID={`food-unit-option-${unit}`}
        className="flex-row items-center justify-between px-4 py-3.5 border-b border-border-subtle"
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: borderSubtle,
          backgroundColor: isSelected ? raisedBg : 'transparent',
          borderLeftWidth: isSelected ? 3 : 0,
          borderLeftColor: isSelected ? accentPrimary : 'transparent',
        }}
        onPress={() => {
          void handleUnitPress(unit);
        }}
        activeOpacity={0.7}
        disabled={isSubmitting}
      >
        <Text
          className={`text-base text-text-primary ${isSelected ? 'font-semibold' : ''}`}
        >
          {unit}
        </Text>
        {compatible ? (
          <Icon name="checkmark" size={18} color={successText} />
        ) : (
          <Icon name="chevron-forward" size={16} color={textMuted} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      {renderTrigger({ onPress: handleOpen })}

      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={[620]}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        <BottomSheetScrollView contentContainerClassName="pb-safe-or-5">
          <View className="px-4 py-4 border-b border-border-subtle">
            <Text className="text-lg font-semibold text-center text-text-primary">
              {title}
            </Text>
          </View>

          {variants.map(renderVariantRow)}

          {groupedUnits.map((group) => (
            <React.Fragment key={group.label}>
              <View className="px-4 py-2 bg-surface">
                <Text className="text-xs font-semibold uppercase text-text-muted">
                  {group.label}
                </Text>
              </View>
              {group.units.map(renderUnitRow)}
            </React.Fragment>
          ))}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
};

export default FoodUnitSelectorSheet;
