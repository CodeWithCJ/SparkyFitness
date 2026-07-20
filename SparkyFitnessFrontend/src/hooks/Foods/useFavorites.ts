import { foodKeys } from '@/api/keys/meals';
import {
  addFavorite,
  getFavorites,
  removeFavorite,
  type FavoriteType,
} from '@/api/Foods/favoritesService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export type { FavoriteType } from '@/api/Foods/favoritesService';

export const useFavoritesQuery = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: foodKeys.favorites(),
    queryFn: getFavorites,
    meta: {
      errorMessage: t(
        'enhancedFoodSearch.failedToLoadFavorites',
        'Failed to load favorites.'
      ),
    },
  });
};

export const useToggleFavoriteMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    // `isFavorite` is the CURRENT starred state: if already a favorite we
    // remove it, otherwise we add it.
    mutationFn: ({
      type,
      id,
      isFavorite,
    }: {
      type: FavoriteType;
      id: string;
      isFavorite: boolean;
    }) => (isFavorite ? removeFavorite(type, id) : addFavorite(type, id)),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: foodKeys.favorites(),
      });
    },
    meta: {
      errorMessage: t(
        'enhancedFoodSearch.failedToUpdateFavorite',
        'Failed to update favorite.'
      ),
    },
  });
};
