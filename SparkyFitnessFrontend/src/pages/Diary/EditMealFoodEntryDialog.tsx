import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import MealBuilder from '@/components/MealBuilder';
import type { FoodEntryMeal, MealFood } from '@/types/meal';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const initialMealFoods: MealFood[] = foodEntry.foods ?? [];

  const handleSave = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('mealLogging.editTitle', { name: foodEntry.name })}
          </DialogTitle>
          <DialogDescription>
            {t('mealLogging.editDescription')}
          </DialogDescription>
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm leading-relaxed text-muted-foreground">
            {t('mealLogging.editScopeNotice')}
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
