import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import { debug, info, warn, error } from '@/utils/logging'; // Import logging utility
import {
  loadFoodVariants,
  updateFoodEntry,
} from '@/services/editFoodEntryService';
import { getFoodById } from '@/services/foodService'; // Import getFoodById
import { FoodVariant, FoodEntry, Food } from '@/types/food'; // Import Food type



interface EditFoodEntryDialogProps {
  entry: FoodEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

const EditFoodEntryDialog = ({ entry, open, onOpenChange, onSave }: EditFoodEntryDialogProps) => {
  const { loggingLevel, energyUnit, convertEnergy } = usePreferences(); // Get logging level, energyUnit, convertEnergy
  debug(loggingLevel, "EditFoodEntryDialog component rendered.", { entry, open });

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    // This component does not import useTranslation, so we'll hardcode or pass t() from parent if it were needed for translation
    return unit === 'kcal' ? 'kcal' : 'kJ';
  };
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<FoodVariant | null>(null);
  const [variants, setVariants] = useState<FoodVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [latestFood, setLatestFood] = useState<Food | null>(null); // New state for latest food
  const [latestVariant, setLatestVariant] = useState<FoodVariant | null>(null); // New state for latest variant

  useEffect(() => {
    debug(loggingLevel, "EditFoodEntryDialog entry/open useEffect triggered.", { entry, open });
    if (entry && open) {
      setQuantity(entry.quantity || 1);
      loadFoodAndVariants(); // Call new function to load both food and variants
    }
  }, [entry, open]);

