import { usdaKeys } from '@/api/keys/meals';
import { getUsdaFoodDetails, searchUsdaFoods } from '@/api/Foods/usda';

export const searchUsdaOptions = (
  query: string,
  providerId: string,
  limit: number = 50
) => ({
  queryKey: usdaKeys.search(query, providerId, limit),
  queryFn: () => searchUsdaFoods(query, providerId, limit),
  enabled: !!query && !!providerId,
  meta: {
    errorMessage: 'Failed to search USDA foods.',
  },
});

// 2. Details Query Options (für einzelne Lebensmittel)
export const usdaFoodDetailsOptions = (fdcId: number, providerId: string) => ({
  queryKey: usdaKeys.details(fdcId, providerId),
  queryFn: () => getUsdaFoodDetails(fdcId, providerId),
  enabled: !!fdcId && !!providerId,
  meta: {
    errorMessage: 'Failed to load USDA food details.',
  },
});
