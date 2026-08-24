import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from './BottomSheetPicker';
import Button from './ui/Button';
import EquivalentsSection from './EquivalentsSection';
import FormInput from './FormInput';
import Icon from './Icon';
import FoodUnitSelectorSheet from './FoodUnitSelectorSheet';
import Switch from './ui/Switch';
import { useActiveAiServiceSetting } from '../hooks/useActiveAiServiceSetting';
import { useCustomNutrients } from '../hooks/useCustomNutrients';
import { usePreferences } from '../hooks/usePreferences';
import { useServerConnection } from '../hooks';
import { useUserAiConfigAllowed } from '../hooks/useUserAiConfigAllowed';
import { requestAiUnitConversion } from '../services/api/aiConversionApi';
import Toast from 'react-native-toast-message';
import type {
  EquivalentUnit,
  FoodUnitSelectionResult,
  FoodUnitVariant,
} from '../types/foodUnitVariants';
import { formatFoodFormNumber } from '../utils/foodDetails';
import { localizeFoodUnit } from '../utils/foodUnitLocalization';
import { SAVE_LABEL } from '../hooks/useScreenHeader';
import {
  FORM_DRAFT_UNIT_ID,
  NUMERIC_FOOD_FORM_FIELDS,
  NUMERIC_FOOD_FORM_FIELD_SET,
  NUTRITION_FIELDS,
  makeServingUnitSections,
  applyCompatibleDraftToFormState,
  applyVariantToFormState,
  applyVariantUnitToFormState,
  buildDisplayFormState,
  buildPreciseNumericValues,
  buildPreciseNumericValuesFromVariant,
  formatScaledInput,
  getScaledVariantNumericValue,
  isPositiveNumber,
  normalizeSelectedUnitSelection,
  scaleCompatibleDraftVariant,
  toPreciseFormString,
  type FoodFormData,
  type NumericFoodFormField,
} from '../utils/foodFormState';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import { localizeAiEstimateQuality } from '../utils/foodPhotoEstimate';
import {
  CONFIDENCE_TONES,
  getConversionFactor,
  shouldOfferAiConversion,
  type AiConfidence,
  type ConfidenceTone,
} from '@workspace/shared';

export type { FoodFormData };

export interface FoodFormProps {
  initialValues?: Partial<FoodFormData>;
  onSubmit: (data: FoodFormData) => void;
  submitRequestRef?: React.MutableRefObject<(() => void) | null>;
  onServingChange?: (servingSize: string, servingUnit: string) => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  hideSubmitButton?: boolean;
  showAutoScaleNutrition?: boolean;
  initialAutoScaleNutritionEnabled?: boolean;
  unitSelector?: {
    variants: FoodUnitVariant[];
    selectedSelection?: FoodUnitSelectionResult | null;
    onUnitSelectionChange?: (
      selection: FoodUnitSelectionResult,
    ) =>
      | Promise<FoodUnitSelectionResult | void>
      | FoodUnitSelectionResult
      | void;
    /** Food id for the inline AI estimate path. Omit (or pass undefined) for
     *  unsaved foods — the sheet will then skip the persistent variant POST
     *  and emit the AI variant inline as a draft selection so the parent form
     *  can persist it only if the user later saves. */
    foodId?: string;
  };
  /**
   * When the user picks a new serving unit compatible with the current one
   * (e.g. g ↔ oz), convert the serving size value to keep the same quantity
   * expressed in the new unit. Incompatible swaps (g → cup) leave the value
   * alone — the user is relabeling, not converting.
   */
  convertServingSizeOnUnitChange?: boolean;
  equivalents?: {
    items: EquivalentUnit[];
    onChange: (next: EquivalentUnit[]) => void;
    disabled?: boolean;
  };
  headerChildren?: React.ReactNode;
  children?: React.ReactNode;
  /** Initial custom nutrient values (key = nutrient name, value = amount). */
  customNutrients?: Record<string, string | number> | null;
  /** Called whenever the user changes a custom nutrient value. */
  onCustomNutrientsChange?: (values: Record<string, number>) => void;
}

const androidSparkleStyle =
  Platform.OS === 'android'
    ? ({ transform: [{ scaleX: 0.86 }, { scaleY: 0.9 }] } as const)
    : undefined;

// Confidence tone colors for the inline post-estimate AI badge; mirrors the picker sheet.
type AiToneColors = Record<ConfidenceTone, string>;

