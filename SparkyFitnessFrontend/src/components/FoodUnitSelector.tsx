import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import { debug, info, warn, error } from '@/utils/logging'; // Import logging utility
import { loadFoodVariants } from '@/services/foodUnitService';
import { Food, FoodVariant } from '@/types/food';


interface FoodUnitSelectorProps {
  food: Food;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (food: Food, quantity: number, unit: string, selectedVariant: FoodVariant) => void;
  showUnitSelector?: boolean; // New prop to control visibility
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
  const { loggingLevel, energyUnit, convertEnergy } = usePreferences(); // Get logging level, energyUnit, convertEnergy
  debug(loggingLevel, "FoodUnitSelector component rendered.", { food, open });

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    // This component does not import useTranslation, so we'll hardcode or pass t() from parent if it were needed for translation
    return unit === 'kcal' ? 'kcal' : 'kJ';
  };
  const [variants, setVariants] = useState<FoodVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<FoodVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    debug(loggingLevel, "FoodUnitSelector open/food useEffect triggered.", { open, food, initialQuantity, initialUnit, initialVariantId });
    if (open && food && food.id) { // Ensure food.id exists before loading variants
      loadVariantsData();
      setQuantity(initialQuantity !== undefined ? initialQuantity : (food.default_variant?.serving_size || 1));
    }
  }, [open, food, initialQuantity, initialUnit, initialVariantId]);

  const loadVariantsData = async () => {
    debug(loggingLevel, "Loading food variants for food ID:", food?.id);
    setLoading(true);
    try {
      const data = await loadFoodVariants(food.id);

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
        info(loggingLevel, "Food variants loaded successfully:", data);
        const variantsFromDb = data.map(variant => ({
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
        const otherVariants = variantsFromDb.filter(variant => variant.id !== primaryUnit.id);
        combinedVariants = [primaryUnit, ...otherVariants];
      } else {
        info(loggingLevel, "No additional variants found, using primary food unit only.");
      }
      
      setVariants(combinedVariants);
      if (initialVariantId) {
        const variantToSelect = combinedVariants.find(v => v.id === initialVariantId);
        setSelectedVariant(variantToSelect || combinedVariants[0]);
      } else {
        setSelectedVariant(combinedVariants[0]); // Select the primary unit by default
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
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    debug(loggingLevel, "Handling submit.");
    if (selectedVariant) {
      info(loggingLevel, 'Submitting food selection:', {
        food,
        quantity,
        unit: selectedVariant.serving_unit,
        variantId: selectedVariant.id || undefined
      });

      // Pass the user-entered quantity directly, as it now represents the number of servings.
      // If the selected variant is the primary food unit (identified by food.id), pass null for variantId
      // Otherwise, pass the actual variant.id
      onSelect(food, quantity, selectedVariant.serving_unit, selectedVariant);
      onOpenChange(false);
      setQuantity(1);
    } else {
      warn(loggingLevel, "Submit called with no selected variant.");
    }
  };

  const calculateNutrition = () => {
    debug(loggingLevel, "Calculating nutrition.");
    if (!selectedVariant) {
      warn(loggingLevel, "calculateNutrition called with no selected variant.");
      return null;
    }

    info(loggingLevel, 'Calculating nutrition for:', {
      selectedVariant,
      quantity
    });

    let nutrientValuesPerReferenceSize = {
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
    let effectiveReferenceSize = selectedVariant.serving_size || 100;

    // Calculate total nutrition: (nutrient_value_per_reference_size / effective_reference_size) * quantity_consumed
    const result = {
      calories: (nutrientValuesPerReferenceSize.calories / effectiveReferenceSize) * quantity, // This result is in kcal
      protein: (nutrientValuesPerReferenceSize.protein / effectiveReferenceSize) * quantity,
      carbs: (nutrientValuesPerReferenceSize.carbs / effectiveReferenceSize) * quantity,
      fat: (nutrientValuesPerReferenceSize.fat / effectiveReferenceSize) * quantity,
    };
    debug(loggingLevel, "Calculated nutrition result:", result);

    return result;
  };

  const nutrition = calculateNutrition();
  const focusAndSelect = useCallback(e => {
    if (e) {
      e.focus();
      e.select();
    }
  }, []);

  return (
    <Dialog open={open && (showUnitSelector ?? true)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialQuantity ? `Edit ${food?.name}` : `Add ${food?.name} to Meal`}</DialogTitle>
          <DialogDescription>
            {initialQuantity ? `Edit the quantity and unit for ${food?.name}.` : `Select the quantity and unit for your food entry.`}
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
                    debug(loggingLevel, "Quantity changed:", newQuantity);
                    setQuantity(newQuantity);
                  }}
                />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Select
                  value={selectedVariant?.id || ''} // Use empty string for default if no ID
                  onValueChange={(value) => {
                    debug(loggingLevel, "Unit selected:", value);
                    const variant = variants.find(v => v.id === value); // Match by actual ID
                    setSelectedVariant(variant || null);
                    if (variant) {
                      setQuantity(variant.serving_size); // Update quantity to the new variant's serving size
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}> {/* Use actual ID as key and value */}
                        {variant.serving_unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {nutrition && selectedVariant && (
              <div className="bg-muted p-3 rounded-lg">
                <h4 className="font-medium mb-2">Nutrition for {quantity} {selectedVariant.serving_unit}:</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>{Math.round(convertEnergy(nutrition.calories, 'kcal', energyUnit))} {getEnergyUnitString(energyUnit)}</div>
                  <div>{nutrition.protein.toFixed(1)}g protein</div>
                  <div>{nutrition.carbs.toFixed(1)}g carbs</div>
                  <div>{nutrition.fat.toFixed(1)}g fat</div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!selectedVariant}>
                {initialQuantity ? 'Update Food' : 'Add to Meal'}
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
