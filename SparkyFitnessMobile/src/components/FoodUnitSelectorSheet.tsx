import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { FullWindowOverlay } from 'react-native-screens';
import { useCSSVariable, useUniwind } from 'uniwind';
import FormInput from './FormInput';
import Button from './ui/Button';
import Icon from './Icon';
import type {
  FoodUnitSelectionResult,
  FoodUnitVariant,
} from '../types/foodUnitVariants';
import { canAutoConvertToUnit, useUnitConversion } from '../hooks/useUnitConversion';
import { FOOD_FORM_UNIT_GROUPS } from '../utils/servingSizeConversions';
import { DECIMAL_INPUT_REGEX } from '../utils/numericInput';

const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => (
        <FullWindowOverlay>{children}</FullWindowOverlay>
      )
    : undefined;

interface FoodUnitSelectorSheetProps {
  variants: FoodUnitVariant[];
  selectedVariantId?: string;
  title?: string;
  renderTrigger: (props: { onPress: () => void }) => React.ReactNode;
  onSelect: (selection: FoodUnitSelectionResult) => Promise<void> | void;
}

function formatVariantLabel(variant: FoodUnitVariant): string {
  return `${variant.serving_size} ${variant.serving_unit} (${Math.round(
    variant.calories,
  )} cal)`;
}