const FoodForm: React.FC<FoodFormProps> = ({
  initialValues,
  onSubmit,
  submitRequestRef,
  onServingChange,
  submitLabel,
  isSubmitting = false,
  hideSubmitButton = false,
  showAutoScaleNutrition = false,
  initialAutoScaleNutritionEnabled = false,
  unitSelector,
  convertServingSizeOnUnitChange = false,
  equivalents,
  headerChildren,
  children,
  customNutrients: customNutrientsProp,
  onCustomNutrientsChange,
}) => {
  const { t } = useTranslation();
  // A caller may reuse the canonical English SAVE_LABEL marker for the footer
  // submit button; localize it so it follows the active app language.
  const resolvedSubmitLabel =
    submitLabel && submitLabel !== SAVE_LABEL
      ? submitLabel
      : submitLabel === SAVE_LABEL
        ? t('common.save', 'Save')
        : t('foodForm.addFood', { defaultValue: 'Add Food' });
  const [form, setForm] = useState<FoodFormData>(() =>
    buildDisplayFormState(initialValues),
  );
  const [showMoreNutrients, setShowMoreNutrients] = useState(false);

  const { isConnected } = useServerConnection();
  const { customNutrients: customNutrientDefs } = useCustomNutrients({ enabled: isConnected });

  const [customNutrientForm, setCustomNutrientForm] = useState<Record<string, string>>(() => {
    if (!customNutrientsProp) return {};
    const initial: Record<string, string> = {};
    for (const [name, value] of Object.entries(customNutrientsProp)) {
      const n = Number(value) || 0;
      initial[name] = formatFoodFormNumber(n, 'nutrient') || '';
    }
    return initial;
  });

  useEffect(() => {
    setCustomNutrientForm((prev) => {
      const next: Record<string, string> = {};
      if (customNutrientsProp) {
        for (const [name, value] of Object.entries(customNutrientsProp)) {
          const n = Number(value) || 0;
          next[name] = formatFoodFormNumber(n, 'nutrient') || '';
        }
      }
      const sameKeys =
        Object.keys(prev).length === Object.keys(next).length &&
        Object.entries(next).every(([k, v]) => prev[k] === v);
      return sameKeys ? prev : next;
    });
  }, [customNutrientsProp]);

  const updateCustomNutrient = (name: string, text: string) => {
    if (!DECIMAL_INPUT_REGEX.test(text)) return;
    // Build the next form from one consistent snapshot so the edited field and
    // every other field are read from the same object — no per-field stale reads.
    const nextForm = { ...customNutrientForm, [name]: text };
    setCustomNutrientForm(nextForm);
    if (!onCustomNutrientsChange) return;
    const numeric: Record<string, number> = {};
    for (const def of customNutrientDefs) {
      const parsed = parseDecimalInput(nextForm[def.name] ?? '');
      numeric[def.name] = Number.isFinite(parsed) ? parsed : 0;
    }
    // Preserve any stored custom-nutrient values that no longer have a matching
    // definition (e.g. the definition was deleted) so editing a food doesn't
    // silently drop them.
    for (const [key, raw] of Object.entries(nextForm)) {
      if (!(key in numeric)) {
        const parsed = parseDecimalInput(raw);
        numeric[key] = Number.isFinite(parsed) ? parsed : 0;
      }
    }
    onCustomNutrientsChange(numeric);
  };

  // AI gate for the inline AI estimate flow inside FoodUnitSelectorSheet.
  // Re-checked on every render so flipping the preference live takes effect.
  // The sheet itself further requires the swap to be incompatible
  // weight↔volume — compatible swaps stay on the math-only path.
  const { data: userAiConfigAllowed } = useUserAiConfigAllowed();
  const { data: activeAiServiceSetting } = useActiveAiServiceSetting({
    enabled: userAiConfigAllowed === true,
  });
  const { preferences: userPreferences } = usePreferences();
  const aiEstimatesAvailable =
    userAiConfigAllowed === true &&
    !!activeAiServiceSetting &&
    userPreferences?.ai_assisted_conversions !== false;
  const [autoScaleNutrition, setAutoScaleNutrition] = useState(
    initialAutoScaleNutritionEnabled,
  );
  const [selectedUnitSelection, setSelectedUnitSelection] =
    useState<FoodUnitSelectionResult | null>(() =>
      normalizeSelectedUnitSelection(unitSelector?.selectedSelection),
    );
  const [showManualUpdateBanner, setShowManualUpdateBanner] = useState(() => {
    const initial = normalizeSelectedUnitSelection(unitSelector?.selectedSelection);
    return Boolean(
      initial?.kind === 'draft' && initial.requiresNutritionUpdate,
    );
  });
  const [selectedSavedVariantId, setSelectedSavedVariantId] = useState<
    string | undefined
  >(
    unitSelector?.selectedSelection?.kind === 'existing'
      ? unitSelector.selectedSelection.variant.id
      : unitSelector?.variants[0]?.id,
  );
  const [textMuted, textPrimary, accentColor, infoBg, infoText] = useCSSVariable([
    '--color-text-muted',
    '--color-text-primary',
    '--color-accent-primary',
    '--color-bg-info',
    '--color-text-info',
  ]) as [string, string, string, string, string];
  const preciseNumericValuesRef = useRef<
    Partial<Record<NumericFoodFormField, number>>
  >(buildPreciseNumericValues(initialValues));
  const lastServingSizeRef = useRef(parseDecimalInput(initialValues?.servingSize ?? ''));
  const hasTouchedAutoScaleRef = useRef(false);

  // Captured at the moment of an incompatible unit swap (the one that opens
  // the "manual update required" banner). Only used to know the post-swap
  // `fromUnit` for the AI request — the SCALING anchor is the food's trusted
  // default variant (see `trustedAnchorRef`), not the row's pre-swap state.
  const swapContextRef = useRef<{
    fromUnit: string;
  } | null>(null);
  // The food's trusted default variant — AI estimates ALWAYS scale from this.
  // Matches the web behavior of anchoring on the food's default so sequential
  // AI estimates don't compound off each other (`g default → cup AI → ml`
  // anchors on `g default`, not on the AI cup value). Initialized from
  // `unitSelector.variants` whenever the variant list changes.
  const trustedAnchorRef = useRef<FoodUnitVariant | null>(null);
  const [isEstimatingAi, setIsEstimatingAi] = useState(false);

  // Confidence-tone text colors for the AI badge that appears below the unit
  // row after AI auto-applies. Sparkle icon lives inside the picker dropdown
  // (FoodUnitSelectorSheet) — this badge is a tone-pill mirroring the style
  // used on FoodPhotoEstimateReviewScreen so AI surfaces feel consistent.
  const [aiSuccessText, aiWarningText, aiDangerText] = useCSSVariable([
    '--color-text-success',
    '--color-text-warning',
    '--color-text-danger-subtle',
  ]) as [string, string, string];
  const aiTextColorByTone: AiToneColors = {
    success: aiSuccessText,
    warning: aiWarningText,
    error: aiDangerText,
  };
  const aiBadgeBgClassByTone: Record<ConfidenceTone, string> = {
    success: 'bg-bg-success',
    warning: 'bg-bg-warning',
    error: 'bg-bg-danger-subtle',
  };

  const fieldRefs = {
    name: useRef<TextInput>(null),
    brand: useRef<TextInput>(null),
    servingSize: useRef<TextInput>(null),
    calories: useRef<TextInput>(null),
    protein: useRef<TextInput>(null),
    fat: useRef<TextInput>(null),
    carbs: useRef<TextInput>(null),
    fiber: useRef<TextInput>(null),
    saturatedFat: useRef<TextInput>(null),
    transFat: useRef<TextInput>(null),
    sodium: useRef<TextInput>(null),
    sugars: useRef<TextInput>(null),
    potassium: useRef<TextInput>(null),
    cholesterol: useRef<TextInput>(null),
    calcium: useRef<TextInput>(null),
    iron: useRef<TextInput>(null),
    vitaminA: useRef<TextInput>(null),
    vitaminC: useRef<TextInput>(null),
  };

  const focusField = (field: keyof typeof fieldRefs) => {
    fieldRefs[field].current?.focus();
  };

  const applyCompatibleDraftSelection = (variant: FoodUnitVariant) => {
    setForm((previous) => {
      const currentServingSize =
        preciseNumericValuesRef.current.servingSize ??
        parseDecimalInput(previous.servingSize);
      const nextServingSize = isPositiveNumber(currentServingSize)
        ? currentServingSize
        : variant.serving_size;
      const scaledVariant = scaleCompatibleDraftVariant(
        variant,
        nextServingSize,
      );
      NUTRITION_FIELDS.forEach((field) => {
        preciseNumericValuesRef.current[field as NumericFoodFormField] =
          getScaledVariantNumericValue(
            field as Exclude<NumericFoodFormField, 'servingSize'>,
            scaledVariant,
          );
      });
      preciseNumericValuesRef.current.servingSize = nextServingSize;
      if (isPositiveNumber(nextServingSize)) {
        lastServingSizeRef.current = nextServingSize;
      }
      return applyCompatibleDraftToFormState(
        previous,
        variant,
        scaledVariant,
      );
    });
  };

  const update = (field: keyof FoodFormData, value: string) => {
    // Manual nutrition edits on an AI-tagged unit immediately take ownership
    // away from AI — the saved variant becomes 'manual' so it isn't mislabeled.
    // servingSize is intentionally excluded: that's a scale op, not a value
    // re-entry, and AI-then-auto-scale stays semantically "AI-sourced at the
    // original quantity". serving_unit changes route through the sheet, which
    // emits a fresh draft selection. Matches web's immediate-clear behavior.
    const isNutritionField = NUTRITION_FIELDS.includes(field);
    if (
      isNutritionField &&
      selectedUnitSelection &&
      selectedUnitSelection.variant.source === 'ai_estimate'
    ) {
      const clearedVariant: FoodUnitVariant = {
        ...selectedUnitSelection.variant,
        source: 'manual',
        ai_confidence: null,
      };
      const clearedSelection: FoodUnitSelectionResult = {
        kind: 'draft',
        variant: clearedVariant,
      };
      setSelectedUnitSelection(clearedSelection);
      setSelectedSavedVariantId(undefined);
      setShowManualUpdateBanner(false);
      void unitSelector?.onUnitSelectionChange?.(clearedSelection);
    }

    setForm((prev) => {
      if (
        NUMERIC_FOOD_FORM_FIELD_SET.has(field) &&
        (field !== 'servingSize' || !autoScaleNutrition)
      ) {
        const parsedValue = parseDecimalInput(value);
        if (Number.isFinite(parsedValue)) {
          preciseNumericValuesRef.current[field as NumericFoodFormField] =
            parsedValue;
        } else {
          delete preciseNumericValuesRef.current[field as NumericFoodFormField];
        }
      }

      if (
        field === 'servingUnit' &&
        convertServingSizeOnUnitChange &&
        value !== prev.servingUnit
      ) {
        const current = parseDecimalInput(prev.servingSize);
        // getConversionFactor returns null for incompatible units (e.g. g→cup),
        // in which case we leave the size value alone — the user is relabeling.
        const factor =
          Number.isFinite(current) && current > 0
            ? getConversionFactor(prev.servingUnit, value)
            : null;
        if (factor !== null && factor !== 0) {
          const converted = current / factor;
          const rounded = Math.round(converted * 10) / 10;
          preciseNumericValuesRef.current.servingSize = converted;
          return {
            ...prev,
            servingUnit: value,
            servingSize: String(rounded),
          };
        }
      }

      if (field !== 'servingSize' || !autoScaleNutrition) {
        return { ...prev, [field]: value };
      }

      const nextServingSize = parseDecimalInput(value);
      const currentServingSize =
        preciseNumericValuesRef.current.servingSize ??
        parseDecimalInput(prev.servingSize);
      const previousServingSize = isPositiveNumber(currentServingSize)
        ? currentServingSize
        : lastServingSizeRef.current;

      if (!isPositiveNumber(nextServingSize) || !isPositiveNumber(previousServingSize)) {
        return { ...prev, servingSize: value };
      }

      const ratio = nextServingSize / previousServingSize;
      const nutritionUpdates: Partial<FoodFormData> = {};
      NUTRITION_FIELDS.forEach((nutritionField) => {
        const preciseValue =
          preciseNumericValuesRef.current[
            nutritionField as NumericFoodFormField
          ] ?? parseDecimalInput(prev[nutritionField]);

        if (!Number.isFinite(preciseValue)) {
          nutritionUpdates[nutritionField] = prev[nutritionField];
          return;
        }

        const scaledValue = preciseValue * ratio;
        preciseNumericValuesRef.current[
          nutritionField as NumericFoodFormField
        ] = scaledValue;
        nutritionUpdates[nutritionField] = formatScaledInput(scaledValue);
      });
      preciseNumericValuesRef.current.servingSize = nextServingSize;

      return { ...prev, servingSize: value, ...nutritionUpdates };
    });
  };

  useEffect(() => {
    if (form.servingSize || form.servingUnit) {
      onServingChange?.(form.servingSize, form.servingUnit);
    }
  }, [form.servingSize, form.servingUnit, onServingChange]);

  useEffect(() => {
    const servingSize = parseDecimalInput(form.servingSize);
    if (isPositiveNumber(servingSize)) {
      lastServingSizeRef.current = servingSize;
    }
  }, [form.servingSize]);

  useEffect(() => {
    const normalizedSelection = normalizeSelectedUnitSelection(
      unitSelector?.selectedSelection,
    );
    setSelectedUnitSelection(normalizedSelection);
    setShowManualUpdateBanner(
      Boolean(
        normalizedSelection?.kind === 'draft' &&
          normalizedSelection.requiresNutritionUpdate,
      ),
    );
    setSelectedSavedVariantId((previous) => {
      if (normalizedSelection?.kind === 'existing') {
        return normalizedSelection.variant.id;
      }

      if (normalizedSelection?.kind === 'draft') {
        const backingSavedVariant = unitSelector?.variants.find(
          (variant) =>
            Boolean(variant.id) &&
            variant.id === normalizedSelection.variant.id,
        );
        return backingSavedVariant?.id;
      }

      return unitSelector?.variants[0]?.id;
    });
  }, [unitSelector?.selectedSelection, unitSelector?.variants]);

  const selection = unitSelector?.selectedSelection;
  const selectionRequiresNutritionUpdate =
    selection?.kind === 'draft' ? selection.requiresNutritionUpdate : false;

  useEffect(() => {
    if (!selection) return;
    if (selection.kind === 'draft' && selection.requiresNutritionUpdate) {
      setForm((prev) =>
        prev.servingUnit === selection.variant.serving_unit
          ? prev
          : { ...prev, servingUnit: selection.variant.serving_unit },
      );
      return;
    }
    if (selection.kind === 'draft') {
      applyCompatibleDraftSelection(selection.variant);
      return;
    }
    preciseNumericValuesRef.current = {
      ...preciseNumericValuesRef.current,
      ...buildPreciseNumericValuesFromVariant(selection.variant),
    };
    lastServingSizeRef.current = selection.variant.serving_size;
    setForm((prev) => applyVariantToFormState(prev, selection.variant));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selection?.kind,
    selection?.variant?.id,
    selection?.variant?.serving_unit,
    selectionRequiresNutritionUpdate,
  ]);

  useEffect(() => {
    if (!unitSelector?.variants?.length) {
      setSelectedSavedVariantId(undefined);
      trustedAnchorRef.current = null;
      return;
    }

    setSelectedSavedVariantId((previous) =>
      previous && unitSelector.variants.some((variant) => variant.id === previous)
        ? previous
        : unitSelector.variants[0]?.id,
    );

    // Refresh the trusted anchor whenever the variant list changes. Prefer
    // a non-AI default so AI estimates always scale from a manual ground
    // truth; if every variant is AI (unusual), the explicit default still
    // wins; final fallback is the first variant.
    const variants = unitSelector.variants;
    trustedAnchorRef.current =
      variants.find(
        (v) => v.is_default === true && v.source !== 'ai_estimate',
      ) ??
      variants.find((v) => v.source !== 'ai_estimate') ??
      variants.find((v) => v.is_default === true) ??
      variants[0] ??
      null;
  }, [unitSelector?.variants]);

  useEffect(() => {
    if (!showAutoScaleNutrition) {
      hasTouchedAutoScaleRef.current = false;
      setAutoScaleNutrition(false);
      return;
    }

    if (!hasTouchedAutoScaleRef.current) {
      setAutoScaleNutrition(initialAutoScaleNutritionEnabled);
    }
  }, [initialAutoScaleNutritionEnabled, showAutoScaleNutrition]);

  const handleUnitSelectorSelection = async (
    selection: FoodUnitSelectionResult,
  ) => {
    // For incompatible swaps that surface the manual-update banner, capture
    // the unit so the inline AI button knows what it's converting FROM. The
    // scaling anchor itself is always the food's trusted default variant (see
    // `trustedAnchorRef`) — not the pre-swap form state — so sequential AI
    // estimates don't compound off each other.
    if (
      selection.kind === 'draft' &&
      selection.requiresNutritionUpdate === true
    ) {
      const prevUnit = form.servingUnit;
      if (prevUnit && prevUnit !== selection.variant.serving_unit) {
        swapContextRef.current = { fromUnit: selection.variant.serving_unit };
      } else {
        swapContextRef.current = null;
      }
    } else {
      // Any non-swap path invalidates the AI anchor.
      swapContextRef.current = null;
    }


    const nextSelection = normalizeSelectedUnitSelection(
      (await unitSelector?.onUnitSelectionChange?.(selection)) ?? selection,
    );

    if (!nextSelection) return;

    setSelectedUnitSelection(nextSelection);
    setShowManualUpdateBanner(
      Boolean(
        nextSelection.kind === 'draft' &&
          nextSelection.requiresNutritionUpdate,
      ),
    );
    if (nextSelection.kind === 'existing') {
      setSelectedSavedVariantId(nextSelection.variant.id);
    }
    if (nextSelection.kind === 'existing') {
      preciseNumericValuesRef.current = {
        ...preciseNumericValuesRef.current,
        ...buildPreciseNumericValuesFromVariant(nextSelection.variant),
      };
      lastServingSizeRef.current = nextSelection.variant.serving_size;
    }
    if (nextSelection.kind === 'draft') {
      if (nextSelection.requiresNutritionUpdate) {
        // AI eligibility for this swap is gauged against the food's trusted
        // anchor unit (what AI would actually convert to), not the pre-swap
        // form state. Keeps auto-scale ON only when AI has a real path forward.
        const canAiConvert = shouldOfferAiConversion(
          trustedAnchorRef.current?.serving_unit ?? '',
          nextSelection.variant.serving_unit,
        );

        if (!canAiConvert) {
          setAutoScaleNutrition(false);
          hasTouchedAutoScaleRef.current = true;
        }

        setForm((previous) =>
          applyVariantUnitToFormState(previous, nextSelection.variant),
        );
        return;
      }

      applyCompatibleDraftSelection(nextSelection.variant);
      return;
    }

    setForm((previous) =>
      applyVariantToFormState(previous, nextSelection.variant),
    );
  };

  /**
   * Inline AI estimate: invoked from the button next to the manual-update
   * banner. Uses the captured pre-swap context as the AI anchor — sends
   * `fromAmount {fromUnit}` and asks for the equivalent in `{prevUnit}`,
   * then scales the trusted default variant's nutrition by `estimatedAmount /
   * anchor.serving_size`.
   *
   * On success: auto-fills the row's nutrition, stamps AI provenance on the
   * pending draft variant, restores Auto-Scale to the user's intent, and
   * dismisses the banner. No "Use this" confirmation step — this surface is
   * a single-tap commitment. Manual edits to nutrition fields afterward keep
   * the AI tag visible until save-time (see `update()` + `handleSubmitPress`)
   * which prompts the user to keep or remove the badge.
   */
  const handleAiEstimate = async () => {
    const context = swapContextRef.current;
    const anchor = trustedAnchorRef.current;
    if (!context || !anchor) return;
    if (!(Number.isFinite(anchor.serving_size) && anchor.serving_size > 0)) {
      Toast.show({
        type: 'error',
        text1: t('foodForm.ai.couldNotEstimate', { defaultValue: "Couldn't estimate" }),
        text2: t('foodForm.ai.noTrustedDefault', { defaultValue: 'The food has no trusted default to scale from.' }),
      });
      return;
    }
    const fromAmount =
      preciseNumericValuesRef.current.servingSize ??
      parseDecimalInput(form.servingSize);
    if (!Number.isFinite(fromAmount) || fromAmount <= 0) {
      Toast.show({
        type: 'error',
        text1: t('foodForm.ai.servingSizeRequired', { defaultValue: 'Set a serving size first' }),
      });
      return;
    }

    setIsEstimatingAi(true);
    try {
      const result = await requestAiUnitConversion({
        foodId: unitSelector?.foodId ?? 'pending-new-food',
        foodName: form.name.trim() || 'Untitled food',
        brand: form.brand.trim() || undefined,
        fromUnit: context.fromUnit,
        fromAmount,
        toUnit: anchor.serving_unit,
        knownVariants: (unitSelector?.variants ?? []).map((v) => ({
          amount: v.serving_size,
          unit: v.serving_unit,
        })),
      });

      // AI tells us: `fromAmount {fromUnit}` ≡ `estimatedAmount {anchor.unit}`.
      // The trusted anchor defines nutrition for `anchor.serving_size
      // {anchor.unit}`. So the new nutrition for `fromAmount {fromUnit}` is
      //   anchor.nutrition × (estimatedAmount / anchor.serving_size).
      // Anchoring on the food's default (not on the pre-swap form state)
      // matches web behavior and prevents AI estimates from compounding off
      // earlier AI values.
      const ratio = result.estimatedAmount / anchor.serving_size;
      const scaledNutrition: Partial<FoodFormData> = {};
      const scaledPreciseUpdates: Partial<Record<NumericFoodFormField, number>> = {};
      const anchorNutritionByField: Partial<Record<NumericFoodFormField, number>> = {
        calories: anchor.calories,
        protein: anchor.protein,
        carbs: anchor.carbs,
        fat: anchor.fat,
        fiber: anchor.dietary_fiber,
        saturatedFat: anchor.saturated_fat,
        transFat: anchor.trans_fat,
        sodium: anchor.sodium,
        sugars: anchor.sugars,
        potassium: anchor.potassium,
        cholesterol: anchor.cholesterol,
        calcium: anchor.calcium,
        iron: anchor.iron,
        vitaminA: anchor.vitamin_a,
        vitaminC: anchor.vitamin_c,
      };
      NUTRITION_FIELDS.forEach((field) => {
        const anchorValue =
          anchorNutritionByField[field as NumericFoodFormField];
        if (!Number.isFinite(anchorValue)) return;
        const next = (anchorValue as number) * ratio;
        scaledNutrition[field] = formatScaledInput(next);
        scaledPreciseUpdates[field as NumericFoodFormField] = next;
      });

      // Apply scaled nutrition + clear banner. We don't change servingSize or
      // servingUnit — the row already has the user's chosen new unit.
      preciseNumericValuesRef.current = {
        ...preciseNumericValuesRef.current,
        ...scaledPreciseUpdates,
      };
      setForm((prev) => ({ ...prev, ...scaledNutrition }));
      setShowManualUpdateBanner(false);

      // Build an AI-tagged draft variant so the parent screen's deferred-POST
      // pattern (FoodFormScreen.handleSubmit → buildVariantFromFormData) picks
      // up source/ai_confidence. The variant's nutrition is
      // already correct; on submit, buildVariantFromFormData spreads this
      // variant first, then overwrites with the form's current numbers — so
      // later manual edits override the AI nutrition while the provenance
      // tag still survives unless update() explicitly clears it.
      const aiVariant: FoodUnitVariant = {
        id: FORM_DRAFT_UNIT_ID,
        serving_size: fromAmount,
        serving_unit: context.fromUnit,
        calories: scaledPreciseUpdates.calories ?? 0,
        protein: scaledPreciseUpdates.protein ?? 0,
        carbs: scaledPreciseUpdates.carbs ?? 0,
        fat: scaledPreciseUpdates.fat ?? 0,
        dietary_fiber: scaledPreciseUpdates.fiber,
        saturated_fat: scaledPreciseUpdates.saturatedFat,
        trans_fat: scaledPreciseUpdates.transFat,
        sodium: scaledPreciseUpdates.sodium,
        sugars: scaledPreciseUpdates.sugars,
        potassium: scaledPreciseUpdates.potassium,
        cholesterol: scaledPreciseUpdates.cholesterol,
        calcium: scaledPreciseUpdates.calcium,
        iron: scaledPreciseUpdates.iron,
        vitamin_a: scaledPreciseUpdates.vitaminA,
        vitamin_c: scaledPreciseUpdates.vitaminC,
        source: 'ai_estimate',
        ai_confidence: result.confidence,
      };
      const aiSelection: FoodUnitSelectionResult = {
        kind: 'draft',
        variant: aiVariant,
      };
      setSelectedUnitSelection(aiSelection);
      // Propagate to the screen so its pendingUnitSelection picks up the AI
      // tags — buildVariantFromFormData spreads this variant on submit.
      void unitSelector?.onUnitSelectionChange?.(aiSelection);

      swapContextRef.current = null;
    } catch {
      const message =
        t('foodForm.ai.estimateFailed', { defaultValue: 'AI estimate failed.' });
      Toast.show({
        type: 'error',
        text1: t('foodForm.ai.couldNotEstimate', { defaultValue: "Couldn't estimate" }),
        text2: message,
      });
    } finally {
      setIsEstimatingAi(false);
    }
  };

  const renderTextField = (
    label: string,
    field: keyof FoodFormData,
    placeholder: string,
    required?: boolean,
    nextField?: keyof typeof fieldRefs,
  ) => (
    <View className="gap-1.5">
      <Text className="text-text-secondary text-sm font-medium">
        {label}{required ? ' *' : ''}
      </Text>
      <FormInput
        ref={fieldRefs[field as keyof typeof fieldRefs]}
        placeholder={placeholder}
        value={form[field]}
        onChangeText={(v) => update(field, v)}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType={nextField ? 'next' : 'done'}
        onSubmitEditing={nextField ? () => focusField(nextField) : undefined}
      />
    </View>
  );

  const renderNumericField = (
    label: string,
    field: keyof FoodFormData,
    unit?: string,
    required?: boolean,
    nextField?: keyof typeof fieldRefs,
  ) => (
    <View className="gap-1.5 flex-1">
      <Text className="text-text-secondary text-sm font-medium">
        {label}{unit ? ` (${unit})` : ''}{required ? ' *' : ''}
      </Text>
      <FormInput
        ref={fieldRefs[field as keyof typeof fieldRefs]}
        placeholder="0"
        value={form[field]}
        onChangeText={(v) => {
          if (DECIMAL_INPUT_REGEX.test(v)) update(field, v);
        }}
        keyboardType="decimal-pad"
      />
    </View>
  );

  const submitForm = () =>
    onSubmit({
      ...form,
      ...Object.fromEntries(
        NUMERIC_FOOD_FORM_FIELDS.map((field) => [
          field,
          preciseNumericValuesRef.current[field] != null
            ? toPreciseFormString(preciseNumericValuesRef.current[field])
            : form[field],
        ]),
      ),
    });

  const handleSubmitPress = () => {
    if (!showManualUpdateBanner) {
      submitForm();
      return;
    }

    Alert.alert(
      t('foodForm.manualUpdate.title', { defaultValue: 'Manual Nutrition Update' }),
      t('foodForm.manualUpdate.message', { defaultValue: "Can't convert between units. Update nutrition values manually before saving." }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('foodForm.manualUpdate.saveAnyway', { defaultValue: 'Save Anyway' }),
          onPress: submitForm,
        },
      ],
    );
  };

  useEffect(() => {
    if (!submitRequestRef) return;
    submitRequestRef.current = handleSubmitPress;
    return () => {
      submitRequestRef.current = null;
    };
  });

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-4 pb-20 gap-4"
        keyboardShouldPersistTaps="handled"
      >
        {headerChildren}
        <View className="bg-surface rounded-xl p-4 gap-4 shadow-sm">
          {/* Food info */}
          {renderTextField(t('foodForm.foodName', { defaultValue: 'Food Name' }), 'name', t('foodForm.foodNamePlaceholder', { defaultValue: 'e.g. Chicken Breast' }), true, 'brand')}
          {renderTextField(t('foodForm.brand', { defaultValue: 'Brand' }), 'brand', t('foodForm.optional', { defaultValue: 'Optional' }), false, 'servingSize')}

          {/* Serving */}
          <View className="flex-row gap-3">
            {renderNumericField(t('foodForm.servingSize', { defaultValue: 'Serving Size' }), 'servingSize', undefined, false, 'calories')}
            <View className="gap-1.5 flex-1">
              <Text className="text-text-secondary text-sm font-medium">{t('foodForm.servingUnit', { defaultValue: 'Serving Unit' })}</Text>
              {unitSelector ? (
                <FoodUnitSelectorSheet
                  variants={unitSelector.variants}
                  selectedVariantId={selectedSavedVariantId}
                  selectedSelection={selectedUnitSelection}
                  title={t('foodForm.selectUnit', { defaultValue: 'Select Unit' })}
                  onSelect={handleUnitSelectorSelection}
                  renderTrigger={({ onPress }) => (
                    <TouchableOpacity
                      onPress={onPress}
                      activeOpacity={0.7}
                      className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
                      style={{ height: 44 }}
                    >
                      <Text
                        className="text-text-primary flex-1 pr-2"
                        style={{ fontSize: 16 }}
                        numberOfLines={1}
                      >
                        {form.servingUnit ? localizeFoodUnit(form.servingUnit, t) : t('foodForm.unit', { defaultValue: 'unit' })}
                      </Text>
                      <Icon
                        name="chevron-down"
                        size={12}
                        color={textMuted}
                        weight="medium"
                      />
                    </TouchableOpacity>
                  )}
                />
              ) : (
                <BottomSheetPicker
                  value={form.servingUnit}
                  sections={makeServingUnitSections(t)}
                  onSelect={(v) => update('servingUnit', v)}
                  title={t('foodForm.selectUnit', { defaultValue: 'Select Unit' })}
                  placeholder={t('foodForm.unit', { defaultValue: 'unit' })}
                  renderTrigger={({ onPress, selectedOption }) => (
                    <TouchableOpacity
                      onPress={onPress}
                      activeOpacity={0.7}
                      className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
                      style={{ height: 44 }}
                    >
                      <Text
                        className={selectedOption ? 'text-text-primary' : 'text-text-muted'}
                        style={{ fontSize: 16 }}
                      >
                        {selectedOption?.label ?? t('foodForm.unit', { defaultValue: 'unit' })}
                      </Text>
                      <Icon
                        name="chevron-down"
                        size={12}
                        color={textMuted}
                        weight="medium"
                      />
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </View>

          {equivalents ? (
            <EquivalentsSection
              items={equivalents.items}
              onChange={equivalents.onChange}
              disabled={equivalents.disabled}
              textMuted={textMuted}
              accentColor={accentColor}
            />
          ) : null}

          {showAutoScaleNutrition ? (
            <View className="flex-row items-center justify-between mt-1.5">
              <Text className="text-text-secondary text-base">{t('foodForm.autoScaleNutrition', { defaultValue: 'Auto Scale Nutrition' })}</Text>
              <Switch
                accessibilityLabel={t('foodForm.autoScaleNutrition', { defaultValue: 'Auto Scale Nutrition' })}
                value={autoScaleNutrition}
                onValueChange={(value) => {
                  hasTouchedAutoScaleRef.current = true;
                  setAutoScaleNutrition(value);
                }}
              />
            </View>
          ) : null}

          {showManualUpdateBanner ? (() => {
            // AI eligibility for this swap. When true, the Convert with AI
            // button appears below the banner. The banner text itself is
            // unconditional now — the button is the affordance.
            const canAiConvert =
              aiEstimatesAvailable &&
              swapContextRef.current != null &&
              trustedAnchorRef.current != null &&
              shouldOfferAiConversion(
                trustedAnchorRef.current.serving_unit,
                form.servingUnit,
              );
            return (
            <View className="mt-1.5 gap-2">
              <View
                className="rounded-lg px-3 py-3 flex-row items-center gap-2.5"
                style={{ backgroundColor: infoBg }}
              >
                <Icon name="info-circle" size={18} color={infoText} />
                <Text
                  className="text-sm font-medium flex-1"
                  style={{ color: infoText }}
                >
                  {t('foodForm.manualUpdate.banner', { defaultValue: "Can't convert between units. Update nutrition values manually." })}
                </Text>
              </View>
              {canAiConvert ? (
                <TouchableOpacity
                  onPress={handleAiEstimate}
                  disabled={isEstimatingAi}
                  activeOpacity={0.7}
                  className={`bg-raised rounded-xl py-3 items-center justify-center ${isEstimatingAi ? 'opacity-50' : ''}`}
                >
                  {isEstimatingAi ? (
                    <View className="flex-row items-center gap-2">
                      <ActivityIndicator size="small" color={textPrimary} />
                      <Text className="text-text-primary font-semibold">
                        {t('foodForm.ai.estimating', { defaultValue: 'Estimating…' })}
                      </Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-2">
                      <Icon
                        name="sparkles"
                        size={16}
                        color={textPrimary}
                        style={androidSparkleStyle}
                      />
                      <Text className="text-text-primary font-semibold">
                        {t('foodForm.ai.convertWithAI', { defaultValue: 'Convert with AI' })}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
            );
          })() : null}

          {selectedUnitSelection?.variant.source === 'ai_estimate' &&
          selectedUnitSelection.variant.ai_confidence ? (
            <View
              className={`mt-1.5 rounded-lg p-3 ${
                aiBadgeBgClassByTone[
                  CONFIDENCE_TONES[
                    selectedUnitSelection.variant
                      .ai_confidence as AiConfidence
                  ]
                ]
              }`}
            >
              <Text
                className="text-sm font-semibold"
                style={{
                  color:
                    aiTextColorByTone[
                      CONFIDENCE_TONES[
                        selectedUnitSelection.variant
                          .ai_confidence as AiConfidence
                      ]
                    ],
                }}
              >
                {
                  localizeAiEstimateQuality(
                    t,
                    selectedUnitSelection.variant
                      .ai_confidence as AiConfidence,
                  )
                }
              </Text>
            </View>
          ) : null}

          <View className="gap-1.5 mt-1.5">
            <Text className="text-text-primary text-sm font-bold">
              {t('foodForm.caloriesRequired', { defaultValue: 'Calories (kcal) *' })}
            </Text>
            <FormInput
              ref={fieldRefs.calories}
              placeholder="0"
              value={form.calories}
              onChangeText={(v) => {
                if (DECIMAL_INPUT_REGEX.test(v)) update('calories', v);
              }}
              keyboardType="decimal-pad"
            />
          </View>
          <View className="flex-row gap-3">
            {renderNumericField(t('nutrients.fat', { defaultValue: 'Fat' } ), 'fat', 'g', false, 'carbs')}
            {renderNumericField(t('nutrients.carbs', { defaultValue: 'Carbs' } ), 'carbs', 'g', false, 'protein')}
          </View>
          <View className="flex-row gap-3">
            {renderNumericField(t('nutrients.protein', { defaultValue: 'Protein' } ), 'protein', 'g', false, 'fiber')}
            {renderNumericField(t('nutrients.fiber', { defaultValue: 'Fiber' } ), 'fiber', 'g', false, showMoreNutrients ? 'saturatedFat' : undefined)}
          </View>
          <Button
            variant="ghost"
            onPress={() => setShowMoreNutrients((prev) => !prev)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="self-start py-0 px-0"
            textClassName="text-sm"
          >
            <Text style={{ color: accentColor }} className="text-sm font-medium">
              {showMoreNutrients ? t('foodNutrition.hideExtra', { defaultValue: 'Hide extra nutrients ▴' }) : t('foodNutrition.showMore', { defaultValue: 'Show more nutrients ▾' })}
            </Text>
          </Button>

          {showMoreNutrients && (
            <>
              <View className="flex-row gap-3">
                {renderNumericField(t('nutrients.saturatedFatLabel', { defaultValue: "Saturated Fat" } ), 'saturatedFat', 'g', false, 'transFat')}
                {renderNumericField(t('nutrients.transFat', { defaultValue: 'Trans Fat' } ), 'transFat', 'g', false, 'cholesterol')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField(t('nutrients.cholesterol', { defaultValue: 'Cholesterol' } ), 'cholesterol', 'mg', false, 'sodium')}
                {renderNumericField(t('nutrients.sodium', { defaultValue: 'Sodium' } ), 'sodium', 'mg', false, 'sugars')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField(t('nutrients.sugars', { defaultValue: 'Sugars' } ), 'sugars', 'g', false, 'calcium')}
                {renderNumericField(t('nutrients.calcium', { defaultValue: 'Calcium' } ), 'calcium', 'mg', false, 'iron')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField(t('nutrients.iron', { defaultValue: 'Iron' } ), 'iron', 'mg', false, 'vitaminA')}
                {renderNumericField(t('nutrients.vitaminA', { defaultValue: 'Vitamin A' } ), 'vitaminA', 'mcg', false, 'vitaminC')}
              </View>
              <View className="flex-row gap-3">
                {renderNumericField(t('nutrients.vitaminC', { defaultValue: 'Vitamin C' } ), 'vitaminC', 'mg', false, 'potassium')}
                {renderNumericField(t('nutrients.potassium', { defaultValue: 'Potassium' } ), 'potassium', 'mg')}
              </View>
              {Array.from({ length: Math.ceil(customNutrientDefs.length / 2) }, (_, rowIndex) => {
                const first = customNutrientDefs[rowIndex * 2];
                const second = customNutrientDefs[rowIndex * 2 + 1];
                return (
                  <View key={first.name} className="flex-row gap-3">
                    <View className="gap-1.5 flex-1">
                      <Text className="text-text-secondary text-sm font-medium">
                        {first.name}{first.unit ? ` (${first.unit})` : ''}
                      </Text>
                      <FormInput
                        placeholder="0"
                        value={customNutrientForm[first.name] ?? ''}
                        onChangeText={(v) => updateCustomNutrient(first.name, v)}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    {second ? (
                      <View className="gap-1.5 flex-1">
                        <Text className="text-text-secondary text-sm font-medium">
                          {second.name}{second.unit ? ` (${second.unit})` : ''}
                        </Text>
                        <FormInput
                          placeholder="0"
                          value={customNutrientForm[second.name] ?? ''}
                          onChangeText={(v) => updateCustomNutrient(second.name, v)}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ) : <View className="flex-1" />}
                  </View>
                );
              })}
            </>
          )}
        </View>

        {children}

        {/* Submit */}
        {!hideSubmitButton && (
        <Button
          variant="primary"
          className="mt-2"
          loading={isSubmitting}
          onPress={handleSubmitPress}
        >
          {resolvedSubmitLabel}
        </Button>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default FoodForm;
