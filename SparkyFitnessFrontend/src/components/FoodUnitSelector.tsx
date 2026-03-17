import { useState, useEffect, useCallback } from 'react';
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
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, warn, error } from '@/utils/logging';
import type { Food, FoodVariant } from '@/types/food';
import { useQueryClient } from '@tanstack/react-query';
import { foodVariantsOptions } from '@/hooks/Foods/useFoodVariants';
import { createFoodVariant } from '@/api/Foods/enhancedCustomFoodFormService';
import { foodVariantKeys } from '@/api/keys/meals';
import {
  STANDARD_UNIT_GROUPS,
  getConversionFactor,
  areUnitsCompatible,
} from '@/utils/servingSizeConversions';

interface FoodUnitSelectorProps {
  food: Food;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (
    food: Food,
    quantity: number,
    unit: string,
    selectedVariant: FoodVariant
  ) => void;
  showUnitSelector?: boolean; // New prop to control visibility
  initialQuantity?: number;
  initialUnit?: string;
  initialVariantId?: string;
}

const CONVERT_SENTINEL = '__convert__';

const FoodUnitSelector = ({
  food,
  open,
  onOpenChange,
  onSelect,
  showUnitSelector,
  initialQuantity,
  initialUnit,
  initialVariantId,
}: FoodUnitSelectorProps) => {
  const { loggingLevel, energyUnit, convertEnergy } = usePreferences(); // Get logging level, energyUnit, convertEnergy
  debug(loggingLevel, 'FoodUnitSelector component rendered.', { food, open });

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    // This component does not import useTranslation, so we'll hardcode or pass t() from parent if it were needed for translation
    return unit === 'kcal' ? 'kcal' : 'kJ';
  };
  const [variants, setVariants] = useState<FoodVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<FoodVariant | null>(
    null
  );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

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
  const [isCreatingVariant, setIsCreatingVariant] = useState(false);
  const [conversionError, setConversionError] = useState('');

  const queryClient = useQueryClient();

  const loadVariantsData = useCallback(async () => {
    debug(loggingLevel, 'Loading food variants for food ID:', food?.id);
    setLoading(true);
    try {
      const data = await queryClient.fetchQuery(foodVariantsOptions(food.id));

      // The food object passed to this component already contains the default variant's data
      const primaryUnit: FoodVariant = {
        id: food.default_variant?.id || food.id, // Use default_variant.id if available, otherwise food.id
        serving_size: food.default_variant?.serving_size || 100,
        serving_unit: food.default_variant?.serving_unit || 'g',
        calories: food.default_variant?.calories || 0, // kcal
        protein: food.default_variant?.protein || 0,
        carbs: food.default_variant?.carbs || 0,
        fat: food.default_variant?.fat || 0,
        saturated_fat: food.default_variant?.saturated_fat || 0,
        polyunsaturated_fat: food.default_variant?.polyunsaturated_fat || 0,
        monounsaturated_fat: food.default_variant?.monounsaturated_fat || 0,
        trans_fat: food.default_variant?.trans_fat || 0,
        cholesterol: food.default_variant?.cholesterol || 0,
        sodium: food.default_variant?.sodium || 0,
        potassium: food.default_variant?.potassium || 0,
        dietary_fiber: food.default_variant?.dietary_fiber || 0,
        sugars: food.default_variant?.sugars || 0,
        vitamin_a: food.default_variant?.vitamin_a || 0,
        vitamin_c: food.default_variant?.vitamin_c || 0,
        calcium: food.default_variant?.calcium || 0,
        iron: food.default_variant?.iron || 0,
      };

      let combinedVariants: FoodVariant[] = [primaryUnit];

      if (data && data.length > 0) {
        info(loggingLevel, 'Food variants loaded successfully:', data);
        const variantsFromDb = data.map((variant) => ({
          id: variant.id,
          serving_size: variant.serving_size,
          serving_unit: variant.serving_unit,
          calories: variant.calories || 0, // kcal
          protein: variant.protein || 0,
          carbs: variant.carbs || 0,
          fat: variant.fat || 0,
          saturated_fat: variant.saturated_fat || 0,
          polyunsaturated_fat: variant.polyunsaturated_fat || 0,
          monounsaturated_fat: variant.monounsaturated_fat || 0,
          trans_fat: variant.trans_fat || 0,
          cholesterol: variant.cholesterol || 0,
          sodium: variant.sodium || 0,
          potassium: variant.potassium || 0,
          dietary_fiber: variant.dietary_fiber || 0,
          sugars: variant.sugars || 0,
          vitamin_a: variant.vitamin_a || 0,
          vitamin_c: variant.vitamin_c || 0,
          calcium: variant.calcium || 0,
          iron: variant.iron || 0,
        }));

        // Ensure the primary unit is always included and is the first option.
        // Then, add any other variants from the database that are not the primary unit (based on ID).
        const otherVariants = variantsFromDb.filter(
          (variant) => variant.id !== primaryUnit.id
        );
        combinedVariants = [primaryUnit, ...otherVariants];
      } else {
        info(
          loggingLevel,
          'No additional variants found, using primary food unit only.'
        );
      }

      setVariants(combinedVariants);
      const firstCombinedVariant = combinedVariants[0];
      if (initialVariantId && firstCombinedVariant) {
        const variantToSelect = combinedVariants.find(
          (v) => v.id === initialVariantId
        );
        setSelectedVariant(variantToSelect || firstCombinedVariant);
      } else if (firstCombinedVariant) {
        setSelectedVariant(firstCombinedVariant); // Select the primary unit by default
      }
    } catch (err) {
      error(loggingLevel, 'Error loading variants:', err);
      // Fallback to primary food unit on error
      const primaryUnit: FoodVariant = {
        id: food.default_variant?.id || food.id, // Use default_variant.id if available, otherwise food.id
        serving_size: food.default_variant?.serving_size || 100,
        serving_unit: food.default_variant?.serving_unit || 'g',
        calories: food.default_variant?.calories || 0, // kcal
        protein: food.default_variant?.protein || 0,
        carbs: food.default_variant?.carbs || 0,
        fat: food.default_variant?.fat || 0,
        saturated_fat: food.default_variant?.saturated_fat || 0,
        polyunsaturated_fat: food.default_variant?.polyunsaturated_fat || 0,
        monounsaturated_fat: food.default_variant?.monounsaturated_fat || 0,
        trans_fat: food.default_variant?.trans_fat || 0,
        cholesterol: food.default_variant?.cholesterol || 0,
        sodium: food.default_variant?.sodium || 0,
        potassium: food.default_variant?.potassium || 0,
        dietary_fiber: food.default_variant?.dietary_fiber || 0,
        sugars: food.default_variant?.sugars || 0,
        vitamin_a: food.default_variant?.vitamin_a || 0,
        vitamin_c: food.default_variant?.vitamin_c || 0,
        calcium: food.default_variant?.calcium || 0,
        iron: food.default_variant?.iron || 0,
      };
      setVariants([primaryUnit]);
      setSelectedVariant(primaryUnit);
    } finally {
      setLoading(false);
    }
  }, [food, queryClient, loggingLevel, initialVariantId]);

  useEffect(() => {
    debug(loggingLevel, 'FoodUnitSelector open/food useEffect triggered.', {
      open,
      food,
      initialQuantity,
      initialUnit,
      initialVariantId,
    });
    if (open && food && food.id) {
      // Ensure food.id exists before loading variants
      loadVariantsData();
      setQuantity(
        initialQuantity !== undefined
          ? initialQuantity
          : food.default_variant?.serving_size || 1
      );
      // Reset conversion mode when dialog opens
      setConversionMode(false);
      setTargetUnit('');
      setTargetUnitIsCustom(false);
      setConversionFactor(1);
      setAutoConversionFactor(null);
      setConversionBaseVariant(null);
      setConversionError('');
    }
  }, [
    open,
    food,
    initialQuantity,
    initialUnit,
    initialVariantId,
    loadVariantsData,
    setQuantity,
    loggingLevel,
  ]);

  const buildConvertedVariant = useCallback((): FoodVariant | null => {
    const base = conversionBaseVariant;
    const effectiveFactor =
      autoConversionFactor !== null
        ? autoConversionFactor
        : typeof conversionFactor === 'number'
          ? conversionFactor
          : 0;
    const factor = effectiveFactor;
    if (!base || factor <= 0 || !targetUnit.trim()) return null;
    const ratio = factor / base.serving_size;
    return {
      serving_size: factor,
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    debug(loggingLevel, 'Handling submit.');

    if (conversionMode) {
      const convertedVariant = buildConvertedVariant();
      if (!convertedVariant) {
        setConversionError(
          'Please enter a valid unit name and conversion factor.'
        );
        return;
      }
      setConversionError('');
      setIsCreatingVariant(true);
      try {
        const savedVariant = await createFoodVariant(food.id, convertedVariant);
        info(loggingLevel, 'Created converted variant:', savedVariant);
        // Invalidate the variants cache so it refreshes next time
        queryClient.invalidateQueries({
          queryKey: foodVariantKeys.byFood(food.id),
        });
        const variantWithId: FoodVariant = {
          ...convertedVariant,
          ...savedVariant,
        };
        onSelect(food, quantity, variantWithId.serving_unit, variantWithId);
        onOpenChange(false);
        setQuantity(1);
      } catch (err) {
        error(loggingLevel, 'Error creating converted variant:', err);
        setConversionError('Failed to save the new unit. Please try again.');
      } finally {
        setIsCreatingVariant(false);
      }
      return;
    }

    if (selectedVariant) {
      info(loggingLevel, 'Submitting food selection:', {
        food,
        quantity,
        unit: selectedVariant.serving_unit,
        variantId: selectedVariant.id || undefined,
      });

      // Pass the user-entered quantity directly, as it now represents the number of servings.
      // If the selected variant is the primary food unit (identified by food.id), pass null for variantId
      // Otherwise, pass the actual variant.id
      onSelect(food, quantity, selectedVariant.serving_unit, selectedVariant);
      onOpenChange(false);
      setQuantity(1);
    } else {
      warn(loggingLevel, 'Submit called with no selected variant.');
    }
  };

  const calculateNutrition = () => {
    debug(loggingLevel, 'Calculating nutrition.');

    if (conversionMode) {
      const convertedVariant = buildConvertedVariant();
      if (!convertedVariant) return null;
      const ratio = quantity / convertedVariant.serving_size;
      return {
        calories: convertedVariant.calories * ratio,
        protein: convertedVariant.protein * ratio,
        carbs: convertedVariant.carbs * ratio,
        fat: convertedVariant.fat * ratio,
      };
    }

    if (!selectedVariant) {
      warn(loggingLevel, 'calculateNutrition called with no selected variant.');
      return null;
    }

    info(loggingLevel, 'Calculating nutrition for:', {
      selectedVariant,
      quantity,
    });

    const nutrientValuesPerReferenceSize = {
      calories: selectedVariant.calories || 0, // kcal
      protein: selectedVariant.protein || 0,
      carbs: selectedVariant.carbs || 0,
      fat: selectedVariant.fat || 0,
      saturated_fat: selectedVariant.saturated_fat || 0,
      polyunsaturated_fat: selectedVariant.polyunsaturated_fat || 0,
      monounsaturated_fat: selectedVariant.monounsaturated_fat || 0,
      trans_fat: selectedVariant.trans_fat || 0,
      cholesterol: selectedVariant.cholesterol || 0,
      sodium: selectedVariant.sodium || 0,
      potassium: selectedVariant.potassium || 0,
      dietary_fiber: selectedVariant.dietary_fiber || 0,
      sugars: selectedVariant.sugars || 0,
      vitamin_a: selectedVariant.vitamin_a || 0,
      vitamin_c: selectedVariant.vitamin_c || 0,
      calcium: selectedVariant.calcium || 0,
      iron: selectedVariant.iron || 0,
    };
    const effectiveReferenceSize = selectedVariant.serving_size || 100;

    // Calculate total nutrition: (nutrient_value_per_reference_size / effective_reference_size) * quantity_consumed
    const result = {
      calories:
        (nutrientValuesPerReferenceSize.calories / effectiveReferenceSize) *
        quantity, // This result is in kcal
      protein:
        (nutrientValuesPerReferenceSize.protein / effectiveReferenceSize) *
        quantity,
      carbs:
        (nutrientValuesPerReferenceSize.carbs / effectiveReferenceSize) *
        quantity,
      fat:
        (nutrientValuesPerReferenceSize.fat / effectiveReferenceSize) *
        quantity,
    };
    debug(loggingLevel, 'Calculated nutrition result:', result);

    return result;
  };

  const nutrition = calculateNutrition();
  const focusAndSelect = useCallback((e: HTMLInputElement) => {
    if (e) {
      e.focus();
      e.select();
    }
  }, []);

  const displayUnit = conversionMode
    ? targetUnit.trim() || '?'
    : selectedVariant?.serving_unit || '';

  return (
    <Dialog
      open={open && (showUnitSelector ?? true)}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initialQuantity
              ? `Edit ${food?.name}`
              : `Add ${food?.name} to Meal`}
          </DialogTitle>
          <DialogDescription>
            {initialQuantity
              ? `Edit the quantity and unit for ${food?.name}.`
              : `Select the quantity and unit for your food entry.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div>Loading units...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={quantity}
                    ref={focusAndSelect}
                    onChange={(e) => {
                      const newQuantity = Number(e.target.value);
                      debug(loggingLevel, 'Quantity changed:', newQuantity);
                      setQuantity(newQuantity);
                    }}
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
                      debug(loggingLevel, 'Unit selected:', value);
                      if (value === CONVERT_SENTINEL) {
                        // Enter conversion mode using currently selected variant as base
                        setConversionBaseVariant(
                          selectedVariant || variants[0] || null
                        );
                        setConversionMode(true);
                        setTargetUnit('');
                        setConversionFactor(1);
                        setConversionError('');
                        return;
                      }
                      setConversionMode(false);
                      const variant = variants.find((v) => v.id === value);
                      setSelectedVariant(variant || null);
                      if (variant) {
                        setQuantity(variant.serving_size);
                      }
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

                  {/* Target unit selection */}
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
                        if (auto === null) {
                          setConversionFactor(1);
                        }
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

                  {/* Custom unit text input */}
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

                  {/* Conversion factor — auto-filled or manual */}
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
                            These units can't be converted automatically — enter
                            how many{' '}
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

              {nutrition && (
                <div className="bg-muted p-3 rounded-lg">
                  <h4 className="font-medium mb-2">
                    Nutrition for {quantity} {displayUnit}:
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      {Math.round(
                        convertEnergy(nutrition.calories, 'kcal', energyUnit)
                      )}{' '}
                      {getEnergyUnitString(energyUnit)}
                    </div>
                    <div>{nutrition.protein.toFixed(1)}g protein</div>
                    <div>{nutrition.carbs.toFixed(1)}g carbs</div>
                    <div>{nutrition.fat.toFixed(1)}g fat</div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2">
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
                    isCreatingVariant ||
                    (!conversionMode && !selectedVariant) ||
                    (conversionMode &&
                      (!targetUnit.trim() ||
                        (autoConversionFactor === null &&
                          (!conversionFactor || conversionFactor <= 0))))
                  }
                >
                  {isCreatingVariant
                    ? 'Saving...'
                    : initialQuantity
                      ? 'Update Food'
                      : 'Add to Meal'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FoodUnitSelector;
