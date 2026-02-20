import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import MealBuilder from '@/components/MealBuilder';
import type { FoodEntryMeal, MealFood } from '@/types/meal';

interface EditMealFoodEntryDialogProps {
  foodEntry: FoodEntryMeal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EditMealFoodEntryDialog = ({
  foodEntry,
  open,
  onOpenChange,
}: EditMealFoodEntryDialogProps) => {
  const initialMealFoods: MealFood[] = foodEntry.foods ?? [];

  const handleSave = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Logged Meal: {foodEntry?.name}</DialogTitle>{' '}
          <DialogDescription>
            Modify the foods and quantities for this specific logged meal entry.
          </DialogDescription>
          <p className="text-sm text-blue-500 mt-2">
            Note: Changes made here will only affect this specific entry in your
            food diary, not the master meal template.
          </p>
        </DialogHeader>
        <MealBuilder
          initialFoods={initialMealFoods}
          onSave={handleSave}
          onCancel={() => onOpenChange(false)}
          source="food-diary"
          foodEntryId={foodEntry.id}
          foodEntryDate={foodEntry.entry_date}
          foodEntryMealType={foodEntry.meal_type}
        />
      </DialogContent>
    </Dialog>
  );
};

export default EditMealFoodEntryDialog;
