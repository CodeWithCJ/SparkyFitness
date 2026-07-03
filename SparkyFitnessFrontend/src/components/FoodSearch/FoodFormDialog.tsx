import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Food } from '@/types/food';
import CustomFoodForm from './CustomFoodForm';
import { useTranslation } from 'react-i18next';

interface FoodFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  editingProduct?: Food | null;
  onSave: (food: Food) => void;
}

export const FoodFormDialog = ({
  isOpen,
  onOpenChange,
  mode,
  editingProduct,
  onSave,
}: FoodFormDialogProps) => {
  const { t } = useTranslation();
  const getFoodData = (): Food | undefined => {
    if (mode === 'add' || !editingProduct) return undefined;

    const product = editingProduct;
    if (
      product.default_variant &&
      (!product.variants || product.variants.length === 0)
    ) {
      return {
        ...product,
        variants: [product.default_variant],
      };
    }
    return product;
  };

  const foodData = getFoodData();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        requireConfirmation
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
      >
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
        <CustomFoodForm
          food={foodData}
          initialVariants={foodData?.variants}
          onSave={onSave}
        />
      </DialogContent>
    </Dialog>
  );
};
