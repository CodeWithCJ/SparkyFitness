import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { useUpdateFoodEntriesSnapshotMutation } from '@/hooks/Foods/useFoods';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { useQueryClient } from '@tanstack/react-query';
import {
  foodVariantsOptions,
  useSaveFoodMutation,
} from '@/hooks/Foods/useFoodVariants';
import { isUUID, deepClone } from '@/utils/foodSearch';
import { error } from '@/utils/logging';
import {
  createDefaultFormVariant,
  foodVariantToFormVariant,
  FormFoodVariant,
  formVariantToFoodVariant,
  sanitizeGlycemicIndexFrontend,
} from '@/utils/foodForm';
import { nutrientFields } from '@/constants/foodForm';
import {
  getConversionFactor,
  shouldOfferAiConversion,
} from '@workspace/shared';
import type { AiEstimateData } from '@/hooks/Foods/useUnitConversion';
import type {
  EquivalentUnit,
  Food,
  FoodVariant,
  FormFoodVariantWithEquivalents,
  GlycemicIndex,
  NumericFoodVariantKeys,
} from '@/types/food';

interface UseCustomFoodFormProps {
  food?: Food;
  initialVariants?: FoodVariant[];
  onSave: (foodData: Food) => void;
}

type GroupedFormFoodVariant = FormFoodVariantWithEquivalents;

