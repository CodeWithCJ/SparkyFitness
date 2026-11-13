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
import { Link } from 'react-router-dom';

interface FoodFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'add' | 'edit';
  editingProduct?: Food | null;
  onSave: (food: Food) => void;
  recipeImportProviderId?: string;
}

export const FoodFormDialog = ({
  isOpen,
  onOpenChange,
  mode,
  editingProduct,
  onSave,
  recipeImportProviderId,
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
        {foodData?.provider_type === 'mealie' &&
          foodData.recipe_has_nutrition === false && (
            <div className="rounded-md border p-3 space-y-2">
              <p>
                {t(
                  'recipeImport.missingNutritionHint',
                  'This Mealie recipe has no declared nutrition. Calculate it from matched ingredients.'
                )}
              </p>
              {recipeImportProviderId && foodData.provider_external_id && (
                <Link
                  reloadDocument
                  className="text-primary underline"
                  to={
                    '/foods?' +
                    new URLSearchParams({
                      mealieProvider: recipeImportProviderId,
                      mealieRecipe: foodData.provider_external_id,
                    })
                  }
                >
                  {t(
                    'recipeImport.importAsMeal',
                    'Import ingredients as a meal'
                  )}
                </Link>
              )}
            </div>
          )}
        <CustomFoodForm
          food={foodData}
          initialVariants={foodData?.variants}
          onSave={onSave}
        />
      </DialogContent>
    </Dialog>
  );
};
