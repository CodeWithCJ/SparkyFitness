import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { addFavorite, removeFavorite } from '../services/api/favoritesApi';
import { FavoritesResponse, FavoriteType, FoodItem } from '../types/foods';
import { Meal } from '../types/meals';
import { favoritesQueryKey } from './queryKeys';

interface ToggleFavoriteArgs {
  type: FavoriteType;
  id: string;
  // Whether the item is currently a favorite (state before this tap).
  isFavorite: boolean;
  // Full item, used to optimistically insert into the favorites list on add.
  // Optional: when omitted, the list is reconciled via refetch on settle.
  food?: FoodItem;
  meal?: Meal;
}

interface ToggleFavoriteContext {
  previous?: FavoritesResponse;
}

/**
 * Toggles a food or meal's favorite state with an optimistic update of the
 * favorites cache and rollback on error.
 */
export function useToggleFavorite() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const mutation = useMutation<
    unknown,
    Error,
    ToggleFavoriteArgs,
    ToggleFavoriteContext
  >({
    mutationFn: ({ type, id, isFavorite }) =>
      isFavorite ? removeFavorite(type, id) : addFavorite(type, id),
    onMutate: async ({ type, id, isFavorite, food, meal }) => {
      await queryClient.cancelQueries({ queryKey: favoritesQueryKey });
      const previous =
        queryClient.getQueryData<FavoritesResponse>(favoritesQueryKey);
      queryClient.setQueryData<FavoritesResponse>(favoritesQueryKey, (old) => {
        const foods = old?.favoriteFoods ?? [];
        const meals = old?.favoriteMeals ?? [];
        if (type === 'food') {
          if (isFavorite) {
            return {
              favoriteFoods: foods.filter((f) => f.id !== id),
              favoriteMeals: meals,
            };
          }
          if (foods.some((f) => f.id === id)) {
            return { favoriteFoods: foods, favoriteMeals: meals };
          }
          return {
            favoriteFoods: food ? [food, ...foods] : foods,
            favoriteMeals: meals,
          };
        }
        if (isFavorite) {
          return {
            favoriteFoods: foods,
            favoriteMeals: meals.filter((m) => m.id !== id),
          };
        }
        if (meals.some((m) => m.id === id)) {
          return { favoriteFoods: foods, favoriteMeals: meals };
        }
        return {
          favoriteFoods: foods,
          favoriteMeals: meal ? [meal, ...meals] : meals,
        };
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(favoritesQueryKey, context.previous);
      }
      Toast.show({
        type: 'error',
        text1: t('favorites.updateFailed', { defaultValue: 'Failed to update favorites' }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
    },
  });

  return {
    toggleFavorite: (args: ToggleFavoriteArgs) => mutation.mutate(args),
    isPending: mutation.isPending,
  };
}
