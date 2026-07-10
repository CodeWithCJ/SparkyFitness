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
import {
  canAutoConvertToUnit,
  useUnitConversion,
} from '../hooks/useUnitConversion';
import {
  CONFIDENCE_TONES,
  FOOD_FORM_UNIT_GROUPS,
  type AiConfidence,
  type ConfidenceTone,
} from '@workspace/shared';
import { localizeServingUnit, mobileT } from '../localization';

function showUnitUpdateError(): void {
  Toast.show({
    type: 'error',
    text1: mobileT('foodUnit.updateFailed'),
    text2: mobileT('common.retry'),
  });
}

function formatAiAccessibilityLabel(confidence?: AiConfidence | null): string {
  return confidence
    ? mobileT('foodUnit.aiEstimateConfidence', {
        confidence: mobileT(`foodUnit.confidence.${confidence}`),
      })
    : mobileT('foodUnit.aiEstimate');
}

const STANDARD_UNIT_KEYS = new Set(
  FOOD_FORM_UNIT_GROUPS.flatMap((group) =>
    group.units.map((unit) => unit.trim().toLowerCase()),
  ),
);

// `cups`/`lbs` are aliases of `cup`/`lb` kept in the shared unit list for
// backwards compatibility with older saved variants. They shouldn't appear as
// separate dropdown options — picking either is functionally identical.
const UNIT_ALIASES_TO_HIDE = new Set(['cups', 'lbs']);

const sheetContainer =
  Platform.OS === 'ios'
    ? ({ children }: React.PropsWithChildren) => (
        <FullWindowOverlay>{children}</FullWindowOverlay>
      )
    : undefined;

