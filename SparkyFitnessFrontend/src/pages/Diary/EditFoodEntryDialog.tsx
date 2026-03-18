import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  SubmitEvent,
} from 'react';
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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import {
  getConversionFactor,
  areUnitsCompatible,
  STANDARD_UNIT_GROUPS,
} from '@/utils/servingSizeConversions';

const CONVERT_SENTINEL = '__convert__';

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

  // Conversion mode state
  const [conversionMode, setConversionMode] = useState(false);
  const [targetUnit, setTargetUnit] = useState('');
  const [targetUnitIsCustom, setTargetUnitIsCustom] = useState(false);
  const [conversionFactor, setConversionFactor] = useState<number | ''>(1);
  const [autoConversionFactor, setAutoConversionFactor] = useState<
    number | null
  >(null);
  const [conversionBaseVariant, setConversionBaseVariant] =
    useState<FoodVariant | null>(null);
  const [conversionError, setConversionError] = useState('');

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
      // Kleiner Timeout hilft oft bei Dialog-Animationen von Radix UI
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

  const selectedVariant = useMemo(() => {
    if (!variants.length) return null;
    if (selectedVariantId) {
      return variants.find((v) => v.id === selectedVariantId) || variants[0];
    }
    return variants[0];
  }, [variants, selectedVariantId]);

  const buildConvertedVariant = useCallback((): FoodVariant | null => {
    const base = conversionBaseVariant;
    const effectiveFactor =
      autoConversionFactor !== null
        ? autoConversionFactor
        : typeof conversionFactor === 'number'
          ? conversionFactor
          : 0;
    if (!base || effectiveFactor <= 0 || !targetUnit.trim()) return null;
    const ratio = effectiveFactor / base.serving_size;
    return {
      serving_size: effectiveFactor,
      serving_unit: targetUnit.trim(),
      calories: (base.calories || 0) * ratio,
      protein: (base.protein || 0) * ratio,
      carbs: (base.carbs || 0) * ratio,
      fat: (base.fat || 0) * ratio,
      saturated_fat: (base.saturated_fat || 0) * ratio,
      polyunsaturated_fat: (base.polyunsaturated_fat || 0) * ratio,
      monounsaturated_fat: (base.monounsaturated_fat || 0) * ratio,
      trans_fat: (base.trans_fat || 0) * ratio,
      cholesterol: (base.cholesterol || 0) * ratio,
      sodium: (base.sodium || 0) * ratio,
      potassium: (base.potassium || 0) * ratio,
      dietary_fiber: (base.dietary_fiber || 0) * ratio,
      sugars: (base.sugars || 0) * ratio,
      vitamin_a: (base.vitamin_a || 0) * ratio,
      vitamin_c: (base.vitamin_c || 0) * ratio,
      calcium: (base.calcium || 0) * ratio,
      iron: (base.iron || 0) * ratio,
    };
  }, [
    conversionBaseVariant,
    conversionFactor,
    autoConversionFactor,
    targetUnit,
  ]);

  if (!entry) return null;

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (conversionMode) {
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
          foodId: entry.food_id,
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

  const nutrition = selectedVariant
    ? calculateNutrition(selectedVariant, quantity)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                    value={
                      conversionMode
                        ? CONVERT_SENTINEL
                        : selectedVariant?.id || ''
                    }
                    onValueChange={(value) => {
                      if (value === CONVERT_SENTINEL) {
                        setConversionBaseVariant(
                          selectedVariant || variants[0] || null
                        );
                        setConversionMode(true);
                        setTargetUnit('');
                        setTargetUnitIsCustom(false);
                        setConversionFactor(1);
                        setAutoConversionFactor(null);
                        setConversionError('');
                        return;
                      }
                      setConversionMode(false);
                      setSelectedVariantId(value);
                    }}
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
                      <SelectItem value={CONVERT_SENTINEL}>
                        Convert to different unit...
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {conversionMode && conversionBaseVariant && (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    Converting from{' '}
                    <strong>
                      {conversionBaseVariant.serving_size}{' '}
                      {conversionBaseVariant.serving_unit}
                    </strong>
                    . Select a target unit below.
                  </p>

                  <div>
                    <Label htmlFor="targetUnitSelect">Convert to</Label>
                    <Select
                      value={
                        targetUnitIsCustom
                          ? '__custom__'
                          : targetUnit || undefined
                      }
                      onValueChange={(value) => {
                        setConversionError('');
                        if (value === '__custom__') {
                          setTargetUnitIsCustom(true);
                          setTargetUnit('');
                          setAutoConversionFactor(null);
                          setConversionFactor(1);
                          return;
                        }
                        setTargetUnitIsCustom(false);
                        setTargetUnit(value);
                        const auto = getConversionFactor(
                          conversionBaseVariant.serving_unit,
                          value
                        );
                        setAutoConversionFactor(auto);
                        if (auto === null) setConversionFactor(1);
                      }}
                    >
                      <SelectTrigger id="targetUnitSelect">
                        <SelectValue placeholder="Select unit..." />
                      </SelectTrigger>
                      <SelectContent>
                        {STANDARD_UNIT_GROUPS.map((group) => (
                          <SelectGroup key={group.label}>
                            <SelectLabel>{group.label}</SelectLabel>
                            {group.units.map((u) => (
                              <SelectItem key={u} value={u}>
                                {u}
                                {areUnitsCompatible(
                                  conversionBaseVariant.serving_unit,
                                  u
                                ) && (
                                  <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                                    ✓ auto
                                  </span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                        <SelectSeparator />
                        <SelectItem value="__custom__">
                          Custom unit...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {targetUnitIsCustom && (
                    <div>
                      <Label htmlFor="targetUnitCustom">Custom unit name</Label>
                      <Input
                        id="targetUnitCustom"
                        type="text"
                        placeholder="e.g. slice, bar, scoop"
                        value={targetUnit}
                        onChange={(e) => {
                          setTargetUnit(e.target.value);
                          setConversionError('');
                        }}
                      />
                    </div>
                  )}

                  {targetUnit.trim() && (
                    <div>
                      <Label htmlFor="conversionFactor">
                        1 {targetUnit.trim()} ={' '}
                        {conversionBaseVariant.serving_unit}
                      </Label>
                      {autoConversionFactor !== null ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            id="conversionFactor"
                            type="number"
                            value={autoConversionFactor
                              .toFixed(6)
                              .replace(/\.?0+$/, '')}
                            readOnly
                            className="bg-muted cursor-default"
                          />
                          <span className="text-xs text-green-600 dark:text-green-400 whitespace-nowrap">
                            Auto-calculated
                          </span>
                        </div>
                      ) : (
                        <>
                          <Input
                            id="conversionFactor"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="e.g. 14.2"
                            value={conversionFactor}
                            onChange={(e) => {
                              const val = e.target.value;
                              setConversionFactor(
                                val === '' ? '' : Number(val)
                              );
                              setConversionError('');
                            }}
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            These units can&apos;t be converted automatically —
                            enter how many{' '}
                            <strong>
                              {conversionBaseVariant.serving_unit}
                            </strong>{' '}
                            are in 1 <strong>{targetUnit.trim()}</strong>.
                          </p>
                        </>
                      )}
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
                    onClick={() => {
                      setConversionMode(false);
                      setConversionError('');
                    }}
                  >
                    Cancel conversion
                  </Button>
                </div>
              )}

              {nutrition && customNutrients && (
                <div className="space-y-4">
                  <NutrientGrid
                    baseVariant={selectedVariant}
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
                    (conversionMode &&
                      (!targetUnit.trim() ||
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
