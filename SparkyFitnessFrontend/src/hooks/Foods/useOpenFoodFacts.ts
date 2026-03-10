import {
  searchOpenFoodFactsApi,
  searchOpenFoodFactsBarcodeApi,
  searchBarcodeApi,
} from '@/api/Foods/foodService';
import { openFoodFactsKeys } from '@/api/keys/meals';

export const searchOpenFoodFactsOptions = (query: string) => ({
  queryKey: openFoodFactsKeys.search(query),
  queryFn: () => searchOpenFoodFactsApi(query),
  staleTime: 1000 * 60 * 5,
  meta: {
    errorMessage: 'Unable to search OpenFoodFacts database',
  },
});

export const searchOpenFoodFactsBarcodeOptions = (barcode: string) => ({
  queryKey: openFoodFactsKeys.barcode(barcode),
  queryFn: () => searchOpenFoodFactsBarcodeApi(barcode),
  staleTime: 1000 * 60 * 5,
  meta: {
    errorMessage: 'Unable to search OpenFoodFacts database with barcode.',
  },
});

export const searchBarcodeOptions = (barcode: string, providerId?: string) => ({
  queryKey: [...openFoodFactsKeys.barcode(barcode), providerId || 'default'],
  queryFn: () => searchBarcodeApi(barcode, providerId),
  staleTime: 1000 * 60 * 5,
  meta: {
    errorMessage: 'Unable to search barcode database.',
  },
});