function roundMacro(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

const FoodUnitSelectorSheet: React.FC<FoodUnitSelectorSheetProps> = ({
  variants,
  selectedVariantId,
  title = 'Select Serving',
  renderTrigger,
  onSelect,
}) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { theme } = useUniwind();
  const [surfaceBg, textMuted, accentPrimary] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string, string];
  const isDarkMode = theme === 'dark' || theme === 'amoled';
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedVariant = useMemo(
    () =>
      variants.find((variant) => variant.id === selectedVariantId) ??
      variants[0] ??
      null,
    [selectedVariantId, variants],
  );

  const {
    pendingUnit,
    setPendingUnit,
    pendingUnitIsCustom,
    conversionFactor,
    setConversionFactor,
    autoConversionFactor,
    conversionBaseVariant,
    conversionError,
    setConversionError,
    isConverting,
    convertibleUnits,
    buildConvertedVariant,
    handleExistingUnitSelection,
    startCustomUnit,
    cancelConversion,
    resetConversionState,
  } = useUnitConversion({
    variants,
    selectedVariant,
  });

  const previewVariant = buildConvertedVariant();

  const groupedUnits = useMemo(() => {
    const availableUnits = new Set(convertibleUnits.map((unit) => unit.toLowerCase()));

    return FOOD_FORM_UNIT_GROUPS
      .map((group) => ({
        label: group.label,
        units: group.units.filter((unit) => availableUnits.has(unit.toLowerCase())),
      }))
      .filter((group) => group.units.length > 0);
  }, [convertibleUnits]);

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
    resetConversionState();
    bottomSheetRef.current?.present();
  }, [resetConversionState]);

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
        resetConversionState();
        bottomSheetRef.current?.dismiss();
      } finally {
        setIsSubmitting(false);
      }
    },
    [onSelect, resetConversionState],
  );

  const handleSubmitDraft = useCallback(async () => {
    const convertedVariant = buildConvertedVariant();
    if (!convertedVariant) {
      setConversionError('Please enter a valid unit name and conversion factor.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSelect({ kind: 'draft', variant: convertedVariant });
      resetConversionState();
      bottomSheetRef.current?.dismiss();
    } catch {
      setConversionError('Could not save that unit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [buildConvertedVariant, onSelect, resetConversionState, setConversionError]);

  const renderVariantRow = (variant: FoodUnitVariant, index: number) => {
    const isSelected = variant.id != null && variant.id === selectedVariantId;

    return (
      <TouchableOpacity
        key={`variant-${variant.id ?? index}`}
        className="flex-row items-center justify-between px-4 py-3.5 border-b border-border-subtle"
        style={{ borderBottomWidth: StyleSheet.hairlineWidth }}
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
        {isSelected ? (
          <Icon name="checkmark" size={20} color={accentPrimary} />
        ) : (
          <Icon name="chevron-forward" size={16} color={textMuted} />
        )}
      </TouchableOpacity>
    );
  };

  const renderUnitRow = (unit: string) => {
    const compatible = canAutoConvertToUnit(variants, selectedVariant, unit);

    return (
      <TouchableOpacity
        key={unit}
        className="flex-row items-center justify-between px-4 py-3.5 border-b border-border-subtle"
        style={{ borderBottomWidth: StyleSheet.hairlineWidth }}
        onPress={() => handleExistingUnitSelection(unit)}
        activeOpacity={0.7}
        disabled={isSubmitting}
      >
        <Text className="text-base text-text-primary">{unit}</Text>
        {compatible ? (
          <Icon name="checkmark" size={18} color={accentPrimary} />
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

          {variants.length > 0 && (
            <>
              <View className="px-4 py-2 bg-surface">
                <Text className="text-xs font-semibold uppercase text-text-muted">
                  Available Units
                </Text>
              </View>
              {variants.map(renderVariantRow)}
            </>
          )}

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

          <View className="px-4 py-2 bg-surface">
            <Text className="text-xs font-semibold uppercase text-text-muted">
              Custom
            </Text>
          </View>
          <TouchableOpacity
            className="flex-row items-center justify-between px-4 py-3.5 border-b border-border-subtle"
            style={{ borderBottomWidth: StyleSheet.hairlineWidth }}
            onPress={startCustomUnit}
            activeOpacity={0.7}
            disabled={isSubmitting}
          >
            <Text className="text-base text-text-primary">Custom unit...</Text>
            <Icon name="chevron-forward" size={16} color={textMuted} />
          </TouchableOpacity>

          {isConverting && (
            <View className="mx-4 mt-4 rounded-xl bg-raised border border-border-subtle p-4 gap-3">
              {pendingUnitIsCustom ? (
                <>
                  <View className="gap-1.5">
                    <Text className="text-text-secondary text-sm font-medium">
                      Unit name
                    </Text>
                    <FormInput
                      placeholder="e.g. slice, bar, scoop"
                      value={pendingUnit}
                      onChangeText={(value) => {
                        setPendingUnit(value);
                        setConversionError('');
                      }}
                    />
                  </View>

                  {pendingUnit.trim() ? (
                    <View className="gap-1.5">
                      <Text className="text-text-secondary text-sm font-medium">
                        1 {pendingUnit.trim()} = ? {conversionBaseVariant?.serving_unit}
                      </Text>
                      <FormInput
                        placeholder="e.g. 1"
                        keyboardType="decimal-pad"
                        value={conversionFactor === '' ? '' : String(conversionFactor)}
                        onChangeText={(value) => {
                          if (DECIMAL_INPUT_REGEX.test(value)) {
                            setConversionFactor(value === '' ? '' : Number(value));
                            setConversionError('');
                          }
                        }}
                      />
                    </View>
                  ) : null}
                </>
              ) : autoConversionFactor === null ? (
                <>
                  <Text className="text-sm text-text-secondary">
                    These units can&apos;t be converted automatically. Enter how many{' '}
                    <Text className="font-semibold text-text-primary">
                      {conversionBaseVariant?.serving_unit}
                    </Text>{' '}
                    are in 1{' '}
                    <Text className="font-semibold text-text-primary">
                      {pendingUnit}
                    </Text>.
                  </Text>
                  <View className="gap-1.5">
                    <Text className="text-text-secondary text-sm font-medium">
                      1 {pendingUnit} = ? {conversionBaseVariant?.serving_unit}
                    </Text>
                    <FormInput
                      placeholder="e.g. 1"
                      keyboardType="decimal-pad"
                      value={conversionFactor === '' ? '' : String(conversionFactor)}
                      onChangeText={(value) => {
                        if (DECIMAL_INPUT_REGEX.test(value)) {
                          setConversionFactor(value === '' ? '' : Number(value));
                          setConversionError('');
                        }
                      }}
                    />
                  </View>
                </>
              ) : (
                <Text className="text-sm text-text-secondary">
                  1{' '}
                  <Text className="font-semibold text-text-primary">
                    {pendingUnit}
                  </Text>{' '}
                  ={' '}
                  <Text className="font-semibold text-text-primary">
                    {roundMacro(autoConversionFactor)} {conversionBaseVariant?.serving_unit}
                  </Text>
                  . This unit will be converted automatically.
                </Text>
              )}

              {previewVariant ? (
                <View className="rounded-lg bg-surface px-3 py-3">
                  <Text className="text-text-primary text-sm font-semibold mb-2">
                    Nutrition for 1 {previewVariant.serving_unit}
                  </Text>
                  <View className="flex-row gap-3">
                    <Text className="text-text-secondary text-sm">
                      {Math.round(previewVariant.calories)} cal
                    </Text>
                    <Text className="text-text-secondary text-sm">
                      {roundMacro(previewVariant.protein)}g protein
                    </Text>
                  </View>
                  <View className="flex-row gap-3 mt-1">
                    <Text className="text-text-secondary text-sm">
                      {roundMacro(previewVariant.carbs)}g carbs
                    </Text>
                    <Text className="text-text-secondary text-sm">
                      {roundMacro(previewVariant.fat)}g fat
                    </Text>
                  </View>
                </View>
              ) : null}

              {conversionError ? (
                <Text className="text-sm text-bg-danger">{conversionError}</Text>
              ) : null}

              <View className="flex-row gap-3">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onPress={cancelConversion}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onPress={() => {
                    void handleSubmitDraft();
                  }}
                  disabled={
                    isSubmitting ||
                    !pendingUnit.trim() ||
                    (autoConversionFactor === null &&
                      (!conversionFactor || conversionFactor <= 0))
                  }
                >
                  <Text className="text-white text-base font-semibold">
                    {isSubmitting ? 'Saving...' : 'Use Unit'}
                  </Text>
                </Button>
              </View>
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </>
  );
};

export default FoodUnitSelectorSheet;
