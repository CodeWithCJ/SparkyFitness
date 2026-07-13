import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { searchBarcodeV2Options } from '@/hooks/Foods/useFoodsV2';
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
  convertNutrientAmount,
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
  aiEstimatesAvailable?: boolean;
}

type GroupedFormFoodVariant = FormFoodVariantWithEquivalents;

type VariantMeta = {
  manualUnitConversionPending: boolean;
  aiEstimatedUnit: string | null;
  autoScaleIntent: boolean;
  hasTrustedCompatibilityBase: boolean;
  error: string;
};

const DEFAULT_VARIANT_META: VariantMeta = {
  manualUnitConversionPending: false,
  aiEstimatedUnit: null,
  autoScaleIntent: false,
  hasTrustedCompatibilityBase: false,
  error: '',
};

type SwapOutcome = {
  variant: GroupedFormFoodVariant;
  metaPatch: Partial<VariantMeta>;
  originalPatch?: GroupedFormFoodVariant;
  scalingPatch?: GroupedFormFoodVariant;
} | null;

function toPositiveNumber(value: unknown): number | null {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
}

function buildManualConversionToast() {
  return {
    title: 'Manual Nutrition Update',
    description:
      "Can't convert between units. Update nutrition values manually.",
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

function tryExactUnitSwap(
  currentVariant: GroupedFormFoodVariant,
  loadedVariants: (GroupedFormFoodVariant | null)[],
  index: number,
  targetUnit: string,
  autoScaleIntent: boolean,
  prevHasTrustedBase: boolean
): SwapOutcome {
  const loadedVariant = loadedVariants[index] ?? null;
  const exactSavedVariant =
    (loadedVariant && targetUnit === loadedVariant.serving_unit
      ? loadedVariant
      : null) ??
    loadedVariants.find(
      (donor, donorIndex) =>
        donorIndex !== index &&
        Boolean(donor?.id) &&
        donor?.serving_unit === targetUnit
    ) ??
    null;
  if (!exactSavedVariant) return null;

  const variant = buildExactVariantSnapshot(
    exactSavedVariant,
    currentVariant,
    autoScaleIntent
  );
  const isAi = exactSavedVariant.source === 'ai_estimate';
  return {
    variant,
    metaPatch: {
      manualUnitConversionPending: false,
      aiEstimatedUnit: isAi ? targetUnit : null,
      hasTrustedCompatibilityBase: !isAi || prevHasTrustedBase,
    },
    originalPatch: isAi ? undefined : deepClone(variant),
  };
}

function tryConversionWithTrustedBase(
  currentVariant: GroupedFormFoodVariant,
  loadedVariants: (GroupedFormFoodVariant | null)[],
  index: number,
  variantHasTrustedCompatibilityBase: boolean,
  trustedConversionBaseVariant: GroupedFormFoodVariant,
  targetUnit: string,
  autoScaleIntent: boolean
): SwapOutcome {
  const trustedOwnManualBase =
    variantHasTrustedCompatibilityBase &&
    trustedConversionBaseVariant?.source !== 'ai_estimate'
      ? trustedConversionBaseVariant
      : null;
  const trustedManualBaseCandidate =
    (trustedOwnManualBase &&
    getConversionFactor(trustedOwnManualBase.serving_unit, targetUnit) !== null
      ? trustedOwnManualBase
      : null) ??
    loadedVariants.find(
      (donor, donorIndex) =>
        donorIndex !== index &&
        Boolean(donor?.id) &&
        donor !== null &&
        donor?.source !== 'ai_estimate' &&
        getConversionFactor(donor.serving_unit, targetUnit) !== null
    ) ??
    null;
  if (!trustedManualBaseCandidate) return null;

  const baseServingSize = toPositiveNumber(
    trustedManualBaseCandidate.serving_size
  );
  const nextServingSize = toPositiveNumber(currentVariant.serving_size);
  const baseFactor = getConversionFactor(
    trustedManualBaseCandidate.serving_unit,
    targetUnit
  );
  if (
    baseServingSize === null ||
    nextServingSize === null ||
    baseFactor === null
  ) {
    return null;
  }

  const ratio = (nextServingSize * baseFactor) / baseServingSize;
  const variant = scaleVariantNutrition(
    trustedManualBaseCandidate,
    ratio
  ) as GroupedFormFoodVariant;
  variant.serving_size = currentVariant.serving_size;
  variant.serving_unit = targetUnit;
  variant.source = trustedManualBaseCandidate.source;
  variant.ai_confidence = null;
  variant.is_locked = autoScaleIntent;

  return {
    variant,
    metaPatch: {
      manualUnitConversionPending: false,
      aiEstimatedUnit: null,
      hasTrustedCompatibilityBase: true,
    },
  };
}

function evaluateAiSwapBack(
  newVariant: GroupedFormFoodVariant,
  fromUnit: string,
  savedAiUnit: string | null,
  targetUnit: string,
  autoScaleIntent: boolean,
  aiEstimatesAvailable: boolean
): {
  variant: GroupedFormFoodVariant;
  metaPatch: Partial<VariantMeta>;
  showManualToast: boolean;
} {
  const variant = { ...newVariant };
  if (savedAiUnit !== null && targetUnit === savedAiUnit) {
    variant.serving_unit = targetUnit;
    variant.is_locked = autoScaleIntent;
    return {
      variant,
      metaPatch: { manualUnitConversionPending: false },
      showManualToast: false,
    };
  }

  const canAiConvert =
    aiEstimatesAvailable &&
    canOfferAiConversionForUnits([fromUnit], targetUnit);
  variant.serving_unit = targetUnit;
  variant.is_locked = canAiConvert ? autoScaleIntent : false;
  return {
    variant,
    metaPatch: { manualUnitConversionPending: true },
    showManualToast: true,
  };
}

export function useCustomFoodForm({
  food,
  initialVariants,
  onSave,
  aiEstimatesAvailable = true,
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
  const [variantMeta, setVariantMeta] = useState<VariantMeta[]>([]);
  const [showSyncConfirmation, setShowSyncConfirmation] = useState(false);
  const [savedFoodResult, setSavedFoodResult] = useState<Food | null>(null);
  const [showBarcodeConflictConfirmation, setShowBarcodeConflictConfirmation] =
    useState(false);
  const [barcodeConflictFoodName, setBarcodeConflictFoodName] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    is_quick_food: false,
    barcode: '',
  });

  // Provider nutrient values the user mapped onto this food (custom nutrient
  // name -> { provider field label, the nutrient's chosen unit }). Re-applied
  // whenever variants are rebuilt so the imported value survives — notably the
  // rebuild the effect below runs when creating a custom nutrient refetches the
  // list. Kept in a ref so recording a match doesn't retrigger that effect.
  const pendingProviderMatchesRef = useRef<
    Map<string, { label: string; unit?: string }>
  >(new Map());

  const applyProviderMatchesToVariants = useCallback(
    <T extends FormFoodVariant>(list: T[]): T[] => {
      if (pendingProviderMatchesRef.current.size === 0) return list;
      return list.map((variant) => {
        let next = variant;
        for (const [
          name,
          { label, unit },
        ] of pendingProviderMatchesRef.current) {
          const providerValue = Number(next.provider_nutrients?.[label]);
          if (!Number.isFinite(providerValue) || providerValue <= 0) continue;
          // Convert the provider amount into the nutrient's unit when both are
          // known and compatible; otherwise keep the provider's raw value.
          const providerUnit = next.provider_nutrient_units?.[label];
          const converted = convertNutrientAmount(
            providerValue,
            providerUnit,
            unit
          );
          const value =
            converted === null
              ? providerValue
              : Math.round(converted * 1e6) / 1e6;
          next = {
            ...next,
            custom_nutrients: {
              ...next.custom_nutrients,
              [name]: value,
            },
            // A concrete provider value counts as a manual edit for AI rows.
            ...(next.source === 'ai_estimate'
              ? { source: 'manual' as const, ai_confidence: null }
              : {}),
          };
        }
        return next;
      });
    },
    []
  );

  const initializeVariantState = useCallback(
    (
      grouped: GroupedFormFoodVariant[],
      options: { autoScaleIntent: boolean; hasTrustedBase: boolean }
    ) => {
      const withMatches = applyProviderMatchesToVariants(grouped);
      const trustedSnapshot = deepClone(withMatches);
      const scalingSnapshot = deepClone(withMatches);
      setVariants(withMatches);
      setOriginalVariants(trustedSnapshot);
      setServingSizeScalingBaseVariants(scalingSnapshot);
      setLoadedVariants(deepClone(withMatches));
      setVariantMeta(
        withMatches.map((v) => ({
          ...DEFAULT_VARIANT_META,
          aiEstimatedUnit: v.source === 'ai_estimate' ? v.serving_unit : null,
          autoScaleIntent: options.autoScaleIntent,
          hasTrustedCompatibilityBase: options.hasTrustedBase,
        }))
      );
    },
    [applyProviderMatchesToVariants]
  );

  const resetForm = useCallback(() => {
    setFormData({ name: '', brand: '', is_quick_food: false, barcode: '' });
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
        barcode: food.barcode || '',
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
      setFormData({ name: '', brand: '', is_quick_food: false, barcode: '' });
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
    setVariantMeta((prev) => [...prev, { ...DEFAULT_VARIANT_META }]);
  };

  const duplicateVariant = (index: number) => {
    const src = variants[index];
    const sourceOriginalVariant = originalVariants[index];
    const sourceServingSizeScalingBaseVariant =
      servingSizeScalingBaseVariants[index];
    const sourceMeta = variantMeta[index] ?? DEFAULT_VARIANT_META;
    const sourceRequiresManualConversion =
      sourceMeta.manualUnitConversionPending;
    const sourceAutoScaleIntent = sourceMeta.autoScaleIntent;

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
    setVariantMeta((prev) => [
      ...prev,
      {
        manualUnitConversionPending: sourceRequiresManualConversion,
        aiEstimatedUnit: src.source === 'ai_estimate' ? src.serving_unit : null,
        autoScaleIntent: sourceAutoScaleIntent,
        hasTrustedCompatibilityBase: sourceMeta.hasTrustedCompatibilityBase,
        error: '',
      },
    ]);
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
    setVariantMeta((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVariant = (
    index: number,
    field: keyof FormFoodVariant | string,
    value:
      | string
      | number
      | boolean
      | undefined
      | GlycemicIndex
      | EquivalentUnit[]
      | string[]
  ) => {
    const updatedVariants = [...variants];
    const updatedOriginalVariants = [...originalVariants];
    const updatedServingSizeScalingBaseVariants = [
      ...servingSizeScalingBaseVariants,
    ];
    const currentVariant = updatedVariants[index];

    if (!currentVariant) {
      error(loggingLevel, 'Could not find variant to update at index:', index);
      return;
    }

    const prevMeta = variantMeta[index] ?? DEFAULT_VARIANT_META;
    const metaPatch: Partial<VariantMeta> = {};
    const readMeta = <K extends keyof VariantMeta>(key: K): VariantMeta[K] =>
      metaPatch[key] !== undefined
        ? (metaPatch[key] as VariantMeta[K])
        : prevMeta[key];

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
          [field]: value === '' || value === undefined ? '' : Number(value),
        },
      };
    } else if (isNutrientField) {
      newVariant = {
        ...currentVariant,
        [field as keyof FormFoodVariant]:
          value === '' || value === undefined ? '' : Number(value),
      };
    } else {
      newVariant = {
        ...currentVariant,
      };
      (newVariant as Record<string, unknown>)[field] = value;
    }

    // Manual nutrient edits drop the AI tag (serving_size edits don't — they're scaling, not overriding).
    if (
      (isCustomNutrient || isNutrientField) &&
      currentVariant.source === 'ai_estimate'
    ) {
      newVariant.source = 'manual';
      newVariant.ai_confidence = null;
      metaPatch.aiEstimatedUnit = null;
      metaPatch.hasTrustedCompatibilityBase = true;
      updatedOriginalVariants[index] = deepClone(newVariant);
      updatedServingSizeScalingBaseVariants[index] = deepClone(newVariant);
    }

    if (field === 'serving_size') {
      const num = Number(value);
      metaPatch.error =
        isNaN(num) || num <= 0 ? 'Serving size must be a positive number.' : '';
    }

    if (field === 'calories' && value !== '' && typeof value === 'number') {
      newVariant.calories = convertEnergy(value, energyUnit, 'kcal');
    }

    if (field === 'is_locked') {
      const nextLocked = Boolean(value);
      metaPatch.autoScaleIntent = nextLocked;
      newVariant.is_locked = nextLocked;

      if (nextLocked) {
        metaPatch.manualUnitConversionPending = false;
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
      const trustedConversionBaseVariant =
        updatedOriginalVariants[index] ?? loadedVariant ?? currentVariant;
      const trustedBaseUnit =
        trustedConversionBaseVariant?.serving_unit ?? oldUnit;
      const manualConversionPendingForVariant = readMeta(
        'manualUnitConversionPending'
      );
      const autoScaleIntentForVariant = readMeta('autoScaleIntent');

      const exactSwap = tryExactUnitSwap(
        currentVariant,
        loadedVariants,
        index,
        newUnit,
        autoScaleIntentForVariant,
        readMeta('hasTrustedCompatibilityBase')
      );
      if (exactSwap) {
        newVariant = exactSwap.variant;
        Object.assign(metaPatch, exactSwap.metaPatch);
        updatedServingSizeScalingBaseVariants[index] = deepClone(newVariant);
        if (exactSwap.originalPatch) {
          updatedOriginalVariants[index] = exactSwap.originalPatch;
        }

        updatedVariants[index] = newVariant;
        setVariants(updatedVariants);
        setOriginalVariants(updatedOriginalVariants);
        setServingSizeScalingBaseVariants(
          updatedServingSizeScalingBaseVariants
        );
        setVariantMeta((prev) =>
          prev.map((m, i) => (i === index ? { ...m, ...metaPatch } : m))
        );
        return;
      }

      const trustedSwap = tryConversionWithTrustedBase(
        currentVariant,
        loadedVariants,
        index,
        readMeta('hasTrustedCompatibilityBase'),
        trustedConversionBaseVariant,
        newUnit,
        autoScaleIntentForVariant
      );
      if (trustedSwap) {
        newVariant = trustedSwap.variant;
        Object.assign(metaPatch, trustedSwap.metaPatch);
      } else if (currentVariant.source === 'ai_estimate') {
        // AI-tagged rows: swap back to the original AI unit clears pending; any other unit re-prompts via the AI flow.
        const aiSwap = evaluateAiSwapBack(
          newVariant,
          currentVariant.serving_unit,
          readMeta('aiEstimatedUnit'),
          newUnit,
          autoScaleIntentForVariant,
          aiEstimatesAvailable
        );
        newVariant = aiSwap.variant;
        Object.assign(metaPatch, aiSwap.metaPatch);
        if (aiSwap.showManualToast) {
          toast(buildManualConversionToast());
        }
        updatedVariants[index] = newVariant;
        setVariants(updatedVariants);
        setVariantMeta((prev) =>
          prev.map((m, i) => (i === index ? { ...m, ...metaPatch } : m))
        );
        return;
      } else if (!readMeta('hasTrustedCompatibilityBase')) {
        newVariant.serving_unit = newUnit;
        metaPatch.manualUnitConversionPending = false;
        newVariant.is_locked = autoScaleIntentForVariant;
      } else if (loadedVariant && newUnit === loadedVariant.serving_unit) {
        for (const nutrient of nutrientFields) {
          newVariant[nutrient] = loadedVariant[nutrient];
        }
        newVariant.custom_nutrients = deepClone(loadedVariant.custom_nutrients);
        metaPatch.manualUnitConversionPending = false;
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
          metaPatch.manualUnitConversionPending = false;
          newVariant.is_locked = autoScaleIntentForVariant;
        } else if (
          !manualConversionPendingForVariant &&
          directFactor !== null
        ) {
          newVariant = scaleVariantNutrition(currentVariant, directFactor);
          newVariant.serving_size = currentVariant.serving_size;
          newVariant.serving_unit = newUnit;
          metaPatch.manualUnitConversionPending = false;
          newVariant.is_locked = autoScaleIntentForVariant;
        } else {
          const canAiConvert =
            aiEstimatesAvailable &&
            canOfferAiConversionForUnits([oldUnit, trustedBaseUnit], newUnit);
          toast(buildManualConversionToast());
          metaPatch.manualUnitConversionPending = true;
          // Honor auto-scale only when this swap can be auto-converted; incompatible swaps clear it.
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
      !readMeta('manualUnitConversionPending')
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
      !readMeta('manualUnitConversionPending')
    ) {
      updatedServingSizeScalingBaseVariants[index] = deepClone(newVariant);
      setServingSizeScalingBaseVariants(updatedServingSizeScalingBaseVariants);
      // originalVariants is the AI anchor and must stay frozen while a manual conversion is pending.
      if (
        newVariant.source !== 'ai_estimate' &&
        !readMeta('manualUnitConversionPending')
      ) {
        updatedOriginalVariants[index] = deepClone(newVariant);
        setOriginalVariants(updatedOriginalVariants);
      }
    }

    updatedVariants[index] = newVariant;
    setVariants(updatedVariants);
    if (Object.keys(metaPatch).length > 0) {
      setVariantMeta((prev) =>
        prev.map((m, i) => (i === index ? { ...m, ...metaPatch } : m))
      );
    }
  };

  // Fill a custom nutrient's value across every variant from the matching
  // provider field (kept per-variant on provider_nutrients, already scaled).
  // Called when a user adds an alias / creates a nutrient from the provider
  // nutrient viewer, so the food being imported reflects it immediately.
  // Records the match so it survives the variant rebuild the create/update
  // triggers (custom nutrient list refetch), and applies it now in single
  // setState passes to avoid stale-state overwrites across variants.
  const applyProviderNutrientMatch = (
    nutrientName: string,
    providerLabel: string,
    nutrientUnit?: string
  ) => {
    pendingProviderMatchesRef.current.set(nutrientName, {
      label: providerLabel,
      unit: nutrientUnit,
    });
    setVariants((prev) => applyProviderMatchesToVariants(prev));
    setOriginalVariants((prev) => applyProviderMatchesToVariants(prev));
    setServingSizeScalingBaseVariants((prev) =>
      applyProviderMatchesToVariants(prev)
    );
  };

  // Apply an AI-estimated conversion to a row. Anchor is always the food's
  // default variant (so AI estimates don't compound on prior AI values); when
  // the row IS the default, fall back to originalVariants[default] (the
  // pre-swap snapshot — the default's serving_unit is the post-swap target
  // and not a valid anchor). Scaling = estimate.estimatedAmount / anchor.serving_size;
  // we preserve the row's serving_size rather than canonicalize to 1, and
  // restore is_locked from the row's saved auto-scale intent.
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
        currentVariant.is_locked ??
        variantMeta[index]?.autoScaleIntent ??
        false;

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
        is_locked: autoScaleIntentForVariant,
        source: 'ai_estimate' as const,
        ai_confidence: estimate.confidence,
      };

      setVariants((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = aiEstimatedVariant;
        return next;
      });

      setServingSizeScalingBaseVariants((prev) => {
        const next = [...prev];
        next[index] = deepClone(aiEstimatedVariant);
        return next;
      });

      setVariantMeta((prev) =>
        prev.map((m, i) =>
          i === index
            ? {
                ...m,
                autoScaleIntent: aiEstimatedVariant.is_locked ?? false,
                manualUnitConversionPending: false,
                aiEstimatedUnit: aiEstimatedVariant.serving_unit,
              }
            : m
        )
      );
    },
    [variants, originalVariants, variantMeta]
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
    setVariantMeta((prev) =>
      prev.map((m, i) => ({ ...m, error: newVariantErrors[i] ?? '' }))
    );

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

    const barcode = formData.barcode ? formData.barcode.trim() : '';
    const BARCODE_REGEX = /^\d{8,14}$/;
    if (barcode && !BARCODE_REGEX.test(barcode)) {
      toast({
        title: 'Validation Error',
        description: 'Barcode must be 8-14 digits.',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  }, [variants, formData.barcode]);

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
        barcode: formData.barcode.trim() || null,
        provider_external_id: food?.provider_external_id,
        provider_type: food?.provider_type,
        provider_verified: food?.provider_verified,
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
        setSavedFoodResult(savedFood);
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

  const handleBarcodeConflictConfirm = async () => {
    setShowBarcodeConflictConfirmation(false);
    await persistFood();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateBeforeSave()) {
      return;
    }

    const barcode = formData.barcode ? formData.barcode.trim() : '';
    if (barcode) {
      try {
        const lookup = await queryClient.fetchQuery(
          searchBarcodeV2Options(barcode)
        );
        if (
          lookup?.source === 'local' &&
          lookup?.food &&
          lookup?.food?.id !== food?.id
        ) {
          setBarcodeConflictFoodName(lookup.food.name || 'another food');
          setShowBarcodeConflictConfirmation(true);
          return;
        }
      } catch (err) {
        console.error('Barcode conflict check failed:', err);
      }
    }

    await persistFood();
  };

  const handleSyncConfirmation = async (sync: boolean) => {
    if (!savedFoodResult) return;

    if (sync) {
      try {
        await updateFoodEntriesSnapshot(savedFoodResult.id);
      } catch {
        /* toast handled by QueryClient */
      }
    }
    setShowSyncConfirmation(false);
    onSave(savedFoodResult);
    setSavedFoodResult(null);
  };

  const variantErrors = useMemo(
    () => variantMeta.map((m) => m.error),
    [variantMeta]
  );
  const manualUnitConversionPending = useMemo(
    () => variantMeta.map((m) => m.manualUnitConversionPending),
    [variantMeta]
  );
  const hasTrustedCompatibilityBase = useMemo(
    () => variantMeta.map((m) => m.hasTrustedCompatibilityBase),
    [variantMeta]
  );
  const aiEstimatedUnits = useMemo(
    () => variantMeta.map((m) => m.aiEstimatedUnit),
    [variantMeta]
  );

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
    applyProviderNutrientMatch,
    applyAiEstimate,
    handleSubmit,
    handleSyncConfirmation,
    showBarcodeConflictConfirmation,
    setShowBarcodeConflictConfirmation,
    barcodeConflictFoodName,
    handleBarcodeConflictConfirm,
  };
}
