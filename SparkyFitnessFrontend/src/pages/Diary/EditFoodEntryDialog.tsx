import { useState, useMemo, useEffect, useRef, SubmitEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePreferences } from '@/contexts/PreferencesContext';
import { info, warn, error } from '@/utils/logging';
import type { FoodVariant, FoodEntry } from '@/types/food';
import { useFoodView } from '@/hooks/Foods/useFoods';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import {
  useFoodVariants,
  useCreateFoodVariantMutation,
} from '@/hooks/Foods/useFoodVariants';
import { useUpdateFoodEntryMutation } from '@/hooks/Diary/useFoodEntries';
import { calculateNutrition } from '@/utils/nutritionCalculations';
import { NutrientGrid } from './NutrientsGrid';
import { useUnitConversion } from '@/hooks/Foods/useUnitConversion';

interface EditFoodEntryDialogProps {
  entry: FoodEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EditFoodEntryDialog = ({
  entry,
  open,
  onOpenChange,
}: EditFoodEntryDialogProps) => {
  const { loggingLevel, energyUnit, convertEnergy } = usePreferences();

  const [quantity, setQuantity] = useState<number>(entry?.quantity || 1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    entry?.variant_id || null
  );

  const { data: customNutrients } = useCustomNutrients();
  const { data: foodData, isLoading: isLoadingFood } = useFoodView(
    entry?.food_id || ''
  );
  const { data: variantsData, isLoading: isLoadingVariants } = useFoodVariants(
    entry?.food_id || ''
  );
  const { mutateAsync: updateFoodEntry } = useUpdateFoodEntryMutation();
  const createFoodVariantMutation = useCreateFoodVariantMutation();

  const loading = isLoadingFood || isLoadingVariants;
  const isEditingAllowed = open && !!entry && !entry.meal_id;

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !loading && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open, loading]);

  const variants = useMemo(() => {
    if (!isEditingAllowed || !foodData || !variantsData || !entry) return [];

    const defaultVariant =
      foodData.default_variant || variantsData.find((v) => v.is_default);

    const primaryUnit: FoodVariant = defaultVariant
      ? {
          ...defaultVariant,
          calories: defaultVariant.calories || 0,
          protein: defaultVariant.protein || 0,
          carbs: defaultVariant.carbs || 0,
          fat: defaultVariant.fat || 0,
          custom_nutrients: defaultVariant.custom_nutrients || {},
        }
      : ({
          id: entry.food_id,
          serving_size: 100,
          serving_unit: 'g',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          custom_nutrients: {},
        } as FoodVariant);

    const variantsFromDb = variantsData
      .filter((v) => v.id !== primaryUnit.id)
      .map((variant) => ({
        ...variant,
        calories: variant.calories || 0,
        protein: variant.protein || 0,
        carbs: variant.carbs || 0,
        fat: variant.fat || 0,
        custom_nutrients: variant.custom_nutrients || {},
      }));

    return [primaryUnit, ...variantsFromDb];
  }, [foodData, variantsData, entry, isEditingAllowed]);

  const selectedVariant = useMemo((): FoodVariant | null => {
    if (!variants.length) return null;
    if (selectedVariantId) {
      return (
        variants.find((v) => v.id === selectedVariantId) || variants[0] || null
      );
    }
    return variants[0] || null;
  }, [variants, selectedVariantId]);

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
    dropdownValue,
    buildConvertedVariant,
    handleUnitChange,
    cancelConversion,
  } = useUnitConversion({
    variants,
    selectedVariant,
    onVariantSelect: (variantId) => {
      setSelectedVariantId(variantId);
    },
  });

  if (!entry) return null;

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (isConverting) {
      const convertedVariant = buildConvertedVariant();
      if (!convertedVariant) {
        setConversionError(
          'Please enter a valid unit name and conversion factor.'
        );
        return;
      }
      setConversionError('');
      try {
        const savedVariant = await createFoodVariantMutation.mutateAsync({
          foodId: entry.food_id ?? '',
          variant: convertedVariant,
        });
        const variantWithId: FoodVariant = {
          ...convertedVariant,
          ...savedVariant,
        };
        await updateFoodEntry({
          id: entry.id,
          data: {
            quantity,
            unit: variantWithId.serving_unit,
            variant_id: variantWithId.id || null,
          },
        });
        info(
          loggingLevel,
          'Food entry updated with converted variant:',
          entry.id
        );
        onOpenChange(false);
      } catch (err) {
        error(loggingLevel, 'Error saving converted variant:', err);
        setConversionError('Failed to save the new unit. Please try again.');
      }
      return;
    }

    if (!selectedVariant) {
      warn(loggingLevel, 'Save called with no selected variant.');
      return;
    }

    try {
      const updateData = {
        quantity,
        unit: selectedVariant.serving_unit,
        variant_id:
          selectedVariant.id === 'default-variant' ? null : selectedVariant.id,
      };

      await updateFoodEntry({ id: entry.id, data: updateData });

      info(loggingLevel, 'Food entry updated successfully:', entry.id);
      onOpenChange(false);
    } catch (err) {
      error(loggingLevel, 'Error updating food entry:', err);
    }
  };

  // Use the converted variant for nutrition when converting, otherwise the selected variant
  const activeVariant = isConverting
    ? buildConvertedVariant()
    : selectedVariant;
  const nutrition = activeVariant
    ? calculateNutrition(activeVariant, quantity)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        requireConfirmation
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Edit Food Entry</DialogTitle>
          <DialogDescription>
            Edit the quantity and serving unit for your food entry.
          </DialogDescription>
          <p className="text-sm text-red-500 mt-2">
            Note: Updating this entry will use the latest available variant
            details for the food, not the original snapshot.
          </p>
        </DialogHeader>

        {loading ? (
          <div>Loading...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">
                  {entry.food_name}
                </h3>
                {entry.brand_name && (
                  <p className="text-sm text-gray-600 mb-4">
                    {entry.brand_name}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={quantity}
                    ref={inputRef}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  />
                </div>

                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <Select
                    value={dropdownValue}
                    onValueChange={handleUnitChange}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {variants.map(
                        (variant) =>
                          variant.id && (
                            <SelectItem key={variant.id} value={variant.id}>
                              {variant.serving_unit}
                            </SelectItem>
                          )
                      )}
                      {convertibleUnits.length > 0 && (
                        <>
                          <SelectSeparator />
                          {convertibleUnits.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      <SelectSeparator />
                      <SelectItem value="__custom__">Custom unit...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Custom unit name input */}
              {pendingUnitIsCustom && (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/50">
                  <div>
                    <Label htmlFor="customUnitName">Unit name</Label>
                    <Input
                      id="customUnitName"
                      type="text"
                      placeholder="e.g. slice, bar, scoop"
                      value={pendingUnit}
                      onChange={(e) => {
                        setPendingUnit(e.target.value);
                        setConversionError('');
                      }}
                    />
                  </div>
                  {pendingUnit.trim() && (
                    <div>
                      <Label htmlFor="conversionFactor">
                        1 {pendingUnit.trim()} ={' '}
                        {conversionBaseVariant?.serving_unit}
                      </Label>
                      <Input
                        id="conversionFactor"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="e.g. 14.2"
                        value={conversionFactor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConversionFactor(val === '' ? '' : Number(val));
                          setConversionError('');
                        }}
                      />
                    </div>
                  )}
                  {conversionError && (
                    <p className="text-sm text-destructive">
                      {conversionError}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={cancelConversion}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* Manual factor needed for incompatible standard units */}
              {pendingUnit &&
                !pendingUnitIsCustom &&
                autoConversionFactor === null && (
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/50">
                    <p className="text-sm text-muted-foreground">
                      These units can&apos;t be converted automatically — enter
                      how many{' '}
                      <strong>{conversionBaseVariant?.serving_unit}</strong> are
                      in 1 <strong>{pendingUnit}</strong>.
                    </p>
                    <div>
                      <Label htmlFor="conversionFactor">
                        1 {pendingUnit} = ?{' '}
                        {conversionBaseVariant?.serving_unit}
                      </Label>
                      <Input
                        id="conversionFactor"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="e.g. 14.2"
                        value={conversionFactor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConversionFactor(val === '' ? '' : Number(val));
                          setConversionError('');
                        }}
                      />
                    </div>
                    {conversionError && (
                      <p className="text-sm text-destructive">
                        {conversionError}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={cancelConversion}
                    >
                      Cancel
                    </Button>
                  </div>
                )}

              {nutrition && customNutrients && (
                <div className="space-y-4">
                  <NutrientGrid
                    baseVariant={activeVariant}
                    nutrition={nutrition}
                    customNutrients={customNutrients}
                    energyUnit={energyUnit}
                    convertEnergy={convertEnergy}
                  />
                </div>
              )}

              <div className="flex justify-end space-x-2 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createFoodVariantMutation.isPending ||
                    (isConverting &&
                      (!pendingUnit.trim() ||
                        (autoConversionFactor === null &&
                          (!conversionFactor || conversionFactor <= 0))))
                  }
                >
                  {createFoodVariantMutation.isPending
                    ? 'Saving...'
                    : 'Save Changes'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditFoodEntryDialog;
