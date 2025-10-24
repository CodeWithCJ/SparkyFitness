import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import MealBuilder from './MealBuilder';

interface EditMealFoodEntryDialogProps {
  mealId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

const EditMealFoodEntryDialog = ({ mealId, open, onOpenChange, onSave }: EditMealFoodEntryDialogProps) => {
  const handleSave = () => {
    onSave();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Meal</DialogTitle>
          <DialogDescription>
            Modify the foods and quantities for this meal.
          </DialogDescription>
          <p className="text-sm text-red-500 mt-2">
            Note: Updating this entry will use the latest available meal details for the meal, not the original snapshot.
          </p>
        </DialogHeader>
        <MealBuilder
          mealId={mealId}
          onSave={handleSave}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
};

export default EditMealFoodEntryDialog;