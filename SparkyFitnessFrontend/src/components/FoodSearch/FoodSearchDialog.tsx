import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import type { Food } from '@/types/food';
import type { Meal } from '@/types/meal';
import EnhancedFoodSearch from './FoodSearch';

interface FoodSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFoodSelect: (item: Food | Meal, type: 'food' | 'meal') => void;
  title?: string;
  description?: string;
  hideDatabaseTab?: boolean;
  hideMealTab?: boolean;
  mealType?: string;
}

const FoodSearchDialog = ({
  open,
  onOpenChange,
  onFoodSelect,
  title,
  description,
  hideDatabaseTab = false,
  hideMealTab = false,
  mealType = undefined,
}: FoodSearchDialogProps) => {
  const { t } = useTranslation();
  const resolvedTitle =
    title ?? t('foodSearchDialog.title', 'Search and add food');
  const resolvedDescription =
    description ??
    t(
      'foodSearchDialog.description',
      'Search for foods to add to your library.'
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{resolvedTitle}</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>
        <EnhancedFoodSearch
          onFoodSelect={onFoodSelect}
          hideDatabaseTab={hideDatabaseTab}
          hideMealTab={hideMealTab}
          mealType={mealType}
        />
      </DialogContent>
    </Dialog>
  );
};

export default FoodSearchDialog;
