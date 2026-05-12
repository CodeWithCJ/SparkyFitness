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
import { getConversionFactor } from '@/utils/servingSizeConversions';
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

function buildManualConversionToast(baseUnit: string, targetUnit: string) {
  return {
    title: 'Manual conversion required',
    description: `"${baseUnit}" and "${targetUnit}" are incompatible unit types. Please update the serving size and nutrition values manually.`,
  } as const;
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
  const [loadedVariants, setLoadedVariants] = useState<
    GroupedFormFoodVariant[]
  >([]);
  const [manualUnitConversionPending, setManualUnitConversionPending] =
    useState<boolean[]>([]);
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
      const snapshot = deepClone(grouped);
      setVariants(grouped);
      setOriginalVariants(snapshot);
      setLoadedVariants(snapshot);
      setManualUnitConversionPending(new Array(grouped.length).fill(false));
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
    setLoadedVariants((prev) => [...prev, clone]);
    setManualUnitConversionPending((prev) => [...prev, false]);
    setAutoScaleIntents((prev) => [...prev, false]);
    setHasTrustedCompatibilityBase((prev) => [...prev, false]);
    setVariantErrors((prev) => [...prev, '']);
  };

  const duplicateVariant = (index: number) => {
    const src = variants[index];
    const sourceOriginalVariant = originalVariants[index];
    const sourceLoadedVariant = loadedVariants[index];
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
    const loadedClone = deepClone(
      sourceRequiresManualConversion
        ? sourceLoadedVariant || sourceOriginalVariant || src
        : newVariant
    );

    setVariants((prev) => [...prev, newVariant]);
    setOriginalVariants((prev) => [...prev, originalClone]);
    setLoadedVariants((prev) => [...prev, loadedClone]);
    setManualUnitConversionPending((prev) => [
      ...prev,
      sourceRequiresManualConversion,
    ]);
    setAutoScaleIntents((prev) => [...prev, sourceAutoScaleIntent]);
    setHasTrustedCompatibilityBase((prev) => [...prev, false]);
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
    setLoadedVariants((prev) => prev.filter((_, i) => i !== index));
    setManualUnitConversionPending((prev) =>
      prev.filter((_, i) => i !== index)
    );
    setAutoScaleIntents((prev) => prev.filter((_, i) => i !== index));
    setHasTrustedCompatibilityBase((prev) =>
      prev.filter((_, i) => i !== index)
    );
    setVariantErrors((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVariant = (
    index: number,
    field: keyof FormFoodVariant | string,
    value: string | number | boolean | GlycemicIndex | EquivalentUnit[]
  ) => {
    const updatedVariants = [...variants];
    const updatedOriginalVariants = [...originalVariants];
    const updatedManualUnitConversionPending = [...manualUnitConversionPending];
    const updatedAutoScaleIntents = [...autoScaleIntents];
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
        updatedOriginalVariants[index] = deepClone(newVariant);
        setOriginalVariants(updatedOriginalVariants);
      }
    }

    if (field === 'serving_unit') {
      const oldUnit = currentVariant.serving_unit;
      const newUnit = String(value);
      const loadedVariant = loadedVariants[index];
      const variantHasTrustedCompatibilityBase =
        hasTrustedCompatibilityBase[index] ?? false;
      const scalingBaseVariant =
        updatedOriginalVariants[index] ?? loadedVariant ?? currentVariant;
      const trustedBaseUnit = scalingBaseVariant?.serving_unit ?? oldUnit;
      const manualConversionPendingForVariant =
        updatedManualUnitConversionPending[index] ?? false;
      const autoScaleIntentForVariant = updatedAutoScaleIntents[index] ?? false;

      if (!variantHasTrustedCompatibilityBase) {
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
          scalingBaseVariant
        ) {
          const baseServingSize = Number(scalingBaseVariant.serving_size || 1);
          const newServingSize = Number(currentVariant.serving_size || 1);
          const ratio = (newServingSize * trustedBaseFactor) / baseServingSize;
          newVariant = scaleVariantNutrition(scalingBaseVariant, ratio);
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
          toast(buildManualConversionToast(trustedBaseUnit, newUnit));
          updatedManualUnitConversionPending[index] = true;
          newVariant.is_locked = false;
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
      const originalVariant = updatedOriginalVariants[index];
      if (!originalVariant) {
        error(loggingLevel, 'Could not find original variant at index:', index);
        return;
      }
      const ratio = Number(value) / Number(originalVariant.serving_size);
      if (!isNaN(ratio) && ratio >= 0) {
        newVariant = scaleVariantNutrition(originalVariant, ratio, 2);
        newVariant.serving_size = Number(value);
      }
    } else if (
      field !== 'serving_unit' ||
      !(updatedManualUnitConversionPending[index] ?? false)
    ) {
      updatedOriginalVariants[index] = deepClone(newVariant);
      setOriginalVariants(updatedOriginalVariants);
    }

    updatedVariants[index] = newVariant;
    setVariants(updatedVariants);
    setManualUnitConversionPending(updatedManualUnitConversionPending);
    setAutoScaleIntents(updatedAutoScaleIntents);
  };

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

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
      return;
    }

    const defaultCount = variants.filter((v) => v.is_default).length;
    if (defaultCount === 0) {
      toast({
        title: 'Validation Error',
        description: 'At least one variant must be marked as the default unit.',
        variant: 'destructive',
      });
      return;
    }
    if (defaultCount > 1) {
      toast({
        title: 'Validation Error',
        description: 'Only one variant can be marked as the default unit.',
        variant: 'destructive',
      });
      return;
    }

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
    platform,
    updateField,
    addVariant,
    duplicateVariant,
    removeVariant,
    updateVariant,
    handleSubmit,
    handleSyncConfirmation,
  };
}
