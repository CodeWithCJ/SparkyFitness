
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import { debug, info, warn, error } from '@/utils/logging'; // Import logging utility
import { loadFoodVariants, FoodVariant } from '@/services/foodUnitService';


interface FoodUnitSelectorProps {
  food: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (food: any, quantity: number, unit: string, variantId?: string) => void;
}

const FoodUnitSelector = ({ food, open, onOpenChange, onSelect }: FoodUnitSelectorProps) => {
  const { loggingLevel } = usePreferences(); // Get logging level
  debug(loggingLevel, "FoodUnitSelector component rendered.", { food, open });
  const [variants, setVariants] = useState<FoodVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<FoodVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    debug(loggingLevel, "FoodUnitSelector open/food useEffect triggered.", { open, food });
    if (open && food) {
      loadVariants();
      // Set quantity to the serving_size of the initially selected variant (primary unit)
      if (food) {
        setQuantity(food.serving_size || 1);
      } else {
        setQuantity(1); // Fallback if food is not available
      }
    }
  }, [open, food]);

  const loadVariants = async () => {
    debug(loggingLevel, "Loading food variants for food ID:", food?.id);
    setLoading(true);
    try {

      const data = await loadFoodVariants(food.id);


      // Always include the primary food unit as the first option
      const primaryUnit: FoodVariant = {
        id: food.id, // Use food.id as the variant ID for the primary unit
        serving_size: food.serving_size || 100,
        serving_unit: food.serving_unit || 'g',
        calories: food.calories || 0,
        protein: food.protein || 0,
        carbs: food.carbs || 0,
        fat: food.fat || 0
      };

      let combinedVariants: FoodVariant[] = [primaryUnit];

      if (data && data.length > 0) {
        info(loggingLevel, "Food variants loaded successfully:", data);
        const variantsFromDb = data.map(variant => ({
          id: variant.id,
          serving_size: variant.serving_size,
          serving_unit: variant.serving_unit,
          calories: variant.calories || 0,
          protein: variant.protein || 0,
          carbs: variant.carbs || 0,
          fat: variant.fat || 0
        }));

        // Filter out any variants from DB that are identical to the primary unit
        const filteredVariants = variantsFromDb.filter(variant =>
          !(variant.serving_size === primaryUnit.serving_size && variant.serving_unit === primaryUnit.serving_unit)
        );
        
        combinedVariants = [primaryUnit, ...filteredVariants];
      } else {
        info(loggingLevel, "No additional variants found, using primary food unit only.");
      }
      
      setVariants(combinedVariants);
      setSelectedVariant(combinedVariants[0]); // Select the primary unit by default
      // Do NOT pre-populate quantity with serving_size. Quantity should default to 1.
    } catch (err) {
      error(loggingLevel, 'Error loading variants:', err);
      // Fallback to primary food unit on error
      const primaryUnit: FoodVariant = {
        id: food.id, // Use food.id as the variant ID for the primary unit
        serving_size: food.serving_size || 100,
        serving_unit: food.serving_unit || 'g',
        calories: food.calories || 0,
        protein: food.protein || 0,
        carbs: food.carbs || 0,
        fat: food.fat || 0
      };
      setVariants([primaryUnit]);
      setSelectedVariant(primaryUnit);
      // Do NOT pre-populate quantity with serving_size. Quantity should default to 1.
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
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
      const variantIdToPass = selectedVariant.id === food.id ? null : selectedVariant.id;

      onSelect(food, quantity, selectedVariant.serving_unit, variantIdToPass);
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
      calories: food.calories || 0,
      protein: food.protein || 0,
      carbs: food.carbs || 0,
      fat: food.fat || 0,
    };
    let effectiveReferenceSize = food.serving_size || 100;

    if (selectedVariant) {
      if (selectedVariant.calories !== null && selectedVariant.calories !== undefined &&
          selectedVariant.protein !== null && selectedVariant.protein !== undefined &&
          selectedVariant.carbs !== null && selectedVariant.carbs !== undefined &&
          selectedVariant.fat !== null && selectedVariant.fat !== undefined) {
        // Use variant's explicit nutrient values per its serving_size
        nutrientValuesPerReferenceSize = {
          calories: selectedVariant.calories,
          protein: selectedVariant.protein,
          carbs: selectedVariant.carbs,
          fat: selectedVariant.fat,
        };
        effectiveReferenceSize = selectedVariant.serving_size;
      } else {
        // If variant doesn't have explicit nutrients, scale base food nutrients to the variant's serving size
        const variantServingSize = selectedVariant.serving_size;
        const baseFoodServingSize = food.serving_size || 100;
        const ratio = variantServingSize / baseFoodServingSize;

        nutrientValuesPerReferenceSize = {
          calories: (food.calories || 0) * ratio,
          protein: (food.protein || 0) * ratio,
          carbs: (food.carbs || 0) * ratio,
          fat: (food.fat || 0) * ratio,
        };
        effectiveReferenceSize = variantServingSize;
      }
    }

    // Calculate total nutrition: (nutrient_value_per_reference_size / effective_reference_size) * quantity_consumed
    const result = {
      calories: (nutrientValuesPerReferenceSize.calories / effectiveReferenceSize) * quantity,
      protein: (nutrientValuesPerReferenceSize.protein / effectiveReferenceSize) * quantity,
      carbs: (nutrientValuesPerReferenceSize.carbs / effectiveReferenceSize) * quantity,
      fat: (nutrientValuesPerReferenceSize.fat / effectiveReferenceSize) * quantity,
    };
    debug(loggingLevel, "Calculated nutrition result:", result);

    return result;
  };

  const nutrition = calculateNutrition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {food?.name} to Meal</DialogTitle>
          <DialogDescription>
            Select the quantity and unit for your food entry.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div>Loading units...</div>
        ) : (
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
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="font-medium mb-2">Nutrition for {quantity} {selectedVariant.serving_unit}:</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>{nutrition.calories.toFixed(1)} calories</div>
                  <div>{nutrition.protein.toFixed(1)}g protein</div>
                  <div>{nutrition.carbs.toFixed(1)}g carbs</div>
                  <div>{nutrition.fat.toFixed(1)}g fat</div>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!selectedVariant}>
                Add to Meal
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FoodUnitSelector;
