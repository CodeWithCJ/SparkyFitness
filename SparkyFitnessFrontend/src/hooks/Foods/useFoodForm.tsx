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
  getUnitCategory,
} from '@/utils/servingSizeConversions';
import type {
  Food,
  FoodVariant,
  GlycemicIndex,
  NumericFoodVariantKeys,
} from '@/types/food';

interface UseCustomFoodFormProps {
  food?: Food;
  initialVariants?: FoodVariant[];
  onSave: (foodData: Food) => void;
}

function buildManualConversionToast(baseUnit: string, targetUnit: string) {
  return {
    title: 'Manual conversion required',
    description: `"${baseUnit}" and "${targetUnit}" are incompatible unit types. Please update the serving size and nutrition values manually.`,
  } as const;
}

function zeroOutVariantNutrition(variant: FormFoodVariant): FormFoodVariant {
  const zeroedVariant = { ...variant };

  for (const nutrient of nutrientFields) {
    zeroedVariant[nutrient] = 0;
  }

  if (variant.custom_nutrients) {
    zeroedVariant.custom_nutrients = Object.fromEntries(
      Object.keys(variant.custom_nutrients).map((name) => [name, 0])
    );
  }

  return zeroedVariant;
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
  const [variants, setVariants] = useState<FormFoodVariant[]>([]);
  const [originalVariants, setOriginalVariants] = useState<FormFoodVariant[]>(
    []
  );
  const [loadedVariants, setLoadedVariants] = useState<FormFoodVariant[]>([]);
  const [manualUnitConversionPending, setManualUnitConversionPending] =
    useState<boolean[]>([]);
  const [variantErrors, setVariantErrors] = useState<string[]>([]);
  const [showSyncConfirmation, setShowSyncConfirmation] = useState(false);
  const [syncFoodId, setSyncFoodId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    is_quick_food: false,
  });

  const resetForm = useCallback(() => {
    setFormData({ name: '', brand: '', is_quick_food: false });
    const defaultVariant = createDefaultFormVariant(customNutrients);
    const snapshot = [deepClone(defaultVariant)];
    setVariants([defaultVariant]);
    setOriginalVariants(snapshot);
    setLoadedVariants(snapshot);
    setManualUnitConversionPending([false]);
    setVariantErrors(['']);
  }, [customNutrients]);

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
            foodVariantToFormVariant({ ...defaultVariant, is_locked: false }),
            ...data
              .filter((v) => v.id !== defaultVariant?.id)
              .map((v) => foodVariantToFormVariant({ ...v, is_locked: false })),
          ];
        } else {
          loaded = data.map((v) =>
            foodVariantToFormVariant({ ...v, is_locked: false })
          );
        }
      } else {
        loaded = [createDefaultFormVariant(customNutrients)];
      }

      const snapshot = deepClone(loaded);
      setVariants(loaded);
      setOriginalVariants(snapshot);
      setLoadedVariants(snapshot);
      setManualUnitConversionPending(new Array(loaded.length).fill(false));
    } catch (err) {
      console.error('Error loading variants:', err);
      const fallback = createDefaultFormVariant(customNutrients);
      const snapshot = [deepClone(fallback)];
      setVariants([fallback]);
      setOriginalVariants(snapshot);
      setLoadedVariants(snapshot);
      setManualUnitConversionPending([false]);
    }
  }, [food?.default_variant, food?.id, queryClient, customNutrients]);

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
            is_locked: v.is_locked ?? autoScaleOnlineImports,
            glycemic_index: sanitizeGlycemicIndexFrontend(v.glycemic_index),
          })
        );
        const snapshot = deepClone(mapped);
        setVariants(mapped);
        setOriginalVariants(snapshot);
        setLoadedVariants(snapshot);
        setManualUnitConversionPending(new Array(mapped.length).fill(false));
        setVariantErrors(new Array(food.variants.length).fill(null));
      } else {
        loadExistingVariants();
      }
    } else if (initialVariants && initialVariants.length > 0) {
      setFormData({ name: '', brand: '', is_quick_food: false });
      const mapped = initialVariants.map(foodVariantToFormVariant);
      const snapshot = deepClone(mapped);
      setVariants(mapped);
      setOriginalVariants(snapshot);
      setLoadedVariants(snapshot);
      setManualUnitConversionPending(new Array(mapped.length).fill(false));
      setVariantErrors(new Array(initialVariants.length).fill(null));
    } else {
      resetForm();
    }
  }, [
    food,
    initialVariants,
    customNutrients,
    loadExistingVariants,
    autoScaleOnlineImports,
    resetForm,
  ]);

  const addVariant = () => {
    const newVariant = createDefaultFormVariant(customNutrients, {
      serving_size: 1,
      is_default: false,
    });
    const clone = deepClone(newVariant);
    setVariants((prev) => [...prev, newVariant]);
    setOriginalVariants((prev) => [...prev, clone]);
    setLoadedVariants((prev) => [...prev, clone]);
    setManualUnitConversionPending((prev) => [...prev, false]);
    setVariantErrors((prev) => [...prev, '']);
  };

  const duplicateVariant = (index: number) => {
    const src = variants[index];
    const sourceOriginalVariant = originalVariants[index];
    const sourceLoadedVariant = loadedVariants[index];
    const sourceRequiresManualConversion =
      manualUnitConversionPending[index] ?? false;
    if (!src) {
      error(
        loggingLevel,
        'Could not find variant to duplicate at index:',
        index
      );
      return;
    }
    const newVariant: FormFoodVariant = {
      ...src,
      id: undefined,
      is_default: false,
      is_locked: false,
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
    setVariantErrors((prev) => prev.filter((_, i) => i !== index));
  };

  const updateVariant = (
    index: number,
    field: keyof FormFoodVariant | string,
    value: string | number | boolean | GlycemicIndex
  ) => {
    const updatedVariants = [...variants];
    const updatedOriginalVariants = [...originalVariants];
    const updatedManualUnitConversionPending = [...manualUnitConversionPending];
    const currentVariant = updatedVariants[index];
    if (!currentVariant) {
      error(loggingLevel, 'Could not find variant to update at index:', index);
      return;
    }

    const isCustomNutrient = customNutrients?.some((n) => n.name === field);
    const isNutrientField =
      nutrientFields.includes(field as NumericFoodVariantKeys) ||
      isCustomNutrient;

    // Build updated variant
    let newVariant: FormFoodVariant;
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
        [field as keyof FormFoodVariant]: value,
      };
    }

    // Validate serving_size
    const updatedErrors = [...variantErrors];
    if (field === 'serving_size') {
      const num = Number(value);
      updatedErrors[index] =
        isNaN(num) || num <= 0 ? 'Serving size must be a positive number.' : '';
      setVariantErrors(updatedErrors);
    }

    // Energy conversion: input arrives in display unit, store as kcal
    if (field === 'calories' && value !== '' && typeof value === 'number') {
      newVariant.calories = convertEnergy(value, energyUnit, 'kcal');
    }

    // Unit change — restore loaded values on revert, otherwise scale
    if (field === 'serving_unit') {
      const oldUnit = currentVariant.serving_unit;
      const newUnit = String(value);
      const loadedVariant = loadedVariants[index];
      const trustedBaseUnit =
        updatedOriginalVariants[index]?.serving_unit ??
        loadedVariant?.serving_unit ??
        oldUnit;
      const manualConversionPendingForVariant =
        updatedManualUnitConversionPending[index] ?? false;

      if (loadedVariant && newUnit === loadedVariant.serving_unit) {
        for (const nutrient of nutrientFields) {
          newVariant[nutrient] = loadedVariant[nutrient];
        }
        newVariant.custom_nutrients = deepClone(loadedVariant.custom_nutrients);
        updatedManualUnitConversionPending[index] = false;
      } else {
        const factor = getConversionFactor(oldUnit, newUnit);
        const bothServing =
          getUnitCategory(oldUnit) === null &&
          getUnitCategory(newUnit) === null;
        if (manualConversionPendingForVariant) {
          toast(buildManualConversionToast(trustedBaseUnit, newUnit));
          updatedManualUnitConversionPending[index] = true;
        } else if (factor !== null && factor !== 1) {
          for (const nutrient of nutrientFields) {
            const old = Number(currentVariant[nutrient]);
            if (!isNaN(old))
              newVariant[nutrient] = Number((old * factor).toFixed(4));
          }
          if (currentVariant.custom_nutrients) {
            const scaled = { ...newVariant.custom_nutrients };
            Object.keys(currentVariant.custom_nutrients).forEach((name) => {
              const old = Number(currentVariant.custom_nutrients?.[name]);
              if (!isNaN(old)) scaled[name] = Number((old * factor).toFixed(4));
            });
            newVariant.custom_nutrients = scaled;
          }
          updatedManualUnitConversionPending[index] = false;
        } else if (factor === null && !bothServing) {
          newVariant = zeroOutVariantNutrition(newVariant);
          toast(buildManualConversionToast(trustedBaseUnit, newUnit));
          updatedManualUnitConversionPending[index] = true;
        } else {
          updatedManualUnitConversionPending[index] = false;
        }
      }
    }

    // Ensure only one default
    if (field === 'is_default' && value === true) {
      updatedVariants.forEach((v, i) => {
        if (i !== index) v.is_default = false;
      });
    }

    // Proportional scaling for locked variants
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
        nutrientFields.forEach((nf) => {
          newVariant[nf] = Number(
            (Number(originalVariant[nf]) * ratio).toFixed(2)
          );
        });
        if (originalVariant.custom_nutrients) {
          const scaled = { ...newVariant.custom_nutrients };
          Object.keys(originalVariant.custom_nutrients).forEach((name) => {
            const orig = Number(originalVariant.custom_nutrients?.[name]);
            if (!isNaN(orig)) scaled[name] = Number((orig * ratio).toFixed(2));
          });
          newVariant.custom_nutrients = scaled;
        }
      }
    } else {
      // Update scaling baseline for any non-scaling change
      if (
        field !== 'serving_unit' ||
        !(updatedManualUnitConversionPending[index] ?? false)
      ) {
        updatedOriginalVariants[index] = deepClone(newVariant);
        setOriginalVariants(updatedOriginalVariants);
      }
    }

    updatedVariants[index] = newVariant;
    setVariants(updatedVariants);
    setManualUnitConversionPending(updatedManualUnitConversionPending);
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

    if (newVariantErrors.some((e) => e !== '')) {
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

      const savedFood = await saveFood({
        foodData,
        variants: variants.map(formVariantToFoodVariant),
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
    // State
    formData,
    variants,
    variantErrors,
    loading,
    showSyncConfirmation,
    setShowSyncConfirmation,
    loadedVariants,
    conversionBaseVariants: originalVariants,
    platform,
    // Handlers
    updateField,
    addVariant,
    duplicateVariant,
    removeVariant,
    updateVariant,
    handleSubmit,
    handleSyncConfirmation,
  };
}
