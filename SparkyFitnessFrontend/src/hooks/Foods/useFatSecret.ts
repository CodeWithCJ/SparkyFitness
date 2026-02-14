import { fatSecretKeys } from '@/api/keys/meals';
import {
  getFatSecretNutrients,
  searchFatSecretFoods,
} from '@/api/Foods/fatSecret';

export const searchFatSecretOptions = (query: string, providerId: string) => ({
  queryKey: fatSecretKeys.search(query, providerId),
  queryFn: () => searchFatSecretFoods(query, providerId),
  enabled: !!query && !!providerId,
  meta: {
    errorMessage: 'Failed to search FatSecret foods.',
  },
});

export const fatSecretNutrientOptions = (
  foodId: string,
  providerId: string
) => ({
  queryKey: fatSecretKeys.nutrients(foodId, providerId),
  queryFn: () => getFatSecretNutrients(foodId, providerId),
  enabled: !!foodId && !!providerId,
  meta: {
    errorMessage: 'Failed to load FatSecret nutrients.',
  },
});