  const loadFoodAndVariants = async () => {
    debug(loggingLevel, "Loading food and variants for food ID:", entry?.food_id);
    if (!entry) {
      warn(loggingLevel, "loadFoodAndVariants called with no entry.");
      return;
    }

    if (entry.meal_id) {
      // This is an aggregated meal entry, editing is not supported in the same way.
      // We can disable the form or show a message.
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch latest food details
      const foodData = await getFoodById(entry.food_id);
      setLatestFood(foodData);

      // Fetch latest variants for the food
      const variantsData = await loadFoodVariants(entry.food_id);

      // Determine the primary unit from the fetched food data's default variant
      const defaultVariant = foodData.default_variant || variantsData.find(v => v.is_default);
      const primaryUnit: FoodVariant = defaultVariant ? {
        id: defaultVariant.id,
        serving_size: defaultVariant.serving_size,
        serving_unit: defaultVariant.serving_unit,
        calories: defaultVariant.calories || 0, // kcal
        protein: defaultVariant.protein || 0,
        carbs: defaultVariant.carbs || 0,
        fat: defaultVariant.fat || 0,
        saturated_fat: defaultVariant.saturated_fat || 0,
        polyunsaturated_fat: defaultVariant.polyunsaturated_fat || 0,
        monounsaturated_fat: defaultVariant.monounsaturated_fat || 0,
        trans_fat: defaultVariant.trans_fat || 0,
        cholesterol: defaultVariant.cholesterol || 0,
        sodium: defaultVariant.sodium || 0,
        potassium: defaultVariant.potassium || 0,
        dietary_fiber: defaultVariant.dietary_fiber || 0,
        sugars: defaultVariant.sugars || 0,
        vitamin_a: defaultVariant.vitamin_a || 0,
        vitamin_c: defaultVariant.vitamin_c || 0,
        calcium: defaultVariant.calcium || 0,
        iron: defaultVariant.iron || 0
      } : { // Fallback if no default variant found
        id: entry.food_id,
        serving_size: 100,
        serving_unit: 'g',
        calories: 0, // kcal
        protein: 0, carbs: 0, fat: 0, saturated_fat: 0, polyunsaturated_fat: 0,
        monounsaturated_fat: 0, trans_fat: 0, cholesterol: 0, sodium: 0, potassium: 0,
        dietary_fiber: 0, sugars: 0, vitamin_a: 0, vitamin_c: 0, calcium: 0, iron: 0
      };

      let combinedVariants: FoodVariant[] = [primaryUnit];

      if (variantsData && variantsData.length > 0) {
        info(loggingLevel, "Food variants loaded successfully:", variantsData);
        const variantsFromDb = variantsData.map(variant => ({
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
          iron: variant.iron || 0
        }));

        // Ensure the primary unit is always included and is the first option.
        // Then, add any other variants from the database that are not the primary unit (based on ID).
        const otherVariants = variantsFromDb.filter(variant => variant.id !== primaryUnit.id);
        combinedVariants = [primaryUnit, ...otherVariants];
      } else {
        info(loggingLevel, "No additional variants found, using primary food unit only.");
      }
      
      setVariants(combinedVariants);

      // Set selected variant based on entry.variant_id or default to primaryUnit
      const initialSelectedVariant = combinedVariants.find(v =>
        (entry.variant_id && v.id === entry.variant_id) ||
        (!entry.variant_id && v.id === primaryUnit.id) // If no variant_id, use the default variant
      ) || primaryUnit;
      setSelectedVariant(initialSelectedVariant);
      setLatestVariant(initialSelectedVariant); // Set latest variant for nutrition calculation
      debug(loggingLevel, "Selected variant:", initialSelectedVariant);
    } catch (err) {
      error(loggingLevel, 'Error loading food or variants:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadVariants = async () => {
    debug(loggingLevel, "Loading food variants for food ID:", entry?.food_id);
    if (!entry) {
      warn(loggingLevel, "loadVariants called with no entry.");
      return;
    }

    setLoading(true);
    try {
      const data = await loadFoodVariants(entry.food_id);

      // The primary unit is now the food_variants object directly from the entry
      const primaryUnit: FoodVariant = {
        id: entry.food_variants?.id || entry.food_id, // Use variant ID if available, otherwise food ID
        serving_size: entry.food_variants?.serving_size || 100,
        serving_unit: entry.food_variants?.serving_unit || 'g',
        calories: entry.food_variants?.calories || 0, // kcal
        protein: entry.food_variants?.protein || 0,
        carbs: entry.food_variants?.carbs || 0,
        fat: entry.food_variants?.fat || 0,
        saturated_fat: entry.food_variants?.saturated_fat || 0,
        polyunsaturated_fat: entry.food_variants?.polyunsaturated_fat || 0,
        monounsaturated_fat: entry.food_variants?.monounsaturated_fat || 0,
        trans_fat: entry.food_variants?.trans_fat || 0,
        cholesterol: entry.food_variants?.cholesterol || 0,
        sodium: entry.food_variants?.sodium || 0,
        potassium: entry.food_variants?.potassium || 0,
        dietary_fiber: entry.food_variants?.dietary_fiber || 0,
        sugars: entry.food_variants?.sugars || 0,
        vitamin_a: entry.food_variants?.vitamin_a || 0,
        vitamin_c: entry.food_variants?.vitamin_c || 0,
        calcium: entry.food_variants?.calcium || 0,
        iron: entry.food_variants?.iron || 0
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
          iron: variant.iron || 0
        }));

        // Ensure the primary unit is always included and is the first option.
        // Then, add any other variants from the database that are not the primary unit (based on ID).
        const otherVariants = variantsFromDb.filter(variant => variant.id !== primaryUnit.id);
        combinedVariants = [primaryUnit, ...otherVariants];
      } else {
        info(loggingLevel, "No additional variants found, using primary food unit only.");
      }
      
      setVariants(combinedVariants);

      // Set selected variant based on entry.variant_id or default to primaryUnit
      const initialSelectedVariant = combinedVariants.find(v =>
        (entry.variant_id && v.id === entry.variant_id) ||
        (!entry.variant_id && v.id === primaryUnit.id) // If no variant_id, use the default variant
      ) || primaryUnit;
      setSelectedVariant(initialSelectedVariant);
      debug(loggingLevel, "Selected variant:", initialSelectedVariant);
    } catch (err) {
      error(loggingLevel, 'Error loading variants:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!entry) return null;

  const handleSubmit = async (event) => {
      event.preventDefault();
    debug(loggingLevel, "Handling save food entry.");
    if (!selectedVariant) {
      warn(loggingLevel, "Save called with no selected variant.");
      return;
    }

    try {
      const updateData: any = {
        quantity: quantity,
        unit: selectedVariant.serving_unit,
        variant_id: selectedVariant.id === 'default-variant' ? null : selectedVariant.id || null
      };
      debug(loggingLevel, "Update data for food entry:", updateData);

      await updateFoodEntry(entry.id, updateData);

      info(loggingLevel, "Food entry updated successfully:", entry.id);
      toast({
        title: "Success",
        description: "Food entry updated successfully",
      });

      onSave();
      onOpenChange(false);
    } catch (err) {
      error(loggingLevel, 'Error updating food entry:', err);
      toast({
        title: "Error",
        description: "Failed to update food entry",
        variant: "destructive",
      });
    }
  };

  const calculateNutrition = () => {
    debug(loggingLevel, "Calculating nutrition for edit dialog.");
    if (!latestVariant || !entry) { // Use latestVariant for calculation
      warn(loggingLevel, "calculateNutrition called with missing data.", { latestVariant, entry });
      return null;
    }

    // Calculate the ratio based on quantity vs serving size of the selected variant
    const ratio = quantity / latestVariant.serving_size; // Use latestVariant
    debug(loggingLevel, "Calculated ratio for edit dialog:", ratio);

    // Apply the ratio to the selected variant's nutrition values
    const nutrition = {
      calories: (latestVariant.calories * ratio) || 0, // Use latestVariant, this is in kcal
      protein: (latestVariant.protein * ratio) || 0, // Use latestVariant
      carbs: (latestVariant.carbs * ratio) || 0, // Use latestVariant
      fat: (latestVariant.fat * ratio) || 0, // Use latestVariant
      saturated_fat: (latestVariant.saturated_fat * ratio) || 0, // Use latestVariant
      polyunsaturated_fat: (latestVariant.polyunsaturated_fat * ratio) || 0, // Use latestVariant
      monounsaturated_fat: (latestVariant.monounsaturated_fat * ratio) || 0, // Use latestVariant
      trans_fat: (latestVariant.trans_fat * ratio) || 0, // Use latestVariant
      cholesterol: (latestVariant.cholesterol * ratio) || 0, // Use latestVariant
      sodium: (latestVariant.sodium * ratio) || 0, // Use latestVariant
      potassium: (latestVariant.potassium * ratio) || 0, // Use latestVariant
      dietary_fiber: (latestVariant.dietary_fiber * ratio) || 0, // Use latestVariant
      sugars: (latestVariant.sugars * ratio) || 0, // Use latestVariant
      vitamin_a: (latestVariant.vitamin_a * ratio) || 0, // Use latestVariant
      vitamin_c: (latestVariant.vitamin_c * ratio) || 0, // Use latestVariant
      calcium: (latestVariant.calcium * ratio) || 0, // Use latestVariant
      iron: (latestVariant.iron * ratio) || 0, // Use latestVariant
    };
    debug(loggingLevel, "Calculated nutrition for edit dialog:", nutrition);
    return nutrition;
  };

  const nutrition = calculateNutrition();
  const focusAndSelect = useCallback(e => {
    if (e) {
      e.focus();
      e.select();
    }
  }, []);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Food Entry</DialogTitle>
          <DialogDescription>
            Edit the quantity and serving unit for your food entry.
          </DialogDescription>
          <p className="text-sm text-red-500 mt-2">
            Note: Updating this entry will use the latest available variant details for the food, not the original snapshot.
          </p>
        </DialogHeader>

        {loading ? (
          <div>Loading...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">{entry.food_name}</h3>
                {entry.brand_name && (
                  <p className="text-sm text-gray-600 mb-4">{entry.brand_name}</p>
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
                    ref={focusAndSelect}
                    onChange={(e) => {
                      debug(loggingLevel, "Quantity changed in edit dialog:", e.target.value);
                      setQuantity(Number(e.target.value));
                    }}
                  />
                </div>

                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <Select
                    value={selectedVariant?.id || ''}
                    onValueChange={(value) => {
                      debug(loggingLevel, "Unit selected in edit dialog:", value);
                      const variant = variants.find(v => v.id === value);
                      setSelectedVariant(variant || null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {variants.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {variant.serving_unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {nutrition && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-3">Macronutrients</h4>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <Label className="text-sm">Calories ({getEnergyUnitString(energyUnit)})</Label>
                        <div className="text-lg font-medium">{Math.round(convertEnergy(nutrition.calories, 'kcal', energyUnit))}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Protein (g)</Label>
                        <div className="text-lg font-medium">{nutrition.protein.toFixed(1)}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Carbs (g)</Label>
                        <div className="text-lg font-medium">{nutrition.carbs.toFixed(1)}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Fat (g)</Label>
                        <div className="text-lg font-medium">{nutrition.fat.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Fat Breakdown</h4>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <Label className="text-sm">Saturated Fat (g)</Label>
                        <div className="text-lg font-medium">{nutrition.saturated_fat.toFixed(1)}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Polyunsaturated Fat (g)</Label>
                        <div className="text-lg font-medium">{nutrition.polyunsaturated_fat.toFixed(1)}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Monounsaturated Fat (g)</Label>
                        <div className="text-lg font-medium">{nutrition.monounsaturated_fat.toFixed(1)}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Trans Fat (g)</Label>
                        <div className="text-lg font-medium">{nutrition.trans_fat.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Minerals & Other Nutrients</h4>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <Label className="text-sm">Cholesterol (mg)</Label>
                        <div className="text-lg font-medium">{nutrition.cholesterol.toFixed(1)}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Sodium (mg)</Label>
                        <div className="text-lg font-medium">{nutrition.sodium.toFixed(1)}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Potassium (mg)</Label>
                        <div className="text-lg font-medium">{nutrition.potassium.toFixed(1)}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Dietary Fiber (g)</Label>
                        <div className="text-lg font-medium">{nutrition.dietary_fiber.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Sugars & Vitamins</h4>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <Label className="text-sm">Sugars (g)</Label>
                        <div className="text-lg font-medium">{nutrition.sugars.toFixed(1)}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Vitamin A (μg)</Label>
                        <div className="text-lg font-medium">{nutrition.vitamin_a.toFixed(1)}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Vitamin C (mg)</Label>
                        <div className="text-lg font-medium">{nutrition.vitamin_c.toFixed(1)}</div>
                      </div>
                      <div>
                        <Label className="text-sm">Calcium (mg)</Label>
                        <div className="text-lg font-medium">{nutrition.calcium.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <Label className="text-sm">Iron (mg)</Label>
                        <div className="text-lg font-medium">{nutrition.iron.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Base Values (per {selectedVariant?.serving_size} {selectedVariant?.serving_unit}):</h4>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>{Math.round(convertEnergy(selectedVariant?.calories || 0, 'kcal', energyUnit))} {getEnergyUnitString(energyUnit)}</div>
                      <div>{selectedVariant?.protein || 0}g protein</div>
                      <div>{selectedVariant?.carbs || 0}g carbs</div>
                      <div>{selectedVariant?.fat || 0}g fat</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 mt-6">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Save Changes
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
