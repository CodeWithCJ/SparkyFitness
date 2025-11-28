import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import MealBuilder from './MealBuilder';
import { FoodEntryMeal, MealFood } from '@/types/meal'; // Import FoodEntryMeal directly
import { debug, error, warn } from '@/utils/logging';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTranslation } from "react-i18next";

interface EditMealFoodEntryDialogProps {
  foodEntry: FoodEntryMeal; // Updated to accept FoodEntryMeal
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

const EditMealFoodEntryDialog = ({ foodEntry, open, onOpenChange, onSave }: EditMealFoodEntryDialogProps) => {
  const { t } = useTranslation();
  const { loggingLevel } = usePreferences();
  const [initialMealFoods, setInitialMealFoods] = useState<MealFood[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    debug(loggingLevel, "EditMealFoodEntryDialog: useEffect triggered. FoodEntryMeal:", foodEntry);
    if (open && foodEntry?.foods) { // Only set when dialog is open and foodEntryMeal has foods
      setLoading(true);
      setInitialMealFoods(foodEntry.foods);
      setLoading(false);
      debug(loggingLevel, "EditMealFoodEntryDialog: Initial meal foods set from FoodEntryMeal:", foodEntry.foods);
    } else if (open) {
      warn(loggingLevel, "EditMealFoodEntryDialog: No foods found in FoodEntryMeal, setting initial foods to empty.");
      setInitialMealFoods([]);
      setLoading(false);
    }
  }, [foodEntry, open, loggingLevel]);

  const handleSave = () => {
    onSave(); // Trigger refresh in FoodDiary
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Logged Meal: {foodEntry?.name}</DialogTitle> {/* Updated to foodEntry.name */}
          <DialogDescription>
            Modify the foods and quantities for this specific logged meal entry.
          </DialogDescription>
          <p className="text-sm text-blue-500 mt-2">
            Note: Changes made here will only affect this specific entry in your food diary, not the master meal template.
          </p>
        </DialogHeader>
        {loading ? (
          <div>Loading meal details...</div>
        ) : (
          <MealBuilder
            initialFoods={initialMealFoods} // Pass the fetched meal foods
            onSave={handleSave} // This will now trigger the disaggregation logic
            onCancel={() => onOpenChange(false)}
            source="food-diary" // Indicate source is food diary
            foodEntryId={foodEntry.id} // Pass the FoodEntryMeal ID
            foodEntryDate={foodEntry.entry_date} // Pass the FoodEntryMeal date
            foodEntryMealType={foodEntry.meal_type} // Pass the FoodEntryMeal meal type
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditMealFoodEntryDialog;