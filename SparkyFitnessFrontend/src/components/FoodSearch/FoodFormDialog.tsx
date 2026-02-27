import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Food } from '@/types/food';
import { convertOpenFoodFactsToFood } from '@/utils/foodSearch';
import { OpenFoodFactsProduct } from './FoodSearch';
import EnhancedCustomFoodForm from './CustomFoodForm';
import { useTranslation } from 'react-i18next';

// Define the type for OpenFoodFactsProduct if not exported globally

interface FoodFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  editingProduct?: OpenFoodFactsProduct | Food | null;
  autoScaleOpenFoodFactsImports: boolean;
  onSave: (food: Food) => void;
}

export const FoodFormDialog = ({
  isOpen,
  onOpenChange,
  mode,
  editingProduct,
  autoScaleOpenFoodFactsImports,
  onSave,
}: FoodFormDialogProps) => {
  const { t } = useTranslation();
  const getFoodData = (): Food | undefined => {
    if (mode === 'add' || !editingProduct) return undefined;

    if ('product_name' in editingProduct) {
      return convertOpenFoodFactsToFood(
        editingProduct as OpenFoodFactsProduct,
        autoScaleOpenFoodFactsImports
      );
    }
    return editingProduct as Food;
  };

  const foodData = getFoodData();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit'
              ? t('enhancedFoodSearch.editFoodDetails', 'Edit Food Details')
              : t('enhancedFoodSearch.addNewFood', 'Add New Food')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? t(
                  'enhancedFoodSearch.editFoodDetailsDescription',
                  'Adjust the food details before adding it to your custom database.'
                )
              : t(
                  'enhancedFoodSearch.addNewFoodDescription',
                  'Enter the details for a new food item to add to your database.'
                )}
          </DialogDescription>
        </DialogHeader>
        <EnhancedCustomFoodForm
          food={foodData}
          initialVariants={foodData?.variants}
          onSave={onSave}
        />
      </DialogContent>
    </Dialog>
  );
};
