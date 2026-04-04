import { useState, useEffect, useCallback } from 'react';
import { Check } from 'lucide-react';
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
import { debug, info, warn, error } from '@/utils/logging';
import type { Food, FoodVariant } from '@/types/food';
import { useQueryClient } from '@tanstack/react-query';
import {
  foodVariantsOptions,
  useCreateFoodVariantMutation,
} from '@/hooks/Foods/useFoodVariants';
import { getConversionFactor } from '@/utils/servingSizeConversions';
import { useUnitConversion } from '@/hooks/Foods/useUnitConversion';

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
  showUnitSelector?: boolean;
  initialQuantity?: number;
  initialUnit?: string;
  initialVariantId?: string;
}

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
  const { loggingLevel, energyUnit, convertEnergy } = usePreferences();
  debug(loggingLevel, 'FoodUnitSelector component rendered.', { food, open });

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? 'kcal' : 'kJ';
  };

  const [variants, setVariants] = useState<FoodVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<FoodVariant | null>(
    null
  );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const queryClient = useQueryClient();
  const createFoodVariantMutation = useCreateFoodVariantMutation();

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
    resetConversionState,
  } = useUnitConversion({
    variants,
    selectedVariant,
    onVariantSelect: (_variantId, variant) => {
      setSelectedVariant(variant);
      setQuantity(variant.serving_size);
    },
  });

  const loadVariantsData = useCallback(async () => {
    debug(loggingLevel, 'Loading food variants for food ID:', food?.id);
    setLoading(true);
    try {
      const data = await queryClient.fetchQuery(foodVariantsOptions(food.id));

      const primaryUnit: FoodVariant = {
        id: food.default_variant?.id || food.id,
        serving_size: food.default_variant?.serving_size || 100,
        serving_unit: food.default_variant?.serving_unit || 'g',
        calories: food.default_variant?.calories || 0,
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
        custom_nutrients: food.default_variant?.custom_nutrients,
      };

      let combinedVariants: FoodVariant[] = [primaryUnit];

      if (data && data.length > 0) {
        info(loggingLevel, 'Food variants loaded successfully:', data);
        const variantsFromDb = data.map((variant) => ({
          id: variant.id,
          serving_size: variant.serving_size,
          serving_unit: variant.serving_unit,
          calories: variant.calories || 0,
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
          custom_nutrients: variant.custom_nutrients,
        }));

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
        setSelectedVariant(firstCombinedVariant);
      }
    } catch (err) {
      error(loggingLevel, 'Error loading variants:', err);
      const primaryUnit: FoodVariant = {
        id: food.default_variant?.id || food.id,
        serving_size: food.default_variant?.serving_size || 100,
        serving_unit: food.default_variant?.serving_unit || 'g',
        calories: food.default_variant?.calories || 0,
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
        custom_nutrients: food.default_variant?.custom_nutrients,
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
      loadVariantsData();
      setQuantity(
        initialQuantity !== undefined
          ? initialQuantity
          : food.default_variant?.serving_size || 1
      );
      resetConversionState();
    }
  }, [
    open,
    food,
    initialQuantity,
    initialUnit,
    initialVariantId,
    loadVariantsData,
    loggingLevel,
    resetConversionState,
  ]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    debug(loggingLevel, 'Handling submit.');

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
          foodId: food.id,
          variant: convertedVariant,
        });
        info(loggingLevel, 'Created converted variant:', savedVariant);
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
      onSelect(food, quantity, selectedVariant.serving_unit, selectedVariant);
      onOpenChange(false);
      setQuantity(1);
    } else {
      warn(loggingLevel, 'Submit called with no selected variant.');
    }
  };

  // The active variant used for nutrition display
  const activeVariant = isConverting
    ? buildConvertedVariant()
    : selectedVariant;

  const nutrition = (() => {
    if (!activeVariant) return null;
    const ratio = quantity / (activeVariant.serving_size || 1);
    return {
      calories: (activeVariant.calories || 0) * ratio,
      protein: (activeVariant.protein || 0) * ratio,
      carbs: (activeVariant.carbs || 0) * ratio,
      fat: (activeVariant.fat || 0) * ratio,
    };
  })();

  const focusAndSelect = useCallback((e: HTMLInputElement) => {
    if (e) {
      e.focus();
      e.select();
    }
  }, []);

  const displayUnit = isConverting
    ? pendingUnit.trim() || '?'
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
                          {convertibleUnits.map((u) => {
                            const compatible =
                              getConversionFactor(
                                selectedVariant?.serving_unit || '',
                                u
                              ) !== null;
                            return (
                              <SelectItem key={u} value={u}>
                                <span className="flex items-center gap-1.5">
                                  {u}
                                  {compatible && (
                                    <Check className="h-3 w-3 text-green-500" />
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
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
                    createFoodVariantMutation.isPending ||
                    (!isConverting && !selectedVariant) ||
                    (isConverting &&
                      (!pendingUnit.trim() ||
                        (autoConversionFactor === null &&
                          (!conversionFactor || conversionFactor <= 0))))
                  }
                >
                  {createFoodVariantMutation.isPending
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