function toPositiveNumber(value: unknown): number | null {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function buildManualConversionToast(aiAvailable: boolean) {
  return {
    title: 'Manual Nutrition Update',
    description: aiAvailable
      ? "Can't convert between units. Update nutrition values manually or convert with AI."
      : "Can't convert between units. Update nutrition values manually.",
  } as const;
}

function canOfferAiConversionForUnits(
  fromUnits: Array<string | null | undefined>,
  toUnit: string
) {
  return fromUnits.some(
    (fromUnit) =>
      typeof fromUnit === 'string' &&
      fromUnit.length > 0 &&
      shouldOfferAiConversion(fromUnit, toUnit)
  );
}

function scaleVariantNutrition(
  variant: FormFoodVariant,
  ratio: number,
  precision: number = 4
): FormFoodVariant {
  const scaledVariant = {
    ...variant,
  };

  nutrientFields.forEach((nutrient) => {
    const originalValue = Number(variant[nutrient]);
    if (!isNaN(originalValue)) {
      scaledVariant[nutrient] = Number(
        (originalValue * ratio).toFixed(precision)
      );
    }
  });

  if (variant.custom_nutrients) {
    const scaledCustomNutrients = { ...variant.custom_nutrients };
    Object.keys(variant.custom_nutrients).forEach((name) => {
      const originalValue = Number(variant.custom_nutrients?.[name]);
      if (!isNaN(originalValue)) {
        scaledCustomNutrients[name] = Number(
          (originalValue * ratio).toFixed(precision)
        );
      }
    });
    scaledVariant.custom_nutrients = scaledCustomNutrients;
  }

  return scaledVariant;
}

function buildExactVariantSnapshot(
  exactVariant: FormFoodVariant,
  currentVariant: GroupedFormFoodVariant,
  autoScaleIntent: boolean
): GroupedFormFoodVariant {
  return {
    ...deepClone(exactVariant),
    id: currentVariant.id,
    is_default: currentVariant.is_default,
    equivalents: deepClone(currentVariant.equivalents || []),
    is_locked: autoScaleIntent,
    ai_confidence: exactVariant.ai_confidence ?? null,
    ai_reasoning: exactVariant.ai_reasoning ?? null,
  };
}

function groupEquivalentVariants(
  variants: FormFoodVariant[]
): GroupedFormFoodVariant[] {
  const grouped: GroupedFormFoodVariant[] = [];

  for (const variant of variants) {
    const matchIndex = grouped.findIndex((g) => {
      for (const field of nutrientFields) {
        if (g[field] !== variant[field]) return false;
      }
      const c1 = g.custom_nutrients || {};
      const c2 = variant.custom_nutrients || {};
      const keys1 = Object.keys(c1);
      const keys2 = Object.keys(c2);

      if (keys1.length !== keys2.length) return false;
      for (const key of keys1) {
        if (c1[key] !== c2[key]) return false;
      }
      return true;
    });
    const match = grouped[matchIndex];
    if (matchIndex !== -1) {
      match?.equivalents?.push({
        id: variant.id,
        serving_size: Number(variant.serving_size),
        serving_unit: variant.serving_unit,
      });
    } else {
      grouped.push({ ...variant, equivalents: [] });
    }
  }

  return grouped;
}

export function useCustomFoodForm({
  food,
  initialVariants,
  onSave,
}: UseCustomFoodFormProps) {
  const { user } = useAuth();
  const { energyUnit, convertEnergy, loggingLevel, autoScaleOnlineImports } =
    usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';

  const queryClient = useQueryClient();
  const { data: customNutrients } = useCustomNutrients();
  const { mutateAsync: updateFoodEntriesSnapshot } =
    useUpdateFoodEntriesSnapshotMutation();
  const { mutateAsync: saveFood } = useSaveFoodMutation();

  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<GroupedFormFoodVariant[]>([]);
  const [originalVariants, setOriginalVariants] = useState<
    GroupedFormFoodVariant[]
  >([]);
  const [servingSizeScalingBaseVariants, setServingSizeScalingBaseVariants] =
    useState<GroupedFormFoodVariant[]>([]);
  const [loadedVariants, setLoadedVariants] = useState<
    (GroupedFormFoodVariant | null)[]
  >([]);
  const [manualUnitConversionPending, setManualUnitConversionPending] =
    useState<boolean[]>([]);
  // Per-row record of the unit the AI estimate was produced FOR. Lets the
  // unit-swap branch recognize "swap back to the AI-estimated unit" and clear
  // the pending-conversion state instead of asking the user to re-estimate.
  // Initialized from `serving_unit` whenever an AI variant is loaded or a
  // fresh estimate is applied; cleared when the row's AI tag drops.
  const [aiEstimatedUnits, setAiEstimatedUnits] = useState<(string | null)[]>(
    []
  );
  const [autoScaleIntents, setAutoScaleIntents] = useState<boolean[]>([]);
  const [hasTrustedCompatibilityBase, setHasTrustedCompatibilityBase] =
    useState<boolean[]>([]);
  const [variantErrors, setVariantErrors] = useState<string[]>([]);
  const [showSyncConfirmation, setShowSyncConfirmation] = useState(false);
  const [syncFoodId, setSyncFoodId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    is_quick_food: false,
  });

  const initializeVariantState = useCallback(
    (
      grouped: GroupedFormFoodVariant[],
      options: { autoScaleIntent: boolean; hasTrustedBase: boolean }
    ) => {
      const trustedSnapshot = deepClone(grouped);
      const scalingSnapshot = deepClone(grouped);
      setVariants(grouped);
      setOriginalVariants(trustedSnapshot);
      setServingSizeScalingBaseVariants(scalingSnapshot);
      setLoadedVariants(deepClone(grouped));
      setManualUnitConversionPending(new Array(grouped.length).fill(false));
      setAiEstimatedUnits(
        grouped.map((v) => (v.source === 'ai_estimate' ? v.serving_unit : null))
      );
      setAutoScaleIntents(
        new Array(grouped.length).fill(options.autoScaleIntent)
      );
      setHasTrustedCompatibilityBase(
        new Array(grouped.length).fill(options.hasTrustedBase)
      );
      setVariantErrors(new Array(grouped.length).fill(''));
    },
    []
  );

  const resetForm = useCallback(() => {
    setFormData({ name: '', brand: '', is_quick_food: false });
    const defaultVariant = createDefaultFormVariant(customNutrients);
    const grouped = groupEquivalentVariants([defaultVariant]);
    initializeVariantState(grouped, {
      autoScaleIntent: false,
      hasTrustedBase: false,
    });
  }, [customNutrients, initializeVariantState]);

  const loadExistingVariants = useCallback(async () => {
    if (!food?.id || !isUUID(food.id)) return;

    try {
      const data = await queryClient.fetchQuery(foodVariantsOptions(food.id));
      let loaded: FormFoodVariant[] = [];

      if (data && data.length > 0) {
        let defaultVariant =
          data.find((v) => v.is_default) ??
          (food.default_variant
            ? data.find((v) => v.id === food.default_variant?.id)
            : undefined) ??
          data[0];

        if (defaultVariant) {
          defaultVariant = { ...defaultVariant, is_default: true };
          loaded = [
            foodVariantToFormVariant({
              ...defaultVariant,
              is_locked: autoScaleOnlineImports,
            }),
            ...data
              .filter((v) => v.id !== defaultVariant?.id)
              .map((v) =>
                foodVariantToFormVariant({
                  ...v,
                  is_locked: autoScaleOnlineImports,
                })
              ),
          ];
        } else {
          loaded = data.map((v) =>
            foodVariantToFormVariant({
              ...v,
              is_locked: autoScaleOnlineImports,
            })
          );
        }
      } else {
        loaded = [
          createDefaultFormVariant(customNutrients, {
            is_locked: autoScaleOnlineImports,
          }),
        ];
      }

      const grouped = groupEquivalentVariants(loaded);
      initializeVariantState(grouped, {
        autoScaleIntent: autoScaleOnlineImports,
        hasTrustedBase: true,
      });
    } catch (err) {
      console.error('Error loading variants:', err);
      const fallback = createDefaultFormVariant(customNutrients, {
        is_locked: autoScaleOnlineImports,
      });
      const grouped = groupEquivalentVariants([fallback]);
      initializeVariantState(grouped, {
        autoScaleIntent: autoScaleOnlineImports,
        hasTrustedBase: true,
      });
    }
  }, [
    autoScaleOnlineImports,
    customNutrients,
    food?.default_variant,
    food?.id,
    initializeVariantState,
    queryClient,
  ]);

  useEffect(() => {
    if (food) {
      setFormData({
        name: food.name || '',
        brand: food.brand || '',
        is_quick_food: food.is_quick_food || false,
      });

      if (food.variants && food.variants.length > 0) {
        const mapped = food.variants.map((v) =>
          foodVariantToFormVariant({
            ...v,
            is_locked: autoScaleOnlineImports,
            glycemic_index: sanitizeGlycemicIndexFrontend(v.glycemic_index),
          })
        );
        mapped.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));

        const grouped = groupEquivalentVariants(mapped);
        initializeVariantState(grouped, {
          autoScaleIntent: autoScaleOnlineImports,
          hasTrustedBase: true,
        });
      } else {
        loadExistingVariants();
      }
    } else if (initialVariants && initialVariants.length > 0) {
      setFormData({ name: '', brand: '', is_quick_food: false });
      const mapped = initialVariants.map((variant) =>
        foodVariantToFormVariant({
          ...variant,
          is_locked: autoScaleOnlineImports,
        })
      );
      mapped.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));

      const grouped = groupEquivalentVariants(mapped);
      initializeVariantState(grouped, {
        autoScaleIntent: autoScaleOnlineImports,
        hasTrustedBase: true,
      });
    } else {
      resetForm();
    }
  }, [
    autoScaleOnlineImports,
    customNutrients,
    food,
    initialVariants,
    initializeVariantState,
    loadExistingVariants,
    resetForm,
  ]);

  const addVariant = () => {
    const newVariant = createDefaultFormVariant(customNutrients, {
      serving_size: 1,
      is_default: false,
      is_locked: false,
    });
    const groupedVariant = { ...newVariant, equivalents: [] };
    const clone = deepClone(groupedVariant);

    setVariants((prev) => [...prev, groupedVariant]);
    setOriginalVariants((prev) => [...prev, clone]);
    setServingSizeScalingBaseVariants((prev) => [...prev, deepClone(clone)]);
    setLoadedVariants((prev) => [...prev, null]);
    setManualUnitConversionPending((prev) => [...prev, false]);
    setAiEstimatedUnits((prev) => [...prev, null]);
    setAutoScaleIntents((prev) => [...prev, false]);
    setHasTrustedCompatibilityBase((prev) => [...prev, false]);
    setVariantErrors((prev) => [...prev, '']);
  };

  const duplicateVariant = (index: number) => {
    const src = variants[index];
    const sourceOriginalVariant = originalVariants[index];
    const sourceServingSizeScalingBaseVariant =
      servingSizeScalingBaseVariants[index];
    const sourceRequiresManualConversion =
      manualUnitConversionPending[index] ?? false;
    const sourceAutoScaleIntent = autoScaleIntents[index] ?? false;

    if (!src) {
      error(
        loggingLevel,
        'Could not find variant to duplicate at index:',
        index
      );
      return;
    }

    const newVariant: FormFoodVariant & { equivalents: EquivalentUnit[] } = {
      ...src,
      id: undefined,
      is_default: false,
      is_locked: sourceAutoScaleIntent && !sourceRequiresManualConversion,
      equivalents: deepClone(src.equivalents || []),
    };

    const originalClone = deepClone(
      sourceRequiresManualConversion ? sourceOriginalVariant || src : newVariant
    );
    const scalingClone = deepClone(
      sourceServingSizeScalingBaseVariant || newVariant
    );

    setVariants((prev) => [...prev, newVariant]);
    setOriginalVariants((prev) => [...prev, originalClone]);
    setServingSizeScalingBaseVariants((prev) => [...prev, scalingClone]);
    setLoadedVariants((prev) => [...prev, null]);
    setManualUnitConversionPending((prev) => [
      ...prev,
      sourceRequiresManualConversion,
    ]);
    setAiEstimatedUnits((prev) => [
      ...prev,
      src.source === 'ai_estimate' ? src.serving_unit : null,
    ]);
    setAutoScaleIntents((prev) => [...prev, sourceAutoScaleIntent]);
    setHasTrustedCompatibilityBase((prev) => [
      ...prev,
      hasTrustedCompatibilityBase[index] ?? false,
    ]);
    setVariantErrors((prev) => [...prev, '']);
  };

  const removeVariant = (index: number) => {
    if (index === 0) {
      toast({
        title: 'Cannot remove default unit',
        description:
          "The default unit represents the food's primary serving and cannot be removed.",
        variant: 'destructive',
      });
      return;
    }
    setVariants((prev) => prev.filter((_, i) => i !== index));
    setOriginalVariants((prev) => prev.filter((_, i) => i !== index));
    setServingSizeScalingBaseVariants((prev) =>
      prev.filter((_, i) => i !== index)
    );
    setLoadedVariants((prev) => prev.filter((_, i) => i !== index));
    setManualUnitConversionPending((prev) =>
      prev.filter((_, i) => i !== index)
    );
    setAiEstimatedUnits((prev) => prev.filter((_, i) => i !== index));
    setAutoScaleIntents((prev) => prev.filter((_, i) => i !== index));
    setHasTrustedCompatibilityBase((prev) =>
      prev.filter((_, i) => i !== index)
    );
    setVariantErrors((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVariant = (
    index: number,
    field: keyof FormFoodVariant | string,
    value: string | number | boolean | null | GlycemicIndex | EquivalentUnit[]
  ) => {
    const updatedVariants = [...variants];
    const updatedOriginalVariants = [...originalVariants];
    const updatedServingSizeScalingBaseVariants = [
      ...servingSizeScalingBaseVariants,
    ];
    const updatedManualUnitConversionPending = [...manualUnitConversionPending];
    const updatedAiEstimatedUnits = [...aiEstimatedUnits];
    const updatedAutoScaleIntents = [...autoScaleIntents];
    const updatedHasTrustedCompatibilityBase = [...hasTrustedCompatibilityBase];
    const currentVariant = updatedVariants[index];

    if (!currentVariant) {
      error(loggingLevel, 'Could not find variant to update at index:', index);
      return;
    }

    const isCustomNutrient = customNutrients?.some((n) => n.name === field);
    const isNutrientField =
      nutrientFields.includes(field as NumericFoodVariantKeys) ||
      isCustomNutrient;

    let newVariant: FormFoodVariant & { equivalents?: EquivalentUnit[] };

    if (isCustomNutrient) {
      newVariant = {
        ...currentVariant,
        custom_nutrients: {
          ...currentVariant.custom_nutrients,
          [field]: value === '' ? '' : Number(value),
        },
      };
    } else if (isNutrientField) {
      newVariant = {
        ...currentVariant,
        [field as keyof FormFoodVariant]: value === '' ? '' : Number(value),
      };
    } else {
      newVariant = {
        ...currentVariant,
      };
      (newVariant as Record<string, unknown>)[field] = value;
    }

    // Manual nutrition edits should immediately take ownership away from AI.
    // serving_size is intentionally not treated as a manual override because
    // auto-scaling an AI estimate is still the same estimate at a new amount.
    if (
      (isCustomNutrient || isNutrientField) &&
      currentVariant.source === 'ai_estimate'
    ) {
      newVariant.source = 'manual';
      newVariant.ai_confidence = null;
      newVariant.ai_reasoning = null;
      updatedAiEstimatedUnits[index] = null;
      updatedOriginalVariants[index] = deepClone(newVariant);
      updatedServingSizeScalingBaseVariants[index] = deepClone(newVariant);
      updatedHasTrustedCompatibilityBase[index] = true;
    }

    const updatedErrors = [...variantErrors];
    if (field === 'serving_size') {
      const num = Number(value);
      updatedErrors[index] =
        isNaN(num) || num <= 0 ? 'Serving size must be a positive number.' : '';
      setVariantErrors(updatedErrors);
    }

    if (field === 'calories' && value !== '' && typeof value === 'number') {
      newVariant.calories = convertEnergy(value, energyUnit, 'kcal');
    }

    if (field === 'is_locked') {
      const nextLocked = Boolean(value);
      updatedAutoScaleIntents[index] = nextLocked;
      newVariant.is_locked = nextLocked;

      if (nextLocked) {
        updatedManualUnitConversionPending[index] = false;
        if (toPositiveNumber(newVariant.serving_size) !== null) {
          updatedServingSizeScalingBaseVariants[index] = deepClone(newVariant);
          if (newVariant.source !== 'ai_estimate') {
            updatedOriginalVariants[index] = deepClone(newVariant);
          }
          setOriginalVariants(updatedOriginalVariants);
          setServingSizeScalingBaseVariants(
            updatedServingSizeScalingBaseVariants
          );
        }
      }
    }

    if (field === 'serving_unit') {
      const oldUnit = currentVariant.serving_unit;
      const newUnit = String(value);
      const loadedVariant = loadedVariants[index] ?? null;
      const variantHasTrustedCompatibilityBase =
        hasTrustedCompatibilityBase[index] ?? false;
      const trustedConversionBaseVariant =
        updatedOriginalVariants[index] ?? loadedVariant ?? currentVariant;
      const trustedBaseUnit =
        trustedConversionBaseVariant?.serving_unit ?? oldUnit;
      const manualConversionPendingForVariant =
        updatedManualUnitConversionPending[index] ?? false;
      const autoScaleIntentForVariant = updatedAutoScaleIntents[index] ?? false;
      const exactSavedVariant =
        (loadedVariant && newUnit === loadedVariant.serving_unit
          ? loadedVariant
          : null) ??
        loadedVariants.find(
          (donor, donorIndex) =>
            donorIndex !== index &&
            Boolean(donor?.id) &&
            donor?.serving_unit === newUnit
        ) ??
        null;
      const trustedOwnManualBase =
        variantHasTrustedCompatibilityBase &&
        trustedConversionBaseVariant?.source !== 'ai_estimate'
          ? trustedConversionBaseVariant
          : null;
      const trustedManualBaseCandidate =
        (trustedOwnManualBase &&
        getConversionFactor(trustedOwnManualBase.serving_unit, newUnit) !== null
          ? trustedOwnManualBase
          : null) ??
        loadedVariants.find(
          (donor, donorIndex) =>
            donorIndex !== index &&
            Boolean(donor?.id) &&
            donor !== null &&
            donor?.source !== 'ai_estimate' &&
            getConversionFactor(donor.serving_unit, newUnit) !== null
        ) ??
        null;

      if (exactSavedVariant) {
        newVariant = buildExactVariantSnapshot(
          exactSavedVariant,
          currentVariant,
          autoScaleIntentForVariant
        );
        updatedManualUnitConversionPending[index] = false;
        updatedAiEstimatedUnits[index] =
          exactSavedVariant.source === 'ai_estimate' ? newUnit : null;
        updatedHasTrustedCompatibilityBase[index] =
          exactSavedVariant.source !== 'ai_estimate' ||
          variantHasTrustedCompatibilityBase;
        updatedServingSizeScalingBaseVariants[index] = deepClone(newVariant);
        if (exactSavedVariant.source !== 'ai_estimate') {
          updatedOriginalVariants[index] = deepClone(newVariant);
        }

        updatedVariants[index] = newVariant;
        setVariants(updatedVariants);
        setOriginalVariants(updatedOriginalVariants);
        setServingSizeScalingBaseVariants(
          updatedServingSizeScalingBaseVariants
        );
        setManualUnitConversionPending(updatedManualUnitConversionPending);
        setAiEstimatedUnits(updatedAiEstimatedUnits);
        setAutoScaleIntents(updatedAutoScaleIntents);
        setHasTrustedCompatibilityBase(updatedHasTrustedCompatibilityBase);
        return;
      }

      // AI-tagged rows: never auto-scale on unit swap, even when the new unit
      // is math-compatible with the AI-estimated one. The user's rule: once a
      // unit has been AI-estimated for a food, sibling units in the same
      // category should also be AI-estimated rather than math-derived from
      // the AI value — otherwise it gets unclear what's "real" vs. "AI".
      //   • Swap back to the AI-estimated unit (tracked in aiEstimatedUnits)
      //     → restore the row by clearing the pending flag. Nutrition values
      //     were never altered during the prior swap so they're already
      //     correct for the AI unit.
      //   • Any other unit → keep the AI tag, suppress scaling, mark pending
      //     so the AI button re-offers (anchored on the default variant).
      if (trustedManualBaseCandidate) {
        const baseServingSize = toPositiveNumber(
          trustedManualBaseCandidate.serving_size
        );
        const nextServingSize = toPositiveNumber(currentVariant.serving_size);
        const baseFactor = getConversionFactor(
          trustedManualBaseCandidate.serving_unit,
          newUnit
        );

        if (
          baseServingSize !== null &&
          nextServingSize !== null &&
          baseFactor !== null
        ) {
          const ratio = (nextServingSize * baseFactor) / baseServingSize;
          newVariant = scaleVariantNutrition(trustedManualBaseCandidate, ratio);
          newVariant.serving_size = currentVariant.serving_size;
          newVariant.serving_unit = newUnit;
          newVariant.source = trustedManualBaseCandidate.source;
          newVariant.ai_confidence = null;
          newVariant.ai_reasoning = null;
          newVariant.is_locked = autoScaleIntentForVariant;
          updatedManualUnitConversionPending[index] = false;
          updatedAiEstimatedUnits[index] = null;
          updatedHasTrustedCompatibilityBase[index] = true;
        }
      } else if (currentVariant.source === 'ai_estimate') {
        const savedAiUnit = aiEstimatedUnits[index] ?? null;
        if (savedAiUnit !== null && newUnit === savedAiUnit) {
          newVariant.serving_unit = newUnit;
          updatedManualUnitConversionPending[index] = false;
          newVariant.is_locked = autoScaleIntentForVariant;
        } else {
          const canAiConvert = canOfferAiConversionForUnits(
            [currentVariant.serving_unit],
            newUnit
          );
          newVariant.serving_unit = newUnit;
          updatedManualUnitConversionPending[index] = true;
          newVariant.is_locked = canAiConvert
            ? autoScaleIntentForVariant
            : false;
          toast(buildManualConversionToast(canAiConvert));
        }
        // Skip the rest of the unit-change branch.
        updatedVariants[index] = newVariant;
        setVariants(updatedVariants);
        setManualUnitConversionPending(updatedManualUnitConversionPending);
        setAiEstimatedUnits(updatedAiEstimatedUnits);
        setAutoScaleIntents(updatedAutoScaleIntents);
        setHasTrustedCompatibilityBase(updatedHasTrustedCompatibilityBase);
        return;
      } else if (!variantHasTrustedCompatibilityBase) {
        newVariant.serving_unit = newUnit;
        updatedManualUnitConversionPending[index] = false;
        newVariant.is_locked = autoScaleIntentForVariant;
      } else if (loadedVariant && newUnit === loadedVariant.serving_unit) {
        for (const nutrient of nutrientFields) {
          newVariant[nutrient] = loadedVariant[nutrient];
        }
        newVariant.custom_nutrients = deepClone(loadedVariant.custom_nutrients);
        updatedManualUnitConversionPending[index] = false;
        newVariant.is_locked = autoScaleIntentForVariant;
      } else {
        const directFactor = getConversionFactor(oldUnit, newUnit);
        const trustedBaseFactor = getConversionFactor(trustedBaseUnit, newUnit);

        if (
          manualConversionPendingForVariant &&
          trustedBaseFactor !== null &&
          trustedConversionBaseVariant
        ) {
          const baseServingSize = toPositiveNumber(
            trustedConversionBaseVariant.serving_size
          );
          const newServingSize = toPositiveNumber(currentVariant.serving_size);

          if (baseServingSize !== null && newServingSize !== null) {
            const ratio =
              (newServingSize * trustedBaseFactor) / baseServingSize;
            newVariant = scaleVariantNutrition(
              trustedConversionBaseVariant,
              ratio
            );
          }
          newVariant.serving_size = currentVariant.serving_size;
          newVariant.serving_unit = newUnit;
          updatedManualUnitConversionPending[index] = false;
          newVariant.is_locked = autoScaleIntentForVariant;
        } else if (
          !manualConversionPendingForVariant &&
          directFactor !== null
        ) {
          newVariant = scaleVariantNutrition(currentVariant, directFactor);
          newVariant.serving_size = currentVariant.serving_size;
          newVariant.serving_unit = newUnit;
          updatedManualUnitConversionPending[index] = false;
          newVariant.is_locked = autoScaleIntentForVariant;
        } else {
          const canAiConvert = canOfferAiConversionForUnits(
            [oldUnit, trustedBaseUnit],
            newUnit
          );
          toast(buildManualConversionToast(canAiConvert));
          updatedManualUnitConversionPending[index] = true;
          // Honor the user's auto-scale preference through incompatible
          // swaps. With AI estimation available, the user may want to set a
          // serving_size and have it scale once the estimate lands. While
          // manualUnitConversionPending is true the serving_size scaling
          // block is gated off anyway, so this is safe.
          newVariant.is_locked = canAiConvert
            ? autoScaleIntentForVariant
            : false;
        }
      }
    }

    if (field === 'is_default' && value === true) {
      updatedVariants.forEach((v, i) => {
        if (i !== index) v.is_default = false;
      });
    }

    if (
      field === 'serving_size' &&
      newVariant.is_locked &&
      !(updatedManualUnitConversionPending[index] ?? false)
    ) {
      const scalingBaseVariant =
        updatedServingSizeScalingBaseVariants[index] ?? currentVariant;
      if (!scalingBaseVariant) {
        error(
          loggingLevel,
          'Could not find serving-size scaling base variant at index:',
          index
        );
        return;
      }
      const baseServingSize = toPositiveNumber(scalingBaseVariant.serving_size);
      const nextServingSize = toPositiveNumber(value);
      if (baseServingSize !== null && nextServingSize !== null) {
        const ratio = nextServingSize / baseServingSize;
        newVariant = scaleVariantNutrition(scalingBaseVariant, ratio, 4);
        newVariant.serving_size = nextServingSize;
      }
    } else if (
      field !== 'serving_unit' ||
      !(updatedManualUnitConversionPending[index] ?? false)
    ) {
      updatedServingSizeScalingBaseVariants[index] = deepClone(newVariant);
      setServingSizeScalingBaseVariants(updatedServingSizeScalingBaseVariants);
      // While a manual-conversion-pending swap is in flight, `originalVariants`
      // must stay frozen at the PRE-SWAP state — it's the AI estimation
      // anchor. Updating it here on a serving_size edit (auto-scale, etc.)
      // overwrites the previous unit and breaks
      // `shouldOfferAiConversion(anchor.unit, row.unit)` (same-unit → false),
      // which makes the "Estimate with AI" button disappear mid-flow.
      if (
        newVariant.source !== 'ai_estimate' &&
        !(updatedManualUnitConversionPending[index] ?? false)
      ) {
        updatedOriginalVariants[index] = deepClone(newVariant);
        setOriginalVariants(updatedOriginalVariants);
      }
    }

    updatedVariants[index] = newVariant;
    setVariants(updatedVariants);
    setManualUnitConversionPending(updatedManualUnitConversionPending);
    setAiEstimatedUnits(updatedAiEstimatedUnits);
    setAutoScaleIntents(updatedAutoScaleIntents);
    setHasTrustedCompatibilityBase(updatedHasTrustedCompatibilityBase);
  };

  /**
   * Apply an AI-estimated unit conversion to a variant row. The anchor is
   * ALWAYS the food's default variant — that's the trusted source of truth
   * for the food's nutrition, and using it consistently avoids compounding
   * AI estimates on top of each other (which would happen if we anchored on
   * the row's previous state when the previous state was itself an AI value).
   *
   * Special case: if the swapping row IS the default, the current default's
   * unit is the new (swapped-to) unit, which isn't a valid anchor. Fall back
   * to originalVariants[defaultIndex], which is the pre-swap snapshot.
   *
   * AI was asked for the conversion of `row.serving_size {fromUnit}` to
   * `{toUnit}`, returning `estimatedAmount {toUnit}`. We scale the anchor's
   * nutrition by `estimatedAmount / anchor.serving_size` (because the anchor
   * defines nutrition per `anchor.serving_size {toUnit}`). The resulting
   * nutrition represents `estimatedAmount {toUnit}` worth of food, which
   * equals `row.serving_size {fromUnit}` by AI's estimate — so we preserve
   * the row's original `serving_size` rather than canonicalizing to 1.
   *
   * Also restores `is_locked` to the user's auto-scale preference — the
   * preceding incompatible-unit swap typically cleared it.
   */
  const applyAiEstimate = useCallback(
    (index: number, estimate: AiEstimateData) => {
      const defaultIndex = variants.findIndex((v) => v.is_default);
      const fallbackDefaultIndex = defaultIndex !== -1 ? defaultIndex : 0;
      const isSwappingDefault = index === fallbackDefaultIndex;
      const anchorVariant = isSwappingDefault
        ? originalVariants[fallbackDefaultIndex]
        : variants[fallbackDefaultIndex];
      if (!anchorVariant) return;

      const baseSize = toPositiveNumber(anchorVariant.serving_size);
      if (baseSize === null) {
        toast({
          title: 'Set the default variant first',
          description:
            'The default variant needs a positive serving size before AI can estimate other units.',
          variant: 'destructive',
        });
        return;
      }

      const ratio = estimate.estimatedAmount / baseSize;
      const scaled = scaleVariantNutrition(anchorVariant, ratio);
      const currentVariant = variants[index];
      if (!currentVariant) return;
      const autoScaleIntentForVariant =
        currentVariant.is_locked ?? autoScaleIntents[index] ?? false;

      const aiEstimatedVariant = {
        ...currentVariant,
        calories: scaled.calories,
        protein: scaled.protein,
        carbs: scaled.carbs,
        fat: scaled.fat,
        saturated_fat: scaled.saturated_fat,
        polyunsaturated_fat: scaled.polyunsaturated_fat,
        monounsaturated_fat: scaled.monounsaturated_fat,
        trans_fat: scaled.trans_fat,
        cholesterol: scaled.cholesterol,
        sodium: scaled.sodium,
        potassium: scaled.potassium,
        dietary_fiber: scaled.dietary_fiber,
        sugars: scaled.sugars,
        vitamin_a: scaled.vitamin_a,
        vitamin_c: scaled.vitamin_c,
        calcium: scaled.calcium,
        iron: scaled.iron,
        custom_nutrients: scaled.custom_nutrients
          ? { ...scaled.custom_nutrients }
          : currentVariant.custom_nutrients,
        // Restore auto-scale to this row's saved intent after the
        // incompatible-unit swap may have temporarily cleared it.
        is_locked: autoScaleIntentForVariant,
        source: 'ai_estimate' as const,
        ai_confidence: estimate.confidence,
        ai_reasoning: estimate.reasoning,
      };

      setVariants((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = aiEstimatedVariant;
        return next;
      });

      // Keep later serving_size edits anchored to the AI-populated row while
      // leaving originalVariants untouched as the trusted non-AI conversion base.
      setServingSizeScalingBaseVariants((prev) => {
        const next = [...prev];
        next[index] = deepClone(aiEstimatedVariant);
        return next;
      });

      setAutoScaleIntents((prev) => {
        const next = [...prev];
        next[index] = aiEstimatedVariant.is_locked ?? false;
        return next;
      });

      setManualUnitConversionPending((prev) => {
        const next = [...prev];
        next[index] = false;
        return next;
      });

      // Record the unit this row was just AI-estimated for. Lets a later
      // swap-back to this unit clear the pending-conversion state instead of
      // re-prompting the user to estimate.
      setAiEstimatedUnits((prev) => {
        const next = [...prev];
        next[index] = aiEstimatedVariant.serving_unit;
        return next;
      });
    },
    [variants, originalVariants, autoScaleIntents]
  );

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateBeforeSave = useCallback(() => {
    const newVariantErrors = variants.map((v) =>
      isNaN(Number(v.serving_size)) || Number(v.serving_size) <= 0
        ? 'Serving size must be a positive number.'
        : ''
    );
    setVariantErrors(newVariantErrors);

    if (newVariantErrors.some((entry) => entry !== '')) {
      toast({
        title: 'Validation Error',
        description: 'Please correct the errors in the unit variants.',
        variant: 'destructive',
      });
      return false;
    }

    const defaultCount = variants.filter((v) => v.is_default).length;
    if (defaultCount === 0) {
      toast({
        title: 'Validation Error',
        description: 'At least one variant must be marked as the default unit.',
        variant: 'destructive',
      });
      return false;
    }
    if (defaultCount > 1) {
      toast({
        title: 'Validation Error',
        description: 'Only one variant can be marked as the default unit.',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  }, [variants]);

  const persistFood = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const foodData: Food = {
        id: food?.id || '',
        name: formData.name,
        brand: formData.brand,
        is_quick_food: formData.is_quick_food,
        is_custom: true,
        barcode: food?.barcode,
        provider_external_id: food?.provider_external_id,
        provider_type: food?.provider_type,
      };

      const expandedVariants: FormFoodVariant[] = [];

      variants.forEach((variant) => {
        const { equivalents, ...baseVariant } = variant;
        expandedVariants.push(baseVariant as FormFoodVariant);

        if (equivalents && equivalents.length > 0) {
          equivalents.forEach((eq) => {
            expandedVariants.push({
              ...baseVariant,
              id: eq.id,
              is_default: false,
              serving_size: eq.serving_size,
              serving_unit: eq.serving_unit,
            } as FormFoodVariant);
          });
        }
      });

      const savedFood = await saveFood({
        foodData,
        variants: expandedVariants.map(formVariantToFoodVariant),
        userId: user.id,
        foodId: food?.id,
      });

      if (food?.id && user?.id === food.user_id) {
        setSyncFoodId(savedFood.id);
        setShowSyncConfirmation(true);
      } else {
        if (!food?.id) resetForm();
        onSave(savedFood);
      }
    } catch (err) {
      console.error('Error saving food:', err);
    } finally {
      setLoading(false);
    }
  }, [food, formData, onSave, resetForm, saveFood, user, variants]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateBeforeSave()) {
      return;
    }

    await persistFood();
  };

  const handleSyncConfirmation = async () => {
    if (syncFoodId) {
      try {
        await updateFoodEntriesSnapshot(syncFoodId);
      } catch {
        /* toast handled by QueryClient */
      }
    }
    setShowSyncConfirmation(false);
    if (food) onSave(food);
  };

  return {
    formData,
    variants,
    variantErrors,
    loading,
    showSyncConfirmation,
    setShowSyncConfirmation,
    loadedVariants,
    conversionBaseVariants: originalVariants,
    hasTrustedCompatibilityBase,
    manualUnitConversionPending,
    aiEstimatedUnits,
    platform,
    updateField,
    addVariant,
    duplicateVariant,
    removeVariant,
    updateVariant,
    applyAiEstimate,
    handleSubmit,
    handleSyncConfirmation,
  };
}
