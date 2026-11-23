import { useTranslation } from 'react-i18next';
import type { RecipeImportBrowseResponse } from '@workspace/shared';
import FoodResultCard from '@/components/FoodSearch/FoodResultCard';
import { useFoodResultNutrientConfig } from '@/hooks/Foods/useFoodResultNutrientConfig';

export default function RecipeImportSearchResult({
  recipe,
  disabled,
  onChoose,
}: {
  recipe: RecipeImportBrowseResponse['items'][number];
  disabled: boolean;
  onChoose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const nutrientConfig = useFoodResultNutrientConfig();
  const food = recipe.food;
  if (!food) return null;
  return (
    <div className="space-y-1">
      <FoodResultCard
        isOnline
        item={{
          id: food.id ?? recipe.slug,
          name: food.name,
          brand: food.brand,
          is_custom: food.is_custom,
          provider_type: 'mealie',
          recipe_has_nutrition: food.recipe_has_nutrition,
          image_url: food.image_url,
          image_source_url: food.image_source_url,
          images: food.images,
          default_variant: {
            ...food.default_variant,
            glycemic_index: undefined,
          },
        }}
        nutrientConfig={nutrientConfig}
        editActionLabel={t(
          'recipeImport.reviewIngredients',
          'Review ingredients'
        )}
        editDisabled={disabled}
        onEditClick={onChoose}
      />
      {recipe.recipeServings && (
        <p className="text-xs text-muted-foreground">
          {t('recipeImport.recipeYield', 'Recipe makes {{servings}} servings', {
            count: recipe.recipeServings,
            servings: new Intl.NumberFormat(
              i18n?.resolvedLanguage ?? i18n?.language ?? 'en'
            ).format(recipe.recipeServings),
          })}
        </p>
      )}
    </div>
  );
}
