import type {
  ProviderCredentials,
  ProviderSearchResult,
} from '../../services/externalFoodSearchService.js';

export interface ProviderCallContext {
  userId: string;
  credentialUserId: string;
  providerId?: string;
  credentials: ProviderCredentials;
  language: string;
  autoScale: boolean;
  signal?: AbortSignal;
}

export interface FoodProviderAdapter {
  search(
    ctx: ProviderCallContext,
    query: string,
    page: number,
    pageSize: number
  ): Promise<ProviderSearchResult>;
  getDetails(
    ctx: ProviderCallContext,
    externalId: string,
    opts?: { requireNutrition?: boolean }
  ): Promise<unknown | null>;
  lookupBarcode?(
    ctx: ProviderCallContext,
    barcode: string
  ): Promise<unknown | null>;
}
