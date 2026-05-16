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

const STANDARD_UNIT_KEYS = new Set(
  FOOD_FORM_UNIT_GROUPS.flatMap((group) =>
    group.units.map((unit) => unit.trim().toLowerCase()),
  ),
);

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
  const [surfaceBg, borderSubtle, textMuted, successIcon, accentPrimary, infoBg] = useCSSVariable([
    '--color-surface',
    '--color-border-subtle',
    '--color-text-muted',
    '--color-icon-success',
    '--color-accent-primary',
    '--color-bg-info',
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

  const selectedUnitKey = useMemo(
    () =>
      normalizeUnitKey(
        selectedSelection?.variant.serving_unit ?? selectedVariant?.serving_unit,
      ),
    [selectedSelection, selectedVariant],
  );

  const savedStandardUnits = useMemo(
    () =>
      variants
        .map((variant) => normalizeUnitKey(variant.serving_unit))
        .filter((unit) => STANDARD_UNIT_KEYS.has(unit)),
    [variants],
  );

  const groupedUnits = useMemo(() => {
    const availableUnits = new Set(
      convertibleUnits.map((unit) => unit.toLowerCase()),
    );
    savedStandardUnits.forEach((unit) => {
      availableUnits.add(unit);
    });
    if (selectedUnitKey) {
      availableUnits.add(selectedUnitKey);
    }

    return FOOD_FORM_UNIT_GROUPS
      .map((group) => ({
        label: group.label,
        units: group.units.filter((unit) => availableUnits.has(unit.toLowerCase())),
      }))
      .filter((group) => group.units.length > 0);
  }, [convertibleUnits, savedStandardUnits, selectedUnitKey]);

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

  const handleUnitPress = useCallback(
    async (unit: string) => {
      const normalizedTarget = normalizeUnitKey(unit);
      const matchedVariant = variants.find(
        (variant) =>
          Boolean(variant.id) &&
          normalizeUnitKey(variant.serving_unit) === normalizedTarget,
      );
      if (matchedVariant) {
        await handleExistingVariantPress(matchedVariant);
        return;
      }

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
    [
      buildConvertedVariant,
      buildManualVariant,
      handleExistingVariantPress,
      onSelect,
      variants,
    ],
  );

  const customSavedVariants = useMemo(
    () =>
      variants.filter((variant) => {
        const normalizedUnit = normalizeUnitKey(variant.serving_unit);
        return Boolean(variant.id) && !STANDARD_UNIT_KEYS.has(normalizedUnit);
      }),
    [variants],
  );

  const buildSelectedRowStyle = useCallback(
    (isSelected: boolean) => ({
      borderColor: isSelected ? accentPrimary : borderSubtle,
      borderWidth: isSelected ? 1 : 0,
      borderBottomWidth: isSelected ? 1 : StyleSheet.hairlineWidth,
      backgroundColor: isSelected ? infoBg : 'transparent',
      borderRadius: isSelected ? 12 : 0,
      marginHorizontal: isSelected ? 8 : 0,
      marginVertical: isSelected ? 4 : 0,
      paddingHorizontal: 16,
      paddingVertical: 14,
    }),
    [accentPrimary, borderSubtle, infoBg],
  );

  const renderCustomVariantRow = (variant: FoodUnitVariant) => {
    const isSelected = variant.id != null && variant.id === selectedVariantId;

    return (
      <TouchableOpacity
        key={variant.id}
        testID={`food-unit-custom-variant-${variant.id}`}
        className="flex-row items-center justify-between"
        style={buildSelectedRowStyle(isSelected)}
        onPress={() => {
          void handleExistingVariantPress(variant);
        }}
        activeOpacity={0.7}
        disabled={isSubmitting}
      >
        <Text
          className={`text-base text-text-primary ${isSelected ? 'font-semibold' : ''}`}
          style={isSelected ? { color: accentPrimary } : undefined}
        >
          {variant.serving_unit}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderUnitRow = (unit: string) => {
    const compatible = canAutoConvertToUnit(variants, selectedVariant, unit);
    const isSelected = selectedUnitKey === normalizeUnitKey(unit);

    return (
      <TouchableOpacity
        key={unit}
        testID={`food-unit-option-${unit}`}
        className="flex-row items-center justify-between"
        style={buildSelectedRowStyle(isSelected)}
        onPress={() => {
          void handleUnitPress(unit);
        }}
        activeOpacity={0.7}
        disabled={isSubmitting}
      >
        <Text
          className={`text-base text-text-primary ${isSelected ? 'font-semibold' : ''}`}
          style={isSelected ? { color: accentPrimary } : undefined}
        >
          {unit}
        </Text>
        {compatible ? <Icon name="checkmark" size={18} color={successIcon} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <>
      {renderTrigger({ onPress: handleOpen })}

      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={[500]}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        <View className="flex-1">
          <View className="px-4 py-4 border-b border-border-subtle">
            <Text className="text-lg font-semibold text-center text-text-primary">
              {title}
            </Text>
          </View>

          <BottomSheetScrollView contentContainerClassName="pb-safe-or-5">
            {customSavedVariants.length > 0 ? (
              <>
                <View className="px-4 py-2 bg-surface">
                  <Text className="text-xs font-semibold uppercase text-text-muted">
                    Saved Custom Units
                  </Text>
                </View>
                {customSavedVariants.map(renderCustomVariantRow)}
              </>
            ) : null}

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
        </View>
      </BottomSheetModal>
    </>
  );
};

export default FoodUnitSelectorSheet;