const androidSparkleStyle =
  Platform.OS === 'android'
    ? ({ transform: [{ scaleX: 0.86 }, { scaleY: 0.9 }] } as const)
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
  title = mobileT('foodUnit.selectUnit'),
  renderTrigger,
  onSelect,
}) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const isDismissingRef = useRef(false);
  const isOpenRef = useRef(false);
  const isPresentingRef = useRef(false);
  const presentFrameRef = useRef<number | null>(null);
  const { theme } = useUniwind();
  const [
    surfaceBg,
    raisedBg,
    borderSubtle,
    borderStrong,
    textMuted,
    successIcon,
    warningIcon,
    dangerIcon,
  ] = useCSSVariable([
    '--color-surface',
    '--color-raised',
    '--color-border-subtle',
    '--color-border-strong',
    '--color-text-muted',
    '--color-icon-success',
    '--color-icon-warning',
    '--color-icon-danger',
  ]) as [string, string, string, string, string, string, string, string];
  const isDarkMode = theme === 'dark' || theme === 'amoled';
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confidence-tinted color for the AI-provenance Sparkles icon. All three
  // tones use the vivid icon-* CSS variables so the standalone glyph pops
  // as a saturated mid-tone rather than a washed-out pale color — mirrors
  // web's `-500/-400` sparkle shade.
  const aiSparkleColorByTone: Record<ConfidenceTone, string> = useMemo(
    () => ({
      success: successIcon,
      warning: warningIcon,
      error: dangerIcon,
    }),
    [dangerIcon, successIcon, warningIcon],
  );

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
        label: mobileT(
          `foodUnit.group.${group.label.toLowerCase()}`,
          undefined,
          group.label,
        ),
        units: group.units.filter(
          (unit) =>
            availableUnits.has(unit.toLowerCase()) &&
            !UNIT_ALIASES_TO_HIDE.has(unit.toLowerCase()),
        ),
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

  const clearScheduledPresent = useCallback(() => {
    if (presentFrameRef.current != null) {
      cancelAnimationFrame(presentFrameRef.current);
      presentFrameRef.current = null;
    }
  }, []);

  const handleOpen = useCallback(() => {
    if (isDismissingRef.current || isOpenRef.current || isPresentingRef.current) {
      return;
    }

    clearScheduledPresent();
    isPresentingRef.current = true;
    presentFrameRef.current = requestAnimationFrame(() => {
      presentFrameRef.current = null;
      bottomSheetRef.current?.present();
    });
  }, [clearScheduledPresent]);

  const dismissSheet = useCallback(() => {
    isPresentingRef.current = false;
    isDismissingRef.current = true;
    clearScheduledPresent();
    bottomSheetRef.current?.dismiss();
  }, [clearScheduledPresent]);

  const handleDismiss = useCallback(() => {
    isDismissingRef.current = false;
    isOpenRef.current = false;
    isPresentingRef.current = false;
  }, []);

  useEffect(() => {
    const sheetRef = bottomSheetRef.current;
    return () => {
      clearScheduledPresent();
      sheetRef?.dismiss();
    };
  }, [clearScheduledPresent]);

  const handleExistingVariantPress = useCallback(
    async (variant: FoodUnitVariant) => {
      setIsSubmitting(true);
      try {
        await onSelect({ kind: 'existing', variant });
        dismissSheet();
      } catch {
        showUnitUpdateError();
      } finally {
        setIsSubmitting(false);
      }
    },
    [dismissSheet, onSelect],
  );

  /**
   * Fall through to the existing draft+manual path: the parent FoodForm shows
   * its "manual update required" banner and offers the (form-level) AI button
   * if the unit pair qualifies. AI is intentionally NOT inline in this sheet
   * — the form is the single host for AI estimation, keeping diary and food
   * editor flows consistent.
   */
  const submitManualDraft = useCallback(
    async (unit: string) => {
      const manualVariant = buildManualVariant(unit);
      if (!manualVariant) {
        showUnitUpdateError();
        return;
      }
      setIsSubmitting(true);
      try {
        await onSelect({
          kind: 'draft',
          variant: manualVariant,
          requiresNutritionUpdate: true,
        });
        dismissSheet();
      } catch {
        showUnitUpdateError();
      } finally {
        setIsSubmitting(false);
      }
    },
    [buildManualVariant, dismissSheet, onSelect],
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

      // Compatible auto-convert (e.g. tbsp → tsp) wins — math beats AI, always.
      if (convertedVariant) {
        setIsSubmitting(true);
        try {
          await onSelect({ kind: 'draft', variant: convertedVariant });
          dismissSheet();
        } catch {
          showUnitUpdateError();
        } finally {
          setIsSubmitting(false);
        }
        return;
      }

      // Incompatible swap: emit a draft with requiresNutritionUpdate so the
      // parent FoodForm shows the manual-update banner + (when eligible) the
      // form-level "Estimate with AI" button.
      await submitManualDraft(unit);
    },
    [
      buildConvertedVariant,
      dismissSheet,
      handleExistingVariantPress,
      onSelect,
      submitManualDraft,
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
      borderColor: isSelected && !isDarkMode ? borderStrong : borderSubtle,
      borderTopWidth: isSelected && !isDarkMode ? StyleSheet.hairlineWidth : 0,
      borderBottomWidth:
        isSelected && !isDarkMode ? StyleSheet.hairlineWidth : StyleSheet.hairlineWidth,
      backgroundColor: isSelected ? raisedBg : 'transparent',
      paddingHorizontal: 16,
      paddingVertical: 14,
    }),
    [borderStrong, borderSubtle, isDarkMode, raisedBg],
  );

  const renderCustomVariantRow = (variant: FoodUnitVariant) => {
    const isSelected = variant.id != null && variant.id === selectedVariantId;
    // Only mark the row as AI-sourced once it's persisted (food_id present).
    // Fresh in-form AI estimates wait until the food is saved/updated before
    // the dropdown surfaces the indicator.
    const isAiSourced =
      variant.source === 'ai_estimate' && Boolean(variant.food_id);
    const aiConfidence = variant.ai_confidence as AiConfidence | null | undefined;
    const aiTone = aiConfidence ? CONFIDENCE_TONES[aiConfidence] : null;
    const aiSparkleColor = aiTone ? aiSparkleColorByTone[aiTone] : textMuted;
    const aiAccessibilityLabel = formatAiAccessibilityLabel(aiConfidence);

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
        <View className="flex-row items-center gap-2 flex-1">
          <Text
            className={`text-base text-text-primary ${isSelected ? 'font-semibold' : ''}`}
          >
            {localizeServingUnit(variant.serving_unit)}
          </Text>
          {isAiSourced && aiConfidence ? (
            <View accessible accessibilityLabel={aiAccessibilityLabel}>
              <Icon
                name="sparkles"
                size={16}
                color={aiSparkleColor}
                style={androidSparkleStyle}
              />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderUnitRow = (unit: string) => {
    const matchedSavedVariant =
      variants.find(
        (variant) =>
          Boolean(variant.id) &&
          normalizeUnitKey(variant.serving_unit) === normalizeUnitKey(unit),
      ) ?? null;
    // Only show the AI sparkle when the matched variant is persisted (food_id
    // present). In-form drafts wait for the food to be saved/updated.
    const matchedAiConfidence =
      matchedSavedVariant?.source === 'ai_estimate' &&
      Boolean(matchedSavedVariant.food_id)
        ? (matchedSavedVariant.ai_confidence as AiConfidence | null | undefined)
        : null;
    const matchedAiTone = matchedAiConfidence
      ? CONFIDENCE_TONES[matchedAiConfidence]
      : null;
    const matchedAiSparkleColor = matchedAiTone
      ? aiSparkleColorByTone[matchedAiTone]
      : textMuted;
    const matchedAiAccessibilityLabel =
      formatAiAccessibilityLabel(matchedAiConfidence);
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
        >
          {localizeServingUnit(unit)}
        </Text>
        {matchedAiConfidence ? (
          <View accessible accessibilityLabel={matchedAiAccessibilityLabel}>
            <Icon
              name="sparkles"
              size={16}
              color={matchedAiSparkleColor}
              style={androidSparkleStyle}
            />
          </View>
        ) : compatible ? (
          <Icon name="checkmark" size={18} color={successIcon} />
        ) : null}
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
        onDismiss={handleDismiss}
        onChange={(index) => {
          isOpenRef.current = index >= 0;
          if (index >= 0) {
            isPresentingRef.current = false;
          }
        }}
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
                    {mobileT('foodUnit.savedCustomUnits')}
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
