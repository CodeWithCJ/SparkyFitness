import { useState, useEffect } from "react";
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
  FoodVariant,
  FoodEntry,
} from '@/services/editFoodEntryService';



interface EditFoodEntryDialogProps {
  entry: FoodEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

const EditFoodEntryDialog = ({ entry, open, onOpenChange, onSave }: EditFoodEntryDialogProps) => {
  const { loggingLevel } = usePreferences(); // Get logging level
  debug(loggingLevel, "EditFoodEntryDialog component rendered.", { entry, open });
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<FoodVariant | null>(null);
  const [variants, setVariants] = useState<FoodVariant[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    debug(loggingLevel, "EditFoodEntryDialog entry/open useEffect triggered.", { entry, open });
    if (entry && open) {
      setQuantity(entry.quantity || 1);
      loadVariants();
    }
  }, [entry, open]);

  const loadVariants = async () => {
    debug(loggingLevel, "Loading food variants for food ID:", entry?.food_id);
    if (!entry) {
      warn(loggingLevel, "loadVariants called with no entry.");
      return;
    }

    setLoading(true);
    try {
      const data = await loadFoodVariants(entry.food_id);

      // Always include the primary food unit as the first option
      const primaryUnit: FoodVariant = {
        id: entry.foods.id, // Use food.id as the variant ID for the primary unit
        serving_size: entry.foods.serving_size || 100,
        serving_unit: entry.foods.serving_unit || 'g',
        calories: entry.foods.calories,
        protein: entry.foods.protein,
        carbs: entry.foods.carbs,
        fat: entry.foods.fat,
        saturated_fat: entry.foods.saturated_fat,
        polyunsaturated_fat: entry.foods.polyunsaturated_fat,
        monounsaturated_fat: entry.foods.monounsaturated_fat,
        trans_fat: entry.foods.trans_fat,
        cholesterol: entry.foods.cholesterol,
        sodium: entry.foods.sodium,
        potassium: entry.foods.potassium,
        dietary_fiber: entry.foods.dietary_fiber,
        sugars: entry.foods.sugars,
        vitamin_a: entry.foods.vitamin_a,
        vitamin_c: entry.foods.vitamin_c,
        calcium: entry.foods.calcium,
        iron: entry.foods.iron
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

        // Filter out any variants from DB that are identical to the primary unit
        const filteredVariants = variantsFromDb.filter(variant =>
          !(variant.serving_size === primaryUnit.serving_size && variant.serving_unit === primaryUnit.serving_unit)
        );
        
        combinedVariants = [primaryUnit, ...filteredVariants];
      } else {
        info(loggingLevel, "No additional variants found, using primary food unit only.");
      }
      
      setVariants(combinedVariants);

      // Set selected variant based on entry.variant_id or entry.unit, or default to primaryUnit
      const initialSelectedVariant = combinedVariants.find(v =>
        (entry.variant_id && v.id === entry.variant_id) ||
        (!entry.variant_id && v.serving_unit === entry.unit && v.serving_size === entry.foods.serving_size)
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

  const handleSave = async () => {
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
    if (!selectedVariant || !entry) {
      warn(loggingLevel, "calculateNutrition called with missing data.", { selectedVariant, entry });
      return null;
    }

    // Calculate the ratio based on quantity vs serving size of the selected variant
    const ratio = quantity / selectedVariant.serving_size;
    debug(loggingLevel, "Calculated ratio for edit dialog:", ratio);

    // Apply the ratio to the selected variant's nutrition values
    const nutrition = {
      calories: (selectedVariant.calories * ratio) || 0,
      protein: (selectedVariant.protein * ratio) || 0,
      carbs: (selectedVariant.carbs * ratio) || 0,
      fat: (selectedVariant.fat * ratio) || 0,
      saturated_fat: (selectedVariant.saturated_fat * ratio) || 0,
      polyunsaturated_fat: (selectedVariant.polyunsaturated_fat * ratio) || 0,
      monounsaturated_fat: (selectedVariant.monounsaturated_fat * ratio) || 0,
      trans_fat: (selectedVariant.trans_fat * ratio) || 0,
      cholesterol: (selectedVariant.cholesterol * ratio) || 0,
      sodium: (selectedVariant.sodium * ratio) || 0,
      potassium: (selectedVariant.potassium * ratio) || 0,
      dietary_fiber: (selectedVariant.dietary_fiber * ratio) || 0,
      sugars: (selectedVariant.sugars * ratio) || 0,
      vitamin_a: (selectedVariant.vitamin_a * ratio) || 0,
      vitamin_c: (selectedVariant.vitamin_c * ratio) || 0,
      calcium: (selectedVariant.calcium * ratio) || 0,
      iron: (selectedVariant.iron * ratio) || 0,
    };
    debug(loggingLevel, "Calculated nutrition for edit dialog:", nutrition);
    return nutrition;
  };

  const nutrition = calculateNutrition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Food Entry</DialogTitle>
          <DialogDescription>
            Edit the quantity and serving unit for your food entry.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div>Loading units...</div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">{entry.foods.name}</h3>
                {entry.foods.brand && (
                  <p className="text-sm text-gray-600 mb-4">{entry.foods.brand}</p>
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
                        <Label className="text-sm">Calories</Label>
                        <div className="text-lg font-medium">{nutrition.calories.toFixed(1)}</div>
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

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Base Values (per {selectedVariant?.serving_size} {selectedVariant?.serving_unit}):</h4>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>{selectedVariant?.calories || 0} cal</div>
                      <div>{selectedVariant?.protein || 0}g protein</div>
                      <div>{selectedVariant?.carbs || 0}g carbs</div>
                      <div>{selectedVariant?.fat || 0}g fat</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2 mt-6">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>
                  Save Changes
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditFoodEntryDialog;
