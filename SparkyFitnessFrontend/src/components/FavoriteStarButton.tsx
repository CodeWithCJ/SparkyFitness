import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  useFavoritesQuery,
  useToggleFavoriteMutation,
  type FavoriteType,
} from '@/hooks/Foods/useFavorites';

interface FavoriteStarButtonProps {
  type: FavoriteType;
  id: string;
}

// Star toggle shown in the food-log and meal-log dialog headers. Reads current
// starred state from the favorites query and toggles it via the shared mutation.
const FavoriteStarButton = ({ type, id }: FavoriteStarButtonProps) => {
  const { t } = useTranslation();
  const { data: favorites, isLoading } = useFavoritesQuery();
  const { mutate: toggleFavorite, isPending } = useToggleFavoriteMutation();

  const isFavorite =
    type === 'food'
      ? !!favorites?.favoriteFoods?.some((food) => food.id === id)
      : !!favorites?.favoriteMeals?.some((meal) => meal.id === id);

  const label = isFavorite
    ? t('enhancedFoodSearch.removeFromFavorites', 'Remove from favorites')
    : t('enhancedFoodSearch.addToFavorites', 'Add to favorites');

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      // Disable until favorites have loaded: isFavorite defaults to false while
      // loading, so an early tap would fire a toggle against unknown state.
      disabled={isPending || isLoading}
      aria-label={label}
      aria-pressed={isFavorite}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite({ type, id, isFavorite });
      }}
    >
      <Star
        className={`h-4 w-4 ${
          isFavorite ? 'fill-current text-yellow-500' : 'text-muted-foreground'
        }`}
      />
    </Button>
  );
};

export default FavoriteStarButton;
