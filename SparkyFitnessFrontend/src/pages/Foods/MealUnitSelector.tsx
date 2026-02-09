import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn } from '@/utils/logging';
import { Meal } from '@/types/meal';

interface MealUnitSelectorProps {
    meal: Meal;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (meal: Meal, quantity: number, unit: string) => void;
    initialQuantity?: number;
    initialUnit?: string;
}

const MealUnitSelector = ({
    meal,
    open,
    onOpenChange,
    onSelect,
    initialQuantity,
    initialUnit,
}: MealUnitSelectorProps) => {
    const { loggingLevel, energyUnit, convertEnergy } = usePreferences();
    debug(loggingLevel, "MealUnitSelector component rendered.", { meal, open });

    const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
        return unit === 'kcal' ? 'kcal' : 'kJ';
    };

    const [quantity, setQuantity] = useState(1.0);
    const [unit, setUnit] = useState('serving');

    useEffect(() => {
        debug(loggingLevel, "MealUnitSelector open/meal useEffect triggered.", { open, meal, initialQuantity, initialUnit });
        if (open && meal) {
            // Set initial values or defaults
            setQuantity(initialQuantity !== undefined ? initialQuantity : 1.0);
            setUnit(initialUnit || meal.serving_unit || 'serving');
        }
    }, [open, meal, initialQuantity, initialUnit]);

    const handleSubmit = (event) => {
        event.preventDefault();
        debug(loggingLevel, "Handling meal unit selector submit.");

        info(loggingLevel, 'Submitting meal selection:', {
            meal,
            quantity,
            unit
        });

        onSelect(meal, quantity, unit);
        onOpenChange(false);
        setQuantity(1.0);
    };

    const calculateNutrition = () => {
        debug(loggingLevel, "Calculating meal nutrition preview.");
        if (!meal || !meal.foods || meal.foods.length === 0) {
            warn(loggingLevel, "calculateNutrition called with no meal foods.");
            return null;
        }

        // Calculate total nutrition for the meal based on its component foods
        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;

        meal.foods.forEach(foodItem => {
            if (foodItem.calories) totalCalories += foodItem.calories;
            if (foodItem.protein) totalProtein += foodItem.protein;
            if (foodItem.carbs) totalCarbs += foodItem.carbs;
            if (foodItem.fat) totalFat += foodItem.fat;
        });

        // Calculate meal serving size (default to 1.0 if not set)
        const mealServingSize = meal.serving_size || 1.0;

        // Calculate multiplier based on quantity and unit
        let multiplier = 1.0;
        if (unit === 'serving' || unit === meal.serving_unit) {
            // If using serving-based units, multiply by the quantity
            multiplier = quantity;
        } else {
            // If using non-serving units, calculate based on ratio
            multiplier = quantity / mealServingSize;
        }

        const result = {
            calories: totalCalories * multiplier,
            protein: totalProtein * multiplier,
            carbs: totalCarbs * multiplier,
            fat: totalFat * multiplier,
        };

        debug(loggingLevel, "Calculated meal nutrition result:", result);
        return result;
    };

    const nutrition = calculateNutrition();

    const focusAndSelect = useCallback(e => {
        if (e) {
            e.focus();
            e.select();
        }
    }, []);

    // Get display unit (prefer meal's serving_unit, fallback to 'serving')
    const displayUnit = meal?.serving_unit || 'serving';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{initialQuantity ? `Edit ${meal?.name}` : `Add ${meal?.name} to Meal Plan`}</DialogTitle>
                    <DialogDescription>
                        {initialQuantity ? `Edit the quantity for ${meal?.name}.` : `Select the quantity for this meal in your meal plan.`}
                    </DialogDescription>
                </DialogHeader>

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
                                        debug(loggingLevel, "Meal quantity changed:", newQuantity);
                                        setQuantity(newQuantity);
                                    }}
                                />
                            </div>
                            <div>
                                <Label htmlFor="unit">Unit</Label>
                                <Input
                                    id="unit"
                                    type="text"
                                    value={displayUnit}
                                    disabled
                                    className="bg-muted"
                                />
                            </div>
                        </div>

                        {nutrition && (
                            <div className="bg-muted p-3 rounded-lg">
                                <h4 className="font-medium mb-2">Nutrition for {quantity} {displayUnit}:</h4>
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
                            <Button type="submit">
                                {initialQuantity ? 'Update Meal' : 'Add to Meal Plan'}
                            </Button>
                        </div>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default MealUnitSelector;
