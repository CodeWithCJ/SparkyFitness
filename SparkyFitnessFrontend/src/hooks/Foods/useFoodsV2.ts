import {
  searchFoodsV2,
  searchBarcodeV2,
  getFoodDetailsV2,
} from '@/api/Foods/foodService';

export const v2FoodKeys = {
  all: ['v2', 'foods'] as const,
  search: (
    providerType: string,
    query: string,
    providerId?: string,
    pageSize?: number,
    autoScale?: boolean
  ) =>
    [
      ...v2FoodKeys.all,
      'search',
      providerType,
      query,
      providerId,
      pageSize,
      autoScale,
    ] as const,
  barcode: (barcode: string, providerId?: string) =>
    [...v2FoodKeys.all, 'barcode', barcode, providerId] as const,
  details: (providerType: string, externalId: string, providerId?: string) =>
    [
      ...v2FoodKeys.all,
      'details',
      providerType,
      externalId,
      providerId,
    ] as const,
};

export const searchFoodsV2Options = (
  providerType: string,
  query: string,
  providerId?: string,
  pageSize?: number,
  autoScale?: boolean
) => ({
  queryKey: v2FoodKeys.search(
    providerType,
    query,
    providerId,
    pageSize,
    autoScale
  ),
  queryFn: () =>
    searchFoodsV2(
      providerType,
      query,
      providerId,
      undefined,
      pageSize,
      autoScale
    ),
  staleTime: 1000 * 60 * 5,
  enabled: !!query,
  meta: {
    errorMessage: `Failed to search ${providerType} foods.`,
  },
});

export const searchBarcodeV2Options = (
  barcode: string,
  providerId?: string
) => ({
  queryKey: v2FoodKeys.barcode(barcode, providerId),
  queryFn: () => searchBarcodeV2(barcode, providerId),
  staleTime: 1000 * 60 * 5,
  meta: {
    errorMessage: 'Failed to search barcode.',
  },
});

export const foodDetailsV2Options = (
  providerType: string,
  externalId: string,
  providerId?: string
) => ({
  queryKey: v2FoodKeys.details(providerType, externalId, providerId),
  queryFn: () => getFoodDetailsV2(providerType, externalId, providerId),
  staleTime: 1000 * 60 * 5,
  enabled: !!externalId,
  meta: {
    errorMessage: `Failed to load ${providerType} food details.`,
  },
});
