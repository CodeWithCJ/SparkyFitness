import type React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import MealBuilder from '../../components/MealBuilder';
import FavoriteStarButton from '@/components/FavoriteStarButton';
import type { Meal, MealFood } from '@/types/meal';

interface LogMealDialogProps {
  mealTemplate: Meal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  mealType: string;
  initialEntryTime?: string | null;
}

const LogMealDialog: React.FC<LogMealDialogProps> = ({
  mealTemplate,
  open,
  onOpenChange,
  date,
  mealType,
  initialEntryTime,
}) => {
  const handleSave = () => {
    onOpenChange(false);
  };

  if (!mealTemplate) return null;

  // Ensure foods have necessary serving info for MealBuilder
  // The search result from repository usually includes flattened variant info,
  // but let's make sure MealBuilder accepts it as MealFood[].
  // The repository returns fields that match MealFood interface quite well.
  const initialFoods: MealFood[] = mealTemplate.foods || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Log Meal: {mealTemplate.name}</span>
            {mealTemplate.id && (
              <FavoriteStarButton type="meal" id={mealTemplate.id} />
            )}
          </DialogTitle>
          <DialogDescription>
            Adjust the portion size or ingredients for this meal entry.
          </DialogDescription>
        </DialogHeader>
        <MealBuilder
          mealId={mealTemplate.id} // Pass template ID so it can be linked
          initialFoods={initialFoods}
          onSave={handleSave}
          onCancel={() => onOpenChange(false)}
          source="food-diary"
          foodEntryDate={date}
          foodEntryMealType={mealType}
          initialServingSize={mealTemplate.serving_size}
          initialServingUnit={mealTemplate.serving_unit}
          initialEntryTime={initialEntryTime}
        />
      </DialogContent>
    </Dialog>
  );
};

export default LogMealDialog;
