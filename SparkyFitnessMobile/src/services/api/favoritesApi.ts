import { apiFetch } from './apiClient';
import {
  FavoritesResponse,
  FavoriteType,
  ToggleFavoriteResponse,
} from '../../types/foods';

/**
 * Fetches the user's favorite (starred) foods and meals.
 */
export const fetchFavorites = async (): Promise<FavoritesResponse> => {
  return apiFetch<FavoritesResponse>({
    endpoint: '/api/favorites',
    serviceName: 'Favorites API',
    operation: 'fetch favorites',
  });
};

/**
 * Stars a food or meal as a favorite.
 */
export const addFavorite = async (
  type: FavoriteType,
  id: string
): Promise<ToggleFavoriteResponse> => {
  return apiFetch<ToggleFavoriteResponse>({
    endpoint: `/api/favorites/${type}/${id}`,
    serviceName: 'Favorites API',
    operation: 'add favorite',
    method: 'POST',
  });
};

/**
 * Removes a food or meal from favorites.
 */
export const removeFavorite = async (
  type: FavoriteType,
  id: string
): Promise<ToggleFavoriteResponse> => {
  return apiFetch<ToggleFavoriteResponse>({
    endpoint: `/api/favorites/${type}/${id}`,
    serviceName: 'Favorites API',
    operation: 'remove favorite',
    method: 'DELETE',
  });
};
